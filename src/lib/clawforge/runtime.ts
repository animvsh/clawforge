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
  { from: "running", to: "stopped" },
  { from: "paused", to: "running" },
  { from: "running", to: "waiting_for_approval" },
  { from: "waiting_for_approval", to: "running" },
  { from: "waiting_for_approval", to: "stopped" },
  { from: "waiting_for_approval", to: "completed" },
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

  private checkActionPolicy(action: string): {
    allowed: boolean;
    approvalRequired: boolean;
    policyId: string;
    reason: string;
  } {
    const policy = this.policies.find((p) => p.action === action);
    if (!policy) {
      return {
        allowed: false,
        approvalRequired: false,
        policyId: "policy_default_deny",
        reason: `No policy exists for ${action}.`,
      };
    }
    if (policy.effect === "deny") {
      return {
        allowed: false,
        approvalRequired: false,
        policyId: policy.id,
        reason: policy.reason,
      };
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

    this.emit(
      createLifecycleEvent(
        this.sessionId,
        "session.deployed",
        `Agent ${blueprint.agent_name} deployed into NemoClaw sandbox.`,
        "success",
        {
          blueprint_id: blueprint.blueprint_id,
          agent_name: blueprint.agent_name,
        },
      ),
    );

    this.state = "deployed";

    if (!isValidTransition(this.state, "running")) {
      throw new Error(`Invalid transition from ${this.state} to running`);
    }
    this.state = "running";

    this.emit(
      createLifecycleEvent(
        this.sessionId,
        "session.running",
        "Sandbox session is now running.",
        "info",
      ),
    );

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
      this.emit(
        createLifecycleEvent(
          this.sessionId,
          "tool.blocked",
          `Cannot execute ${action.action}: session is ${this.state}.`,
          "error",
        ),
      );
      return { allowed: false, approvalRequired: false, blocked: true, events: this.getEvents() };
    }

    this.emit(
      createLifecycleEvent(
        this.sessionId,
        "policy.checked",
        `Checking policy for action: ${action.action}.`,
        "debug",
        { action: action.action },
      ),
    );

    const policyCheck = this.checkActionPolicy(action.action);

    if (!policyCheck.allowed && !policyCheck.approvalRequired) {
      this.emit(
        createLifecycleEvent(
          this.sessionId,
          "policy.blocked",
          `Blocked by ${policyCheck.policyId}: ${policyCheck.reason}`,
          "error",
          { action: action.action },
        ),
      );
      this.emit(
        createLifecycleEvent(
          this.sessionId,
          "tool.blocked",
          `Action ${action.action} is blocked.`,
          "error",
          { action: action.action },
        ),
      );
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

      this.emit(
        createLifecycleEvent(
          this.sessionId,
          "approval.requested",
          `Approval required: ${policyCheck.reason}`,
          "warning",
          {
            approval_id: approval.id,
            action: action.action,
            policy_id: policyCheck.policyId,
          },
        ),
      );

      this.emit(
        createLifecycleEvent(
          this.sessionId,
          "session.waiting_for_approval",
          "Session paused, waiting for approval.",
          "info",
        ),
      );

      return {
        allowed: false,
        approvalRequired: true,
        blocked: false,
        events: this.getEvents(),
        approval,
      };
    }

    this.emit(
      createLifecycleEvent(
        this.sessionId,
        "tool.executed",
        `Action ${action.action} executed successfully inside sandbox.`,
        "success",
        { action: action.action },
      ),
    );
    return { allowed: true, approvalRequired: false, blocked: false, events: this.getEvents() };
  }

  pauseSession(): {
    status: SessionState;
    events: LifecycleEvent[];
  } {
    if (!isValidTransition(this.state, "paused")) {
      this.emit(
        createLifecycleEvent(
          this.sessionId,
          "session.paused",
          `Cannot pause: session is ${this.state}.`,
          "warning",
        ),
      );
      return { status: this.state, events: this.getEvents() };
    }

    this.state = "paused";
    this.emit(
      createLifecycleEvent(this.sessionId, "session.paused", "Sandbox session paused.", "info"),
    );
    return { status: this.state, events: this.getEvents() };
  }

  resumeSession(approval?: ApprovalResult): {
    status: SessionState;
    events: LifecycleEvent[];
    executed: boolean;
  } {
    // Handle resuming from paused state
    if (this.state === "paused") {
      if (!isValidTransition(this.state, "running")) {
        throw new Error(`Invalid transition from ${this.state} to running`);
      }
      this.state = "running";
      this.emit(
        createLifecycleEvent(
          this.sessionId,
          "session.resumed",
          "Sandbox session resumed from paused state.",
          "info",
        ),
      );
      return { status: this.state, events: this.getEvents(), executed: false };
    }

    if (this.state !== "waiting_for_approval") {
      this.emit(
        createLifecycleEvent(
          this.sessionId,
          "session.resumed",
          `Cannot resume: session is ${this.state}.`,
          "warning",
        ),
      );
      return { status: this.state, events: this.getEvents(), executed: false };
    }

    if (!approval || !approval.approved) {
      if (!isValidTransition(this.state, "running")) {
        throw new Error(`Invalid transition from ${this.state} to running`);
      }
      this.state = "running";
      const memoryItem: MemoryItem = {
        id: generateId("memory"),
        agent_id: this.agentId,
        type: "approval",
        content: this.pendingAction
          ? `User denied action: ${this.pendingAction.action}`
          : "User denied pending action.",
        created_at: now(),
      };
      this.memory.push(memoryItem);

      this.emit(
        createLifecycleEvent(
          this.sessionId,
          "approval.resolved",
          "Approval denied by user.",
          "warning",
        ),
      );
      this.emit(createLifecycleEvent(this.sessionId, "memory.updated", memoryItem.content, "info"));
      this.emit(
        createLifecycleEvent(
          this.sessionId,
          "session.resumed",
          "Sandbox session resumed after denied approval.",
          "info",
        ),
      );

      this.pendingApproval = null;
      this.pendingAction = null;

      return { status: this.state, events: this.getEvents(), executed: false };
    }

    this.state = "running";
    this.emit(
      createLifecycleEvent(this.sessionId, "approval.resolved", "Approval granted.", "success"),
    );

    if (this.pendingAction) {
      this.emit(
        createLifecycleEvent(
          this.sessionId,
          "tool.executed",
          `Action ${this.pendingAction.action} executed after approval.`,
          "success",
          {
            action: this.pendingAction.action,
            approval_id: approval.approval_id,
          },
        ),
      );

      const memoryItem: MemoryItem = {
        id: generateId("memory"),
        agent_id: this.agentId,
        type: "approval",
        content: `User approved action: ${this.pendingAction.action}`,
        created_at: now(),
      };
      this.memory.push(memoryItem);
      this.emit(
        createLifecycleEvent(this.sessionId, "memory.updated", memoryItem.content, "success"),
      );
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

    this.state = "stopped";
    this.emit(
      createLifecycleEvent(
        this.sessionId,
        "session.terminated",
        "Sandbox session terminated and cleaned up.",
        "warning",
      ),
    );

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

    this.emit(
      createLifecycleEvent(
        this.sessionId,
        "report.generated",
        "Incident report generated.",
        "success",
      ),
    );
    this.emit(
      createLifecycleEvent(
        this.sessionId,
        "session.completed",
        "Sandbox session completed successfully.",
        "success",
      ),
    );

    return { status: this.state, events: this.getEvents(), report };
  }
}

