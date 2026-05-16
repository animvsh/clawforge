# NemoClaw Integration Notes

> **Status**: Implementation draft — `integration_layer.py` is the working document.
> These notes capture the *why* and the *what calls what* for the engineering team.

---

## Overview

ClawForge runs agent logic in two runtime environments:

| Environment | Location | Runs |
|---|---|---|
| **ClawForge API** (TypeScript/Node) | Local or Cloudflare Workers | Blueprint generation, policy checks, session state |
| **NemoClaw Sandbox** (Python + OpenHands) | Brev-provisioned VM (L40S) | Actual tool execution, agent loop, memory |

`integration_layer.py` bridges the two. It is Python code that runs *in the same process* as the ClawForge persistent agent (or in a sidecar) and orchestrates the Brev/OpenHands lifecycle on behalf of the agent.

---

## Component Map

```
ClawForge API (TypeScript)
│  ├─ runtime.ts          ─ NemoClawSandboxSession state machine (TypeScript, in-process)
│  ├─ sandbox/brev.ts     ─ Brev VM lifecycle + OpenHands connection manifest
│  ├─ sandbox/openhands.ts ─ Predeploy smoke tests (policy evaluation sandbox)
│  └─ policies.ts         ─ checkPolicy() / evaluateEnvelope() / PolicyEvent log
│
│  [HTTP REST, base64 manifest via env var]
│
└─ NemoClawIntegration (Python / integration_layer.py)
   │  ├─ BrevClient         ─ subprocess wrapper for brev CLI
   │  ├─ OpenHandsClient   ─ HTTP client for OpenHands runtime API on Brev VM
   │  ├─ AuditLogger        ─ Structured JSON audit trail
   │  └─ NemoClawIntegration class ─ Orchestrator
           │
           │  [SSH + HTTP to Brev VM]
           │
           └─ Brev VM (L40S)
               └─ OpenHands agent-server container (port 8080)
                   └─ NemoClawSandboxSession (TypeScript, running in Node inside the container)
```

---

## Sandbox Execution Contract

A **sandbox execution unit** is one `NemoClawIntegration.execute()` call — from policy evaluation through to the runtime response (or approval gate).

### Input

```python
integration.execute(action: str, params: Optional[dict] = None) -> ExecutionResult
```

`action` is the tool action string (e.g. `"shell.execute"`, `"logs.read"`). The blueprint is the source of truth for both tool definitions and policies.

### Output

```python
ExecutionResult(
    ok: bool,
    session_id: str,
    agent_id: str,
    status: SessionState,               # running | waiting_for_approval | ...
    events: list[LifecycleEvent],       # accumulated lifecycle events
    memory_items: list[dict],
    report: Optional[dict],             # populated after complete()
    blocked_action: Optional[str],      # set when effect == DENY
    pending_approval: Optional[ApprovalRequest],  # set when effect == REQUIRE_APPROVAL
    error: Optional[str],
)
```

### State Machine

```
created ──deploy()──> deployed ──deploy()──> running
                                          │
                    execute(action) ───────┤
                                          │
                    ALLOW ──> tool.executed ──> (back to running)
                    DENY ──> policy.blocked ──> (stay in running, result.ok=False)
                    REQUIRE_APPROVAL ──> waiting_for_approval ──resolve_approval()──> running
                                                                         │
                    complete() ──────────────────────────────────────────┤──> completed
                    stop() ───────────────────────────────────────────────────> stopped
```

---

## BlueprintResponse → NemoClaw Execution

A `BlueprintResponse` carries everything needed to configure a sandbox session:

| Blueprint field | How it's used |
|---|---|
| `tools[]` | Each tool's `permission` field drives the policy decision. `id`, `action`, `name`, `purpose` are forwarded to OpenHands. |
| `policies[]` | Additional policy constraints beyond tool permission. Evaluated by `_check_tool_policy()` |
| `memory_schema[]` | Used to build the mem0 memory layer configuration inside the VM |
| `workflow_steps[]` | Hint ordering for the agent; `run_blueprint()` executes in step order |
| `integration_requirements[]` | Determines which secret names and capabilities are wired into the manifest |
| `model` / `provider` | Passed to OpenHands runtime so it knows which intelligence layer to use |

The blueprint is serialised into a `NemoClawIntegrationManifest` (TypeScript type `NemoClawIntegrationManifest`) and passed to the OpenHands runtime via the `CLAWFORGE_INTEGRATION_MANIFEST_B64` environment variable set in the Brev startup script.

