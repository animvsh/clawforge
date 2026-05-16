import { DEMO_AGENT_ID, demoApproval, demoMemory, demoReport } from "./fixtures";
import { routeToolCall } from "./tools";
import type { IncidentReport, MemoryItem, RuntimeEvent } from "./types";

export type RuntimeState = "created" | "running" | "waiting_for_approval" | "completed" | "stopped";

let state: RuntimeState = "created";
let events: RuntimeEvent[] = [];
let memory: MemoryItem[] = [...demoMemory];
let report: IncidentReport | null = null;
let approvalStatus: "pending" | "approved" | "denied" = "pending";

function now(): string {
  return new Date().toISOString();
}

function event(
  type: RuntimeEvent["type"],
  message: string,
  severity: RuntimeEvent["severity"] = "info",
  metadata?: Record<string, unknown>,
): RuntimeEvent {
  return {
    id: `event_${events.length + 1}_${Date.now()}`,
    agent_id: DEMO_AGENT_ID,
    type,
    message,
    timestamp: now(),
    severity,
    metadata,
  };
}

function addEvent(nextEvent: RuntimeEvent): RuntimeEvent {
  events.push(nextEvent);
  return nextEvent;
}

function buildInitialEvents(): RuntimeEvent[] {
  events = [];
  addEvent(event("agent.started", "Agent started inside NemoClaw sandbox.", "success"));

  const logDecision = routeToolCall("logs.read");
  addEvent(event("policy.checked", logDecision.message, "info", { action: "logs.read" }));
  addEvent(
    event("tool.called", "Reading system logs from /logs/auth.log.", "info", {
      tool: "Log Reader",
    }),
  );

  addEvent(
    event("agent.thinking", "Detected 47 failed SSH login attempts from 185.92.XX.XX.", "warning"),
  );
  addEvent(
    event("agent.thinking", "Mapped behavior to MITRE ATT&CK: Credential Access.", "warning"),
  );

  const exportDecision = routeToolCall("data.export");
  addEvent(
    event("policy.checked", "NemoClaw checked data.export against active policy.", "info", {
      action: "data.export",
    }),
  );
  addEvent(event("policy.blocked", exportDecision.message, "error", { action: "data.export" }));

  const reportDecision = routeToolCall("report.write");
  addEvent(event("policy.checked", reportDecision.message, "info", { action: "report.write" }));
  addEvent(
    event("tool.called", "Writing local incident report draft inside the sandbox.", "success", {
      tool: "Report Writer",
    }),
  );

  const shellDecision = routeToolCall("shell.execute");
  addEvent(
    event("policy.checked", "NemoClaw checked shell.execute against active policy.", "info", {
      action: "shell.execute",
    }),
  );
  addEvent(
    event("approval.requested", shellDecision.message, "warning", {
      approval_id: demoApproval.id,
      command: demoApproval.command,
    }),
  );

  return events;
}

export function startRuntime(): { agent_id: string; status: RuntimeState } {
  state = "waiting_for_approval";
  approvalStatus = "pending";
  memory = [...demoMemory];
  report = null;
  buildInitialEvents();
  return { agent_id: DEMO_AGENT_ID, status: state };
}

export function stopRuntime(): { agent_id: string; status: RuntimeState } {
  state = "stopped";
  addEvent(event("agent.completed", "Agent runtime stopped by user.", "warning"));
  return { agent_id: DEMO_AGENT_ID, status: state };
}

export function getRuntimeEvents(): RuntimeEvent[] {
  return events.length ? events : buildInitialEvents();
}

export function getRuntimeMemory(): MemoryItem[] {
  return memory;
}

export function getRuntimeReport(): IncidentReport | null {
  return report;
}

export function resolveApproval(decision: "approved" | "denied"): {
  agent_id: string;
  status: RuntimeState;
  memory_item: MemoryItem;
  events: RuntimeEvent[];
  report: IncidentReport;
} {
  approvalStatus = decision;
  const createdAt = now();
  const memoryItem: MemoryItem = {
    id: `memory_approval_${Date.now()}`,
    agent_id: DEMO_AGENT_ID,
    type: "approval",
    content:
      decision === "approved"
        ? "User approved shell execution for 185.92.XX.XX."
        : "User denied shell execution for 185.92.XX.XX.",
    created_at: createdAt,
  };

  if (!memory.some((item) => item.content === memoryItem.content)) {
    memory.push(memoryItem);
  }

  const resolvedEvents = [
    addEvent(
      event(
        "approval.resolved",
        `User ${decision} shell execution for block_ip 185.92.XX.XX.`,
        decision === "approved" ? "success" : "warning",
      ),
    ),
    addEvent(event("memory.updated", memoryItem.content, "success")),
  ];

  report = {
    ...demoReport,
    approval_decisions: [
      decision === "approved"
        ? "User approved command execution."
        : "User denied command execution.",
    ],
    memory_updates: memory.map((item) => item.content),
  };
  resolvedEvents.push(addEvent(event("report.created", "Incident report generated.", "success")));
  resolvedEvents.push(
    addEvent(event("agent.completed", "Agent completed the workflow safely.", "success")),
  );
  state = "completed";

  return {
    agent_id: DEMO_AGENT_ID,
    status: state,
    memory_item: memoryItem,
    events: resolvedEvents,
    report,
  };
}

export function getApprovalStatus(): "pending" | "approved" | "denied" {
  return approvalStatus;
}
