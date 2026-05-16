# ClawForge Pi SDK And Sandboxed Execution Research

Research date: May 16, 2026

## Decision

ClawForge should use a two-layer runtime:

1. A server-only agent runtime layer powered by Pi Coding Agent SDK when the environment supports Node and sandboxed tool execution.
2. A provider adapter layer that supports NVIDIA Nemotron through NIM/OpenAI-compatible APIs and MiniMax Cloud through MiniMax-compatible APIs.

The product should not give an agent unrestricted power. The user-facing promise can be broad, but the technical system must translate "do anything I want" into least-privilege task capabilities:

Prompt -> capability manifest -> NemoClaw/OpenShell sandbox -> policy broker -> approval gates -> tool execution -> audit log -> memory -> final artifact.

## Pi Coding SDK Finding

"Pi coding SDK" most likely refers to Pi Coding Agent, published as:

```sh
npm install @earendil-works/pi-coding-agent
```

Official Pi docs describe the SDK as a way to embed Pi agent capabilities in custom UIs, automated workflows, and application integrations. The SDK exposes:

- `createAgentSession()`
- `SessionManager`
- `AuthStorage`
- `ModelRegistry`
- streaming session events
- built-in tools such as `read`, `bash`, `edit`, `write`, `grep`, `find`, and `ls`
- `defineTool()` for custom tools
- extensions, skills, prompt templates, and context files

Pi should be used only on the server/runtime side. It should not be bundled into browser code or Cloudflare edge code that cannot safely host filesystem/session/tool behavior.

## Provider Compatibility

### NVIDIA Nemotron

Nemotron should be accessed through NVIDIA NIM/OpenAI-compatible chat APIs.

Recommended defaults:

- Base URL: `https://integrate.api.nvidia.com/v1`
- Endpoint: `/chat/completions`
- Secret: `NVIDIA_API_KEY`
- Model setting: `NVIDIA_NEMOTRON_MODEL`
- Local NIM fallback: `http://localhost:8000/v1` or the active Brev/NIM endpoint

NemoClaw should route in-sandbox inference through `https://inference.local/v1` so provider credentials stay on the host/gateway side rather than inside the sandbox.

### MiniMax Cloud

MiniMax should be supported in two modes:

1. MiniMax Anthropic-compatible mode as the preferred provider path for richer reasoning/tool continuity.
2. MiniMax OpenAI-compatible mode for broader client compatibility.

Recommended settings:

- Secret: `MINIMAX_API_KEY`
- Token-plan secret name if required: `MINIMAX_PLAN_KEY`
- Model setting: `MINIMAX_MODEL`
- OpenAI-compatible base URL: `https://api.minimax.io/v1`
- OpenAI-compatible endpoint: `/chat/completions`

MiniMax provider responses can include thinking/reasoning details. Store the full provider state only server-side when needed for multi-turn continuity. The UI should show summarized audit text, not raw hidden reasoning.

## Runtime Architecture

### AgentRuntimeAdapter

This layer controls sessions and tools.

Implementations:

- `PiAgentRuntimeAdapter`
  - Uses `@earendil-works/pi-coding-agent`.
  - Runs only in Node/server environments.
  - Creates in-memory sessions for the MVP.
  - Loads custom ClawForge tools instead of exposing raw built-ins by default.
  - Allows read-only Pi tools first; write/shell tools must route through ClawForge policy broker.

- `DirectReasoningRuntimeAdapter`
  - Calls provider HTTP APIs directly.
  - Works in Cloudflare/Worker-safe environments.
  - Handles blueprint generation, classification, summarization, and report generation.
  - Remains the fallback when Pi or NemoClaw is unavailable.

- `MockRuntimeAdapter`
  - Keeps deterministic demo mode working without keys.

### ChatModelAdapter

This layer handles model calls.

Implementations:

- `NemotronNimAdapter`
- `MiniMaxAnthropicAdapter`
- `MiniMaxOpenAIAdapter`
- `MockModelAdapter`

Common interface:

- `complete()`
- `stream()`
- `classify()`
- `summarize()`
- `health()`
- `normalizeError()`

Common events:

- `reasoning.started`
- `reasoning.delta`
- `tool.proposed`
- `tool.result`
- `policy.checked`
- `reasoning.completed`
- `reasoning.error`

## Sandboxed Task Execution

Treat broad autonomy as a policy problem.

Every action must be represented as an action envelope:

```json
{
  "run_id": "run_001",
  "actor": "SentinelClaw",
  "tool": "shell",
  "action": "shell.execute",
  "target": "block_ip 185.92.xx.xx",
  "input_hash": "sha256:...",
  "data_classification": "operational",
  "network_destination": null,
  "estimated_side_effect": "mutates_system_state",
  "approval_id": "approval_001"
}
```

