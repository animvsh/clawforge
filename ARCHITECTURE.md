# ClawForge Architecture — Persistent 24/7 Agent Runtime

## Overview

ClawForge is being transformed from a request-driven agent builder (HTTP → run → response) into a **production-grade, always-on agent service** that runs 24/7 on NVIDIA Brev containers.

---

## Module Map

```
┌──────────────────────────────────────────────────────────────────┐
│                     Brev Container                                │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │agent_service │  │ task_queue  │  │   Node.js Server        │  │
│  │    .py       │◄─┤  24/7 loop  │  │   (ClawForge API)      │  │
│  │  (Python)    │  │ (JSON/Redis)│  │   src/server.ts        │  │
│  └──────┬───────┘  └──────────────┘  └───────────┬────────────┘  │
│         │                                          │               │
│         │         ┌───────────────────────────────┘               │
│         │         │                                            │
│         ▼         ▼                                            ▼
│  ┌──────────────────────┐              ┌─────────────────────┐  │
│  │ integration_layer.py │              │ NemoClawSandbox     │  │
│  │  Brev + OpenHands    │◄────────────►│ Session (TypeScript)│  │
│  │  client + audit      │              └──────────┬──────────┘  │
│  └──────────────────────┘                         │              │
│                                                    ▼              │
│                                           ┌───────────────┐      │
│                                           │ProviderRegistry│      │
│                                           │Nemotron/MiniMax│     │
│                                           └───────────────┘      │
└──────────────────────────────────────────────────────────────────┘
```

### Modules

| Module | File | Responsibility |
|--------|------|----------------|
| **Agent Service** | `agent_service.py` | 24/7 runtime loop; crash recovery; graceful shutdown; task orchestration |
| **Task Queue** | `task_queue.py` | Persistent task buffer (pending/running/completed/failed); JSON or Redis backend |
| **Integration Layer** | `integration_layer.py` | Brev VM lifecycle; OpenHands HTTP client; policy enforcement; audit logging |
| **ClawForge API** | `src/lib/clawforge/api.ts` | Blueprint generation; runtime state machine; approval gates; memory |
| **Runtime** | `src/lib/clawforge/runtime.ts` | `NemoClawSandboxSession` state machine |
| **Providers** | `src/lib/clawforge/providers/` | Nemotron, MiniMax, Pi reasoning engine routing |
| **Sandbox** | `src/lib/clawforge/sandbox/` | Brev instance management; OpenHands integration |

---

## Execution Flow

### Task Lifecycle

```
┌─────────────┐    enqueue_task()    ┌────────────┐
│  External   │────────────────────►│  PENDING   │
│  Caller     │                     └─────┬──────┘
└─────────────┘                           │ fetch_next_task()
                                          ▼
                                    ┌────────────┐
                                    │  RUNNING   │
                                    └─────┬──────┘
                     ┌───────────────────┼───────────────────┐
                     │                   │                   │
                     ▼                   ▼                   ▼
              ┌────────────┐     ┌────────────────┐   ┌──────────┐
              │COMPLETED   │     │ WAITING_FOR_   │   │  FAILED  │
              │(success)   │     │ APPROVAL       │   │(crash/   │
              └────────────┘     └───────┬────────┘   │ error)   │
                                         │            └────┬────┘
                              resolveApproval()             │
                                         │            retry_task()
                                         ▼            (up to 3×)
                                  ┌────────────┐       then permanent
                                  │ (resume)  │
                                  └────────────┘
```

### Per-Task Execution Steps

1. **Fetch** — `task_queue.fetch_next_task()` atomically moves task from `pending/` → `active/`
2. **Predeploy Check** — `POST /api/v1/clawforge/agents/predeploy-test` (calls `runPredeployCheck()`)
3. **Deploy** — `POST /api/v1/clawforge/agents/deploy` → creates `NemoClawSandboxSession`
4. **Execute** — poll session state, send tool calls via `integration_layer.OpenHandsClient`
5. **Approval Gate** — if `waiting_for_approval`, write to `pending_approvals/` and poll for resolution
6. **Complete** — fetch incident report via `GET /api/v1/clawforge/agents/:id/report`
7. **Store** — write results to memory via `POST /api/memory/add`
8. **Finalize** — `task_queue.mark_completed()` or `mark_failed()`

---

## Task Queue Design

### State Machine

```
PENDING → RUNNING → COMPLETED
                  ↘ FAILED → RETRY → PENDING (max 3 retries)
```

### Payload Shape

```python
{
    "task_id": str,
    "blueprint": dict,          # BlueprintResponse from ClawForge
    "project_id": str,
    "agent_id": str,
    "user_context": dict,       # memory + approvals from ClawForge
    "priority": int,           # lower = higher priority (default 100)
    "created_at": float        # unix timestamp
}
```

### Backends

- **JSON** (default): `task_queue.json` + `~/.clawforge/tasks/` directory tree. Zero deps, crash-safe.
- **Redis** (optional): activated by `REDIS_URL` env var. Uses sorted set for priority ordering.

---

