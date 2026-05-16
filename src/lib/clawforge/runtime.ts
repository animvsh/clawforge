import { DEMO_AGENT_ID, demoApproval, demoMemory, demoReport } from "./fixtures";
import { routeToolCall } from "./tools";
import type {
  ApprovalRequest,
  BlueprintResponse,
  IncidentReport,
  MemoryItem,
  PolicyDefinition,
  RuntimeEvent,
  ToolDefinition,
} from "./types";

export type SessionState =
  | "created"
  | "deployed"
  | "running"
  | "paused"
  | "waiting_for_approval"
  | "completed"
  | "stopped";

type ValidTransition = {
  from: SessionState;
  to: SessionState;
};

const VALID_TRANSITIONS: ValidTransition[] = [
  { from: "created", to: "deployed" },
  { from: "deployed", to: "running" },
  { from: "running", to: "paused" },
  { from: "paused", to: "running" },
  { from: "running", to: "waiting_for_approval" },
  { from: "waiting_for_approval", to: "running" },
  { from: "waiting_for_approval", to: "stopped" },
  { from: "running", to: "completed" },
  { from: "deployed", to: "stopped" },
];

function isValidTransition(from: SessionState, to: SessionState): boolean {
  return VALID_TRANSITIONS.some((t) => t.from === from && t.to === to);
}

export type SandboxAction = {
  action: string;
  args?: Record<string, unknown>;
};

export type LifecycleEventType =
  | "session.created"
  | "session.deployed"
  | "session.running"
  | "session.paused"
  | "session.waiting_for_approval"
  | "session.resumed"
  | "session.completed"
  | "session.terminated"
  | "policy.checked"
  | "policy.blocked"
  | "approval.requested"
  | "approval.resolved"
  | "tool.executed"
  | "tool.blocked"
  | "memory.updated"
  | "report.generated";

export type LifecycleEvent = {
  id: string;
  session_id: string;
  type: LifecycleEventType;
  message: string;
  timestamp: string;
  severity: "debug" | "info" | "warning" | "error" | "success";
  metadata?: Record<string, unknown>;
};

export type ApprovalResult = {
  approved: boolean;
  approval_id: string;
  modified_command?: string;
};

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function now(): string {
  return new Date().toISOString();
}

function createLifecycleEvent(
  sessionId: string,
  type: LifecycleEventType,
  message: string,
  severity: LifecycleEvent["severity"] = "info",
  metadata?: Record<string, unknown>,
): LifecycleEvent {
  return {
    id: generateId("evt"),
    session_id: sessionId,
    type,
    message,
    timestamp: now(),
    severity,
    metadata,
  };
}

export class NemoClawSandboxSession {
  private sessionId: string;
  private agentId: string;
  private state: SessionState;
  private blueprint: BlueprintResponse | null;
  private tools: ToolDefinition[];
  private policies: PolicyDefinition[];
  private memory: MemoryItem[];
  private events: LifecycleEvent[];
  private report: IncidentReport | null;
  private pendingApproval: ApprovalRequest | null;
  private pendingAction: SandboxAction | null;

  constructor() {
    this.sessionId = generateId("session");
    this.agentId = DEMO_AGENT_ID;
    this.state = "created";
    this.blueprint = null;
    this.tools = [];
    this.policies = [];
    this.memory = [...demoMemory];
    this.events = [];
    this.report = null;
    this.pendingApproval = null;
    this.pendingAction = null;
  }

  private emit(event: LifecycleEvent): LifecycleEvent {
    this.events.push(event);
    return event;
  }