---

## Tool Boundary Enforcement

Tool boundaries are derived from `blueprint.tools[].permission` on every `execute()` call:

| Tool permission | Policy effect | Behaviour |
|---|---|---|
| `allowed` | `allow` | Executed immediately |
| `read_only` | `allow` | Executed immediately |
| `approval_required` | `require_approval` | Session pauses, `pending_approval` returned |
| `blocked` | `deny` | Action blocked, `blocked_action` set |

The `blueprint.policies[]` array is evaluated *additionally* — if a tool is `allowed` but a policy says `deny`, the policy wins. This allows policies to impose stricter constraints than the tool defaults.

The integration layer does **not** maintain its own hardcoded allow/deny list. All boundaries come from the blueprint, which means different agents in the same process can have different boundaries.

---

## Approval Gate in Headless / Persistent Context

When `execute()` returns with `pending_approval` set:

1. The persistent agent loop **pauses** that execution unit
2. The caller receives the `ApprovalRequest` object (includes `action`, `command`, `reason`, `policy_id`)
3. The caller must call `resolve_approval(approval_id, "approved"|"denied")` to unblock
4. `resolve_approval()` is a **blocking HTTP call** to the OpenHands runtime on the Brev VM
5. Once resolved, the session transitions back to `running` and execution continues

For CI / automated testing, pass `approve_auto=True` to `NemoClawIntegration.__init__()` — this silently auto-approves every `approval_required` action without pausing.

For custom approval logic (e.g. a human-in-the-loop via Slack), pass `on_approval: Callable[[ApprovalRequest], str]` to `run_blueprint()`.

---

## Brev/OpenHands Connection

### Brev VM Lifecycle

```
brev create <name> --type <instance_type> --startup-script @<script.sh>
  │
  ├── Waits for VM to boot
  ├── Startup script runs inside VM:
  │     export CLAWFORGE_INTEGRATION_MANIFEST_B64=<base64>
  │     git clone $CLAWFORGE_REPO_URL $CLAWFORGE_ROOT
  │     $CLAWFORGE_ROOT/scripts/brev/setup-clawforge.sh
  │     docker run ghcr.io/openhands/agent-server:main-python
  │
  └── VM exposed at workspaceUrl (human URL) + runtimeApiUrl (machine API)
```

### OpenHands Runtime API (inside Brev VM)

