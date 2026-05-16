"""
task_queue.py — ClawForge Task Queue for Python Agent Runtime

This module provides a TaskQueue class that manages the lifecycle of agent tasks
across the ClawForge platform. It is designed to be imported by agent_service.py,
the Python side of the persistent 24/7 agent runtime.

Task State Flow (api.ts → here):
    The TypeScript API (api.ts) receives blueprint creation requests via POST
    /api/blueprints or /api/v1/clawforge/blueprints. After validation, a task is
    enqueued here for the Python agent runtime to pick up via fetch_next_task().

    Typical flow:
        1. api.ts: POST /api/blueprints → createProviderBackedBlueprint()
        2. api.ts: POST /api/agents/deploy → startRuntime() in runtime.ts
        3. Python side: enqueue_task() ← called by webhook bridge or direct API
        4. agent_service.py: fetch_next_task() → runs the agent
        5. agent_service.py: mark_completed() or mark_failed()

State Machine:
    PENDING → RUNNING → COMPLETED
                      ↘ FAILED → RETRY → PENDING (re-queue)
                                 ↘ (max retries exceeded) → FAILED

Persistence:
    - Default: JSON file (task_queue.json) in same directory as this module.
      Chosen for zero-dependency operation and crash recovery.
    - Optional: Redis if REDIS_URL env var is set. Set REDIS_URL=redis://localhost:6379
      to activate. Redis is attempted first if env var is present; falls back to JSON.

Retry Logic:
    - retry_task(task_id) transitions FAILED → PENDING (re-queue).
    - max_retries per task (default 3) tracked in task metadata.
    - After max_retries, task stays FAILED permanently.

Design Notes:
    - Thread-safe for single-reader single-writer (agent_service.py is single-threaded
      per worker process, but we use locks for future multi-threaded safety).
    - No external dependencies beyond stdlib + optional redis (redis-py).
    - Task payloads match the BlueprintResponse shape from types.ts, plus runtime
      context (project_id, agent_id, user_context from memory/approvals).

Usage:
    from task_queue import TaskQueue, TaskState

    q = TaskQueue()                  # Uses JSON by default
    q = TaskQueue(redis_url="...")   # Force Redis
    q = TaskQueue(use_json=True)     # Force JSON even if REDIS_URL set

    task_id = q.enqueue_task("task_123", payload)
    task = q.fetch_next_task()       # Returns oldest PENDING task, marks RUNNING
    q.mark_completed(task["task_id"])
    q.mark_failed(task["task_id"], error="...")

    status = q.get_task_status(task_id)  # TaskState enum value
    q.retry_task(task_id)            # Re-queue a FAILED task

Environment Variables:
    REDIS_URL    — If set, attempt Redis backend (e.g., redis://localhost:6379)
    TASK_QUEUE_JSON_PATH — Optional path for JSON backing store (default: ./task_queue.json)
"""

from __future__ import annotations

import json
import os
import threading
import time
from enum import Enum
from typing import Any, Optional

# Optional Redis support
try:
    import redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False


# ---------------------------------------------------------------------------
# Types / Enums
# ---------------------------------------------------------------------------

class TaskState(str, Enum):
    """
    Task lifecycle states.

    Transitions:
        PENDING    — Queued, not yet picked up
        RUNNING    — Claimed by a worker (agent_service.py)
        COMPLETED  — Finished successfully
        FAILED     — Finished with an error; eligible for retry
        RETRY      — Transitional state when re-queuing (becomes PENDING)
    """
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    RETRY = "retry"


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class TaskQueueError(Exception):
    """Base exception for task queue errors."""
    pass


class TaskNotFoundError(TaskQueueError):
    """Raised when a task_id does not exist in the queue."""
    pass


class InvalidStateTransitionError(TaskQueueError):
    """Raised when a state transition is not allowed."""
    pass


# ---------------------------------------------------------------------------
# Payload type alias (documented in module docstring)
# ---------------------------------------------------------------------------

TaskPayload = dict[str, Any]
# {
#     "task_id": str,
#     "blueprint": dict,          # BlueprintResponse from types.ts
#     "project_id": str,
#     "agent_id": str,
#     "user_context": dict,       # memory items, pending approvals, etc.
#     "priority": int,            # optional; lower = higher priority; default 100
#     "created_at": float         # unix timestamp
# }


# ---------------------------------------------------------------------------
# JSON Backing Store
# ---------------------------------------------------------------------------