  private checkActionPolicy(action: string): { allowed: boolean; approvalRequired: boolean; policyId: string; reason: string } {
    const policy = this.policies.find((p) => p.action === action);
    if (!policy) {
      return { allowed: false, approvalRequired: false, policyId: "policy_default_deny", reason: `No policy exists for ${action}.` };
    }
    if (policy.effect === "deny") {
      return { allowed: false, approvalRequired: false, policyId: policy.id, reason: policy.reason };
    }
    if (policy.effect === "require_approval") {
      return { allowed: false, approvalRequired: true, policyId: policy.id, reason: policy.reason };
    }
    return { allowed: true, approvalRequired: false, policyId: policy.id, reason: policy.reason };
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getAgentId(): string {
    return this.agentId;
  }

  getState(): SessionState {
    return this.state;
  }

  getEvents(): LifecycleEvent[] {
    return [...this.events];
  }

  getMemory(): MemoryItem[] {
    return [...this.memory];
  }

  getReport(): IncidentReport | null {
    return this.report;
  }

  getPendingApproval(): ApprovalRequest | null {
    return this.pendingApproval;
  }

  createSession(blueprint: BlueprintResponse): {
    sessionId: string;
    agentId: string;
    status: SessionState;
    events: LifecycleEvent[];
  } {
    if (!isValidTransition(this.state, "deployed")) {
      throw new Error(`Invalid transition from ${this.state} to deployed`);
    }
    this.blueprint = blueprint;
    this.tools = blueprint.tools;
    this.policies = blueprint.policies;

    this.emit(createLifecycleEvent(this.sessionId, "session.deployed", `Agent ${blueprint.agent_name} deployed into NemoClaw sandbox.`, "success", {
      blueprint_id: blueprint.blueprint_id,
      agent_name: blueprint.agent_name,
    }));

    this.state = "deployed";

    if (!isValidTransition(this.state, "running")) {
      throw new Error(`Invalid transition from ${this.state} to running`);
    }
    this.state = "running";

    this.emit(createLifecycleEvent(this.sessionId, "session.running", "Sandbox session is now running.", "info"));

    return {
      sessionId: this.sessionId,
      agentId: this.agentId,
      status: this.state,
      events: this.getEvents(),
    };
  }

  execute(action: SandboxAction): {
    allowed: boolean;
    approvalRequired: boolean;
    blocked: boolean;
    events: LifecycleEvent[];
    approval?: ApprovalRequest;
  } {
    if (this.state !== "running" && this.state !== "paused") {
      this.emit(createLifecycleEvent(this.sessionId, "tool.blocked", `Cannot execute ${action.action}: session is ${this.state}.`, "error"));
      return { allowed: false, approvalRequired: false, blocked: true, events: this.getEvents() };
    }

    this.emit(createLifecycleEvent(this.sessionId, "policy.checked", `Checking policy for action: ${action.action}.`, "debug", { action: action.action }));

    const policyCheck = this.checkActionPolicy(action.action);

    if (!policyCheck.allowed && !policyCheck.approvalRequired) {
      this.emit(createLifecycleEvent(this.sessionId, "policy.blocked", `Blocked by ${policyCheck.policyId}: ${policyCheck.reason}`, "error", { action: action.action }));
      this.emit(createLifecycleEvent(this.sessionId, "tool.blocked", `Action ${action.action} is blocked.`, "error", { action: action.action }));
      return { allowed: false, approvalRequired: false, blocked: true, events: this.getEvents() };
    }

    if (policyCheck.approvalRequired) {
      if (!isValidTransition(this.state, "waiting_for_approval")) {
        throw new Error(`Invalid transition from ${this.state} to waiting_for_approval`);
      }
      this.state = "waiting_for_approval";
      this.pendingAction = action;

      const approval: ApprovalRequest = {
        id: generateId("approval"),
        agent_id: this.agentId,
        action: action.action,
        command: typeof action.args?.command === "string" ? action.args.command : undefined,
        reason: policyCheck.reason,
        policy_id: policyCheck.policyId,
        status: "pending",
        created_at: now(),
      };
      this.pendingApproval = approval;

      this.emit(createLifecycleEvent(this.sessionId, "approval.requested", `Approval required: ${policyCheck.reason}`, "warning", {
        approval_id: approval.id,
        action: action.action,
        policy_id: policyCheck.policyId,
      }));

      this.emit(createLifecycleEvent(this.sessionId, "session.waiting_for_approval", "Session paused, waiting for approval.", "info"));

      return { allowed: false, approvalRequired: true, blocked: false, events: this.getEvents(), approval };
    }

    this.emit(createLifecycleEvent(this.sessionId, "tool.executed", `Action ${action.action} executed successfully inside sandbox.`, "success", { action: action.action }));
    return { allowed: true, approvalRequired: false, blocked: false, events: this.getEvents() };
  }

  pauseSession(): {
    status: SessionState;
    events: LifecycleEvent[];
  } {
    if (!isValidTransition(this.state, "paused")) {
      this.emit(createLifecycleEvent(this.sessionId, "session.paused", `Cannot pause: session is ${this.state}.`, "warning"));
      return { status: this.state, events: this.getEvents() };
    }

    this.state = "paused";
    this.emit(createLifecycleEvent(this.sessionId, "session.paused", "Sandbox session paused.", "info"));
    return { status: this.state, events: this.getEvents() };
  }

  resumeSession(approval: ApprovalResult): {
    status: SessionState;
    events: LifecycleEvent[];
    executed: boolean;
  } {
    if (this.state !== "waiting_for_approval") {
      this.emit(createLifecycleEvent(this.sessionId, "session.resumed", `Cannot resume: session is ${this.state}.`, "warning"));
      return { status: this.state, events: this.getEvents(), executed: false };
    }

    if (!approval.approved) {
      this.state = "running";
      const memoryItem: MemoryItem = {
        id: generateId("memory"),
        agent_id: this.agentId,
        type: "approval",
        content: this.pendingAction ? `User denied action: ${this.pendingAction.action}` : "User denied pending action.",
        created_at: now(),
      };
      this.memory.push(memoryItem);

      this.emit(createLifecycleEvent(this.sessionId, "approval.resolved", "Approval denied by user.", "warning"));
      this.emit(createLifecycleEvent(this.sessionId, "memory.updated", memoryItem.content, "info"));
      this.emit(createLifecycleEvent(this.sessionId, "session.resumed", "Sandbox session resumed after denied approval.", "info"));

      this.pendingApproval = null;
      this.pendingAction = null;

      return { status: this.state, events: this.getEvents(), executed: false };
    }

    this.state = "running";
    this.emit(createLifecycleEvent(this.sessionId, "approval.resolved", "Approval granted.", "success"));

    if (this.pendingAction) {
      this.emit(createLifecycleEvent(this.sessionId, "tool.executed", `Action ${this.pendingAction.action} executed after approval.`, "success", {
        action: this.pendingAction.action,
        approval_id: approval.approval_id,
      }));

      const memoryItem: MemoryItem = {
        id: generateId("memory"),
        agent_id: this.agentId,
        type: "approval",
        content: `User approved action: ${this.pendingAction.action}`,
        created_at: now(),
      };
      this.memory.push(memoryItem);
      this.emit(createLifecycleEvent(this.sessionId, "memory.updated", memoryItem.content, "success"));
    }

    this.pendingApproval = null;
    this.pendingAction = null;

    return { status: this.state, events: this.getEvents(), executed: true };
  }

  terminateSession(): {
    status: SessionState;
    events: LifecycleEvent[];
  } {
    if (!isValidTransition(this.state, "stopped") && this.state !== "stopped") {
      throw new Error(`Invalid transition from ${this.state} to stopped`);
    }

    this.emit(createLifecycleEvent(this.sessionId, "session.terminated", "Sandbox session terminated and cleaned up.", "warning"));

    this.pendingApproval = null;
    this.pendingAction = null;

    return { status: this.state, events: this.getEvents() };
  }

  completeSession(report: IncidentReport): {
    status: SessionState;
    events: LifecycleEvent[];
    report: IncidentReport;
  } {
    if (!isValidTransition(this.state, "completed") && this.state !== "completed") {
      throw new Error(`Invalid transition from ${this.state} to completed`);
    }
    this.state = "completed";
    this.report = report;

    this.emit(createLifecycleEvent(this.sessionId, "report.generated", "Incident report generated.", "success"));
    this.emit(createLifecycleEvent(this.sessionId, "session.completed", "Sandbox session completed successfully.", "success"));

    return { status: this.state, events: this.getEvents(), report };
  }
}

// Legacy runtime support - maintains backwards compatibility
type LegacyRuntimeState = "created" | "deployed" | "running" | "waiting_for_approval" | "completed" | "stopped";

const LEGACY_VALID_TRANSITIONS: { from: LegacyRuntimeState; to: LegacyRuntimeState }[] = [
  { from: "created", to: "deployed" },
  { from: "deployed", to: "running" },
  { from: "running", to: "waiting_for_approval" },
  { from: "waiting_for_approval", to: "completed" },
  { from: "waiting_for_approval", to: "stopped" },
  { from: "running", to: "completed" },
  { from: "deployed", to: "stopped" },
];

function isLegacyValidTransition(from: LegacyRuntimeState, to: LegacyRuntimeState): boolean {
  return LEGACY_VALID_TRANSITIONS.some((t) => t.from === from && t.to === to);
}

let legacyState: LegacyRuntimeState = "created";
let legacyEvents: RuntimeEvent[] = [];
let legacyMemory: MemoryItem[] = [];
let legacyReport: IncidentReport | null = null;
let legacyApprovalStatus: "pending" | "approved" | "denied" = "pending";
let legacyPendingApprovalId: string | null = null;

export type RuntimeState = "created" | "deployed" | "running" | "waiting_for_approval" | "completed" | "stopped";

function legacyEvent(
  type: RuntimeEvent["type"],
  message: string,
  severity: RuntimeEvent["severity"] = "info",
  metadata?: Record<string, unknown>,
): RuntimeEvent {
  return {
    id: `event_${legacyEvents.length + 1}_${Date.now()}`,
    agent_id: DEMO_AGENT_ID,
    type,
    message,
    timestamp: now(),
    severity,
    metadata,
  };
}

function addLegacyEvent(nextEvent: RuntimeEvent): RuntimeEvent {
  legacyEvents.push(nextEvent);
  return nextEvent;
}

function buildInitialEvents(): RuntimeEvent[] {
  legacyEvents = [];

  if (!isLegacyValidTransition(legacyState, "deployed")) {
    throw new Error(`Invalid transition from ${legacyState} to deployed`);
  }
  legacyState = "deployed";
  addLegacyEvent(legacyEvent("agent.started", "Agent deployed into NemoClaw sandbox.", "success"));

  if (!isLegacyValidTransition(legacyState, "running")) {
    throw new Error(`Invalid transition from ${legacyState} to running`);
  }
  legacyState = "running";

  const logDecision = routeToolCall("logs.read");
  addLegacyEvent(legacyEvent("policy.checked", logDecision.message, "info", { action: "logs.read" }));
  addLegacyEvent(
    legacyEvent("tool.called", "Reading system logs from /logs/auth.log.", "info", {
      tool: "Log Reader",
    }),
  );

  addLegacyEvent(
    legacyEvent("agent.thinking", "Detected 47 failed SSH login attempts from 185.92.XX.XX.", "warning"),
  );
  addLegacyEvent(
    legacyEvent("agent.thinking", "Mapped behavior to MITRE ATT&CK: Credential Access.", "warning"),
  );

  const exportDecision = routeToolCall("data.export");
  addLegacyEvent(
    legacyEvent("policy.checked", "NemoClaw checked data.export against active policy.", "info", {
      action: "data.export",
    }),
  );
  addLegacyEvent(legacyEvent("policy.blocked", exportDecision.message, "error", { action: "data.export" }));

  const reportDecision = routeToolCall("report.write");
  addLegacyEvent(legacyEvent("policy.checked", reportDecision.message, "info", { action: "report.write" }));
  addLegacyEvent(
    legacyEvent("tool.called", "Writing local incident report draft inside the sandbox.", "success", {
      tool: "Report Writer",
    }),
  );

  const shellDecision = routeToolCall("shell.execute");
  addLegacyEvent(
    legacyEvent("policy.checked", "NemoClaw checked shell.execute against active policy.", "info", {
      action: "shell.execute",
    }),
  );

  if (!isLegacyValidTransition(legacyState, "waiting_for_approval")) {
    throw new Error(`Invalid transition from ${legacyState} to waiting_for_approval`);
  }
  legacyState = "waiting_for_approval";
  legacyPendingApprovalId = demoApproval.id;

  addLegacyEvent(
    legacyEvent("approval.requested", shellDecision.message, "warning", {
      approval_id: demoApproval.id,
      command: demoApproval.command,
    }),
  );

  return legacyEvents;
}

export function startRuntime(): { agent_id: string; status: RuntimeState; events: RuntimeEvent[] } {
  legacyMemory = [...demoMemory];
  legacyReport = null;
  legacyApprovalStatus = "pending";
  buildInitialEvents();
  return { agent_id: DEMO_AGENT_ID, status: legacyState, events: legacyEvents };
}

export function stopRuntime(): { agent_id: string; status: RuntimeState } {
  if (!isLegacyValidTransition(legacyState, "stopped")) {
    throw new Error(`Invalid transition from ${legacyState} to stopped`);
  }
  legacyState = "stopped";
  addLegacyEvent(legacyEvent("agent.completed", "Agent runtime stopped by user.", "warning"));
  return { agent_id: DEMO_AGENT_ID, status: legacyState };
}

export function getRuntimeEvents(): RuntimeEvent[] {
  return legacyEvents.length ? legacyEvents : buildInitialEvents();
}

export function getRuntimeMemory(): MemoryItem[] {
  return legacyMemory;
}

export function getRuntimeReport(): IncidentReport | null {
  return legacyReport;
}

export function resolveApproval(decision: "approved" | "denied"): {
  agent_id: string;
  status: RuntimeState;
  memory_item: MemoryItem;
  events: RuntimeEvent[];
  report: IncidentReport;
} {
  if (legacyState !== "waiting_for_approval") {
    throw new Error(`Cannot resolve approval in state: ${legacyState}`);
  }

  legacyApprovalStatus = decision;
  const memoryContent =
    decision === "approved"
      ? "User approved shell execution for 185.92.XX.XX."
      : "User denied shell execution for 185.92.XX.XX.";

  const memoryItem: MemoryItem = {
    id: `memory_approval_${Date.now()}`,
    agent_id: DEMO_AGENT_ID,
    type: "approval",
    content: memoryContent,
    created_at: now(),
  };

  if (!legacyMemory.some((item) => item.content === memoryItem.content)) {
    legacyMemory.push(memoryItem);
    addLegacyEvent(legacyEvent("memory.updated", memoryContent, "success"));
  }

  const resolvedEvents = [
    addLegacyEvent(
      legacyEvent(
        "approval.resolved",
        `User ${decision} shell execution for block_ip 185.92.XX.XX.`,
        decision === "approved" ? "success" : "warning",
        { approval_id: legacyPendingApprovalId, decision },
      ),
    ),
  ];

  legacyReport = {
    ...demoReport,
    approval_decisions: [
      decision === "approved"
        ? "User approved command execution."
        : "User denied command execution.",
    ],
    memory_updates: legacyMemory.map((item) => item.content),
  };
  resolvedEvents.push(addLegacyEvent(legacyEvent("report.created", "Incident report generated.", "success")));

  if (decision === "denied") {
    if (!isLegacyValidTransition(legacyState, "stopped")) {
      throw new Error(`Invalid transition from ${legacyState} to stopped`);
    }
    legacyState = "stopped";
    resolvedEvents.push(
      addLegacyEvent(legacyEvent("agent.completed", "Agent workflow stopped due to denied approval.", "warning")),
    );
  } else {
    if (!isLegacyValidTransition(legacyState, "completed")) {
      throw new Error(`Invalid transition from ${legacyState} to completed`);
    }
    legacyState = "completed";
    resolvedEvents.push(
      addLegacyEvent(legacyEvent("agent.completed", "Agent completed the workflow safely.", "success")),
    );
  }

  legacyPendingApprovalId = null;

  return {
    agent_id: DEMO_AGENT_ID,
    status: legacyState,
    memory_item: memoryItem,
    events: resolvedEvents,
    report: legacyReport,
  };
}

export function getApprovalStatus(): "pending" | "approved" | "denied" {
  return legacyApprovalStatus;
}