The OpenHands runtime exposes an HTTP API on port 8080 inside the VM. The Python client calls these endpoints:

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/session/create` | Create a NemoClawSandboxSession |
| `GET` | `/api/agent/state` | Get current session state |
| `GET` | `/api/agent/events` | List lifecycle events |
| `POST` | `/api/agent/execute` | Execute a tool action |
| `POST` | `/api/agent/cancel` | Cancel running execution unit |
| `POST` | `/api/agent/approval` | Resolve a pending approval |
| `GET` | `/api/agent/memory` | Get memory items |
| `POST` | `/api/agent/memory` | Add a memory item |
| `GET` | `/api/agent/report` | Fetch final incident report |
| `GET` | `/health` | Runtime health check |

**Notes on the API:**
- The API shape is inferred from OpenHands open-source conventions. Verify exact paths against the running container's `/api` prefix.
- `conversation_id` is sent with every request to correlate calls within a session.
- Events are returned inline in execute/approval responses (no SSE streaming required for the integration layer).
- The `/api/blueprint/manifest` endpoint is **not yet implemented** in OpenHands — see "Changes needed in existing TypeScript code" below.

### Workspace URL vs Runtime API URL

```
workspaceUrl    : Human-facing URL for browsing the sandbox (SSH tunnel or direct IP)
runtimeApiUrl   : Machine-to-machine API base URL (http://<vm-internal-ip>:8080)
```

In development (local), both may point to `localhost`. In production (Brev cloud), `workspaceUrl` is the external Brev URL and `runtimeApiUrl` is the internal VM network address resolved by the Python client from `brev ls --json` output.

---

## Changes Needed in Existing TypeScript Code

### `sandbox/brev.ts`

No structural changes are required to the existing TypeScript. The integration layer replicates the manifest-building logic in `_build_manifest()` so it can drive Brev VM creation from Python.

However, for a future improvement: add a new OpenHands runtime API endpoint:

```
GET /api/blueprint/manifest
```

That returns the parsed `NemoClawIntegrationManifest` from the `CLAWFORGE_INTEGRATION_MANIFEST_B64` env var. This would let the Python side fetch the manifest after VM boot instead of having to reconstruct it locally.

### `sandbox/openhands.ts`

The predeploy smoke-test logic in `sandbox/openhands.ts` runs entirely in-process and does not need changes for the integration layer. It is useful for:

- Pre-flight validation before calling `deploy()` in CI
- Generating a `PredeploySandboxResult` without provisioning a real VM

The integration layer does **not** call `sandbox/openhands.ts` — it talks directly to the Brev/OpenHands runtime via HTTP.

### `runtime.ts`

The `NemoClawSandboxSession` class in `runtime.ts` runs **inside the OpenHands container** on Brev, not in the ClawForge API process. The integration layer does not instantiate it directly; it communicates with it via the OpenHands HTTP API described above.

If a future requirement is to run the sandbox **locally** (without Brev), the integration layer would need to spawn a Node subprocess and call `NemoClawSandboxSession` methods directly. That path is out of scope for the current design.

---

## Execution Constraints

### Timeout Handling

| Setting | Value | Where it's enforced |
|---|---|---|
| `agent_max_runtime_seconds` | Default 600s (10 min) | `NemoClawIntegration.__init__()`, checked by the caller after each `execute()` call |
| Brev VM timeout | Brev-level (2h default) | Brev platform — not controllable from integration layer |
| OpenHands `MAX_ITERATIONS` | OpenHands setting | Set inside the OpenHands container via env var |

> **Limitation**: The integration layer cannot forcefully terminate a running execution unit from Python. `POST /api/agent/cancel` signals cancellation, but the runtime may or may not honour it depending on where the agent loop is. Document this as a known gap.

### Resource Limits

These are set at the **Brev VM level**, not per-execution-unit:

| Limit | How to set | Controllable from integration layer? |
|---|---|---|
| Instance type (CPU/RAM) | `brev create --type <type>` | Yes — pass `instance_type` to `BrevClient.create()` |
| `OPENHANDS_MAX_ITERATIONS` | Env var inside container | Yes — embed in startup script |
| Disk size | Brev plan level | No |
| Network isolation | Brev security groups | No |

### Sandbox Isolation

The sandbox is a Brev-provisioned VM with a Docker container inside. Isolation is at the VM level. The integration layer cannot enforce network-level restrictions (e.g. "agent can only call these domains") from Python. That must be configured in Brev's network policy.

---

## Audit Logging

Every `execute()` call emits one structured JSON record to stdout (or a file):

```json
{
  "ts": "2026-05-16T12:00:00.000Z",
  "session_id": "session_abc123",
  "agent_id": "SentinelClaw",
  "action": "shell.execute",
  "policy_effect": "require_approval",
  "policy_id": "policy_shell_approval",
  "allowed": false,
  "blocked": false,
  "approval_required": true,
  "approval_id": "approval_abc123"
}
```

Approval resolution emits a second record with the decision. The audit log is append-only and written from a locked file handle to support concurrent integration layer instances.

---

## Key Design Decisions

1. **HTTP, not subprocess, for OpenHands**: The OpenHands runtime runs in a Docker container on a remote VM. The cleanest integration point is its HTTP API, not a shared Node process. This also allows the integration layer to run in a separate process from the ClawForge API.

2. **Blueprint as source of truth for boundaries**: The integration layer does not hardcode any allow/deny lists. Every boundary decision is re-evaluated against `blueprint.tools[].permission` and `blueprint.policies[]` on every call so that a single process can run agents with different boundaries.

3. **No shared memory between units**: Each `run_blueprint()` call is atomic. If a long-running agent needs persistent memory between units, the caller is responsible for rehydrating the `NemoClawIntegration` instance with a modified blueprint that includes memory items from the previous unit's `ExecutionResult.memory_items`.

4. **Brev is the only sandbox backend for now**: The integration layer is designed for Brev. If a future backend (e.g., local Docker, Modal) is added, it would be a new `SandboxBackend` ABC with `BrevClient` as the first implementation.

5. **No retry/loop management in integration_layer.py**: Per the CLAUDE.md design constraint "No retries framework, session manager, daemon supervisor" — the integration layer is thin. The caller (persistent agent loop) is responsible for retry logic and session lifecycle.