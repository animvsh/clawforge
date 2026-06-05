"""
ClawForge Agent Service — Persistent Runtime for Brev Deployment
================================================================

## Runtime Design

### Context
ClawForge is a TypeScript/Node.js application (TanStack Start + Cloudflare Worker) that
currently executes agents request-driven (HTTP request → run to completion → response).
This service transforms that into a long-running daemon suitable for 24/7 deployment on
NVIDIA Brev containers.

### Architecture

```
                    ┌─────────────────────────────────────────────┐
                    │           Brev Container                    │
                    │                                              │
                    │  ┌──────────────┐    ┌───────────────────┐  │
                    │  │agent_service │    │  Node.js Server   │  │
                    │  │  (Python)     │◄──►│  (ClawForge API)  │  │
                    │  └──────┬───────┘    └─────────┬─────────┘  │
                    │         │                       │            │
                    │         ▼                       ▼            │
                    │  ┌──────────────┐    ┌───────────────────┐  │
                    │  │  Task Queue  │    │ NemoClawSandbox   │  │
                    │  │  (JSON dirs) │    │ Session (TS)      │  │
                    │  └──────────────┘    └───────────────────┘  │
                    │                              │               │
                    │                              ▼               │
                    │                     ┌───────────────────┐   │
                    │                     │ ProviderRegistry  │   │
                    │                     │ Nemotron/MiniMax  │   │
                    │                     └───────────────────┘   │
                    └─────────────────────────────────────────────┘
```

### Integration Points with TypeScript Codebase

1. **Calling TypeScript APIs**:
   - The Python service communicates with the existing ClawForge API via HTTP (localhost).
   - The Node.js server must be running in the same container (dev mode: `npm run dev` or
     equivalent). This is acceptable because Brev containers already run multiple processes.
   - Subprocess calls to `node --experimental-vm-modules` or similar are avoided — HTTP is
     the correct boundary between a long-running Python service and the request-driven API.

2. **Task Queue Injection**:
   - The queue lives on the filesystem: `~/.clawforge/tasks/pending/`, `done/`, `failed/`.
   - Each task is a JSON file. The agent polls `pending/`, works on one at a time, then
     moves to `done/` or `failed/` on completion.
   - This avoids Redis/SQLite and survives crashes (unprocessed files remain in `pending/`).

3. **NemoClawSandboxSession State Machine**:
   - The TypeScript `NemoClawSandboxSession` (runtime.ts) manages states:
     `created → deployed → running → paused → (waiting_for_approval) → completed/stopped`
   - The Python agent drives this by calling the ClawForge API endpoints in order:
     a. POST /api/v1/clawforge/agents/deploy — creates a session and transitions to `deployed`/`running`
     b. Execute actions via the session (policy checks happen server-side)
     c. POST /api/v1/clawforge/approvals/:id/decision — resolve approval gates
     d. GET /api/v1/clawforge/agents/:id/report — fetch incident report on completion
   - The agent does NOT replicate the state machine locally. It treats the API as the
     authoritative source of truth.

4. **ProviderRegistry**:
   - The TypeScript `ProviderRegistry` (providers/index.ts) handles Nemotron/MiniMax/Pi.
   - The Python agent invokes these via the ClawForge API, not directly.
   - If low-level access is needed (e.g., streaming), the agent calls the remote-chat endpoint.

5. **Brev / OpenHands Integration**:
   - Predeploy checks (openhands.ts): POST /api/v1/clawforge/agents/predeploy-test
   - Brev instance lifecycle (brev.ts): POST /api/v1/clawforge/brev/instances
   - Chat with OpenHands: POST /api/v1/clawforge/openhands/chat

### Task Execution Flow

```
fetch_and_execute_task()
  1. Pick oldest task JSON from ~/.clawforge/tasks/pending/
  2. Parse task: { task_id, blueprint, provider, approval_mode }
  3. Validate blueprint/policies:
     POST /api/v1/clawforge/agents/predeploy-test  → { ok, deploymentAllowed }
     If !deploymentAllowed → move to failed/, continue
  4. Deploy agent:
     POST /api/v1/clawforge/agents/deploy  → { agent_id, status }
  5. Poll for completion:
     GET  /api/v1/clawforge/agents/:agent_id/report
     On wait_for_approval:
       - Stream event to ~/.clawforge/tasks/active/{task_id}.jsonl
       - Write approval request to ~/.clawforge/tasks/pending_approvals/
       - Wait for resolution (poll file or API)
  6. On completion:
     - Save report to memory: POST /api/memory/add
     - Move task JSON to ~/.clawforge/tasks/done/
  7. On error:
     - Log error, move to failed/
```

### Crash Recovery

- On crash: agent_service.py restarts via supervisor (systemd or Brev init script).
- Unprocessed tasks in `pending/` are picked up on restart (idempotent).
- Active task is detected by presence of `~/.clawforge/tasks/active/` lock file.
- On startup, agent checks for stale locks and resolves them (marks associated tasks as failed).

### Health Check / Heartbeat

- report_status() writes to `~/.clawforge/heartbeat.json` every 30s.
- Fields: { last_heartbeat, current_task_id, state, errors }
- External monitors (Brev health checks) can read this file.

### Approval Gate Handling

- When the API returns `waiting_for_approval`:
  1. Write event stream to `~/.clawforge/tasks/active/{task_id}.jsonl`
  2. Write approval record to `~/.clawforge/tasks/pending_approvals/{approval_id}.json`
  3. Wait for approval resolution file or poll GET /api/v1/clawforge/approvals/:id
  4. POST decision to /api/v1/clawforge/approvals/:id/decision
  5. Resume execution
- A human operator can resolve approvals by writing to the pending_approvals directory
  or via the web UI that calls the same API.

### Graceful Shutdown

- SIGTERM received → stop picking up new tasks, finish current task (or checkpoint it).
- SIGINT  → same behavior.
- Checkpoint: current task is left in `pending/` with a `crashed_at` timestamp.

---

Usage:
    python agent_service.py [--queue-dir ~/.clawforge/tasks]

Environment variables:
    CLAWFORGE_API_URL   — Base URL of ClawForge API (default: http://localhost:3000)
    CLAWFORGE_QUEUE_DIR — Task queue root (default: ~/.clawforge/tasks)
    AGENT_HEARTBEAT_INTERVAL — Seconds between heartbeats (default: 30)
"""

