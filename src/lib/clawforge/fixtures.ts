import type {
  ApprovalRequest,
  BlueprintResponse,
  IncidentReport,
  MemoryItem,
  ProviderMode,
  RuntimeEvent,
} from "./types";

export const DEMO_AGENT_ID = "agent_sentinelclaw_demo";
export const DEMO_BLUEPRINT_ID = "bp_sentinelclaw_demo";
export const DEMO_APPROVAL_ID = "approval_shell_block_ip";

const timestamp = "2026-05-16T00:00:00.000Z";

export function createSentinelBlueprint(provider: ProviderMode = "auto"): BlueprintResponse {
  const selectedProvider = provider === "auto" ? "nemotron" : provider;
  const model =
    selectedProvider === "minimax"
      ? "minimax/token-plan"
      : selectedProvider === "mock"
        ? "mock/sentinelclaw"
        : "nvidia/nemotron";

  return {
    blueprint_id: DEMO_BLUEPRINT_ID,
    agent_name: "SentinelClaw",
    description: "An autonomous cybersecurity incident response agent",
    goal: "Monitor logs, detect suspicious activity, generate incident reports, and request approval before high-risk actions.",
    provider,
    model,
    fallback_provider: provider === "auto" ? "minimax" : "mock",
    runtime: "openclaw",
    sandbox: "nemoclaw",
    tools: [
      {
        id: "tool_log_reader",
        name: "Log Reader",
        action: "logs.read",
        purpose: "Reads incoming system logs.",
        permission: "allowed",
        risk_level: "low",
        enabled: true,
      },
      {
        id: "tool_threat_classifier",
        name: "Threat Classifier",
        action: "threat.classify",
        purpose: "Classifies suspicious patterns with the selected reasoning provider.",
        permission: "allowed",
        risk_level: "low",
        enabled: true,
      },
      {
        id: "tool_report_writer",
        name: "Report Writer",
        action: "report.write",
        purpose: "Creates a structured incident report.",
        permission: "allowed",
        risk_level: "low",
        enabled: true,
      },
      {
        id: "tool_shell_executor",
        name: "Shell Executor",
        action: "shell.execute",
        purpose: "Runs remediation commands only after approval.",
        permission: "approval_required",
        risk_level: "high",
        enabled: true,
      },
      {
        id: "tool_ticket_creator",
        name: "Ticket Creator",
        action: "ticket.create",
        purpose: "Creates a mock incident ticket after review.",
        permission: "approval_required",
        risk_level: "medium",
        enabled: true,
      },
      {
        id: "tool_external_alert",
        name: "External Alert Sender",
        action: "message.send_external",
        purpose: "Sends Slack or email alerts only after approval.",
        permission: "approval_required",
        risk_level: "medium",
        enabled: true,
      },
      {
        id: "tool_data_export",
        name: "Data Export",
        action: "data.export",
        purpose: "Attempts to move raw logs outside the sandbox.",
        permission: "blocked",
        risk_level: "high",
        enabled: false,
      },
    ],
    policies: [
      {
        id: "policy_shell_approval",
        name: "Require approval for shell commands",
        action: "shell.execute",
        effect: "require_approval",
        reason: "Shell commands can modify system state.",
      },
      {
        id: "policy_block_raw_export",
        name: "Block raw log export",
        action: "data.export",
        effect: "deny",
        reason: "Raw logs may contain sensitive data.",
      },
      {
        id: "policy_ticket_approval",
        name: "Require approval for ticket creation",
        action: "ticket.create",
        effect: "require_approval",
        reason: "Ticket creation changes external workflow state.",
      },
      {
        id: "policy_external_alert_approval",
        name: "Require approval for external alerts",
        action: "message.send_external",
        effect: "require_approval",
        reason: "External notifications can disclose incident details.",
      },
      {
        id: "policy_allow_logs",
        name: "Allow log reading",
        action: "logs.read",
        effect: "allow",
        reason: "Read-only log inspection is required for this workflow.",
      },
      {
        id: "policy_allow_reports",
        name: "Allow local report writing",
        action: "report.write",
        effect: "allow",
        reason: "Local report writing does not leave the sandbox.",
      },
    ],
    memory_schema: [
      {
        id: "memory_previous_incidents",
        name: "Previous incidents",
        type: "incident",
        description: "Prior suspicious IPs and incident summaries.",
      },
      {
        id: "memory_approval_preferences",
        name: "Approval preferences",
        type: "preference",
        description: "User decisions about risky actions.",
      },
      {
        id: "memory_blocked_actions",
        name: "Blocked actions",
        type: "blocked_action",
        description: "Actions denied by policy or by the user.",
      },
    ],
    workflow_steps: [
      {
        id: "step_read_logs",
        title: "Read latest logs",
        description: "Inspect sample auth logs for suspicious access attempts.",
        tool_id: "tool_log_reader",
      },
      {
        id: "step_classify",
        title: "Classify behavior",
        description: "Classify repeated failed login attempts with the selected model.",
        tool_id: "tool_threat_classifier",
      },
      {
        id: "step_write_report",
        title: "Generate report",
        description: "Write a local incident report with evidence and recommendation.",
        tool_id: "tool_report_writer",
      },
      {
        id: "step_request_approval",
        title: "Request approval",
        description: "Pause before executing the remediation command.",
        tool_id: "tool_shell_executor",
      },
      {
        id: "step_ticket_alert",
        title: "Prepare ticket and alert",
        description: "Prepare external follow-up actions but keep them approval gated.",
        tool_id: "tool_ticket_creator",
      },
      {
        id: "step_save_memory",
        title: "Save memory",
        description: "Store the suspicious IP and user decision for later runs.",
      },
    ],
    config_preview: `runtime: openclaw
sandbox: nemoclaw
model: ${model}
env:
  NVIDIA_API_KEY: ${"${NVIDIA_API_KEY}"}
  MINIMAX_API_KEY: ${"${MINIMAX_API_KEY}"}
  MINIMAX_PLAN_KEY: ${"${MINIMAX_PLAN_KEY}"}
policies:
  - shell.execute: require_approval
  - ticket.create: require_approval
  - message.send_external: require_approval
  - data.export: deny`,
  };
}

