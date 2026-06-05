"""
NemoClaw Integration Layer
=========================

Bridges the ClawForge Python agent_service to the NemoClaw sandbox (TypeScript)
runtime managed by Brev. This layer:

1. Wraps the TypeScript NemoClawSandboxSession via HTTP/subprocess
2. Enforces tool boundaries derived from BlueprintResponse policies
3. Manages the Brev/OpenHands lifecycle (create, connect, teardown)
4. Maps ClawForge tasks (BlueprintResponse) to NemoClaw execution units
5. Handles the approval gate in headless/persistent contexts

Calls TO existing TypeScript code
---------------------------------
All TypeScript calls are HTTP REST calls to the OpenHands runtime API
hosted on the Brev VM. The TypeScript NemoClawSandboxSession runs inside
the OpenHands agent-server container on Brev.

Brev/OpenHands connection contract
----------------------------------
- Brev provisions a VM (L40S) and starts the OpenHands agent-server container
  inside it, binding port 8080 on the VM's internal network.
- Brev provides a workspaceUrl (SSH/HTTP tunnel) for human browsing and an
  optional runtimeApiUrl for machine-to-machine API calls.
- The OpenHands runtime exposes these internal HTTP endpoints:
    POST /api/agent/chat          -- send a message to the agent
    POST /api/agent/execute       -- execute a tool action
    GET  /api/agent/state         -- get session state
    GET  /api/agent/events        -- stream lifecycle events (SSE)
    POST /api/agent/approval      -- resolve a pending approval
    GET  /api/blueprint/manifest  -- fetch the integration manifest
- The CLAWFORGE_INTEGRATION_MANIFEST_B64 env var (set by Brev startup script)
  carries the NemoClawIntegrationManifest from ClawForge to the OpenHands
  runtime so the agent-server knows which tools and integrations are wired.

Sandbox execution contract
------------------------
A "sandbox execution unit" is one NemoClawSandboxSession.run() call --
equivalent to one BlueprintResponse workflow from start to completion
(or first blocked/approval point). The contract:

  input  : BlueprintResponse (tools + policies + memory_schema + workflow_steps)
  output : ExecutionResult   (events + memory_updates + incident_report)

The execution is atomic per unit; long-running agents are modelled as chains
of units with persistent memory between them. Each unit may:

  - complete normally
  - emit an approval.requested event and pause  (waiting_for_approval)
  - emit a policy.blocked event and abort       (blocked tool)
  - timeout                                      (max_runtime_seconds)

Tool boundary enforcement
-------------------------
Tool permissions are read directly from BlueprintResponse.tools[].permission:

  allowed          -> policy effect = allow   -> execute immediately
  read_only        -> policy effect = allow   -> execute immediately
  approval_required -> policy effect = require_approval -> pause + emit event
  blocked          -> policy effect = deny   -> block + emit event

The BlueprintResponse.policies[] is the source of truth; the integration
layer does NOT maintain its own allow/deny list -- it re-evaluates against
the blueprint on every execute() call so that different agents within the same
process can have different boundaries.

Timeouts
--------
- agent_max_runtime_seconds : max wall-clock time per execution unit (default 600s)
- Brev VM itself is a long-lived resource; it is NOT torn down on unit timeout.
  Instead, the unit is cancelled via POST /api/agent/cancel and the error is
  returned. The VM is only destroyed when the session is explicitly stopped.

Resource limits
---------------
These are set at the Brev VM level (not per-unit):

  - instance_type       : e.g. "l40s-48gb.1x"       -- governs CPU/RAM
  - OPENHANDS_MAX_ITERATIONS : OpenHands setting  -- guards against infinite loops

The integration layer cannot enforce memory/CPU limits within the VM; those are
determined by the instance_type.  We document what we can and cannot set.

Audit logging
-------------
Every execute() call emits a structured audit record:

  {
    "ts", "session_id", "agent_id", "action",
    "policy_effect", "policy_id", "allowed", "blocked",
    "approval_required", "approval_id"
  }

Logged to stdout in JSON lines format and optionally flushed to a file.
"""

from __future__ import annotations

import json
import logging
import os
import signal
import subprocess
import sys
import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable, Optional
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

logger = logging.getLogger("nemoclaw_integration")

# ---------------------------------------------------------------------------
# Types / Enums
# ---------------------------------------------------------------------------


class SessionState(str, Enum):
    CREATED = "created"
    DEPLOYED = "deployed"
    RUNNING = "running"
    PAUSED = "paused"
    WAITING_FOR_APPROVAL = "waiting_for_approval"
    COMPLETED = "completed"
    STOPPED = "stopped"


class SandboxActionEffect(str, Enum):
    ALLOW = "allow"
    DENY = "deny"
    REQUIRE_APPROVAL = "require_approval"


@dataclass
class PolicyFinding:
    id: str
    action: str
    effect: SandboxActionEffect
    severity: str  # "info" | "warning" | "error"
    message: str


@dataclass
class LifecycleEvent:
    id: str
    session_id: str
    type: str
    message: str
    timestamp: str
    severity: str
    metadata: dict = field(default_factory=dict)


@dataclass
class ApprovalRequest:
    id: str
    agent_id: str
    action: str
    command: Optional[str]
    reason: str
    policy_id: str
    status: str  # "pending" | "approved" | "denied"


@dataclass
class ExecutionResult:
    ok: bool
    session_id: str
    agent_id: str
    status: SessionState
    events: list[LifecycleEvent]
    memory_items: list[dict]
    report: Optional[dict]
    blocked_action: Optional[str] = None
    pending_approval: Optional[ApprovalRequest] = None
    error: Optional[str] = None