import os
import sys
import json
import time
import signal
import errno
import logging
import threading
import subprocess
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

LOG_FORMAT = "%(asctime)s %(levelname)-8s %(name)-20s %(message)s"
logging.basicConfig(level=logging.INFO, format=LOG_FORMAT)
logger = logging.getLogger("clawforge.agent_service")


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

class Config:
    """Configuration from environment variables with sensible defaults."""

    def __init__(self):
        self.api_base_url = os.environ.get("CLAWFORGE_API_URL", "http://localhost:3000")
        self.queue_dir = Path(os.environ.get("CLAWFORGE_QUEUE_DIR", "~/.clawforge/tasks")).expanduser()
        self.heartbeat_interval = int(os.environ.get("AGENT_HEARTBEAT_INTERVAL", "30"))
        self.max_retries = int(os.environ.get("AGENT_MAX_RETRIES", "3"))
        self.retry_delay_base = float(os.environ.get("AGENT_RETRY_DELAY_BASE", "2.0"))
        self.poll_interval = float(os.environ.get("AGENT_POLL_INTERVAL", "5.0"))
        self.approval_timeout = float(os.environ.get("AGENT_APPROVAL_TIMEOUT", "3600.0"))
        self.startup_timeout = int(os.environ.get("AGENT_STARTUP_TIMEOUT", "60"))

    @property
    def pending_dir(self) -> Path:
        return self.queue_dir / "pending"

    @property
    def done_dir(self) -> Path:
        return self.queue_dir / "done"

    @property
    def failed_dir(self) -> Path:
        return self.queue_dir / "failed"

    @property
    def active_dir(self) -> Path:
        return self.queue_dir / "active"

    @property
    def heartbeat_file(self) -> Path:
        return self.queue_dir / "heartbeat.json"

    @property
    def approvals_dir(self) -> Path:
        return self.queue_dir / "pending_approvals"


# ---------------------------------------------------------------------------
# API Client — calls the existing TypeScript ClawForge API
# ---------------------------------------------------------------------------