## Integration Layer: NemoClaw / OpenHands

### Brev Client

`BrevClient` wraps the `brev` CLI for VM lifecycle:
- `create_instance()` — provisions L40S VM, writes startup script with manifest
- `destroy_instance()` — tears down VM on session end
- `wait_for_openhands()` — polls OpenHands health endpoint until ready

### OpenHands Client

`OpenHandsClient` is a machine-to-machine HTTP client to the OpenHands runtime on the Brev VM:
- `POST /api/agent/chat` — send message to agent
- `POST /api/agent/execute` — execute a tool action
- `GET /api/agent/state` — get session state
- `POST /api/agent/approval` — resolve pending approval
- `GET /api/agent/report` — fetch incident report

### Policy Enforcement

Tool permissions come from `BlueprintResponse.tools[].permission`:
- `allowed` / `read_only` → execute immediately
- `approval_required` → pause, emit event, wait for resolution
- `blocked` → reject with error

### Audit Logging

Every `execute()` call and approval resolution is written to an append-only JSONL log (stdout + rotated file).

---

## Existing ClawForge Components → New Modules

| Existing File | Role in New Architecture |
|--------------|--------------------------|
| `src/server.ts` | API entry point (remains HTTP API server) |
| `src/lib/clawforge/api.ts` | Blueprint generation, runtime management, memory, approvals |
| `src/lib/clawforge/runtime.ts` | `NemoClawSandboxSession` state machine — called via API |
| `src/lib/clawforge/providers/` | Reasoning engine routing — called via API |
| `src/lib/clawforge/sandbox/brev.ts` | Brev VM creation — called via API |
| `src/lib/clawforge/sandbox/openhands.ts` | Predeploy checks — called via API |
| `src/lib/clawforge/policies.ts` | `checkPolicy()` — called via API |
| `src/lib/clawforge/memory/gateway.ts` | Memory store — called via API |

**Key design principle**: The Python layer never re-implements TypeScript logic. It calls the ClawForge API via HTTP (localhost in dev, internal network in production).

---

## Single-Start Command

The system starts with one command:

```bash
# Development / local
docker compose up -d

# Production on Brev
docker compose -f docker-compose.yml --env-file .env up -d
```

This brings up:
1. `clawforge-api` — Node.js API server on port 8080
2. `clawforge-agent` — Python `agent_service.py` (waits for API health before starting)
3. Optional `clawforge-redis` — Redis for task queue (commented out by default)

---

## Docker Deployment

- **Base image**: Multi-stage `python:3.11-slim` + `node:22-bookworm-slim` merged via `FROM --platform`
- **Process manager**: `supervisord` runs API + agent as supervised child processes
- **Service modes**: `SERVICE_MODE=all|api|agent` env var controls what runs
- **Restart policy**: `unless-stopped` on all services — survives host reboots
- **Health checks**: API has HTTP health check; agent has a lightweight `/health` endpoint on 8081
- **Log rotation**: Docker logging driver (5-10 files, 50-100 MB cap)
- **Non-root**: Runs as `app:app` user

---

## Sandbox Compatibility with NemoClaw/OpenClaw

- The `NemoClawSandboxSession` state machine runs **inside** the OpenHands container on Brev, not in the ClawForge API process
- The Python integration layer drives the session via HTTP API calls to the OpenHands runtime
- Brev provisions the VM and starts the OpenHands container; ClawForge manages the session lifecycle
- Tool boundaries are defined per-blueprint, not hardcoded — different agents get different sandbox constraints
- OpenHands runs headless (no browser UI); human approval is handled via the ClawForge workspace UI

---

## Key Interfaces

### AgentService → ClawForge API (HTTP)

```
POST /api/v1/clawforge/agents/deploy
POST /api/v1/clawforge/agents/:id/stop
POST /api/v1/clawforge/agents/:id/approvals/:aid/decision
GET  /api/v1/clawforge/agents/:id/report
POST /api/v1/clawforge/brev/instances
POST /api/v1/clawforge/openhands/chat
POST /api/memory/add
GET  /api/memory
```

### AgentService → OpenHands Runtime (HTTP on Brev VM)

```
POST http://<vm-ip>:8080/api/agent/chat
POST http://<vm-ip>:8080/api/agent/execute
GET  http://<vm-ip>:8080/api/agent/state
GET  http://<vm-ip>:8080/api/agent/events
POST http://<vm-ip>:8080/api/agent/approval
GET  http://<vm-ip>:8080/api/blueprint/manifest
```

### TaskQueue public API

```python
q = TaskQueue()                         # JSON backend
q = TaskQueue(redis_url="...")         # Redis backend
task_id = q.enqueue_task(id, payload)   # PENDING → returns id
task = q.fetch_next_task()             # oldest PENDING → RUNNING
q.mark_completed(task_id)               # RUNNING → COMPLETED
q.mark_failed(task_id, error)          # RUNNING → FAILED
status = q.get_task_status(task_id)    # returns TaskState
q.retry_task(task_id)                   # FAILED → PENDING (≤3 retries)
```