The policy broker evaluates every envelope as:

- `allow`
- `read_only`
- `approval_required`
- `deny`

Unknown actions deny by default.

## Tool Permission Model

| Tool family | Safe default              | Approval required                                      | Denied by default                                                   |
| ----------- | ------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------- |
| Files       | read workspace files      | write/delete/large rewrite                             | secrets, SSH keys, browser profiles, host paths                     |
| Shell       | inspect inside sandbox    | package install, process change, network write, deploy | host escape, credential read, raw exfiltration                      |
| Browser     | public browsing           | login, submit, purchase, upload, OAuth consent         | cookie theft, hidden downloads, credential extraction               |
| GitHub      | read issues/PRs/files     | branch, commit, PR, comment                            | merge, release, secrets/workflow mutation without elevated approval |
| Email/Slack | draft only                | send/reply/forward/external alert                      | secrets, mass send, unknown attachment exfiltration                 |
| Network     | known read-only endpoints | new endpoints by session approval                      | direct provider APIs, raw internet egress                           |
| Policy      | view active policy        | propose policy change                                  | self-modify, disable audit, bypass sandbox                          |

## NemoClaw/OpenShell Integration

NemoClaw/OpenShell should enforce the sandbox boundary outside the model's control.

Key rules:

- Do not allow the sandbox to call provider APIs directly.
- Use `inference.local` routing for model calls.
- Use deny-by-default egress.
- Use policy presets and `nemoclaw <sandbox> policy-add <preset> --yes` for non-destructive updates.
- Avoid raw `openshell policy set` unless starting from a full live policy snapshot because it replaces rather than merges.
- Expose blocked network requests as approval cards in ClawForge.
- Support "approve once" and "promote to preset" as separate concepts.

## Autonomy Modes

Expose four modes in the product:

1. Mock
   - Deterministic demo.
   - No external side effects.

2. Draft-only
   - Agent can read and draft.
   - No writes or sends.

3. Approval-gated
   - Agent can propose side effects.
   - Human approval required before execution.

4. Elevated
   - Explicitly configured by the operator.
   - Requires extra warnings, narrow credentials, audit logging, and sandbox health checks.

The MVP should default to `Approval-gated`.

## Linear Development Lanes

### Pi SDK Runtime Adapter

Branch:

`codex/pi-coding-sdk-adapter`

Owned files:

- `src/lib/clawforge/providers/pi.ts`
- `src/lib/clawforge/providers/index.ts`
- `src/lib/clawforge/runtime.ts`
- `.env.example`

Acceptance criteria:

- Pi SDK is used only server-side.
- Adapter can create an in-memory Pi agent session.
- Pi streaming events map to ClawForge audit events.
- Raw Pi `bash`, `edit`, and `write` tools are not exposed to arbitrary prompts by default.
- Pi tools route through the ClawForge policy broker.
- Mock mode still works without Pi installed/configured.

### Secret-Safe Provider Registry

Branch:

`codex/provider-registry-selection`

Owned files:

- `src/lib/clawforge/providers/index.ts`
- `src/lib/clawforge/providers/nemotron.ts`
- `src/lib/clawforge/providers/minimax.ts`
- `src/lib/clawforge/types.ts`
- `.env.example`

Acceptance criteria:

- `auto` selects Nemotron when `NVIDIA_API_KEY` is available, then MiniMax when MiniMax credentials are available, then mock.
- UI sends provider/model slugs only.
- No API key or redacted key is returned from `/api/*`.
- Provider health returns booleans and model slugs only.

### NVIDIA Nemotron Adapter

Branch:

`codex/nemotron-nim-adapter`

Owned files:

- `src/lib/clawforge/providers/nemotron.ts`
- `src/lib/clawforge/providers/index.ts`
- `.env.example`

Acceptance criteria:

- Calls OpenAI-compatible `POST /v1/chat/completions`.
- Supports hosted NVIDIA API and local NIM base URLs.
- Reads `NVIDIA_API_KEY`, `NVIDIA_NEMOTRON_MODEL`, and optional `NVIDIA_BASE_URL` server-side.
- Supports non-streaming and streaming output.
- Maps provider errors to structured safe messages.

### MiniMax Cloud Adapter

Branch:

`codex/minimax-cloud-adapter`

Owned files:

- `src/lib/clawforge/providers/minimax.ts`
- `src/lib/clawforge/providers/index.ts`
- `.env.example`

Acceptance criteria:

- Supports MiniMax Cloud mode.
- Supports OpenAI-compatible API mode.
- Keeps `MINIMAX_API_KEY`, `MINIMAX_PLAN_KEY`, and `MINIMAX_MODEL` server-side.
- Preserves provider response state needed for multi-turn continuity.
- Does not expose raw thinking blocks to UI by default.