class ClawForgeApiClient:
    """
    HTTP client for the ClawForge API.

    Calls the existing TypeScript API handlers (api.ts) via localhost HTTP.
    All requests/responses are JSON. Errors raise ApiError.
    """

    def __init__(self, base_url: str, timeout: int = 30):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    # ---- Request helpers ---------------------------------------------------

    def _request(self, method: str, path: str, body: Optional[dict] = None) -> dict:
        """Make an HTTP request to the ClawForge API. Returns parsed JSON."""
        url = f"{self.base_url}{path}"
        headers = {"content-type": "application/json", "accept": "application/json"}

        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(url, data=data, headers=headers, method=method)

        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            try:
                err_body = json.loads(e.read().decode("utf-8"))
                raise ApiError(
                    code=err_body.get("error", {}).get("code", "INTERNAL_ERROR"),
                    message=err_body.get("error", {}).get("message", str(e)),
                    status=e.code,
                )
            except (ValueError, OSError):
                raise ApiError(code="INTERNAL_ERROR", message=str(e), status=e.code)
        except urllib.error.URLError as e:
            raise ApiError(code="NETWORK_ERROR", message=str(e), status=0)

    def get(self, path: str) -> dict:
        return self._request("GET", path)

    def post(self, path: str, body: Optional[dict] = None) -> dict:
        return self._request("POST", path, body)

    # ---- API calls that map to existing TypeScript handlers ---------------

    def health_check(self) -> dict:
        """GET /api/v1/clawforge/agents — health endpoint (or generic health)."""
        # Falls back to checking if the API server is reachable
        return self.get("/api/v1/clawforge")

    def run_predeploy_check(
        self, provider: str = "mock", scenario: str = "happy_path"
    ) -> dict:
        """
        POST /api/v1/clawforge/agents/predeploy-test
        Runs the OpenHands predeploy sandbox check.
        """
        return self.post("/api/v1/clawforge/agents/predeploy-test", {
            "provider": provider,
            "scenario": scenario,
        })

    def deploy_agent(self, blueprint_id: str, blueprint: Optional[dict] = None) -> dict:
        """
        POST /api/v1/clawforge/agents/deploy
        Creates a NemoClawSandboxSession and transitions to running.
        """
        payload: dict = {"blueprint_id": blueprint_id}
        if blueprint:
            payload["blueprint"] = blueprint
        return self.post("/api/v1/clawforge/agents/deploy", payload)

    def get_agent_status(self, agent_id: str) -> dict:
        """GET /api/v1/clawforge/agents/:agentId — runtime state and events."""
        return self.get(f"/api/v1/clawforge/agents/{agent_id}")

    def get_agent_report(self, agent_id: str) -> dict:
        """GET /api/v1/clawforge/agents/:agentId/report"""
        return self.get(f"/api/v1/clawforge/agents/{agent_id}/report")

    def get_agent_events(self, agent_id: str) -> list:
        """GET /api/v1/clawforge/agents/:agentId/logs/stream — SSE events as array."""
        return self.get(f"/api/v1/clawforge/agents/{agent_id}/logs")

    def resolve_approval(self, approval_id: str, decision: str) -> dict:
        """
        POST /api/v1/clawforge/approvals/:id/decision
        decision must be "approved" or "denied".
        """
        return self.post(f"/api/v1/clawforge/approvals/{approval_id}/decision", {
            "decision": decision,
        })

    def chat_with_openhands(self, message: str, provider: str = "auto") -> dict:
        """
        POST /api/v1/clawforge/openhands/chat
        Routes to the OpenHands sandbox or ProviderRegistry.
        """
        return self.post("/api/v1/clawforge/openhands/chat", {
            "message": message,
            "provider": provider,
        })

    def add_memory(self, agent_id: str, content: str, mem_type: str = "context") -> dict:
        """POST /api/memory/add — store result in memory layer."""
        return self.post("/api/memory/add", {
            "agent_id": agent_id,
            "content": content,
            "type": mem_type,
        })


class ApiError(Exception):
    """API error with code, message, and HTTP status."""

    def __init__(self, code: str, message: str, status: int):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status

    def is_retryable(self) -> bool:
        """Network errors and 5xx are retryable. 4xx are not."""
        return self.code in ("NETWORK_ERROR", "INTERNAL_ERROR") or self.status >= 500


# ---------------------------------------------------------------------------
# Task Queue — filesystem-based, crash-resilient
# ---------------------------------------------------------------------------