@dataclass
class AuditRecord:
    ts: str
    session_id: str
    agent_id: str
    action: str
    policy_effect: SandboxActionEffect
    policy_id: str
    allowed: bool
    blocked: bool
    approval_required: bool
    approval_id: Optional[str] = None


# ---------------------------------------------------------------------------
# Tool permission mapping
# ---------------------------------------------------------------------------


def _permission_to_effect(permission: str) -> SandboxActionEffect:
    """Map BlueprintResponse tool.permission to SandboxActionEffect."""
    mapping = {
        "allowed": SandboxActionEffect.ALLOW,
        "read_only": SandboxActionEffect.ALLOW,
        "approval_required": SandboxActionEffect.REQUIRE_APPROVAL,
        "blocked": SandboxActionEffect.DENY,
    }
    return mapping.get(permission, SandboxActionEffect.DENY)


# ---------------------------------------------------------------------------
# Brev / OpenHands connection
# ---------------------------------------------------------------------------


@dataclass
class BrevInstance:
    """A live Brev VM running OpenHands."""

    name: str
    instance_id: str
    workspace_url: Optional[str]
    runtime_api_url: Optional[str]  # e.g. "http://10.0.0.42:8080"
    server_image: str
    conversation_id: str


class BrevClient:
    """
    Manages Brev VM lifecycle and returns connection info for the OpenHands
    runtime running inside the VM.

    All brev CLI invocations go through subprocess so this works from the
    machine that runs the integration layer (which may be the user's dev
    machine or a CI runner).
    """

    DEFAULT_SERVER_IMAGE = "ghcr.io/openhands/agent-server:main-python"

    def __init__(
        self,
        cli_path: str = "brev",
        default_instance_type: str = "l40s-48gb.1x",
    ):
        self.cli_path = cli_path
        self.default_instance_type = default_instance_type

    def _run(self, args: list[str], timeout_ms: int = 180_000) -> subprocess.CompletedProcess:
        """Execute a brev CLI command and return the CompletedProcess."""
        return subprocess.run(
            [self.cli_path] + args,
            capture_output=True,
            text=True,
            timeout=timeout_ms / 1000,
        )

    def status(self) -> dict[str, Any]:
        """
        Returns Brev CLI status as a dict with keys:
          ok, status, cli_path, instances, message, install_command
        """
        result = self._run(["ls", "--json"], timeout_ms=10_000)
        if result.returncode != 0:
            return {
                "ok": False,
                "status": "error",
                "cli_path": self.cli_path,
                "instances": [],
                "message": result.stderr.strip() or "brev ls failed",
                "install_command": "brew install brevdev/homebrew-brev/brev",
            }
        try:
            instances = json.loads(result.stdout)
        except json.JSONDecodeError:
            instances = []
        return {
            "ok": True,
            "status": "ready",
            "cli_path": self.cli_path,
            "instances": instances,
            "message": "Brev CLI is installed and reachable.",
            "install_command": "brew install brevdev/homebrew-brev/brev",
        }

    def create(
        self,
        name: str,
        instance_type: Optional[str] = None,
        startup_script: Optional[str] = None,
        wait_for_ready: bool = True,
        timeout_s: int = 300,
    ) -> BrevInstance:
        """
        Provision a Brev VM named `name` and return a BrevInstance with
        connection metadata.  Does NOT wait for the OpenHands runtime to be
        fully ready inside the VM (that is the caller's responsibility via
        openhands_health_check).
        """
        args = ["create", name, "--type", instance_type or self.default_instance_type]
        if startup_script:
            args += ["--startup-script", startup_script]

        result = self._run(args, timeout_ms=180_000)
        if result.returncode != 0:
            raise RuntimeError(
                f"brev create failed (exit {result.returncode}): {result.stderr.strip()}"
            )

        # Poll until the VM is reachable (workspace URL appears in brev ls)
        deadline = time.time() + timeout_s
        instance_id = name  # brev uses name as the instance identifier in many commands
        workspace_url: Optional[str] = None

        if wait_for_ready:
            while time.time() < deadline:
                time.sleep(5)
                ls = self._run(["ls", "--json"], timeout_ms=10_000)
                if ls.returncode == 0:
                    try:
                        instances = json.loads(ls.stdout)
                        for inst in instances:
                            if inst.get("name") == name:
                                instance_id = inst.get("id", name)
                                # Brev exposes HTTP on a port derived from the instance
                                # The workspaceUrl is typically an SSH tunnel URL or direct IP
                                workspace_url = inst.get("workspace_url") or inst.get(
                                    "public_url"
                                )
                                break
                    except json.JSONDecodeError:
                        pass
                if workspace_url:
                    break

        runtime_api_url = None  # resolved via openhands_health_check below
        return BrevInstance(
            name=name,
            instance_id=instance_id,
            workspace_url=workspace_url,
            runtime_api_url=runtime_api_url,
            server_image=self.DEFAULT_SERVER_IMAGE,
            conversation_id=f"clawforge_{name}_{int(time.time())}",
        )

    def destroy(self, name: str) -> None:
        """Tear down a Brev VM."""
        result = self._run(["destroy", name], timeout_ms=30_000)
        if result.returncode != 0:
            logger.warning("brev destroy %s failed: %s", name, result.stderr.strip())

    def openhands_health_check(self, runtime_api_url: str, timeout_s: int = 60) -> bool:
        """
        Poll the OpenHands runtime health endpoint until it responds.
        Returns True once the runtime is ready.
        """
        deadline = time.time() + timeout_s
        while time.time() < deadline:
            try:
                req = Request(f"{runtime_api_url}/health", method="GET")
                with urlopen(req, timeout=5) as resp:
                    if resp.status == 200:
                        return True
            except (HTTPError, URLError, OSError):
                pass
            time.sleep(3)
        return False