export const demoApproval: ApprovalRequest = {
  id: DEMO_APPROVAL_ID,
  agent_id: DEMO_AGENT_ID,
  action: "shell.execute",
  command: "block_ip 185.92.XX.XX",
  reason: "The IP produced repeated failed login attempts and may indicate a brute-force attack.",
  policy_id: "policy_shell_approval",
  status: "pending",
  created_at: timestamp,
};

export const demoMemory: MemoryItem[] = [
  {
    id: "memory_suspicious_ip",
    agent_id: DEMO_AGENT_ID,
    type: "incident",
    content: "185.92.XX.XX marked as suspicious after repeated failed SSH login attempts.",
    created_at: timestamp,
  },
  {
    id: "memory_denied_shell",
    agent_id: DEMO_AGENT_ID,
    type: "approval",
    content: "User denied shell execution for an unknown source IP.",
    created_at: timestamp,
  },
  {
    id: "memory_report_format",
    agent_id: DEMO_AGENT_ID,
    type: "preference",
    content: "Preferred report format: severity, summary, evidence, recommendation.",
    created_at: timestamp,
  },
];

export const demoEvents: RuntimeEvent[] = [
  {
    id: "event_001",
    agent_id: DEMO_AGENT_ID,
    type: "agent.started",
    message: "Agent started inside NemoClaw sandbox.",
    timestamp,
    severity: "success",
  },
  {
    id: "event_002",
    agent_id: DEMO_AGENT_ID,
    type: "tool.called",
    message: "Reading system logs from /logs/auth.log.",
    timestamp,
    severity: "info",
    metadata: { tool: "Log Reader" },
  },
  {
    id: "event_003",
    agent_id: DEMO_AGENT_ID,
    type: "agent.thinking",
    message: "Detected repeated failed login attempts from 185.92.XX.XX.",
    timestamp,
    severity: "warning",
  },
  {
    id: "event_004",
    agent_id: DEMO_AGENT_ID,
    type: "policy.checked",
    message: "NemoClaw checked shell.execute against active policy.",
    timestamp,
    severity: "info",
  },
  {
    id: "event_005",
    agent_id: DEMO_AGENT_ID,
    type: "approval.requested",
    message: "Shell execution requires human approval before block_ip can run.",
    timestamp,
    severity: "warning",
    metadata: { approval_id: DEMO_APPROVAL_ID },
  },
  {
    id: "event_006",
    agent_id: DEMO_AGENT_ID,
    type: "memory.updated",
    message: "Saved user preference: require explicit approval for unknown IP shell actions.",
    timestamp,
    severity: "success",
  },
  {
    id: "event_007",
    agent_id: DEMO_AGENT_ID,
    type: "report.created",
    message: "Incident report generated.",
    timestamp,
    severity: "success",
  },
];

export const demoReport: IncidentReport = {
  id: "report_sentinelclaw_demo",
  agent_id: DEMO_AGENT_ID,
  title: "Suspicious Login Activity",
  severity: "high",
  detected_behavior: "Repeated failed login attempts",
  likely_threat: "Brute-force login attempt",
  mitre_mapping: "Credential Access",
  evidence: [
    "47 failed SSH login attempts in 2 minutes.",
    "Source IP: 185.92.XX.XX.",
    "No approved remediation command was executed.",
  ],
  recommended_action:
    "Review the source IP, monitor additional attempts, and block only after human approval.",
  actions_attempted: ["block_ip 185.92.XX.XX"],
  actions_blocked: ["Raw log export", "Shell command without approval"],
  approval_decisions: ["User denied command execution."],
  memory_updates: demoMemory.map((item) => item.content),
};