class TaskQueue:
    """
    Filesystem-based task queue.

    Structure:
      queue_dir/
        pending/     ← incoming tasks (JSON files)
        active/      ← task currently being processed (contains lock file)
        done/        ← completed tasks
        failed/      ← tasks that errored after all retries
        pending_approvals/  ← approval resolution files written by human operators

    Each task JSON file:
      {
        "task_id": "task_123",
        "blueprint_id": "...",
        "blueprint": { ... },     // optional full blueprint
        "provider": "nemotron",
        "approval_mode": "auto",  // "auto" | "manual"
        "created_at": "ISO8601",
        "retries": 0,
        "crashed_at": null
      }

    Each approval resolution file (written by human operator):
      {
        "approval_id": "approval_abc",
        "decision": "approved"   // or "denied"
      }
    """

    def __init__(self, config: Config):
        self.config = config
        self._ensure_dirs()

    def _ensure_dirs(self):
        """Create all queue directories."""
        for d in [
            self.config.pending_dir,
            self.config.done_dir,
            self.config.failed_dir,
            self.config.active_dir,
            self.config.approvals_dir,
        ]:
            d.mkdir(parents=True, exist_ok=True)

    # ---- Task management --------------------------------------------------

    def enqueue(self, task: dict) -> str:
        """Write a new task to the pending directory. Returns task_id."""
        task_id = task.get("task_id", f"task_{time.time_ns()}")
        task_path = self.config.pending_dir / f"{task_id}.json"
        payload = {
            "task_id": task_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "retries": 0,
            "crashed_at": None,
            **task,
        }
        task_path.write_text(json.dumps(payload, indent=2))
        logger.info("Enqueued task %s", task_id)
        return task_id

    def pop_task(self) -> Optional[dict]:
        """
        Atomically pick the oldest task from pending/ and move to active/.
        Returns None if queue is empty.
        """
        pending = sorted(self.config.pending_dir.glob("*.json"))
        for task_path in pending:
            try:
                task = json.loads(task_path.read_text())
            except (json.JSONDecodeError, OSError):
                logger.warning("Could not read task file %s — skipping", task_path.name)
                continue

            task_id = task.get("task_id", task_path.stem)
            active_path = self.config.active_dir / f"{task_id}.json"

            try:
                task_path.rename(active_path)
            except OSError:
                # Task was taken by another process — skip
                continue

            lock_file = self.config.active_dir / f"{task_id}.lock"
            lock_file.write_text(datetime.now(timezone.utc).isoformat())
            logger.info("Picked up task %s", task_id)
            return task

        return None

    def complete_task(self, task_id: str) -> None:
        """Move completed task from active/ to done/."""
        self._release_task(task_id, self.config.done_dir)

    def fail_task(self, task_id: str, error: Optional[str] = None) -> None:
        """Move failed task from active/ to failed/ with error annotation."""
        active_path = self.config.active_dir / f"{task_id}.json"
        if active_path.exists():
            try:
                task = json.loads(active_path.read_text())
                task["error"] = error
                task["failed_at"] = datetime.now(timezone.utc).isoformat()
                dest = self.config.failed_dir / f"{task_id}.json"
                dest.write_text(json.dumps(task, indent=2))
                active_path.unlink()
            except (json.JSONDecodeError, OSError):
                pass

        self._cleanup_task(task_id)

    def _release_task(self, task_id: str, dest_dir: Path) -> None:
        """Move task file from active/ to dest_dir and clean up lock."""
        active_path = self.config.active_dir / f"{task_id}.json"
        if active_path.exists():
            dest = dest_dir / f"{task_id}.json"
            try:
                active_path.rename(dest)
            except OSError:
                pass
        self._cleanup_task(task_id)

    def _cleanup_task(self, task_id: str) -> None:
        """Remove lock and approval files for a task."""
        lock = self.config.active_dir / f"{task_id}.lock"
        if lock.exists():
            lock.unlink()
        for ext in ("jsonl", "approval", "response"):
            f = self.config.active_dir / f"{task_id}.{ext}"
            if f.exists():
                f.unlink()

    # ---- Approval queue ---------------------------------------------------

    def write_approval_request(self, task_id: str, approval_id: str, approval_data: dict) -> None:
        """Write pending approval to disk so a human operator can resolve it."""
        path = self.config.approvals_dir / f"{approval_id}.json"
        payload = {
            "approval_id": approval_id,
            "task_id": task_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "resolved": False,
            **approval_data,
        }
        path.write_text(json.dumps(payload, indent=2))
        logger.info("Wrote approval request %s for task %s", approval_id, task_id)

    def poll_approval_resolution(self, approval_id: str, timeout: float) -> Optional[str]:
        """
        Poll for approval resolution file or API state.
        Returns "approved", "denied", or None if timed out.
        """
        deadline = time.monotonic() + timeout
        path = self.config.approvals_dir / f"{approval_id}.json"

        while time.monotonic() < deadline:
            # Check for resolution file written by operator
            if path.exists():
                try:
                    data = json.loads(path.read_text())
                    if data.get("resolved") or data.get("decision"):
                        return data.get("decision", "denied")
                except (json.JSONDecodeError, OSError):
                    pass

            time.sleep(self.config.poll_interval)

        return None

    # ---- Recovery ---------------------------------------------------------

    def recover_stale_tasks(self) -> None:
        """On startup, return any tasks left in active/ back to pending/."""
        for active_path in self.config.active_dir.glob("*.json"):
            task_id = active_path.stem
            try:
                task = json.loads(active_path.read_text())
                task["crashed_at"] = datetime.now(timezone.utc).isoformat()
                task["retries"] = task.get("retries", 0) + 1
                pending_dest = self.config.pending_dir / f"{task_id}.json"
                pending_dest.write_text(json.dumps(task, indent=2))
                active_path.unlink()
                logger.info("Recovered stale task %s (crashed at %s)", task_id, task["crashed_at"])
            except (json.JSONDecodeError, OSError):
                # File is corrupt — just remove it
                active_path.unlink()

        # Clean up stale locks
        for lock_path in self.config.active_dir.glob("*.lock"):
            task_id = lock_path.stem
            active_task = self.config.active_dir / f"{task_id}.json"
            if not active_task.exists():
                lock_path.unlink()

    # ---- Event log -------------------------------------------------------

    def append_event(self, task_id: str, event: dict) -> None:
        """Append an event to the task's event log file."""
        log_path = self.config.active_dir / f"{task_id}.jsonl"
        with log_path.open("a") as f:
            f.write(json.dumps(event) + "\n")


