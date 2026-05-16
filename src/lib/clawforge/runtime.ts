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
      requested_action: demoApproval.action,
      reason: "Repeated failed login attempts detected",
      risk_level: "High",
      policy_triggered: "require_shell_approval",
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
        : "User denied shell execution for unknown suspicious IPs. Future remediation commands against unknown IPs require explicit approval.",
    created_at: createdAt,
  };

  if (!memory.some((item) => item.content === memoryItem.content)) {
    memory.push(memoryItem);
  }

  const resolvedEvents = [
    addEvent(
      event(
        "approval.resolved",
        decision === "approved"
          ? "User approved shell execution for block_ip 185.92.XX.XX."
          : "Command denied.",
        decision === "approved" ? "success" : "warning",
      ),
    ),
    addEvent(event("memory.updated", memoryItem.content, "success")),
  ];

  if (decision === "denied") {
    resolvedEvents.push(
      addEvent(
        event(
          "policy.checked",
          "NemoClaw kept the agent inside safe mode.",
          "success",
          { action: "shell.execute", policy: "require_shell_approval" },
        ),
      ),
      addEvent(
        event(
          "tool.called",
          "SentinelClaw will continue by writing a report only.",
          "info",
          { tool: "Report Writer" },
        ),
      ),
      addEvent(
        event(
          "agent.thinking",
          "New suspicious source detected: 91.201.XX.XX.",
          "warning",
        ),
      ),
      addEvent(
        event(
          "memory.updated",
          "Retrieved memory: user denied shell execution for unknown IPs.",
          "success",
        ),
      ),
      addEvent(
        event(
          "policy.checked",
          "SentinelClaw skipped automatic remediation.",
          "success",
          { source_ip: "91.201.XX.XX", decision: "report_only" },
        ),
      ),
      addEvent(
        event(
          "tool.called",
          "Added recommendation to incident report instead.",
          "success",
          { tool: "Report Writer" },
        ),
      ),
    );
  }

  const decisionCopy =
    decision === "approved"
      ? {
          userDecision: "Approve Command.",
          finalAction: "SentinelClaw executed the approved remediation command.",
          safetyResult:
            "NemoClaw recorded the approval before allowing the restricted shell action.",
          approvalDecision: "User approved command execution.",
        }
      : {
          userDecision: "Command denied.",
          finalAction:
            "SentinelClaw skipped automatic remediation and continued with a report-only workflow.",
          safetyResult:
            "NemoClaw kept the agent inside safe mode. No restricted action was executed without approval.",
          approvalDecision: "User denied command execution.",
        };

  report = {
    ...demoReport,
    user_decision: decisionCopy.userDecision,
    final_action: decisionCopy.finalAction,
    safety_result: decisionCopy.safetyResult,
    approval_decisions: [decisionCopy.approvalDecision],
    memory_update: memoryItem.content,
    memory_updates:
      decision === "denied"
        ? [
            ...memory.map((item) => item.content),
            "Retrieved memory before handling 91.201.XX.XX and skipped automatic remediation.",
          ]
        : memory.map((item) => item.content),
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