### Capability Manifest And Policy Broker

Branch:

`codex/capability-policy-broker`

Owned files:

- `src/lib/clawforge/types.ts`
- `src/lib/clawforge/policies.ts`
- `src/lib/clawforge/tools.ts`
- `src/lib/clawforge/fixtures.ts`

Acceptance criteria:

- Adds `ActionEnvelope`.
- Adds action taxonomy for files, shell, browser, GitHub, email, network, memory, and policy.
- Every tool action receives deterministic `allow`, `read_only`, `approval_required`, or `deny`.
- Unknown actions deny by default.
- Policy decisions include reason, policy id, and audit metadata.

### Broad Tool Brokers

Branch:

`codex/broad-tool-brokers`

Owned files:

- `src/lib/clawforge/tools.ts`
- `src/lib/clawforge/policies.ts`
- `src/lib/clawforge/runtime.ts`

Acceptance criteria:

- Adds broker interfaces for shell, browser, GitHub, files, email/Slack, tickets, and reports.
- Every broker call passes through the policy broker first.
- Shell, external send, write outside workspace, and policy edits are guarded.
- Every decision emits an audit event.

### NemoClaw Sandbox Session Adapter

Branch:

`codex/nemoclaw-sandbox-session-adapter`

Owned files:

- `src/lib/clawforge/runtime.ts`
- `src/lib/clawforge/api.ts`
- `src/lib/clawforge/types.ts`
- `scripts/brev/setup-clawforge.sh`
- `README.md`

Acceptance criteria:

- Runtime can create, start, stop, and inspect NemoClaw sandbox sessions.
- Sandbox failures emit sanitized `agent.error` events.
- Blocked network requests can be surfaced as approval events.
- Mock mode still works without NemoClaw.

### Approval Center And Forensics

Branch:

`codex/approval-audit-forensics`

Owned files:

- `src/lib/clawforge/runtime.ts`
- `src/lib/clawforge/memory.ts`
- `src/lib/clawforge/reports.ts`
- `src/components/clawforge/LiveDashboard.tsx`
- `src/components/clawforge/MemoryTimeline.tsx`

Acceptance criteria:

- Approval requests include command/diff/content preview, destination, risk label, timeout behavior, and policy id.
- Side effects cannot execute without approval artifact.
- Audit events are append-only and ordered.
- Memory stores approval/denial and later retrieval.
- Final report cites policy, provider, sandbox, approval, and memory results.

### Sandbox Hardening Verification

Branch:

`codex/sandbox-hardening-verification`

Owned files:

- `src/lib/clawforge/runtime.ts`
- `src/lib/clawforge/policies.ts`
- `artifacts/CLAWFORGE_TEAM_HANDOFF.md`
- `README.md`

Acceptance criteria:

- Startup warns or fails when sandbox hardening is missing.
- Health check covers gateway inference routing, network deny-by-default, forbidden path scanner, and secret redaction.
- Logs redact authorization headers and provider keys.
- No secrets appear in source, artifacts, Linear, screenshots, or logs.

## Recommended Merge Order

1. Capability manifest and policy broker.
2. Secret-safe provider registry.
3. Nemotron adapter.
4. MiniMax adapter.
5. Pi SDK runtime adapter.
6. Broad tool brokers.
7. NemoClaw sandbox session adapter.
8. Approval center and forensics.
9. Sandbox hardening verification.
10. Final Brev/Cloudflare QA.

## Sources

- Pi Coding Agent SDK: https://pi.dev/docs/latest/sdk
- Pi providers and MiniMax environment variables: https://pi.dev/docs/latest/providers
- Pi custom providers: https://pi.dev/docs/latest/custom-providers
- NVIDIA NIM LLM APIs: https://docs.api.nvidia.com/nim/reference/llm-apis
- NVIDIA NemoClaw inference options: https://docs.nvidia.com/nemoclaw/latest/inference/inference-options.html
- NVIDIA NemoClaw local inference: https://docs.nvidia.com/nemoclaw/latest/inference/use-local-inference.html
- NVIDIA NemoClaw network policy customization: https://docs.nvidia.com/nemoclaw/latest/network-policy/customize-network-policy.html
- NVIDIA OpenShell security best practices: https://docs.nvidia.com/openshell/security/best-practices
- MiniMax OpenAI-compatible API: https://platform.minimax.io/docs/api-reference/text-openai-api
- MiniMax OpenAI-compatible text chat: https://platform.minimax.io/docs/api-reference/text-chat-openai
- MiniMax model listing: https://platform.minimax.io/docs/api-reference/models/openai/list-models