# ---------------------------------------------------------------------------
# Agent Execution Engine
# ---------------------------------------------------------------------------

class AgentExecutor:
    """
    Executes a single ClawForge task by coordinating with the TypeScript API.

    Does NOT replicate NemoClawSandboxSession locally — drives it through API calls.
    Handles the full lifecycle: predeploy check → deploy → poll for approval →
    complete → store results.
    """

    def __init__(self, api: ClawForgeApiClient, queue: TaskQueue, config: Config):
        self.api = api
        self.queue = queue
        self.config = config

    def execute(self, task: dict) -> bool:
        """
        Execute a single task. Returns True on success, False on failure.
        Calls the TypeScript API in the correct order to drive the session.
        """
        task_id = task.get("task_id", "unknown")
        blueprint = task.get("blueprint")
        blueprint_id = task.get("blueprint_id", "")
        provider = task.get("provider", "auto")
        approval_mode = task.get("approval_mode", "auto")

        self._emit_event(task_id, "agent.started", f"Task {task_id} starting", "info")

        try:
            # --- Step 1: Predeploy check ---------------------------------
            self._emit_event(task_id, "policy.checked", "Running predeploy sandbox check", "info")

            # Build sentinel blueprint for predeploy check
            # In production, blueprint_id is required. We use mock provider for the check.
            predeploy_result = self.api.run_predeploy_check(provider="mock", scenario="happy_path")

            if not predeploy_result.get("predeploy", {}).get("deploymentAllowed", False):
                report = predeploy_result.get("predeploy", {}).get("report", "Blocked by policy")
                self._emit_event(task_id, "policy.blocked", report, "error")
                return self._fail(task_id, f"Predeploy blocked: {report}")

            self._emit_event(task_id, "policy.checked", "Predeploy passed", "success")

            # --- Step 2: Deploy agent ------------------------------------
            self._emit_event(task_id, "agent.started", "Deploying agent into NemoClaw", "info")

            deploy_result = self.api.deploy_agent(blueprint_id, blueprint)
            agent_id = deploy_result.get("agent_id", "")
            status = deploy_result.get("status", "running")

            self._emit_event(task_id, "session.deployed", f"Agent {agent_id} deployed", "success", {
                "agent_id": agent_id,
                "status": status,
            })

            if not agent_id:
                return self._fail(task_id, "Deploy response missing agent_id")

            # --- Step 3: Poll for completion / approval ------------------
            success = self._poll_for_completion(task_id, agent_id, approval_mode)

            # --- Step 4: Store results in memory ------------------------
            if success:
                self._store_results(task_id, agent_id)

            return success

        except ApiError as e:
            logger.error("API error for task %s: %s (code=%s, status=%d)", task_id, e.message, e.code, e.status)
            if e.is_retryable():
                return self._retry(task_id, task, e)
            return self._fail(task_id, f"API error: {e.message}")
        except Exception as e:
            logger.exception("Unexpected error executing task %s", task_id)
            return self._fail(task_id, str(e))

    def _poll_for_completion(
        self, task_id: str, agent_id: str, approval_mode: str
    ) -> bool:
        """
        Poll the API until the agent reaches a terminal state or approval gate.
        Returns True on successful completion, False on failure.
        """
        max_iterations = 720  # ~1 hour at 5s poll
        iteration = 0

        while iteration < max_iterations:
            iteration += 1

            # Get current runtime state
            try:
                status_resp = self.api.get_agent_status(agent_id)
            except ApiError as e:
                if e.status == 404:
                    # Agent completed and was cleaned up — that's ok
                    self._emit_event(task_id, "session.completed", "Agent completed", "success")
                    return True
                raise

            runtime_status = status_resp.get("status", "running")
            events = status_resp.get("events", [])

            # Stream events to log file
            for event in events[-5:]:  # Only new events
                self._emit_event(task_id, event.get("type", "info"), event.get("message", ""),
                                 event.get("severity", "info"), event.get("metadata"))

            if runtime_status in ("completed", "stopped"):
                self._emit_event(task_id, "session.completed", f"Agent reached {runtime_status}", "success")
                return True

            if runtime_status == "waiting_for_approval":
                # Find pending approval
                approval = status_resp.get("pending_approval")
                if not approval:
                    # Try to find via events
                    approval = self._find_pending_approval(events)

                if approval:
                    approval_id = approval.get("id", "")
                    self._emit_event(task_id, "approval.requested",
                                     f"Approval required: {approval.get('reason', '')}", "warning", {
                        "approval_id": approval_id,
                        "action": approval.get("action"),
                    })

                    # Write approval request for human operator
                    self.queue.write_approval_request(task_id, approval_id, {
                        "action": approval.get("action"),
                        "command": approval.get("command"),
                        "reason": approval.get("reason"),
                        "policy_id": approval.get("policy_id"),
                    })

                    if approval_mode == "auto":
                        decision = "approved"
                    else:
                        # Wait for human resolution
                        decision = self.queue.poll_approval_resolution(
                            approval_id, self.config.approval_timeout
                        )
                        if decision is None:
                            self._emit_event(task_id, "approval.timeout",
                                             "Approval timed out", "error")
                            return self._fail(task_id, "Approval timeout")

                    # Submit decision
                    try:
                        self.api.resolve_approval(approval_id, decision)
                        self._emit_event(task_id, "approval.resolved",
                                         f"Approval {decision}", "success")
                    except ApiError as e:
                        if e.code == "CONFLICT":
                            # Already resolved — this is ok in auto mode
                            pass
                        else:
                            raise
                else:
                    # waiting_for_approval but no approval found — might be race condition
                    pass

            time.sleep(self.config.poll_interval)

        self._emit_event(task_id, "agent.error", "Polling timed out after 1 hour", "error")
        return False

    def _find_pending_approval(self, events: list) -> Optional[dict]:
        """Extract approval request from event stream."""
        for event in events:
            if event.get("type") == "approval.requested":
                metadata = event.get("metadata", {})
                return {
                    "id": metadata.get("approval_id", ""),
                    "action": metadata.get("action", ""),
                    "reason": event.get("message", ""),
                }
        return None

    def _store_results(self, task_id: str, agent_id: str) -> None:
        """Fetch report and store in memory via the memory API."""
        try:
            report_resp = self.api.get_agent_report(agent_id)
            report = report_resp.get("report", {})
            summary = json.dumps(report, indent=2)[:500]
            self.api.add_memory(agent_id, f"Task {task_id} completed. Report: {summary}")
            self._emit_event(task_id, "memory.updated", "Results stored in memory", "success")
        except ApiError as e:
            logger.warning("Could not store memory for task %s: %s", task_id, e.message)

    def _emit_event(self, task_id: str, event_type: str, message: str,
                    severity: str = "info", metadata: Optional[dict] = None) -> None:
        """Append an event to the task log and log to logger."""
        event = {
            "id": f"evt_{int(time.time() * 1000)}",
            "task_id": task_id,
            "type": event_type,
            "message": message,
            "severity": severity,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "metadata": metadata or {},
        }
        self.queue.append_event(task_id, event)
        logger.info("[%s] %s: %s", severity.upper(), event_type, message)

    def _fail(self, task_id: str, reason: str) -> bool:
        """Mark task as failed and return False."""
        self.queue.fail_task(task_id, reason)
        return False

    def _retry(self, task_id: str, task: dict, error: ApiError) -> bool:
        """Re-enqueue task for retry with backoff."""
        retries = task.get("retries", 0) + 1
        if retries > self.config.max_retries:
            return self._fail(task_id, f"Max retries exceeded: {error.message}")

        task["retries"] = retries
        backoff = self.config.retry_delay_base ** retries
        logger.info("Retrying task %s in %.1fs (attempt %d/%d)", task_id, backoff, retries,
                    self.config.max_retries)

        time.sleep(backoff)
        self.queue.enqueue(task)
        return False