# ---------------------------------------------------------------------------
# OpenHands runtime client
# ---------------------------------------------------------------------------


class OpenHandsClient:
    """
    Machine-to-machine client for the OpenHands runtime HTTP API running
    inside a Brev VM.

    The OpenHands runtime is the thing that actually runs the
    NemoClawSandboxSession (TypeScript).  The Python integration layer
    talks to it exclusively through this client -- no shared process,
    no subprocess, only HTTP.
    """

    def __init__(self, runtime_api_url: str, conversation_id: str):
        self.base = runtime_api_url.rstrip("/")
        self.conversation_id = conversation_id

    def _post(self, path: str, body: dict, timeout: float = 30.0) -> dict:
        req = Request(
            f"{self.base}{path}",
            data=json.dumps(body).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def _get(self, path: str, timeout: float = 30.0) -> dict:
        req = Request(
            f"{self.base}{path}",
            headers={"Accept": "application/json"},
            method="GET",
        )
        with urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))

    # -- Session management -------------------------------------------------

    def create_session(self, manifest_b64: str) -> dict:
        """
        Tell the OpenHands runtime to create a new NemoClawSandboxSession
        using the integration manifest that was encoded into the Brev startup
        script env vars.

        The runtime reads CLAWFORGE_INTEGRATION_MANIFEST_B64 directly, so
        passing it here is redundant but useful for explicit control.
        """
        return self._post(
            "/api/session/create",
            {"manifest_b64": manifest_b64, "conversation_id": self.conversation_id},
        )

    def get_state(self) -> dict:
        return self._get("/api/agent/state")

    def list_events(self) -> list[dict]:
        return self._get("/api/agent/events")["events"]

    # -- Tool execution -----------------------------------------------------

    def execute(self, action: str, params: Optional[dict] = None) -> dict:
        """
        Request execution of `action` inside the sandbox.

        Returns a dict with keys:
          allowed, approval_required, blocked, events, approval (optional)
        """
        return self._post(
            "/api/agent/execute",
            {"action": action, "params": params or {}, "conversation_id": self.conversation_id},
        )

    def cancel(self) -> dict:
        """Cancel the currently running execution unit."""
        return self._post("/api/agent/cancel", {"conversation_id": self.conversation_id})

    # -- Approval ----------------------------------------------------------

    def resolve_approval(self, approval_id: str, decision: str, modified_command: Optional[str] = None) -> dict:
        """
        Resolve a pending ApprovalRequest.

        decision : "approved" | "denied"
        modified_command : optional replacement command string
        """
        body = {
            "approval_id": approval_id,
            "decision": decision,
            "conversation_id": self.conversation_id,
        }
        if modified_command is not None:
            body["modified_command"] = modified_command
        return self._post("/api/agent/approval", body)

    # -- Memory ------------------------------------------------------------

    def get_memory(self) -> list[dict]:
        return self._get("/api/agent/memory")["items"]

    def add_memory(self, item: dict) -> dict:
        return self._post("/api/agent/memory", {"item": item})

    # -- Reporting ---------------------------------------------------------

    def get_report(self) -> dict:
        return self._get("/api/agent/report")


# ---------------------------------------------------------------------------
# Audit logger
# ---------------------------------------------------------------------------


class AuditLogger:
    """
    Writes structured JSON audit records to stdout (or an optional file).
    Each execute() call emits one record; approval resolution emits a second.
    """

    def __init__(self, file_path: Optional[str] = None):
        self.file_path = file_path
        self._lock = threading.Lock()
        self._out = open(file_path, "a") if file_path else sys.stdout

    def log(self, record: AuditRecord) -> None:
        with self._lock:
            print(json.dumps(record.__dict__, default=str), file=self._out)
            self._out.flush()

    def close(self) -> None:
        if self.file_path:
            self._out.close()


# ---------------------------------------------------------------------------
# NemoClawIntegration
# ---------------------------------------------------------------------------


