# Memory Gateway Architecture

This document describes the ClawForge memory system architecture, which uses a gateway pattern to interface with Mem0, an external memory store.

## Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           ClawForge Application                          │
│                                                                          │
│  ┌─────────────┐    ┌───────────────────┐    ┌──────────────────────┐  │
│  │   Runtime   │───▶│  Memory Gateway   │───▶│  Mem0 Client (HTTP)  │  │
│  │   (Agent)   │    │  (mem0-client.ts) │    │  ┌────────────────┐   │  │
│  └─────────────┘    └───────────────────┘    │  │ MEM0_API_URL   │   │  │
│                                               │  │ MEM0_API_KEY   │   │  │
│  ┌─────────────┐    ┌───────────────────┐    │  └────────────────┘   │  │
│  │    API      │───▶│  Scope Validation │    └──────────┬───────────┘  │
│  │   Handler   │    │  (user_id, etc.)  │               │              │
│  └─────────────┘    └───────────────────┘               │              │
│                                                        ▼              │
│                                          ┌───────────────────────────────┐│
│                                          │      Mem0 Server             ││
│                                          │   (Brev-hosted or local)     ││
│                                          │   POST /api/memories         ││
│                                          │   GET  /api/memories         ││
│                                          │   POST /api/search           ││
│                                          │   PATCH /api/memories/:id     ││
│                                          │   DELETE /api/memories/:id   ││
│                                          └───────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────┘
```

## Why a Gateway?

Direct access to Mem0 would couple the application to Mem0's specific API shape and response format. The gateway provides:

1. **Capability Discovery** — Probes the Mem0 server at startup to determine which endpoints are available (add, search, list, update, delete). Operations against unavailable capabilities degrade gracefully.

2. **Response Normalization** — Mem0 returns `text`; ClawForge uses `content`. The gateway maps between these and normalizes memory types.

3. **Scope Enforcement** — Every memory write operation requires `user_id` and `project_id`. The gateway validates scope before sending anything to Mem0 and filters results client-side for read operations.

4. **Retry with Backoff** — Network failures trigger up to 3 retries with exponential backoff (capped at 10s). Non-retryable errors (TypeError, DOMException) fail immediately.

5. **Input Sanitization** — Scope field values are truncated to 256 characters to prevent injection attacks.

6. **Graceful Degradation** — When Mem0 is unavailable, writes return a synthetic in-memory fallback and reads return empty arrays, allowing the application to continue running.

## Memory Scopes

Each memory item carries scope metadata that determines its visibility and isolation boundaries.

| Scope Field    | Required | Description                                         |
|----------------|----------|-----------------------------------------------------|
| `tenant_id`    | No       | Top-level organizational tenant.                     |
| `user_id`      | **Yes**  | Owner of this memory.                              |
| `project_id`   | **Yes**  | Project context for the memory.                     |
| `agent_id`     | No       | Specific agent instance that created the memory.    |
| `run_id`       | No       | Specific agent run/session.                         |
| `workspace_id` | No       | Workspace (may span multiple projects or tenants). |

**Required fields for write operations:** `user_id` + `project_id`.

## Memory Types

| Type                | Description                                                           |
|---------------------|-----------------------------------------------------------------------|
| `preference`        | User or agent preference (e.g., coding style, tool settings).         |
| `project_fact`      | Factual knowledge about a project (file structure, dependencies).     |
| `agent_instruction` | Custom instruction or directive given to an agent.                    |
| `run_context`       | Context captured during a specific agent run.                         |
| `research_claim`    | A claim or finding discovered during research.                        |
| `source`            | A source URL, document, or reference.                                 |
| `decision`          | A decision made by an agent or user, with rationale.                  |
| `open_question`     | A question that remains unanswered and may need future research.      |

Legacy types `incident`, `blocked_action`, and `approval` map to `preference` or `decision` internally.

## API Endpoints

The gateway exposes the following operations via `Mem0Client`:

### `client.add(content, type, metadata)`

Creates a new memory item.

**Mem0 endpoint:** `POST /api/memories`

**Request body:**
```json
{
  "text": "Use TypeScript strict mode for all new services",
  "memory_type": "preference",
  "metadata": {
    "user_id": "user_abc123",
    "project_id": "proj_xyz",
    "created_by": "agent"
  }
}
```

**Returns:** `MemoryItem` with generated ID and ISO timestamp.

**Validation:**
- `content` must be non-empty, max 100,000 characters.
- `user_id` and `project_id` are required in metadata.

---

### `client.search(query, filters, limit)`

Searches memories semantically or by scope filter.

**Mem0 endpoint:** `POST /api/search`

**Request body:**
```json
{
  "query": "strict mode typescript",
  "limit": 20,
  "filters": {
    "user_id": "user_abc123",
    "project_id": "proj_xyz"
  }
}
```

**Returns:** Array of `MemoryItem`, filtered client-side to match requested scope.

---

### `client.list(filters)`

Lists memories for a given scope.

**Mem0 endpoint:** `GET /api/memories?user_id=...&project_id=...`

**Returns:** Array of `MemoryItem`, filtered client-side.

---

### `client.update(id, content, metadata)`

Updates an existing memory's content or metadata.

**Mem0 endpoint:** `PATCH /api/memories/:id`

---

### `client.delete(id, scope)`

Deletes a memory by ID.

**Mem0 endpoint:** `DELETE /api/memories/:id`

---

### `client.health()`

Checks Mem0 server availability and discovers server capabilities.

**Returns:**
```json
{
  "ok": true,
  "available": true,
  "apiVersion": "1.0.0",
  "capabilities": {
    "hasHealth": true,
    "hasAdd": true,
    "hasSearch": true,
    "hasList": true,
    "hasUpdate": true,
    "hasDelete": true
  }
}
```

## Scope Isolation Rules

Scope isolation is enforced at two layers:

**Write layer (gateway):**
- `add()` requires `user_id` + `project_id` in scope metadata.
- Missing required scope fields throw before any Mem0 call.

**Read layer (client-side filter):**
- Search and list results are filtered to only return memories whose stored scope matches the requested scope.
- The filter only checks fields that are present in the request filter — a request with only `user_id` will not filter by `project_id`.

```
Request scope: { user_id: "u1", project_id: "p1" }
Mem0 returns:  [{ user_id: "u1", project_id: "p1" }, { user_id: "u1", project_id: "p2" }]
Final result:  [{ user_id: "u1", project_id: "p1" }]  ← p2 is filtered out
```

## Auth / Session Identity Derivation

The gateway does **not** handle authentication — it receives scope values as part of the caller's context. Typically:

1. An authenticated session provides `user_id` (from the session cookie or token).
2. The API handler or runtime layer resolves `project_id` from the current workspace/project context.
3. These values are passed into the memory client as part of `metadata`.

There is no automatic derivation of identity inside the gateway. Callers must explicitly provide scope fields for every write operation.

## Demo Flow: Cross-Workspace Memory Sharing

The following demonstrates how memory created in one workspace can be retrieved in another, when explicit cross-workspace access is needed:

```
1. Agent in Workspace-A stores a research_claim:
   client.add(
     "Vite build times are 40% faster than webpack for our monorepo",
     "research_claim",
     { user_id: "u1", project_id: "proj-a", workspace_id: "ws-a" }
   )