# ---------------------------------------------------------------------------
# Agent Service — main runtime loop
# ---------------------------------------------------------------------------

class AgentService:
    """
    Persistent agent service that runs forever, processing tasks from the queue.

    Lifecycle:
      1. __init__      → configure, set up signal handlers
      2. start()       → runforever() loop
      3. run_forever() → fetch_and_execute_task() loop with error recovery
      4. shutdown()    → graceful stop
    """

    def __init__(self, config: Optional[Config] = None):
        self.config = config or Config()
        self.api = ClawForgeApiClient(self.config.api_base_url)
        self.queue = TaskQueue(self.config)
        self.executor = AgentExecutor(self.api, self.queue, self.config)

        self._running = False
        self._shutting_down = False
        self._current_task_id: Optional[str] = None
        self._heartbeat_thread: Optional[threading.Thread] = None
        self._last_heartbeat: Optional[str] = None
        self._errors: list = []

        self._setup_signals()

    def _setup_signals(self):
        """Install signal handlers for graceful shutdown."""
        for sig in (signal.SIGTERM, signal.SIGINT):
            signal.signal(sig, self._signal_handler)

    def _signal_handler(self, signum, frame):
        """Handle shutdown signals gracefully."""
        sig_name = signal.Signals(signum).name
        logger.info("Received %s — initiating graceful shutdown", sig_name)
        self._shutting_down = True

    # ---- Lifecycle --------------------------------------------------------

    def start(self) -> None:
        """Start the agent service. Blocks until shutdown."""
        logger.info("ClawForge Agent Service starting")
        logger.info("  API:    %s", self.config.api_base_url)
        logger.info("  Queue:  %s", self.config.queue_dir)
        logger.info("  Poll:   %.1fs interval", self.config.poll_interval)

        # Recover any tasks left in active/ from a previous crash
        self.queue.recover_stale_tasks()

        # Wait for API to be reachable
        if not self._wait_for_api():
            logger.error("API is not reachable — exiting")
            sys.exit(1)

        # Start heartbeat thread
        self._heartbeat_thread = threading.Thread(target=self._heartbeat_loop, daemon=True)
        self._heartbeat_thread.start()

        logger.info("Agent Service ready")

        self.run_forever()

    def run_forever(self) -> None:
        """Main loop: fetch a task, execute it, repeat until shutdown."""
        self._running = True

        while not self._shutting_down:
            # Check if API is still reachable
            if not self._is_api_reachable():
                logger.warning("API unreachable — waiting for recovery")
                time.sleep(self.config.poll_interval * 2)
                continue

            # Pick next task
            task = self.queue.pop_task()

            if task is None:
                # No tasks — sleep and retry
                time.sleep(self.config.poll_interval)
                continue

            self._current_task_id = task.get("task_id")
            self._errors = []

            try:
                success = self.executor.execute(task)
                if success:
                    self.queue.complete_task(self._current_task_id)
                else:
                    # Failure already logged and task moved to failed/ by executor
                    pass
            except Exception:
                logger.exception("Unhandled error in execute()")
                self._errors.append({"task_id": self._current_task_id, "error": traceback.format_exc()})
                self.queue.fail_task(self._current_task_id, "Unhandled exception")
            finally:
                self._current_task_id = None

        logger.info("Agent Service stopped — %d errors during lifetime", len(self._errors))

    def shutdown(self) -> None:
        """Graceful shutdown — finish current task then exit."""
        logger.info("Shutdown requested")
        self._shutting_down = True
        # Give current task a chance to checkpoint (future enhancement)
        # For now, we just let the loop exit naturally
        self._running = False

    # ---- Health & Recovery -----------------------------------------------

    def report_status(self) -> dict:
        """
        Health check data — written to heartbeat.json every heartbeat interval.
        Also suitable for HTTP health endpoint.
        """
        return {
            "ok": True,
            "service": "clawforge-agent",
            "version": "1.0.0",
            "state": "running" if self._running else ("shutting_down" if self._shutting_down else "idle"),
            "current_task_id": self._current_task_id,
            "last_heartbeat": self._last_heartbeat,
            "queue_depth": len(list(self.config.pending_dir.glob("*.json"))),
            "errors": self._errors[-10:],  # Last 10 errors
            "uptime_seconds": getattr(self, "_uptime_start", 0),
        }

    def _heartbeat_loop(self) -> None:
        """Background thread: write heartbeat file every interval."""
        self._uptime_start = time.time()
        while not self._shutting_down:
            time.sleep(self.config.heartbeat_interval)
            status = self.report_status()
            self._last_heartbeat = status["last_heartbeat"] = datetime.now(timezone.utc).isoformat()
            try:
                self.config.heartbeat_file.write_text(json.dumps(status, indent=2))
            except OSError as e:
                logger.warning("Could not write heartbeat file: %s", e)

    def _wait_for_api(self, timeout: Optional[int] = None) -> bool:
        """Wait for the ClawForge API to become reachable. Returns True on success."""
        timeout = timeout or self.config.startup_timeout
        deadline = time.monotonic() + timeout

        while time.monotonic() < deadline:
            if self._is_api_reachable():
                return True
            logger.info("Waiting for API at %s ...", self.config.api_base_url)
            time.sleep(2)

        return False

    def _is_api_reachable(self) -> bool:
        """Check if the API server is reachable."""
        try:
            self.api.health_check()
            return True
        except ApiError:
            return False
        except Exception:
            return False

    # ---- Task injection (for testing / manual triggers) -------------------

    def enqueue_task(self, task: dict) -> str:
        """Add a task to the queue. Returns task_id."""
        return self.queue.enqueue(task)