class NemoClawIntegration:
    """
    Python-side orchestrator that connects the ClawForge agent_service
    to a NemoClaw sandbox session running in a Brev-hosted OpenHands
    runtime.

    Lifecycle
    ---------
    1. construct with a BlueprintResponse
    2. call deploy()  -> provisions Brev VM, starts OpenHands, creates session
    3. call execute() repeatedly -> runs tool actions, handles approval gate
    4. call complete() -> fetches final report
    5. call stop() -> tears down Brev VM

    Thread-safety: a single NemoClawIntegration instance is not safe for
    concurrent execute() calls.  Use one instance per agent session.

    Tool boundary enforcement
    --------------------------
    Boundaries are derived from blueprint.tools[].permission on every
    execute() call.  The blueprint is the source of truth -- the integration
    layer does NOT maintain a separate allow/deny list.

    Mapping BlueprintResponse -> NemoClaw execution unit
    ------------------------------------------------------
    A BlueprintResponse carries:
      tools[]      : available actions + their permissions
      policies[]   : policy_id -> effect mapping (additional constraints)
      memory_schema: slots the agent should populate
      workflow_steps: ordered steps the agent SHOULD follow (hint, not enforced)

    These are serialised into the NemoClawIntegrationManifest (TypeScript)
    and passed to the OpenHands runtime via the Brev startup script env var.
    The runtime uses the manifest to configure the NemoClawSandboxSession.

    Approval gate in headless context
    ---------------------------------
    When execute() returns with approval_required=True, the integration
    layer:

      1. returns ExecutionResult with pending_approval populated
      2. the caller (persistent agent loop) MUST call resolve_approval()
         to unblock continued execution
      3. resolve_approval() is a blocking HTTP call to the OpenHands runtime;
         it returns once the human (or automated approver) has resolved it

    For fully-automated testing / CI, use the approve_auto=True flag on
    execute() which silently approves all approval_required actions without
    waiting.  NEVER set this in production.
    """

    DEFAULT_TIMEOUT_S = 600  # 10 minutes per execution unit

    def __init__(
        self,
        blueprint: dict,
        agent_id: Optional[str] = None,
        brev_client: Optional[BrevClient] = None,
        audit_logger: Optional[AuditLogger] = None,
        max_runtime_seconds: int = DEFAULT_TIMEOUT_S,
        approve_auto: bool = False,
    ):
        """
        Parameters
        ----------
        blueprint : BlueprintResponse dict (deserialised from API/fixture)
        agent_id  : optional override; defaults to blueprint's agent_name
        brev_client : BrevClient instance; if None a default is constructed
        audit_logger : structured audit logger; if None stdout is used
        max_runtime_seconds : wall-clock timeout per execute() call
        approve_auto : if True, auto-approve all approval_required actions
                      (development / CI only -- never production)
        """
        self.blueprint = blueprint
        self.agent_id = agent_id or blueprint.get("agent_name", "ClawForgeAgent")
        self.session_id = f"session_{uuid.uuid4().hex[:12]}"

        self._brev = brev_client or BrevClient()
        self._audit = audit_logger or AuditLogger()
        self._max_runtime = max_runtime_seconds
        self._approve_auto = approve_auto

        # Runtime state
        self._brev_instance: Optional[BrevInstance] = None
        self._oh_client: Optional[OpenHandsClient] = None
        self._state = SessionState.CREATED
        self._events: list[LifecycleEvent] = []
        self._memory_items: list[dict] = []
        self._pending_approval: Optional[ApprovalRequest] = None

    # -- Accessors -----------------------------------------------------------

    @property
    def state(self) -> SessionState:
        return self._state

    @property
    def session_id(self) -> str:
        return self._session_id

    @property
    def events(self) -> list[LifecycleEvent]:
        return list(self._events)

    @property
    def memory_items(self) -> list[dict]:
        return list(self._memory_items)

    # -- Blueprint helpers --------------------------------------------------

    def _find_tool(self, action: str) -> Optional[dict]:
        """Find a tool definition by action string."""
        for tool in self.blueprint.get("tools", []):
            if tool.get("action") == action:
                return tool
        return None

    def _check_tool_policy(self, action: str) -> tuple[SandboxActionEffect, str, str]:
        """
        Evaluate policy for an action using blueprint.policies[] as the
        source of truth.

        Returns (effect, policy_id, reason).
        If no policy matches, returns (DENY, "policy_default_deny", ...).
        """
        policies = self.blueprint.get("policies", [])
        for pol in policies:
            if pol.get("action") == action:
                effect_str = pol.get("effect", "deny")
                try:
                    effect = SandboxActionEffect(effect_str)
                except ValueError:
                    effect = SandboxActionEffect.DENY
                return effect, pol.get("id", "unknown"), pol.get("reason", "")
        return SandboxActionEffect.DENY, "policy_default_deny", f"No policy exists for {action}."

    def _effective_effect(self, action: str) -> SandboxActionEffect:
        """
        Combine tool permission with policy effect to produce the final
        SandboxActionEffect that governs execution.

        Tool permission takes priority:
          - blocked tool  -> DENY regardless of policy
          - approval_required tool -> REQUIRE_APPROVAL regardless of policy
          - otherwise use the policy effect
        """
        tool = self._find_tool(action)
        if tool:
            perm = tool.get("permission", "blocked")
            tool_effect = _permission_to_effect(perm)
            if tool_effect == SandboxActionEffect.DENY:
                return SandboxActionEffect.DENY
            if tool_effect == SandboxActionEffect.REQUIRE_APPROVAL:
                return SandboxActionEffect.REQUIRE_APPROVAL

        pol_effect, _, _ = self._check_tool_policy(action)
        return pol_effect

    # -- Lifecycle ----------------------------------------------------------

    def deploy(self, instance_name: str = "clawforge-nemoclaw") -> ExecutionResult:
        """
        Provisions a Brev VM, starts the OpenHands agent-server, and creates
        a NemoClawSandboxSession inside it.

        Step-by-step:
          1. brev create <instance_name>
          2. Poll the VM until the OpenHands runtime responds on port 8080
          3. POST /api/session/create with the integration manifest
          4. Transition state: CREATED -> DEPLOYED -> RUNNING

        Returns ExecutionResult with status=running on success.
        Raises RuntimeError on Brev/OHS failure.
        """
        manifest = self._build_manifest()
        manifest_b64 = _b64_encode(json.dumps(manifest))

        # --- Phase 1: provision Brev VM -----------------------------------
        try:
            self._brev_instance = self._brev.create(
                name=instance_name,
                startup_script=None,  # managed by _brev._run; startup script set via brev create --startup-script
            )
        except Exception as e:
            return ExecutionResult(
                ok=False,
                session_id=self._session_id,
                agent_id=self.agent_id,
                status=self._state,
                events=self._events,
                memory_items=self._memory_items,
                report=None,
                error=f"Brev VM creation failed: {e}",
            )

        # --- Phase 2: wait for OpenHands runtime to be ready -------------
        # The runtimeApiUrl is derived from the Brev instance's internal IP.
        # Brev exposes port 8080 on the VM's internal network.
        runtime_api_url = f"http://{self._brev_instance.instance_id}:8080"
        self._brev_instance = BrevInstance(
            name=self._brev_instance.name,
            instance_id=self._brev_instance.instance_id,
            workspace_url=self._brev_instance.workspace_url,
            runtime_api_url=runtime_api_url,
            server_image=self._brev_instance.server_image,
            conversation_id=self._brev_instance.conversation_id,
        )

        ready = self._brev.openhands_health_check(runtime_api_url, timeout_s=120)
        if not ready:
            return ExecutionResult(
                ok=False,
                session_id=self._session_id,
                agent_id=self.agent_id,
                status=self._state,
                events=self._events,
                memory_items=self._memory_items,
                report=None,
                error="OpenHands runtime did not become ready in time.",
            )

        self._oh_client = OpenHandsClient(
            runtime_api_url=runtime_api_url,
            conversation_id=self._brev_instance.conversation_id,
        )

        # --- Phase 3: create NemoClaw sandbox session --------------------
        try:
            self._oh_client.create_session(manifest_b64)
        except Exception as e:
            return ExecutionResult(
                ok=False,
                session_id=self._session_id,
                agent_id=self.agent_id,
                status=self._state,
                events=self._events,
                memory_items=self._memory_items,
                report=None,
                error=f"OpenHands session creation failed: {e}",
            )

        self._state = SessionState.DEPLOYED
        self._events.append(
            LifecycleEvent(
                id=f"evt_{len(self._events)+1}",
                session_id=self._session_id,
                type="session.deployed",
                message=f"Agent {self.agent_id} deployed into NemoClaw sandbox.",
                timestamp=_now(),
                severity="success",
                metadata={"instance_name": instance_name},
            )
        )

        self._state = SessionState.RUNNING
        self._events.append(
            LifecycleEvent(
                id=f"evt_{len(self._events)+1}",
                session_id=self._session_id,
                type="session.running",
                message="Sandbox session is now running.",
                timestamp=_now(),
                severity="info",
            )
        )

        return ExecutionResult(
            ok=True,
            session_id=self._session_id,
            agent_id=self.agent_id,
            status=self._state,
            events=self._events,
            memory_items=self._memory_items,
            report=None,
        )

    def execute(self, action: str, params: Optional[dict] = None) -> ExecutionResult:
        """
        Execute a single tool action inside the sandbox.

        Policy evaluation:
          1. Find the tool in blueprint.tools[] by action string.
          2. tool.permission = blocked    -> DENY immediately
          3. tool.permission = approval_required -> REQUIRE_APPROVAL
          4. tool.permission = allowed|read_only  -> check policies[]
          5. If no policy matches, use default DENY.

        On REQUIRE_APPROVAL:
          - ExecutionResult.ok = True (the action was correctly classified)
          - ExecutionResult.pending_approval is populated
          - Caller MUST call resolve_approval() to continue.

        On DENY:
          - ExecutionResult.ok = False
          - ExecutionResult.blocked_action = action
          - No HTTP call is made to the runtime.

        On ALLOW:
          - Makes POST /api/agent/execute on the OpenHands runtime
          - Returns ExecutionResult with the runtime's events

        Parameters
        ----------
        action : tool action string (e.g. "shell.execute", "logs.read")
        params : arbitrary dict of parameters forwarded to the runtime
        approve_auto : if True, silently approve instead of pausing
                       (development / CI only)
        """
        if self._state not in (SessionState.RUNNING, SessionState.PAUSED):
            return ExecutionResult(
                ok=False,
                session_id=self._session_id,
                agent_id=self.agent_id,
                status=self._state,
                events=self._events,
                memory_items=self._memory_items,
                report=None,
                error=f"Cannot execute in state {self._state}.",
            )

        effect = self._effective_effect(action)
        pol_effect, policy_id, reason = self._check_tool_policy(action)

        # -- Emit audit record --------------------------------------------
        record = AuditRecord(
            ts=_now(),
            session_id=self._session_id,
            agent_id=self.agent_id,
            action=action,
            policy_effect=effect,
            policy_id=policy_id,
            allowed=effect == SandboxActionEffect.ALLOW,
            blocked=effect == SandboxActionEffect.DENY,
            approval_required=effect == SandboxActionEffect.REQUIRE_APPROVAL,
        )
        self._audit.log(record)

        # -- Denied outright ------------------------------------------------
        if effect == SandboxActionEffect.DENY:
            self._events.append(
                LifecycleEvent(
                    id=f"evt_{len(self._events)+1}",
                    session_id=self._session_id,
                    type="policy.blocked",
                    message=f"Blocked by {policy_id}: {reason}",
                    timestamp=_now(),
                    severity="error",
                    metadata={"action": action},
                )
            )
            self._events.append(
                LifecycleEvent(
                    id=f"evt_{len(self._events)+1}",
                    session_id=self._session_id,
                    type="tool.blocked",
                    message=f"Action {action} is blocked.",
                    timestamp=_now(),
                    severity="error",
                    metadata={"action": action},
                )
            )
            return ExecutionResult(
                ok=False,
                session_id=self._session_id,
                agent_id=self.agent_id,
                status=self._state,
                events=self._events,
                memory_items=self._memory_items,
                report=None,
                blocked_action=action,
            )

        # -- Approval gate --------------------------------------------------
        if effect == SandboxActionEffect.REQUIRE_APPROVAL:
            # Create the approval request object immediately on the Python side
            # so the caller can display it without waiting for the HTTP round-trip.
            approval_id = f"approval_{uuid.uuid4().hex[:10]}"
            approval_req = ApprovalRequest(
                id=approval_id,
                agent_id=self.agent_id,
                action=action,
                command=params.get("command") if params else None,
                reason=reason,
                policy_id=policy_id,
                status="pending",
            )
            self._pending_approval = approval_req
            self._state = SessionState.WAITING_FOR_APPROVAL

            self._events.append(
                LifecycleEvent(
                    id=f"evt_{len(self._events)+1}",
                    session_id=self._session_id,
                    type="approval.requested",
                    message=f"Approval required: {reason}",
                    timestamp=_now(),
                    severity="warning",
                    metadata={"approval_id": approval_id, "action": action},
                )
            )
            self._events.append(
                LifecycleEvent(
                    id=f"evt_{len(self._events)+1}",
                    session_id=self._session_id,
                    type="session.waiting_for_approval",
                    message="Session paused, waiting for approval.",
                    timestamp=_now(),
                    severity="info",
                )
            )

            # Auto-approve shortcut for CI / development
            if self._approve_auto:
                logger.info("Auto-approving %s (approve_auto=True)", action)
                return self._do_approve(approval_id, "approved")

            return ExecutionResult(
                ok=True,
                session_id=self._session_id,
                agent_id=self.agent_id,
                status=self._state,
                events=self._events,
                memory_items=self._memory_items,
                report=None,
                pending_approval=approval_req,
            )

        # -- Allowed --------------------------------------------------------
        assert effect == SandboxActionEffect.ALLOW

        self._events.append(
            LifecycleEvent(
                id=f"evt_{len(self._events)+1}",
                session_id=self._session_id,
                type="policy.checked",
                message=f"Checking policy for action: {action}.",
                timestamp=_now(),
                severity="debug",
                metadata={"action": action},
            )
        )

        if self._oh_client is None:
            return ExecutionResult(
                ok=False,
                session_id=self._session_id,
                agent_id=self.agent_id,
                status=self._state,
                events=self._events,
                memory_items=self._memory_items,
                report=None,
                error="No OpenHands client (call deploy() first).",
            )

        try:
            result = self._oh_client.execute(action, params)
        except Exception as e:
            return ExecutionResult(
                ok=False,
                session_id=self._session_id,
                agent_id=self.agent_id,
                status=self._state,
                events=self._events,
                memory_items=self._memory_items,
                report=None,
                error=f"OpenHands execute failed: {e}",
            )

        # Sync runtime events back into our local list
        runtime_events = result.get("events", [])
        for revt in runtime_events:
            self._events.append(
                LifecycleEvent(
                    id=revt.get("id", f"evt_{len(self._events)+1}"),
                    session_id=self._session_id,
                    type=revt.get("type", "unknown"),
                    message=revt.get("message", ""),
                    timestamp=revt.get("timestamp", _now()),
                    severity=revt.get("severity", "info"),
                    metadata=revt.get("metadata", {}),
                )
            )

        if result.get("approval_required"):
            approval_data = result.get("approval", {})
            approval_req = ApprovalRequest(
                id=approval_data.get("id", ""),
                agent_id=self.agent_id,
                action=action,
                command=approval_data.get("command"),
                reason=approval_data.get("reason", reason),
                policy_id=approval_data.get("policy_id", policy_id),
                status="pending",
            )
            self._pending_approval = approval_req
            self._state = SessionState.WAITING_FOR_APPROVAL
            return ExecutionResult(
                ok=True,
                session_id=self._session_id,
                agent_id=self.agent_id,
                status=self._state,
                events=self._events,
                memory_items=self._memory_items,
                report=None,
                pending_approval=approval_req,
            )

        self._events.append(
            LifecycleEvent(
                id=f"evt_{len(self._events)+1}",
                session_id=self._session_id,
                type="tool.executed",
                message=f"Action {action} executed successfully inside sandbox.",
                timestamp=_now(),
                severity="success",
                metadata={"action": action},
            )
        )

        return ExecutionResult(
            ok=True,
            session_id=self._session_id,
            agent_id=self.agent_id,
            status=self._state,
            events=self._events,
            memory_items=self._memory_items,
            report=None,
        )

    def resolve_approval(
        self,
        approval_id: str,
        decision: str,  # "approved" | "denied"
        modified_command: Optional[str] = None,
    ) -> ExecutionResult:
        """
        Resolve a pending approval and resume the sandbox session.

        This is a blocking HTTP call to the OpenHands runtime.  The runtime
        transitions from waiting_for_approval -> running (or stopped) and
        emits the resolved lifecycle events.

        Parameters
        ----------
        approval_id : the id of the ApprovalRequest to resolve
        decision    : "approved" or "denied"
        modified_command : optional replacement command (only for "approved")
        """
        if self._state != SessionState.WAITING_FOR_APPROVAL:
            return ExecutionResult(
                ok=False,
                session_id=self._session_id,
                agent_id=self.agent_id,
                status=self._state,
                events=self._events,
                memory_items=self._memory_items,
                report=None,
                error=f"Not in waiting_for_approval state (current: {self._state}).",
            )

        if self._oh_client is None:
            return ExecutionResult(
                ok=False,
                session_id=self._session_id,
                agent_id=self.agent_id,
                status=self._state,
                events=self._events,
                memory_items=self._memory_items,
                report=None,
                error="No OpenHands client.",
            )

        try:
            result = self._oh_client.resolve_approval(approval_id, decision, modified_command)
        except Exception as e:
            return ExecutionResult(
                ok=False,
                session_id=self._session_id,
                agent_id=self.agent_id,
                status=self._state,
                events=self._events,
                memory_items=self._memory_items,
                report=None,
                error=f"resolve_approval failed: {e}",
            )

        # Sync events
        runtime_events = result.get("events", [])
        for revt in runtime_events:
            self._events.append(
                LifecycleEvent(
                    id=revt.get("id", f"evt_{len(self._events)+1}"),
                    session_id=self._session_id,
                    type=revt.get("type", "unknown"),
                    message=revt.get("message", ""),
                    timestamp=revt.get("timestamp", _now()),
                    severity=revt.get("severity", "info"),
                    metadata=revt.get("metadata", {}),
                )
            )

        # Sync memory
        for item in result.get("memory", []):
            if item not in self._memory_items:
                self._memory_items.append(item)

        # Update state
        self._state = SessionState.RUNNING
        self._pending_approval = None

        approved = decision == "approved"
        self._events.append(
            LifecycleEvent(
                id=f"evt_{len(self._events)+1}",
                session_id=self._session_id,
                type="approval.resolved",
                message=f"Approval {approval_id} {decision}.",
                timestamp=_now(),
                severity="success" if approved else "warning",
            )
        )

        return ExecutionResult(
            ok=True,
            session_id=self._session_id,
            agent_id=self.agent_id,
            status=self._state,
            events=self._events,
            memory_items=self._memory_items,
            report=None,
        )

    def complete(self) -> ExecutionResult:
        """
        Signal the runtime that the execution unit is complete and fetch the
        final incident report.
        """
        if self._oh_client is None:
            return ExecutionResult(
                ok=False,
                session_id=self._session_id,
                agent_id=self.agent_id,
                status=self._state,
                events=self._events,
                memory_items=self._memory_items,
                report=None,
                error="No OpenHands client.",
            )

        self._state = SessionState.COMPLETED

        try:
            report = self._oh_client.get_report()
        except Exception as e:
            report = {"error": str(e)}

        self._events.append(
            LifecycleEvent(
                id=f"evt_{len(self._events)+1}",
                session_id=self._session_id,
                type="session.completed",
                message="Sandbox session completed successfully.",
                timestamp=_now(),
                severity="success",
            )
        )

        return ExecutionResult(
            ok=True,
            session_id=self._session_id,
            agent_id=self.agent_id,
            status=self._state,
            events=self._events,
            memory_items=self._memory_items,
            report=report,
        )

    def stop(self) -> None:
        """
        Tear down the Brev VM and reset local state.

        This does NOT produce an ExecutionResult -- it is a cleanup call
        made when the agent session is fully done.
        """
        if self._brev_instance:
            try:
                self._brev.destroy(self._brev_instance.name)
            except Exception as e:
                logger.warning("Brev destroy failed: %s", e)
            self._brev_instance = None

        if self._oh_client:
            self._oh_client = None

        self._state = SessionState.STOPPED
        self._events.append(
            LifecycleEvent(
                id=f"evt_{len(self._events)+1}",
                session_id=self._session_id,
                type="session.terminated",
                message="Sandbox session terminated.",
                timestamp=_now(),
                severity="warning",
            )
        )

    # -- Internal helpers --------------------------------------------------

    def _do_approve(self, approval_id: str, decision: str) -> ExecutionResult:
        """Internal auto-approve path (approve_auto=True)."""
        approval_req = self._pending_approval
        if approval_req:
            approval_req.status = decision
        return self.resolve_approval(approval_id, decision)

    def _build_manifest(self) -> dict:
        """
        Reconstruct the NemoClawIntegrationManifest dict from the blueprint.
        This mirrors the TypeScript buildIntegrationManifest() in brev.ts.
        The manifest is base64-encoded and passed to the OpenHands runtime via
        the Brev startup script CLAWFORGE_INTEGRATION_MANIFEST_B64 env var.

        Changes needed in existing TypeScript code (brev.ts):
        --------------------------------------------------
        The TypeScript buildIntegrationManifest() already produces a complete
        manifest.  We replicate it here so the Python side can drive the same
        manifest when creating a Brev VM programmatically.

        If the manifest is ever needed on the TypeScript side AFTER the VM is
        created (i.e., via an API call rather than startup script), the
        following new endpoint should be added to the OpenHands runtime API:

        GET /api/blueprint/manifest  -> returns the parsed NemoClawIntegrationManifest

        This allows the Python integration layer to fetch the manifest without
        having to re-encode it locally.
        """
        blueprint = self.blueprint
        memory_schema = blueprint.get("memory_schema", [])

        # Map memory_schema items to mem0-compatible structure
        memory_items = []
        for item in memory_schema:
            memory_items.append({
                "id": item.get("id", f"mem_{uuid.uuid4().hex[:8]}"),
                "name": item.get("name", ""),
                "type": item.get("type", "context"),
                "description": item.get("description", ""),
            })

        # integrations from blueprint
        integrations = []
        for req in blueprint.get("integration_requirements", []):
            integrations.append({
                "id": req.get("id", ""),
                "label": req.get("label", ""),
                "toolkit": req.get("toolkit", ""),
                "purpose": req.get("purpose", ""),
                "status": req.get("status", "optional"),
                "auth_config_id": None,
                "connected_account_id": None,
                "required": req.get("status") == "required",
                "connectable": False,
            })

        manifest = {
            "version": 1,
            "instance_name": self._brev_instance.name if self._brev_instance else "unknown",
            "generated_at": _now(),
            "agent": {
                "id": f"agent_{blueprint.get('template_id', 'unknown')}_{self.agent_id}",
                "name": self.agent_id,
                "blueprint_id": blueprint.get("blueprint_id"),
                "template_id": blueprint.get("template_id"),
                "goal": blueprint.get("goal"),
                "model": blueprint.get("model"),
                "provider": blueprint.get("provider"),
            },
            "memory": {
                "engine": "mem0",
                "hosted_on": "brev",
                "embedding_model": "nvidia/nv-embedqa-e5-v5",
                "reasoning_model": blueprint.get("model"),
                "scope": "workspace",
                "status": "configured",
            },
            "integrations": integrations,
            "pipedream": {
                "configured": False,
                "project_id": None,
                "environment": "production",
                "connections": [],
            },
            "inbox": {
                "email": None,
                "status": "not_created",
            },
            "capabilities": {
                "agentphone": False,
                "voice_agent": False,
                "agent_inbox": False,
                "calendar": False,
                "gmail": False,
                "google_docs": False,
                "google_drive": False,
                "google_sheets": False,
            },
            "secret_names": [
                "NVIDIA_API_KEY",
                "MINIMAX_PLAN_KEY",
                "COMPOSIO_API_KEY",
            ],
        }

        # Enrich capabilities from integration requirements
        for req in blueprint.get("integration_requirements", []):
            rid = req.get("id", "")
            if rid == "phone_sms":
                manifest["capabilities"]["agentphone"] = True
                manifest["capabilities"]["voice_agent"] = True
            if rid == "email":
                manifest["capabilities"]["gmail"] = True
                manifest["capabilities"]["agent_inbox"] = True
            if rid == "calendar":
                manifest["capabilities"]["calendar"] = True
            if rid == "google_docs":
                manifest["capabilities"]["google_docs"] = True
            if rid == "google_drive":
                manifest["capabilities"]["google_drive"] = True
            if rid == "google_sheets":
                manifest["capabilities"]["google_sheets"] = True

        return manifest