2. Agent in Workspace-B searches for performance-related memories:
   client.search(
     "vite build performance webpack comparison",
     { user_id: "u1", workspace_id: "ws-a" }   ← explicit cross-workspace scope
   )

3. Mem0 returns the memory from ws-a; client-side filter validates
   that the requesting user owns access to workspace ws-a.

4. Agent in Workspace-B can now cite the finding without re-researching.
```

Note: Cross-workspace access requires the requesting scope to explicitly include the `workspace_id` of the source memory. The gateway does not automatically allow cross-workspace reads — the caller must opt in.

## Known Limitations

1. **Client-side scope filtering** — Scope isolation on read operations is enforced by the gateway filtering Mem0's response. A misconfigured Mem0 instance that returns all memories regardless of filter parameters could leak data. For strong isolation, Mem0's own access control must be configured correctly.

2. **No transaction support** — Multiple memory operations in a single logical transaction are not supported. If one operation fails mid-sequence, prior operations are not rolled back.

3. **No memory versioning** — Updating a memory overwrites the previous version. There is no revision history.

4. **Capability probe at startup** — If Mem0 changes capabilities after the first probe, the gateway will not detect the change until the client singleton is reset (via `resetMem0Client()`).

5. **Fallback mode is local-only** — When Mem0 is unavailable, `add()` returns an in-memory fallback item. This item is not persisted to Mem0 and will not appear in subsequent `list()` or `search()` calls until Mem0 is restored.

6. **Max content length** — 100,000 character limit per memory item. There is no chunking or summarization.

7. **No granular per-type access control** — Scope fields apply to all memory types equally. A memory item with `type=preference` has the same visibility as `type=decision`.

## Migration Path: Brev VM Today to Managed Infra Later

### Current State (Brev VM)

Mem0 is currently deployed on a Brev-managed VM:

```
Brev CLI → brev deploy → VM with Docker → Mem0 container
```

Environment variables on the VM:
- `MEM0_API_URL` — internal URL (e.g., `http://localhost:8000`)
- `MEM0_API_KEY` — static API key for authentication

### Target State (Managed Mem0 / Cloud)

The architecture is designed to tolerate a future migration to Mem0's managed cloud service or a self-hosted Kubernetes deployment:

| Change Needed | Action |
|---|---|
| `MEM0_API_URL` | Point to managed cloud endpoint instead of local VM. |
| `MEM0_API_KEY` | Rotate to managed service credentials. |
| Capability discovery | No code changes needed — discovery handles both. |
| Scope schema | No changes required — scope fields remain the same. |
| Client-side filtering | Remains as a defense-in-depth layer. |

### Migration Steps

1. Deploy managed Mem0 instance (Mem0 Cloud or self-hosted k8s).
2. Run data migration: export memories from Brev VM, import to managed instance.
3. Update `MEM0_API_URL` and `MEM0_API_KEY` environment variables.
4. Restart ClawForge — capability discovery will probe the new endpoint automatically.
5. Validate that `health()`, `add()`, `search()`, and `list()` return expected results.
6. Decommission Brev VM once validation passes.

> **TODO:** Document the exact data migration procedure (export format, import script, downtime window).