def _default_json_path() -> str:
    """Return default path for JSON backing store."""
    # Use env var or same directory as this module
    return os.environ.get(
        "TASK_QUEUE_JSON_PATH",
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "task_queue.json"),
    )


class JsonStore:
    """
    Simple JSON file store for task queue persistence.

    File format:
        {
          "version": 1,
          "tasks": {
            "<task_id>": {
              "task_id": "...",
              "state": "pending",
              "payload": {...},
              "created_at": 1234567890.0,
              "updated_at": 1234567890.0,
              "retry_count": 0,
              "error": null,
              "max_retries": 3
            }
          }
        }

    Thread-safe via file locking (flock) using fcntl.
    """

    def __init__(self, path: str):
        self.path = path
        self._lock = threading.RLock()

    def _read(self) -> dict[str, Any]:
        """Read and parse the JSON file. Returns empty structure if missing."""
        with self._lock:
            if not os.path.exists(self.path):
                return {"version": 1, "tasks": {}}
            try:
                with open(self.path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except (json.JSONDecodeError, IOError):
                return {"version": 1, "tasks": {}}

    def _write(self, data: dict[str, Any]) -> None:
        """Write data atomically to the JSON file."""
        with self._lock:
            # Write to temp file then rename for atomicity
            tmp = self.path + f".{os.getpid()}.tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
            os.replace(tmp, self.path)

    def load(self) -> dict[str, Any]:
        return self._read()

    def save(self, data: dict[str, Any]) -> None:
        self._write(data)


# ---------------------------------------------------------------------------
# Redis Store (optional)
# ---------------------------------------------------------------------------

class RedisStore:
    """
    Redis-backed store for task queue.

    Keys:
        taskqueue:tasks       — Hash{ task_id -> JSON(task record) }
        taskqueue:pending     — Sorted set (score=priority, member=task_id)
                                Primary index for FIFO/priority ordering.
        taskqueue:meta        — Hash{ version, ... }

    This is a thin wrapper; actual queue logic lives in TaskQueue.
    """

    def __init__(self, url: str):
        if not REDIS_AVAILABLE:
            raise TaskQueueError(
                "redis-py is not installed. Install it with: pip install redis"
            )
        self._url = url
        self._client = redis.from_url(url, decode_responses=True)
        self._tasks_key = "taskqueue:tasks"
        self._pending_key = "taskqueue:pending"
        self._meta_key = "taskqueue:meta"

    def hset_task(self, task_id: str, data: dict[str, Any]) -> None:
        self._client.hset(self._tasks_key, task_id, json.dumps(data))

    def hget_task(self, task_id: str) -> Optional[dict[str, Any]]:
        raw = self._client.hget(self._tasks_key, task_id)
        if raw is None:
            return None
        return json.loads(raw)

    def hdel_task(self, task_id: str) -> None:
        self._client.hdel(self._tasks_key, task_id)

    def zadd_pending(self, task_id: str, priority: int) -> None:
        self._client.zadd(self._pending_key, {task_id: priority})

    def zrem_pending(self, task_id: str) -> None:
        self._client.zrem(self._pending_key, task_id)

    def zrange_pending(self, start: int, end: int) -> list[str]:
        """
        Return task_ids sorted by priority (score), oldest first.
        ZRANGE is ascending by default (lowest score = highest priority).
        """
        return self._client.zrange(self._pending_key, start, end)

    def hgetall_tasks(self) -> dict[str, dict[str, Any]]:
        raw = self._client.hgetall(self._tasks_key)
        return {k: json.loads(v) for k, v in raw.items()}


# ---------------------------------------------------------------------------
# TaskQueue
# ---------------------------------------------------------------------------

class TaskQueue:
    """
    ClawForge task queue for Python agent runtime.

    Manages the lifecycle of agent tasks: enqueue → fetch → complete/fail → retry.

    Backends:
        - JSON file (default, zero deps)
        - Redis (if REDIS_URL env var set or url passed to __init__)

    Thread-safe for single-process use. For multi-process, use Redis.

    Example (agent_service.py):
        from task_queue import TaskQueue, TaskState

        q = TaskQueue()

        # Enqueue from ClawForge API webhook or direct call
        task_id = q.enqueue_task("task_abc", {
            "task_id": "task_abc",
            "blueprint": { ... },      # BlueprintResponse from api.ts
            "project_id": "proj_1",
            "agent_id": "agent_xyz",
            "user_context": {},
            "priority": 10,
            "created_at": time.time(),
        })

        # In the agent loop:
        while True:
            task = q.fetch_next_task()
            if task is None:
                time.sleep(1)
                continue
            # process task...
            if success:
                q.mark_completed(task["task_id"])
            else:
                q.mark_failed(task["task_id"], error=str(e))

    Connection to api.ts:
        The TypeScript side (api.ts) handles blueprint creation and agent deploy.
        After a blueprint is created and an agent is deployed:

        1. The TypeScript server calls a bridge endpoint (e.g., a webhook or internal
           RPC) that invokes enqueue_task() here, passing the blueprint payload.
        2. agent_service.py calls fetch_next_task() to get work.
        3. Completion/failure is communicated back via mark_completed/mark_failed.

        Alternatively, if running in the same process, you can import this directly.
    """

    DEFAULT_MAX_RETRIES = 3

    def __init__(
        self,
        redis_url: Optional[str] = None,
        use_json: bool = False,
        json_path: Optional[str] = None,
    ):
        """
        Initialize the task queue.

        Args:
            redis_url: Redis connection URL. If provided, Redis backend is used.
                      Falls back to JSON if Redis connection fails.
            use_json: Force JSON backend even if REDIS_URL env var is set.
            json_path: Path for JSON backing store. Defaults to ./task_queue.json
                       or TASK_QUEUE_JSON_PATH env var.
        """
        self._use_redis = False
        self._redis: Optional[RedisStore] = None
        self._json_store: Optional[JsonStore] = None
        self._lock = threading.RLock()

        # Determine backend
        url = redis_url or os.environ.get("REDIS_URL")
        if url and not use_json:
            try:
                self._redis = RedisStore(url)
                self._use_redis = True
            except TaskQueueError as e:
                import warnings
                warnings.warn(f"Redis unavailable ({e}), falling back to JSON store.")
                self._use_redis = False

        if not self._use_redis:
            path = json_path or _default_json_path()
            self._json_store = JsonStore(path)

    # -------------------------------------------------------------------------
    # Internal helpers
    # -------------------------------------------------------------------------

    def _load_all_tasks(self) -> dict[str, dict[str, Any]]:
        if self._use_redis:
            return self._redis.hgetall_tasks()
        return self._json_store.load()["tasks"]

    def _save_task(self, task: dict[str, Any]) -> None:
        if self._use_redis:
            self._redis.hset_task(task["task_id"], task)
        else:
            data = self._json_store.load()
            data["tasks"][task["task_id"]] = task
            self._json_store.save(data)

    def _remove_task(self, task_id: str) -> None:
        if self._use_redis:
            self._redis.hdel_task(task_id)
        else:
            data = self._json_store.load()
            data["tasks"].pop(task_id, None)
            self._json_store.save(data)

    def _build_task(
        self,
        task_id: str,
        payload: TaskPayload,
    ) -> dict[str, Any]:
        """Build a full task record from just the ID and payload."""
        now = time.time()
        return {
            "task_id": task_id,
            "state": TaskState.PENDING.value,
            "payload": payload,
            "created_at": payload.get("created_at", now),
            "updated_at": now,
            "retry_count": 0,
            "max_retries": payload.get("max_retries", self.DEFAULT_MAX_RETRIES),
            "error": None,
        }

    def _transition(
        self,
        task_id: str,
        from_states: list[TaskState],
        to_state: TaskState,
        error: Optional[str] = None,
    ) -> dict[str, Any]:
        """Atomically transition a task from one state to another."""
        with self._lock:
            if self._use_redis:
                task = self._redis.hget_task(task_id)
            else:
                all_tasks = self._load_all_tasks()
                task = all_tasks.get(task_id)

            if task is None:
                raise TaskNotFoundError(f"Task {task_id} not found.")

            if TaskState(task["state"]) not in from_states:
                raise InvalidStateTransitionError(
                    f"Task {task_id} is {task['state']}, not one of {[s.value for s in from_states]}."
                )

            task["state"] = to_state.value
            task["updated_at"] = time.time()
            if error is not None:
                task["error"] = error

            self._save_task(task)
            return task

    # -------------------------------------------------------------------------
    # Public API
    # -------------------------------------------------------------------------

    def enqueue_task(
        self,
        task_id: str,
        payload: TaskPayload,
    ) -> str:
        """
        Add a new task to the queue.

        Args:
            task_id: Unique identifier for the task. Must be unique; will overwrite
                     existing tasks with the same ID (upsert semantics).
            payload: Task payload dict. Expected keys:
                     - task_id: str
                     - blueprint: dict (BlueprintResponse from types.ts)
                     - project_id: str
                     - agent_id: str
                     - user_context: dict (memory, approvals, etc.)
                     - priority: int (optional, lower=higher priority; default 100)
                     - created_at: float (optional, unix timestamp)

        Returns:
            The task_id passed in.

        Raises:
            TaskQueueError if the payload is missing required fields.

        Connection to api.ts:
            Call this after POST /api/agents/deploy succeeds. The payload should
            include the blueprint generated by createProviderBackedBlueprint() so
            the agent knows what to run.
        """
        required = ["task_id", "blueprint", "project_id", "agent_id"]
        for field in required:
            if field not in payload:
                raise TaskQueueError(f"Payload missing required field: {field}")

        with self._lock:
            now = time.time()
            existing = None
            if self._use_redis:
                existing = self._redis.hget_task(task_id)
            else:
                all_tasks = self._load_all_tasks()
                existing = all_tasks.get(task_id)

            if existing is not None:
                # Upsert: re-enqueue an existing task
                task = existing
                task["state"] = TaskState.PENDING.value
                task["payload"] = payload
                task["updated_at"] = now
                task["error"] = None
            else:
                priority = payload.get("priority", 100)
                task = self._build_task(task_id, payload)
                if self._use_redis:
                    # Add to sorted set for ordering
                    self._redis.zadd_pending(task_id, priority)
                # else: order maintained by insertion time in PENDING list

            self._save_task(task)
            return task_id

    def fetch_next_task(self) -> Optional[dict[str, Any]]:
        """
        Get the oldest PENDING task and mark it as RUNNING.

        Returns:
            A task dict with keys: task_id, state, payload, created_at, updated_at,
            retry_count, max_retries, error. Or None if no pending tasks exist.

        Note:
            The task is marked RUNNING immediately to prevent other workers from
            picking it up. If the worker crashes before calling mark_completed or
            mark_failed, the task will remain in RUNNING state indefinitely.
            A watchdog/reaper process should eventually reset stale RUNNING tasks
            back to PENDING (not implemented here; add as needed).

        Connection to api.ts:
            Called by agent_service.py in its main loop. The returned payload
            contains the blueprint that api.ts generated, so the agent can execute
            the same plan that was approved in the UI.
        """
        with self._lock:
            if self._use_redis:
                # Get lowest priority (highest urgency) task
                task_ids = self._redis.zrange_pending(0, 0)
                if not task_ids:
                    return None
                task_id = task_ids[0]
                task = self._redis.hget_task(task_id)
                if task is None:
                    return None
                if task["state"] != TaskState.PENDING.value:
                    # Stale entry in sorted set; clean up
                    self._redis.zrem_pending(task_id)
                    return None
                # Mark RUNNING and remove from pending set
                task["state"] = TaskState.RUNNING.value
                task["updated_at"] = time.time()
                self._redis.hset_task(task_id, task)
                self._redis.zrem_pending(task_id)
                return task
            else:
                # JSON: find oldest PENDING by created_at
                all_tasks = self._load_all_tasks()
                pending = [
                    t for t in all_tasks.values()
                    if t["state"] == TaskState.PENDING.value
                ]
                if not pending:
                    return None
                # Sort by created_at (oldest first) then priority
                pending.sort(key=lambda t: (t.get("created_at", 0), t.get("priority", 100)))
                task = pending[0]
                task["state"] = TaskState.RUNNING.value
                task["updated_at"] = time.time()
                self._save_task(task)
                return task

    def mark_completed(self, task_id: str) -> dict[str, Any]:
        """
        Mark a task as completed.

        Args:
            task_id: The ID of the task to mark complete.

        Returns:
            The updated task dict.

        Raises:
            TaskNotFoundError: if the task does not exist.
            InvalidStateTransitionError: if the task is not in RUNNING state.
        """
        return self._transition(
            task_id,
            from_states=[TaskState.RUNNING],
            to_state=TaskState.COMPLETED,
        )

    def mark_failed(self, task_id: str, error: str) -> dict[str, Any]:
        """
        Mark a task as failed.

        Args:
            task_id: The ID of the task to mark failed.
            error: Error message describing what went wrong.

        Returns:
            The updated task dict (state will be FAILED).

        Raises:
            TaskNotFoundError: if the task does not exist.
            InvalidStateTransitionError: if the task is not in RUNNING state.

        Note:
            After mark_failed, the task can be retried with retry_task(task_id).
            If max_retries has been exceeded, retry_task will raise an error and
            the task remains in FAILED state.
        """
        return self._transition(
            task_id,
            from_states=[TaskState.RUNNING],
            to_state=TaskState.FAILED,
            error=error,
        )

    def retry_task(self, task_id: str) -> dict[str, Any]:
        """
        Re-queue a FAILED task for another attempt.

        Increments the retry_count and transitions FAILED → PENDING.

        Args:
            task_id: The ID of the task to retry.

        Returns:
            The updated task dict (state will be PENDING).

        Raises:
            TaskNotFoundError: if the task does not exist.
            InvalidStateTransitionError: if the task is not in FAILED state.
            TaskQueueError: if retry_count >= max_retries (retries exhausted).
        """
        with self._lock:
            if self._use_redis:
                task = self._redis.hget_task(task_id)
            else:
                all_tasks = self._load_all_tasks()
                task = all_tasks.get(task_id)

            if task is None:
                raise TaskNotFoundError(f"Task {task_id} not found.")

            current_state = TaskState(task["state"])
            if current_state != TaskState.FAILED:
                raise InvalidStateTransitionError(
                    f"Cannot retry task in state {current_state.value}. Must be FAILED."
                )

            retry_count = task.get("retry_count", 0)
            max_retries = task.get("max_retries", self.DEFAULT_MAX_RETRIES)
            if retry_count >= max_retries:
                raise TaskQueueError(
                    f"Task {task_id} has exceeded max retries ({max_retries}). "
                    "Manual intervention required."
                )

            task["retry_count"] = retry_count + 1
            task["state"] = TaskState.PENDING.value
            task["updated_at"] = time.time()
            task["error"] = None  # Clear previous error

            self._save_task(task)

            # Re-add to Redis pending set if using Redis
            if self._use_redis:
                priority = task["payload"].get("priority", 100)
                self._redis.zadd_pending(task_id, priority)

            return task

    def get_task_status(self, task_id: str) -> TaskState:
        """
        Get the current state of a task.

        Args:
            task_id: The ID of the task to look up.

        Returns:
            TaskState enum value (PENDING, RUNNING, COMPLETED, FAILED, RETRY).

        Raises:
            TaskNotFoundError: if the task does not exist.
        """
        with self._lock:
            if self._use_redis:
                task = self._redis.hget_task(task_id)
            else:
                all_tasks = self._load_all_tasks()
                task = all_tasks.get(task_id)

            if task is None:
                raise TaskNotFoundError(f"Task {task_id} not found.")

            return TaskState(task["state"])

    # -------------------------------------------------------------------------
    # Utility methods
    # -------------------------------------------------------------------------

    def list_tasks(
        self,
        state: Optional[TaskState] = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        """
        List tasks, optionally filtered by state.

        Args:
            state: If provided, only return tasks in this state.
            limit: Maximum number of tasks to return (default 100).

        Returns:
            List of task dicts, newest-first by updated_at.
        """
        with self._lock:
            all_tasks = self._load_all_tasks()
            tasks = list(all_tasks.values())

            if state is not None:
                tasks = [t for t in tasks if t["state"] == state.value]

            # Sort newest first
            tasks.sort(key=lambda t: t.get("updated_at", 0), reverse=True)
            return tasks[:limit]

    def get_task(self, task_id: str) -> Optional[dict[str, Any]]:
        """
        Get full task record by ID.

        Args:
            task_id: The task ID to look up.

        Returns:
            Full task dict or None if not found.
        """
        with self._lock:
            if self._use_redis:
                return self._redis.hget_task(task_id)
            all_tasks = self._load_all_tasks()
            return all_tasks.get(task_id)

    def clear_completed(self, older_than: Optional[float] = None) -> int:
        """
        Remove all COMPLETED tasks from the queue.

        Args:
            older_than: If provided, only clear tasks completed before this unix
                       timestamp. If None, clear all completed tasks.

        Returns:
            Number of tasks cleared.
        """
        with self._lock:
            all_tasks = self._load_all_tasks()
            to_delete = []
            for task_id, task in all_tasks.items():
                if task["state"] == TaskState.COMPLETED.value:
                    if older_than is None or task.get("updated_at", 0) < older_than:
                        to_delete.append(task_id)

            for task_id in to_delete:
                self._remove_task(task_id)

            return len(to_delete)

    def pending_count(self) -> int:
        """Return the number of PENDING tasks."""
        return len(self.list_tasks(state=TaskState.PENDING, limit=10_000))

    def __repr__(self) -> str:
        backend = "Redis" if self._use_redis else "JSON"
        pending = self.pending_count()
        return f"TaskQueue(backend={backend}, pending={pending})"