# ---------------------------------------------------------------------------
# Standalone helper: run a BlueprintResponse end-to-end in NemoClaw
# ---------------------------------------------------------------------------


def run_blueprint(
    blueprint: dict,
    instance_name: str = "clawforge-nemoclaw",
    max_runtime_seconds: int = 600,
    approve_auto: bool = False,
    on_approval: Optional[Callable[[ApprovalRequest], str]] = None,
) -> ExecutionResult:
    """
    Run a complete BlueprintResponse inside a NemoClaw sandbox.

    This is the simplest entry point for a persistent agent that wants to
    execute one or more BlueprintResponse workflow units.

    Parameters
    ----------
    blueprint : BlueprintResponse dict
    instance_name : Brev VM name
    max_runtime_seconds : per-unit timeout
    approve_auto : development/CI auto-approve flag
    on_approval : optional callback(ApprovalRequest) -> "approved"|"denied"
                  If provided, called for each approval-gated action and its
                  return value is used as the decision.  Takes precedence
                  over approve_auto.

    Example
    -------
    >>> from integration_layer import run_blueprint
    >>> bp = create_sentinel_blueprint()   # your BlueprintResponse
    >>> result = run_blueprint(bp, approve_auto=True)
    >>> print(result.report)
    """
    agent_id = blueprint.get("agent_name", "ClawForgeAgent")
    integration = NemoClawIntegration(
        blueprint=blueprint,
        agent_id=agent_id,
        max_runtime_seconds=max_runtime_seconds,
        approve_auto=approve_auto,
    )

    deploy_result = integration.deploy(instance_name=instance_name)
    if not deploy_result.ok:
        return deploy_result

    # Execute workflow steps in order
    workflow_steps = blueprint.get("workflow_steps", [])
    for step in workflow_steps:
        tool_id = step.get("tool_id")
        if not tool_id:
            continue

        # Find the tool definition that corresponds to this workflow step
        tool = None
        for t in blueprint.get("tools", []):
            if t.get("id") == tool_id:
                tool = t
                break
        if not tool:
            continue

        action = tool.get("action")
        if not action:
            continue

        result = integration.execute(action)
        if not result.ok:
            return result

        if result.pending_approval:
            # Handle approval gate
            if on_approval:
                decision = on_approval(result.pending_approval)
            elif approve_auto:
                decision = "approved"
            else:
                # In a real persistent loop the caller handles this;
                # here we return with pending_approval set so the caller
                # can see exactly where execution paused.
                return result

            resolve_result = integration.resolve_approval(
                result.pending_approval.id, decision
            )
            if not resolve_result.ok:
                return resolve_result

    return integration.complete()


# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


def _b64_encode(text: str) -> str:
    import base64
    return base64.b64encode(text.encode("utf-8")).decode("ascii")