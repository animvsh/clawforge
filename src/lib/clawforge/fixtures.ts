import type {
  AgentTemplateId,
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

type TemplateBlueprint = {
  id: AgentTemplateId;
  label: string;
  agentName: string;
  description: string;
  goal: string;
  demoPrimary: boolean;
  tools: BlueprintResponse["tools"];
  policies: BlueprintResponse["policies"];
  memory_schema: BlueprintResponse["memory_schema"];
  workflow_steps: BlueprintResponse["workflow_steps"];
};

const baseIncidentTools: BlueprintResponse["tools"] = [
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
];

const baseIncidentPolicies: BlueprintResponse["policies"] = [
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
    id: "policy_block_policy_modify",
    name: "Block policy modification",
    action: "policy.modify",
    effect: "deny",
    reason: "Agents cannot rewrite their own NemoClaw guardrails.",
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
];

export const agentTemplates: TemplateBlueprint[] = [
  {
    id: "incident_response",
    label: "Incident Response Agent",
    agentName: "SentinelClaw",
    description: "An autonomous cybersecurity incident response agent",
    goal: "Monitor logs, detect suspicious activity, generate incident reports, and request approval before high-risk actions.",
    demoPrimary: true,
    tools: baseIncidentTools,
    policies: baseIncidentPolicies,
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
  },
  {
    id: "github_triage",
    label: "GitHub Triage Agent",
    agentName: "TriageClaw",
    description: "A NemoClaw agent for safe GitHub issue triage",
    goal: "Read repository issues, classify urgency, draft triage notes, and pause before posting or changing labels.",
    demoPrimary: false,
    tools: [
      {
        id: "tool_github_read",
        name: "GitHub Issue Reader",
        action: "github.issues.read",
        purpose: "Reads issue titles, labels, and recent comments.",
        permission: "read_only",
        risk_level: "low",
        enabled: true,
      },
      {
        id: "tool_triage_writer",
        name: "Triage Draft Writer",
        action: "triage.write",
        purpose: "Writes a local triage summary inside NemoClaw.",
        permission: "allowed",
        risk_level: "low",
        enabled: true,
      },
      {
        id: "tool_github_comment",
        name: "GitHub Commenter",
        action: "github.comment.create",
        purpose: "Posts a triage comment after approval.",
        permission: "approval_required",
        risk_level: "medium",
        enabled: true,
      },
      {
        id: "tool_repo_secret_read",
        name: "Repository Secret Reader",
        action: "github.secrets.read",
        purpose: "Attempts to inspect repository secrets.",
        permission: "blocked",
        risk_level: "high",
        enabled: false,
      },
    ],
    policies: [
      {
        id: "policy_allow_github_read",
        name: "Allow issue reading",
        action: "github.issues.read",
        effect: "allow",
        reason: "Issue reading is read-only.",
      },
      {
        id: "policy_allow_triage_write",
        name: "Allow local triage drafts",
        action: "triage.write",
        effect: "allow",
        reason: "Drafting inside NemoClaw does not change GitHub.",
      },
      {
        id: "policy_github_comment_approval",
        name: "Require approval for GitHub comments",
        action: "github.comment.create",
        effect: "require_approval",
        reason: "Posting comments changes external repo state.",
      },
      {
        id: "policy_block_github_secrets",
        name: "Block repository secret access",
        action: "github.secrets.read",
        effect: "deny",
        reason: "Secrets must never be exposed to the agent.",
      },
    ],
    memory_schema: [
      {
        id: "memory_triage_patterns",
        name: "Triage patterns",
        type: "context",
        description: "Prior urgency signals and label decisions.",
      },
      {
        id: "memory_posting_preferences",
        name: "Posting preferences",
        type: "preference",
        description: "User choices about when comments can be posted.",
      },
      {
        id: "memory_blocked_repo_actions",
        name: "Blocked repo actions",
        type: "blocked_action",
        description: "Denied repository actions such as secret reads.",
      },
    ],
    workflow_steps: [
      {
        id: "step_read_issues",
        title: "Read issues",
        description: "Load recent GitHub issues in read-only mode.",
        tool_id: "tool_github_read",
      },
      {
        id: "step_rank_issues",
        title: "Rank urgency",
        description: "Identify bugs, blockers, and stale requests.",
      },
      {
        id: "step_draft_triage",
        title: "Draft triage",
        description: "Write a local triage note for review.",
        tool_id: "tool_triage_writer",
      },
      {
        id: "step_ask_before_post",
        title: "Ask before posting",
        description: "Pause before publishing any GitHub comment.",
        tool_id: "tool_github_comment",
      },
    ],
  },
  {
    id: "inbox_approval",
    label: "Inbox Approval Agent",
    agentName: "InboxClaw",
    description: "A NemoClaw agent for approval-gated inbox handling",
    goal: "Summarize important messages, draft replies, remember preferences, and ask before sending anything.",
    demoPrimary: false,
    tools: [
      {
        id: "tool_inbox_read",
        name: "Inbox Reader",
        action: "inbox.read",
        purpose: "Reads message subject lines and selected message bodies.",
        permission: "read_only",
        risk_level: "low",
        enabled: true,
      },
      {
        id: "tool_reply_draft",
        name: "Reply Draft Writer",
        action: "reply.draft",
        purpose: "Drafts replies locally inside NemoClaw.",
        permission: "allowed",
        risk_level: "low",
        enabled: true,
      },
      {
        id: "tool_email_send",
        name: "Email Sender",
        action: "email.send",
        purpose: "Sends a user-approved reply.",
        permission: "approval_required",
        risk_level: "high",
        enabled: true,
      },
      {
        id: "tool_contact_export",
        name: "Contact Export",
        action: "contacts.export",
        purpose: "Attempts to export address book data.",
        permission: "blocked",
        risk_level: "high",
        enabled: false,
      },
    ],
    policies: [
      {
        id: "policy_allow_inbox_read",
        name: "Allow inbox reading",
        action: "inbox.read",
        effect: "allow",
        reason: "Reading selected messages is required for summarization.",
      },
      {
        id: "policy_allow_reply_draft",
        name: "Allow local reply drafts",
        action: "reply.draft",
        effect: "allow",
        reason: "Drafts stay inside NemoClaw until approved.",
      },
      {
        id: "policy_email_send_approval",
        name: "Require approval for sending email",
        action: "email.send",
        effect: "require_approval",
        reason: "Sending email changes external state.",
      },
      {
        id: "policy_block_contact_export",
        name: "Block contact exports",
        action: "contacts.export",
        effect: "deny",
        reason: "Contact lists can contain private data.",
      },
    ],
    memory_schema: [
      {
        id: "memory_reply_preferences",
        name: "Reply preferences",
        type: "preference",
        description: "Tone and approval preferences for future replies.",
      },
      {
        id: "memory_important_threads",
        name: "Important threads",
        type: "context",
        description: "Threads the user asked NemoClaw to watch.",
      },
      {
        id: "memory_blocked_inbox_actions",
        name: "Blocked inbox actions",
        type: "blocked_action",
        description: "Denied contact exports or unapproved sends.",
      },
    ],
    workflow_steps: [
      {
        id: "step_read_inbox",
        title: "Read selected inbox",
        description: "Review important messages without sending anything.",
        tool_id: "tool_inbox_read",
      },
      {
        id: "step_summarize_threads",
        title: "Summarize threads",
        description: "Create a concise inbox brief.",
      },
      {
        id: "step_draft_reply",
        title: "Draft replies",
        description: "Write replies locally for user review.",
        tool_id: "tool_reply_draft",
      },
      {
        id: "step_approval_gate",
        title: "Ask before send",
        description: "Pause before any outbound email.",
        tool_id: "tool_email_send",
      },
    ],
  },
  {
    id: "research_sandbox",
    label: "Research-Only Sandboxed Agent",
    agentName: "ResearchClaw",
    description: "A NemoClaw agent for contained research workflows",
    goal: "Gather sources, save citations to memory, write a research brief, and block publishing or external actions.",
    demoPrimary: false,
    tools: [
      {
        id: "tool_source_read",
        name: "Source Reader",
        action: "sources.read",
        purpose: "Reads approved research sources.",
        permission: "read_only",
        risk_level: "low",
        enabled: true,
      },
      {
        id: "tool_notes_write",
        name: "Research Note Writer",
        action: "notes.write",
        purpose: "Writes local notes and citations.",
        permission: "allowed",
        risk_level: "low",
        enabled: true,
      },
      {
        id: "tool_external_fetch",
        name: "External Fetch",
        action: "network.fetch_external",
        purpose: "Fetches a new external source after approval.",
        permission: "approval_required",
        risk_level: "medium",
        enabled: true,
      },
      {
        id: "tool_publish",
        name: "Publisher",
        action: "publish.external",
        purpose: "Attempts to publish research outside the sandbox.",
        permission: "blocked",
        risk_level: "high",
        enabled: false,
      },
    ],
    policies: [
      {
        id: "policy_allow_source_read",
        name: "Allow source reading",
        action: "sources.read",
        effect: "allow",
        reason: "Approved sources are read-only.",
      },
      {
        id: "policy_allow_notes",
        name: "Allow local notes",
        action: "notes.write",
        effect: "allow",
        reason: "Research notes remain inside NemoClaw.",
      },
      {
        id: "policy_fetch_approval",
        name: "Require approval for external fetches",
        action: "network.fetch_external",
        effect: "require_approval",
        reason: "External network access expands the sandbox boundary.",
      },
      {
        id: "policy_block_publish",
        name: "Block external publishing",
        action: "publish.external",
        effect: "deny",
        reason: "Research-only agents cannot publish outside NemoClaw.",
      },
    ],
    memory_schema: [
      {
        id: "memory_sources",
        name: "Saved sources",
        type: "context",
        description: "Approved sources and citation notes.",
      },
      {
        id: "memory_research_preferences",
        name: "Research preferences",
        type: "preference",
        description: "Preferred brief format and source standards.",
      },
      {
        id: "memory_blocked_publish_actions",
        name: "Blocked publish actions",
        type: "blocked_action",
        description: "Attempts to publish outside the sandbox.",
      },
    ],
    workflow_steps: [
      {
        id: "step_read_sources",
        title: "Read sources",
        description: "Inspect approved research sources.",
        tool_id: "tool_source_read",
      },
      {
        id: "step_save_citations",
        title: "Save citations",
        description: "Store useful citations in NemoClaw memory.",
        tool_id: "tool_notes_write",
      },
      {
        id: "step_write_brief",
        title: "Write brief",
        description: "Create a contained research brief.",
      },
      {
        id: "step_gate_network",
        title: "Gate new sources",
        description: "Ask before fetching sources outside the approved set.",
        tool_id: "tool_external_fetch",
      },
    ],
  },
];

function selectTemplate(templateId?: AgentTemplateId): TemplateBlueprint {
  return agentTemplates.find((template) => template.id === templateId) ?? agentTemplates[0];
}

export function createSentinelBlueprint(
  provider: ProviderMode = "auto",
  templateId: AgentTemplateId = "incident_response",
): BlueprintResponse {
  const selectedProvider = provider === "auto" ? "nemotron" : provider;
  const model =
    selectedProvider === "minimax"
      ? "minimax/token-plan"
      : selectedProvider === "mock"
        ? "mock/sentinelclaw"
        : "nvidia/nemotron";
  const template = selectTemplate(templateId);
  const blueprintId =
    template.id === "incident_response" ? DEMO_BLUEPRINT_ID : `bp_${template.id}_demo`;

  return {
    blueprint_id: blueprintId,
    agent_name: template.agentName,
    description: template.description,
    goal: template.goal,
    provider,
    model,
    fallback_provider: provider === "auto" ? "minimax" : "mock",
    runtime: "openclaw",
    sandbox: "nemoclaw",
    tools: template.tools,
    policies: template.policies,
    memory_schema: template.memory_schema,
    workflow_steps: template.workflow_steps,
    config_preview: `runtime: openclaw
sandbox: nemoclaw
template: ${template.id}
model: ${model}
env:
  NVIDIA_API_KEY: ${"${NVIDIA_API_KEY}"}
  MINIMAX_API_KEY: ${"${MINIMAX_API_KEY}"}
  MINIMAX_PLAN_KEY: ${"${MINIMAX_PLAN_KEY}"}
policies:
${template.policies.map((policy) => `  - ${policy.action}: ${policy.effect}`).join("\n")}`,
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
