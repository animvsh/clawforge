import { DEMO_AGENT_ID, demoApproval, demoMemory, demoReport } from "./fixtures";
import { getSandboxHardeningStatus, scanForbiddenPath } from "./policies";
import { redactSecrets, redactText } from "./security";
import { readRuntimeSnapshot, resetRuntimeSnapshot, writeRuntimeSnapshot } from "./storage";
import { routeToolCall } from "./tools";
import type {
  ApprovalArtifact,
  AuditRecord,
  IncidentReport,
  MemoryItem,
  RuntimeEvent,
  RuntimeSnapshot,
  SandboxHardeningStatus,
} from "./types";

export type RuntimeState = RuntimeSnapshot["status"];

function now(): string {
  return new Date().toISOString();
}

function hashAuditRecord(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return `audit_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function event(
  snapshot: RuntimeSnapshot,
  type: RuntimeEvent["type"],
  message: string,
  severity: RuntimeEvent["severity"] = "info",
  metadata?: Record<string, unknown>,
): RuntimeEvent {
  return {
    id: `event_${snapshot.events.length + 1}_${Date.now()}`,
    agent_id: DEMO_AGENT_ID,
    type,
    message: redactText(message),
    timestamp: now(),
    severity,
    metadata: metadata ? redactSecrets(metadata) : undefined,
  };
}

function auditFromEvent(snapshot: RuntimeSnapshot, nextEvent: RuntimeEvent): AuditRecord {
  const previous = snapshot.audit.at(-1);
  const sequence = snapshot.audit.length + 1;
  const canonical = JSON.stringify({
    sequence,
    event_id: nextEvent.id,
    type: nextEvent.type,
    message: nextEvent.message,
    timestamp: nextEvent.timestamp,
    metadata: nextEvent.metadata,
    previous_hash: previous?.hash ?? null,
  });

  return {
    id: `audit_${sequence}_${Date.now()}`,
    sequence,
    event_id: nextEvent.id,
    agent_id: nextEvent.agent_id,
    type: nextEvent.type,
    message: nextEvent.message,
    timestamp: nextEvent.timestamp,
    severity: nextEvent.severity,
    metadata: nextEvent.metadata,
    previous_hash: previous?.hash ?? null,
    hash: hashAuditRecord(canonical),
    redaction_applied: true,
    immutable: true,
  };
}

function addEvent(snapshot: RuntimeSnapshot, nextEvent: RuntimeEvent): RuntimeEvent {
  snapshot.events.push(nextEvent);
  snapshot.audit.push(auditFromEvent(snapshot, nextEvent));
  return nextEvent;
}

function addRuntimeEvent(
  snapshot: RuntimeSnapshot,
  type: RuntimeEvent["type"],
  message: string,
  severity: RuntimeEvent["severity"] = "info",
  metadata?: Record<string, unknown>,
): RuntimeEvent {
  return addEvent(snapshot, event(snapshot, type, message, severity, metadata));
}

function addMemory(snapshot: RuntimeSnapshot, nextItem: MemoryItem): MemoryItem {
  if (!snapshot.memory.some((item) => item.id === nextItem.id || item.content === nextItem.content)) {
    snapshot.memory.push(nextItem);
  }
  return nextItem;
}

function buildInitialEvents(snapshot: RuntimeSnapshot): RuntimeEvent[] {
  snapshot.events = [];
  snapshot.audit = [];

  addRuntimeEvent(snapshot, "agent.started", "Agent started inside NemoClaw sandbox.", "success");
  addRuntimeEvent(
    snapshot,
    "security.checked",
    `Sandbox hardening status: ${snapshot.hardening?.status ?? "unknown"}.`,
    snapshot.hardening?.status === "failed" ? "error" : "success",
    { checks: snapshot.hardening?.checks },
  );

  const logDecision = routeToolCall("logs.read");
  addRuntimeEvent(snapshot, "policy.checked", logDecision.message, "info", { action: "logs.read" });
  addRuntimeEvent(snapshot, "tool.called", "Reading system logs from /logs/auth.log.", "info", {
    tool: "Log Reader",
  });

  addRuntimeEvent(
    snapshot,
    "agent.thinking",
    "Detected 47 failed SSH login attempts from 185.92.XX.XX.",
    "warning",
  );
  addRuntimeEvent(
    snapshot,
    "agent.thinking",
    "Mapped behavior to MITRE ATT&CK: Credential Access.",
    "warning",
  );

  const exportDecision = routeToolCall("data.export");
  addRuntimeEvent(snapshot, "policy.checked", "NemoClaw checked data.export against active policy.", "info", {
    action: "data.export",
  });
  addRuntimeEvent(snapshot, "policy.blocked", exportDecision.message, "error", {
    action: "data.export",
  });

  const reportDecision = routeToolCall("report.write");
  addRuntimeEvent(snapshot, "policy.checked", reportDecision.message, "info", {
    action: "report.write",
  });
  addRuntimeEvent(
    snapshot,
    "tool.called",
    "Writing local incident report draft inside the sandbox.",
    "success",
    { tool: "Report Writer" },
  );

  const shellDecision = routeToolCall("shell.execute");
  addRuntimeEvent(
    snapshot,
    "policy.checked",
    "NemoClaw checked shell.execute against active policy.",
    "info",
    { action: "shell.execute" },
  );
  addRuntimeEvent(snapshot, "approval.requested", shellDecision.message, "warning", {
    approval_id: demoApproval.id,
    command: demoApproval.command,
    preview: demoApproval.preview,
    destination: demoApproval.destination,
    risk_label: demoApproval.risk_label,
    timeout_seconds: demoApproval.timeout_seconds,
    policy_id: demoApproval.policy_id,
  });

  return snapshot.events;
}

function buildReport(
  snapshot: RuntimeSnapshot,
  decision: "approved" | "denied",
  memoryItem: MemoryItem,
): IncidentReport {
  const approvalDecision =
    decision === "approved" ? "User approved command execution." : "User denied command execution.";

  return {
    ...demoReport,
    user_decision: approvalDecision,
    final_action:
      decision === "approved"
        ? "SentinelClaw executed the shell action only after recording an approval artifact."
        : "SentinelClaw skipped automatic remediation and continued with report-only workflow.",
    memory_update: memoryItem.content,
    safety_result:
      decision === "approved"
        ? "NemoClaw allowed the restricted action only after approval artifact verification."
        : "NemoClaw kept the agent inside safe mode. No restricted action was executed without approval.",
    audit_summary: `${snapshot.audit.length} ordered audit records captured policy, approval, memory, and report events.`,
    approval_decisions: [approvalDecision],
    memory_updates: [
      ...snapshot.memory.map((item) => item.content),
      "Retrieved memory before handling 91.201.XX.XX and skipped automatic remediation.",
    ],
  };
}

export async function startRuntime(): Promise<{
  agent_id: string;
  status: RuntimeState;
  hardening: SandboxHardeningStatus;
}> {
  const hardening = getSandboxHardeningStatus();

  if (hardening.elevated_mode && !hardening.can_run_elevated) {
    const snapshot = await readRuntimeSnapshot();
    snapshot.status = "stopped";
    snapshot.hardening = hardening;
    addRuntimeEvent(
      snapshot,
      "agent.error",
      "Elevated autonomous work blocked because sandbox hardening is not healthy.",
      "error",
      { checks: hardening.checks },
    );
    await writeRuntimeSnapshot(snapshot);
    return { agent_id: DEMO_AGENT_ID, status: snapshot.status, hardening };
  }

  const snapshot = await resetRuntimeSnapshot();
  snapshot.status = "waiting_for_approval";
  snapshot.approval_status = "pending";
  snapshot.memory = [...demoMemory];
  snapshot.approvals = [{ ...demoApproval, status: "pending" }];
  snapshot.approval_artifacts = [];
  snapshot.report = null;
  snapshot.hardening = hardening;
  buildInitialEvents(snapshot);
  await writeRuntimeSnapshot(snapshot);
  return { agent_id: DEMO_AGENT_ID, status: snapshot.status, hardening };
}

export async function stopRuntime(): Promise<{ agent_id: string; status: RuntimeState }> {
  const snapshot = await readRuntimeSnapshot();
  snapshot.status = "stopped";
  addRuntimeEvent(snapshot, "agent.completed", "Agent runtime stopped by user.", "warning");
  await writeRuntimeSnapshot(snapshot);
  return { agent_id: DEMO_AGENT_ID, status: snapshot.status };
}

export async function getRuntimeEvents(): Promise<RuntimeEvent[]> {
  const snapshot = await readRuntimeSnapshot();
  if (!snapshot.events.length) {
    snapshot.hardening = getSandboxHardeningStatus();
    buildInitialEvents(snapshot);
    await writeRuntimeSnapshot(snapshot);
  }
  return snapshot.events;
}

export async function getRuntimeMemory(): Promise<MemoryItem[]> {
  return (await readRuntimeSnapshot()).memory;
}

export async function getRuntimeReport(): Promise<IncidentReport | null> {
  return (await readRuntimeSnapshot()).report;
}

export async function getRuntimeAudit(): Promise<AuditRecord[]> {
  return (await readRuntimeSnapshot()).audit;
}

export async function getRuntimeApprovals() {
  const snapshot = await readRuntimeSnapshot();
  return {
    approvals: snapshot.approvals,
    approval_artifacts: snapshot.approval_artifacts,
  };
}

export async function getRuntimeHardening(): Promise<SandboxHardeningStatus> {
  const snapshot = await readRuntimeSnapshot();
  return snapshot.hardening ?? getSandboxHardeningStatus();
}

export async function resetRuntime(): Promise<{ agent_id: string; status: RuntimeState }> {
  const snapshot = await resetRuntimeSnapshot();
  return { agent_id: DEMO_AGENT_ID, status: snapshot.status };
}

export async function resolveApproval(decision: "approved" | "denied"): Promise<{
  agent_id: string;
  status: RuntimeState;
  memory_item: MemoryItem;
  events: RuntimeEvent[];
  audit: AuditRecord[];
  approval_artifact: ApprovalArtifact;
  report: IncidentReport;
}> {
  const snapshot = await readRuntimeSnapshot();
  const createdAt = now();
  const approvalRequest = snapshot.approvals.find((approval) => approval.id === demoApproval.id) ?? {
    ...demoApproval,
  };

  const approvalArtifact: ApprovalArtifact = {
    id: `approval_artifact_${Date.now()}`,
    approval_id: approvalRequest.id,
    agent_id: DEMO_AGENT_ID,
    decision,
    policy_id: approvalRequest.policy_id,
    command: approvalRequest.command,
    created_at: createdAt,
    side_effect_allowed: decision === "approved",
  };

  snapshot.approval_status = decision;
  snapshot.approvals = snapshot.approvals.map((approval) =>
    approval.id === approvalRequest.id
      ? { ...approval, status: decision, resolved_at: createdAt }
      : approval,
  );
  snapshot.approval_artifacts.push(approvalArtifact);

  const memoryItem: MemoryItem = {
    id: `memory_approval_${Date.now()}`,
    agent_id: DEMO_AGENT_ID,
    type: "approval",
    content:
      decision === "approved"
        ? "User approved shell execution for 185.92.XX.XX with an approval artifact."
        : "User denied shell execution for unknown suspicious IPs. Future remediation commands against unknown IPs require explicit approval.",
    created_at: createdAt,
  };
  addMemory(snapshot, memoryItem);

  const resolvedEvents = [
    addRuntimeEvent(
      snapshot,
      "approval.resolved",
      decision === "approved"
        ? "Approval artifact recorded for block_ip 185.92.XX.XX."
        : "Command denied.",
      decision === "approved" ? "success" : "warning",
      { approval_artifact_id: approvalArtifact.id, policy_id: approvalRequest.policy_id },
    ),
    addRuntimeEvent(snapshot, "memory.updated", memoryItem.content, "success"),
  ];

  if (decision === "approved") {
    const pathScan = scanForbiddenPath(approvalRequest.command ?? "");
    if (!pathScan.allowed) {
      resolvedEvents.push(
        addRuntimeEvent(
          snapshot,
          "policy.blocked",
          `Approved command still blocked by forbidden path scanner: ${pathScan.match}.`,
          "error",
          { approval_artifact_id: approvalArtifact.id },
        ),
      );
    } else {
      resolvedEvents.push(
        addRuntimeEvent(
          snapshot,
          "tool.called",
          "Executed shell action after approval artifact verification.",
          "success",
          { approval_artifact_id: approvalArtifact.id, command: approvalRequest.command },
        ),
      );
    }
  } else {
    resolvedEvents.push(
      addRuntimeEvent(snapshot, "policy.checked", "NemoClaw kept the agent inside safe mode.", "success", {
        action: "shell.execute",
        policy: approvalRequest.policy_id,
      }),
      addRuntimeEvent(snapshot, "tool.called", "SentinelClaw will continue by writing a report only.", "info", {
        tool: "Report Writer",
      }),
      addRuntimeEvent(snapshot, "agent.thinking", "New suspicious source detected: 91.201.XX.XX.", "warning"),
      addRuntimeEvent(
        snapshot,
        "memory.retrieved",
        "Retrieved memory: user denied shell execution for unknown IPs.",
        "success",
      ),
      addRuntimeEvent(snapshot, "policy.checked", "SentinelClaw skipped automatic remediation.", "success", {
        source_ip: "91.201.XX.XX",
        decision: "report_only",
      }),
      addRuntimeEvent(snapshot, "tool.called", "Added recommendation to incident report instead.", "success", {
        tool: "Report Writer",
      }),
    );
  }

  snapshot.report = buildReport(snapshot, decision, memoryItem);
  resolvedEvents.push(addRuntimeEvent(snapshot, "report.created", "Incident report generated.", "success"));
  resolvedEvents.push(
    addRuntimeEvent(snapshot, "agent.completed", "Agent completed the workflow safely.", "success"),
  );
  snapshot.report.audit_summary = `${snapshot.audit.length} ordered audit records captured policy, approval, memory, and report events.`;
  snapshot.status = "completed";
  await writeRuntimeSnapshot(snapshot);

  return {
    agent_id: DEMO_AGENT_ID,
    status: snapshot.status,
    memory_item: memoryItem,
    events: resolvedEvents,
    audit: snapshot.audit,
    approval_artifact: approvalArtifact,
    report: snapshot.report,
  };
}

export async function getApprovalStatus(): Promise<"pending" | "approved" | "denied"> {
  return (await readRuntimeSnapshot()).approval_status;
}