// Legacy runtime support - maintains backwards compatibility
type LegacyRuntimeState =
  | "created"
  | "deployed"
  | "running"
  | "waiting_for_approval"
  | "completed"
  | "stopped";

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
let legacyAgentId = DEMO_AGENT_ID;
let legacyAgentName = "SentinelClaw";
let legacyTemplateId: BlueprintResponse["template_id"] = "incident_response";
let legacyBlueprint: BlueprintResponse | null = null;

export type RuntimeState =
  | "created"
  | "deployed"
  | "running"
  | "waiting_for_approval"
  | "completed"
  | "stopped";

function legacyEvent(
  type: RuntimeEvent["type"],
  message: string,
  severity: RuntimeEvent["severity"] = "info",
  metadata?: Record<string, unknown>,
): RuntimeEvent {
  return {
    id: `event_${legacyEvents.length + 1}_${Date.now()}`,
    agent_id: legacyAgentId,
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

function customAgentId(blueprint: BlueprintResponse): string {
  return `agent_${blueprint.template_id}_${blueprint.blueprint_id
    .replace(/[^a-z0-9]/gi, "_")
    .slice(-16)}`;
}

function buildPhoneReceptionistEvents(): RuntimeEvent[] {
  legacyEvents = [];

  if (!isLegacyValidTransition(legacyState, "deployed")) {
    throw new Error(`Invalid transition from ${legacyState} to deployed`);
  }
  legacyState = "deployed";
  addLegacyEvent(
    legacyEvent("agent.started", `${legacyAgentName} deployed into NemoClaw sandbox.`, "success"),
  );

  if (!isLegacyValidTransition(legacyState, "running")) {
    throw new Error(`Invalid transition from ${legacyState} to running`);
  }
  legacyState = "running";

  addLegacyEvent(
    legacyEvent(
      "policy.checked",
      "NemoClaw allowed phone.call.receive inside the sandbox.",
      "info",
      {
        action: "phone.call.receive",
      },
    ),
  );
  addLegacyEvent(
    legacyEvent("tool.called", "Answering inbound receptionist call in safe mode.", "success", {
      tool: "Phone Number",
    }),
  );
  addLegacyEvent(
    legacyEvent(
      "tool.called",
      "Transcribing call and extracting the requested appointment.",
      "info",
      {
        tool: "Call Transcriber",
      },
    ),
  );
  addLegacyEvent(
    legacyEvent("policy.checked", "NemoClaw allowed calendar.availability.read.", "info", {
      action: "calendar.availability.read",
    }),
  );
  addLegacyEvent(
    legacyEvent("tool.called", "Checking calendar availability for the requested time.", "info", {
      tool: "Calendar Reader",
    }),
  );
  addLegacyEvent(
    legacyEvent(
      "agent.thinking",
      "Found a matching opening and drafted a customer confirmation text.",
      "success",
    ),
  );
  addLegacyEvent(
    legacyEvent("policy.checked", "NemoClaw checked sms.send against approval policy.", "info", {
      action: "sms.send",
    }),
  );

  if (!isLegacyValidTransition(legacyState, "waiting_for_approval")) {
    throw new Error(`Invalid transition from ${legacyState} to waiting_for_approval`);
  }
  legacyState = "waiting_for_approval";
  legacyPendingApprovalId = demoApproval.id;

  addLegacyEvent(
    legacyEvent(
      "approval.requested",
      "Approval required before sending the customer confirmation text.",
      "warning",
      {
        approval_id: demoApproval.id,
        command: "send_text +1-555-0100 'You are booked for Tuesday at 2:00 PM.'",
      },
    ),
  );

  return legacyEvents;
}

function buildInitialEvents(): RuntimeEvent[] {
  if (legacyTemplateId === "phone_receptionist") return buildPhoneReceptionistEvents();

  legacyEvents = [];

  if (!isLegacyValidTransition(legacyState, "deployed")) {
    throw new Error(`Invalid transition from ${legacyState} to deployed`);
  }
  legacyState = "deployed";
  addLegacyEvent(
    legacyEvent("agent.started", `${legacyAgentName} deployed into NemoClaw sandbox.`, "success"),
  );

  if (!isLegacyValidTransition(legacyState, "running")) {
    throw new Error(`Invalid transition from ${legacyState} to running`);
  }
  legacyState = "running";

  const logDecision = routeToolCall("logs.read");
  addLegacyEvent(
    legacyEvent("policy.checked", logDecision.message, "info", { action: "logs.read" }),
  );
  addLegacyEvent(
    legacyEvent("tool.called", "Reading system logs from /logs/auth.log.", "info", {
      tool: "Log Reader",
    }),
  );

  addLegacyEvent(
    legacyEvent(
      "agent.thinking",
      "Detected 47 failed SSH login attempts from 185.92.XX.XX.",
      "warning",
    ),
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
  addLegacyEvent(
    legacyEvent("policy.blocked", exportDecision.message, "error", { action: "data.export" }),
  );

  const reportDecision = routeToolCall("report.write");
  addLegacyEvent(
    legacyEvent("policy.checked", reportDecision.message, "info", { action: "report.write" }),
  );
  addLegacyEvent(
    legacyEvent(
      "tool.called",
      "Writing local incident report draft inside the sandbox.",
      "success",
      {
        tool: "Report Writer",
      },
    ),
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

export function startRuntime(blueprint?: BlueprintResponse): {
  agent_id: string;
  status: RuntimeState;
  events: RuntimeEvent[];
} {
  legacyBlueprint = blueprint ?? null;
  legacyTemplateId = blueprint?.template_id ?? "incident_response";
  legacyAgentName = blueprint?.agent_name ?? "SentinelClaw";
  legacyAgentId = blueprint ? customAgentId(blueprint) : DEMO_AGENT_ID;
  legacyMemory =
    legacyTemplateId === "phone_receptionist"
      ? [
          {
            id: "memory_reception_style",
            agent_id: legacyAgentId,
            type: "preference",
            content: "Ask before sending customer-facing texts or booking appointments.",
            created_at: now(),
          },
        ]
      : [...demoMemory].map((item) => ({ ...item, agent_id: legacyAgentId }));
  legacyReport = null;
  legacyApprovalStatus = "pending";
  buildInitialEvents();
  return { agent_id: legacyAgentId, status: legacyState, events: legacyEvents };
}

export function stopRuntime(): { agent_id: string; status: RuntimeState } {
  if (!isLegacyValidTransition(legacyState, "stopped")) {
    throw new Error(`Invalid transition from ${legacyState} to stopped`);
  }
  legacyState = "stopped";
  addLegacyEvent(legacyEvent("agent.completed", "Agent runtime stopped by user.", "warning"));
  return { agent_id: legacyAgentId, status: legacyState };
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

export function getRuntimeState(): RuntimeState {
  return legacyState;
}

export function isActiveRuntimeAgent(agentId: string): boolean {
  return agentId === legacyAgentId;
}

export function hydrateRuntimeForAgentId(agentId: string): boolean {
  if (agentId === legacyAgentId) return true;
  if (!agentId.startsWith("agent_phone_receptionist_")) return false;

  legacyState = "created";
  legacyEvents = [];
  legacyMemory = [
    {
      id: "memory_reception_style",
      agent_id: agentId,
      type: "preference",
      content: "Ask before sending customer-facing texts or booking appointments.",
      created_at: now(),
    },
  ];
  legacyReport = null;
  legacyApprovalStatus = "pending";
  legacyPendingApprovalId = null;
  legacyAgentId = agentId;
  legacyAgentName = "ReceptionClaw";
  legacyTemplateId = "phone_receptionist";
  legacyBlueprint = null;
  return true;
}

function buildLegacyReport(decision: "approved" | "denied"): IncidentReport {
  if (legacyTemplateId !== "phone_receptionist") {
    return {
      ...demoReport,
      agent_id: legacyAgentId,
      approval_decisions: [
        decision === "approved"
          ? "User approved command execution."
          : "User denied command execution.",
      ],
      memory_updates: legacyMemory.map((item) => item.content),
    };
  }

  const approved = decision === "approved";
  return {
    ...demoReport,
    id: `report_${legacyAgentId}`,
    agent_id: legacyAgentId,
    title: "Receptionist Booking Summary",
    severity: "low",
    detected_behavior: "A caller requested an appointment and asked for a text confirmation.",
    classification: "Phone receptionist workflow",
    model_used: legacyBlueprint?.model ?? "NVIDIA Nemotron",
    runtime: "NemoClaw",
    policy_triggered: "require_approval_for_customer_messages",
    action_attempted: "send_text +1-555-0100",
    user_decision: approved ? "Approved" : "Denied",
    final_action: approved
      ? "Confirmation text was released after approval."
      : "No customer-facing text was sent; the appointment stayed as a draft.",
    memory_update: approved
      ? "User approved this customer confirmation text."
      : "Future receptionist texts require explicit approval before sending.",
    safety_result: approved
      ? "NemoClaw released the action only after approval."
      : "NemoClaw paused the outbound message and kept the workflow in draft mode.",
    likely_threat: "None",
    mitre_mapping: "Not applicable",
    evidence: [
      "Inbound call answered inside NemoClaw.",
      "Calendar availability checked with a read-only action.",
      "Outbound SMS was approval-gated.",
    ],
    recommended_action: approved
      ? "Review the booked appointment and keep customer messaging approval-gated."
      : "Review the draft appointment, then approve a customer confirmation when ready.",
    actions_attempted: ["phone.call.receive", "calendar.availability.read", "sms.send"],
    actions_blocked: approved ? [] : ["sms.send"],
    approval_decisions: [
      approved
        ? "User approved the customer confirmation text."
        : "User denied the customer confirmation text.",
    ],
    memory_updates: [
      approved
        ? "Customer text approval was saved to memory."
        : "Future receptionist texts require explicit approval.",
    ],
  };
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
    legacyTemplateId === "phone_receptionist"
      ? decision === "approved"
        ? "User approved customer confirmation text for the receptionist workflow."
        : "User denied customer confirmation text; future outbound texts require explicit approval."
      : decision === "approved"
        ? "User approved shell execution for 185.92.XX.XX."
        : "User denied shell execution for 185.92.XX.XX.";

  const memoryItem: MemoryItem = {
    id: `memory_approval_${Date.now()}`,
    agent_id: legacyAgentId,
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
        legacyTemplateId === "phone_receptionist"
          ? `User ${decision} customer confirmation text.`
          : `User ${decision} shell execution for block_ip 185.92.XX.XX.`,
        decision === "approved" ? "success" : "warning",
        { approval_id: legacyPendingApprovalId, decision },
      ),
    ),
  ];

  legacyReport = buildLegacyReport(decision);
  resolvedEvents.push(
    addLegacyEvent(
      legacyEvent(
        "report.created",
        legacyTemplateId === "phone_receptionist"
          ? "Receptionist booking summary generated."
          : "Incident report generated.",
        "success",
      ),
    ),
  );

  if (decision === "denied") {
    if (!isLegacyValidTransition(legacyState, "completed")) {
      throw new Error(`Invalid transition from ${legacyState} to completed`);
    }
    legacyState = "completed";
    resolvedEvents.push(
      addLegacyEvent(
        legacyEvent(
          "agent.completed",
          legacyTemplateId === "phone_receptionist"
            ? "Agent completed safely with a draft-only receptionist workflow after denied approval."
            : "Agent completed safely with a report-only workflow after denied approval.",
          "success",
        ),
      ),
    );
  } else {
    if (!isLegacyValidTransition(legacyState, "completed")) {
      throw new Error(`Invalid transition from ${legacyState} to completed`);
    }
    legacyState = "completed";
    resolvedEvents.push(
      addLegacyEvent(
        legacyEvent("agent.completed", "Agent completed the workflow safely.", "success"),
      ),
    );
  }

  legacyPendingApprovalId = null;

  return {
    agent_id: legacyAgentId,
    status: legacyState,
    memory_item: memoryItem,
    events: resolvedEvents,
    report: legacyReport,
  };
}

export function resetLegacyRuntime(): void {
  legacyState = "created";
  legacyEvents = [];
  legacyMemory = [];
  legacyReport = null;
  legacyApprovalStatus = "pending";
  legacyPendingApprovalId = null;
  legacyAgentId = DEMO_AGENT_ID;
  legacyAgentName = "SentinelClaw";
  legacyTemplateId = "incident_response";
  legacyBlueprint = null;
}

export function getApprovalStatus(): "pending" | "approved" | "denied" {
  return legacyApprovalStatus;
}