# ---------------------------------------------------------------------------
# CLI entrypoint
# ---------------------------------------------------------------------------

def main():
    """Parse args and start the agent service."""
    import argparse

    parser = argparse.ArgumentParser(description="ClawForge Persistent Agent Service")
    parser.add_argument(
        "--queue-dir",
        type=Path,
        default=Path("~/.clawforge/tasks").expanduser(),
        help="Root directory for task queue (default: ~/.clawforge/tasks)",
    )
    parser.add_argument(
        "--api-url",
        default=os.environ.get("CLAWFORGE_API_URL", "http://localhost:3000"),
        help="ClawForge API base URL (default: http://localhost:3000)",
    )
    parser.add_argument(
        "--poll-interval",
        type=float,
        default=float(os.environ.get("AGENT_POLL_INTERVAL", "5.0")),
        help="Seconds between queue polls (default: 5.0)",
    )
    parser.add_argument(
        "--heartbeat-interval",
        type=int,
        default=int(os.environ.get("AGENT_HEARTBEAT_INTERVAL", "30")),
        help="Seconds between heartbeat writes (default: 30)",
    )
    args = parser.parse_args()

    # Build config from args
    config = Config()
    config.queue_dir = args.queue_dir
    config.api_base_url = args.api_url
    config.poll_interval = args.poll_interval
    config.heartbeat_interval = args.heartbeat_interval

    service = AgentService(config)
    service.start()


if __name__ == "__main__":
    main()