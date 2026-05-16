import type {
  ApprovalRequest,
  BlueprintResponse,
  AgentTemplateId,
  IncidentReport,
  IntegrationRequirement,
  MemoryItem,
  ProviderMode,
  RuntimeEvent,
} from "./types";

export const DEMO_AGENT_ID = "agent_sentinelclaw_demo";
export const DEMO_BLUEPRINT_ID = "bp_sentinelclaw_demo";
export const DEMO_APPROVAL_ID = "approval_shell_block_ip";

const timestamp = "2026-05-16T00:00:00.000Z";

type BlueprintTemplate = Pick<
  BlueprintResponse,
  | "blueprint_id"
  | "agent_name"
  | "description"
  | "goal"
  | "tools"
  | "policies"
  | "memory_schema"
  | "workflow_steps"
>;

export const templateById: Record<AgentTemplateId, BlueprintTemplate> = {
  incident_response: {
    blueprint_id: DEMO_BLUEPRINT_ID,
    agent_name: "SentinelClaw",
    description: "An autonomous cybersecurity incident response agent",
    goal: "Monitor logs, detect suspicious activity, generate incident reports, and request approval before high-risk actions.",
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
      {
        id: "policy_allow_threat_classify",
        name: "Allow threat classification",
        action: "threat.classify",
        effect: "allow",
        reason: "Read-only threat classification is safe.",
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
  },
  github_triage: {
    blueprint_id: "bp_github_triage_demo",
    agent_name: "RepoClaw",
    description: "A NemoClaw-governed GitHub issue and pull request triage agent",
    goal: "Read GitHub activity, identify urgent bugs, draft labels and replies, and require approval before posting or mutating repository state.",
    tools: [
      {
        id: "tool_github_issue_reader",
        name: "GitHub Issue Reader",
        action: "github.issues.read",
        purpose: "Reads issues, pull requests, comments, labels, and metadata.",
        permission: "read_only",
        risk_level: "low",
        enabled: true,
      },
      {
        id: "tool_bug_prioritizer",
        name: "Bug Prioritizer",
        action: "github.issues.prioritize",
        purpose: "Ranks issues by urgency, user impact, and regression likelihood.",
        permission: "allowed",
        risk_level: "low",
        enabled: true,
      },
      {
        id: "tool_response_drafter",
        name: "Response Drafter",
        action: "github.comments.draft",
        purpose: "Drafts maintainer responses without publishing them.",
        permission: "allowed",
        risk_level: "low",
        enabled: true,
      },
      {
        id: "tool_label_manager",
        name: "Label Manager",
        action: "github.labels.apply",
        purpose: "Applies repository labels after human approval.",
        permission: "approval_required",
        risk_level: "medium",
        enabled: true,
      },
      {
        id: "tool_comment_publisher",
        name: "Comment Publisher",
        action: "github.comments.post",
        purpose: "Posts approved comments back to GitHub.",
        permission: "approval_required",
        risk_level: "medium",
        enabled: true,
      },
      {
        id: "tool_branch_writer",
        name: "Branch Writer",
        action: "github.branches.write",
        purpose: "Attempts direct branch mutation outside triage scope.",
        permission: "blocked",
        risk_level: "high",
        enabled: false,
      },
    ],
    policies: [
      {
        id: "policy_github_read_only",
        name: "Allow GitHub read access",
        action: "github.issues.read",
        effect: "allow",
        reason: "Triage requires read-only repository context.",
      },
      {
        id: "policy_github_label_approval",
        name: "Require approval for labels",
        action: "github.labels.apply",
        effect: "require_approval",
        reason: "Labels change public repository workflow state.",
      },
      {
        id: "policy_github_comment_approval",
        name: "Require approval for posted comments",
        action: "github.comments.post",
        effect: "require_approval",
        reason: "Published comments represent the project externally.",
      },
      {
        id: "policy_github_block_branch_write",
        name: "Block direct branch writes",
        action: "github.branches.write",
        effect: "deny",
        reason: "Triage agents must not mutate source branches.",
      },
    ],
    memory_schema: [
      {
        id: "memory_repo_preferences",
        name: "Repository preferences",
        type: "preference",
        description: "Maintainer labeling, escalation, and response preferences.",
      },
      {
        id: "memory_triage_context",
        name: "Triage context",
        type: "context",
        description: "Known regressions, release windows, and issue patterns.",
      },
      {
        id: "memory_github_approvals",
        name: "GitHub approvals",
        type: "approval",
        description: "Prior approvals for labels and outbound comments.",
      },
    ],
    workflow_steps: [
      {
        id: "step_read_github_queue",
        title: "Read GitHub queue",
        description: "Inspect new issues and pull requests in read-only mode.",
        tool_id: "tool_github_issue_reader",
      },
      {
        id: "step_rank_urgent_bugs",
        title: "Rank urgent bugs",
        description: "Prioritize items by severity and maintainer-defined rules.",
        tool_id: "tool_bug_prioritizer",
      },
      {
        id: "step_draft_response",
        title: "Draft response",
        description: "Prepare a maintainer comment without publishing.",
        tool_id: "tool_response_drafter",
      },
      {
        id: "step_request_label_approval",
        title: "Request label approval",
        description: "Pause before applying labels or status changes.",
        tool_id: "tool_label_manager",
      },
      {
        id: "step_request_comment_approval",
        title: "Request comment approval",
        description: "Publish only after human review.",
        tool_id: "tool_comment_publisher",
      },
    ],
  },
  inbox_approval: {
    blueprint_id: "bp_inbox_approval_demo",
    agent_name: "InboxClaw",
    description: "A NemoClaw-governed inbox assistant for summaries and approval-gated replies",
    goal: "Read important mail, summarize action items, draft replies, and require approval before sending, forwarding, or archiving.",
    tools: [
      {
        id: "tool_inbox_reader",
        name: "Inbox Reader",
        action: "email.read",
        purpose: "Reads relevant email threads and sender metadata.",
        permission: "read_only",
        risk_level: "low",
        enabled: true,
      },
      {
        id: "tool_email_summarizer",
        name: "Email Summarizer",
        action: "email.summarize",
        purpose: "Summarizes priority messages and action items.",
        permission: "allowed",
        risk_level: "low",
        enabled: true,
      },
      {
        id: "tool_reply_drafter",
        name: "Reply Drafter",
        action: "email.reply.draft",
        purpose: "Drafts replies without sending them.",
        permission: "allowed",
        risk_level: "low",
        enabled: true,
      },
      {
        id: "tool_email_sender",
        name: "Email Sender",
        action: "email.send",
        purpose: "Sends approved replies.",
        permission: "approval_required",
        risk_level: "high",
        enabled: true,
      },
      {
        id: "tool_thread_archiver",
        name: "Thread Archiver",
        action: "email.archive",
        purpose: "Archives completed threads after approval.",
        permission: "approval_required",
        risk_level: "medium",
        enabled: true,
      },
      {
        id: "tool_contact_export",
        name: "Contact Export",
        action: "contacts.export",
        purpose: "Attempts to export contacts outside the sandbox.",
        permission: "blocked",
        risk_level: "high",
        enabled: false,
      },
    ],
    policies: [
      {
        id: "policy_email_read_only",
        name: "Allow email reading",
        action: "email.read",
        effect: "allow",
        reason: "Inbox approval workflows require read-only message context.",
      },
      {
        id: "policy_email_send_approval",
        name: "Require approval for sending mail",
        action: "email.send",
        effect: "require_approval",
        reason: "Outbound email can disclose private information or commit the user.",
      },
      {
        id: "policy_email_archive_approval",
        name: "Require approval for archiving",
        action: "email.archive",
        effect: "require_approval",
        reason: "Archiving changes inbox state.",
      },
      {
        id: "policy_block_contact_export",
        name: "Block contact export",
        action: "contacts.export",
        effect: "deny",
        reason: "Contact export is outside the user-approved inbox workflow.",
      },
    ],
    memory_schema: [
      {
        id: "memory_sender_context",
        name: "Sender context",
        type: "context",
        description: "Known sender relationships and thread history.",
      },
      {
        id: "memory_reply_preferences",
        name: "Reply preferences",
        type: "preference",
        description: "Preferred tone, sign-off, and approval rules.",
      },
      {
        id: "memory_email_approvals",
        name: "Email approvals",
        type: "approval",
        description: "Prior decisions for sends, archives, and escalations.",
      },
    ],
    workflow_steps: [
      {
        id: "step_read_priority_mail",
        title: "Read priority mail",
        description: "Inspect important threads in read-only mode.",
        tool_id: "tool_inbox_reader",
      },
      {
        id: "step_summarize_actions",
        title: "Summarize actions",
        description: "Extract commitments, deadlines, and reply needs.",
        tool_id: "tool_email_summarizer",
      },
      {
        id: "step_draft_reply",
        title: "Draft reply",
        description: "Prepare a user-style reply without sending.",
        tool_id: "tool_reply_drafter",
      },
      {
        id: "step_request_send_approval",
        title: "Request send approval",
        description: "Pause before sending any outbound email.",
        tool_id: "tool_email_sender",
      },
      {
        id: "step_save_inbox_preference",
        title: "Save preference",
        description: "Remember approved sender and reply handling preferences.",
      },
    ],
  },
  phone_receptionist: {
    blueprint_id: "bp_phone_receptionist_demo",
    agent_name: "ReceptionClaw",
    description: "A NemoClaw-governed phone receptionist for calls, scheduling, and messages",
    goal: "Answer calls, understand caller intent, schedule meetings, take messages, and require approval before sending outbound messages or changing calendars.",
    tools: [
      {
        id: "tool_phone_number",
        name: "Phone Number",
        action: "phone.receive",
        purpose: "Receives inbound calls and captures caller metadata.",
        permission: "allowed",
        risk_level: "low",
        enabled: true,
      },
      {
        id: "tool_call_transcriber",
        name: "Call Transcriber",
        action: "phone.transcribe",
        purpose: "Transcribes calls inside the sandbox.",
        permission: "allowed",
        risk_level: "low",
        enabled: true,
      },
      {
        id: "tool_calendar_reader",
        name: "Calendar Reader",
        action: "calendar.read",
        purpose: "Checks availability before proposing meeting times.",
        permission: "read_only",
        risk_level: "low",
        enabled: true,
      },
      {
        id: "tool_calendar_scheduler",
        name: "Calendar Scheduler",
        action: "calendar.events.create",
        purpose: "Creates calendar events after approval.",
        permission: "approval_required",
        risk_level: "medium",
        enabled: true,
      },
      {
        id: "tool_sms_sender",
        name: "SMS Sender",
        action: "sms.send",
        purpose: "Sends approved confirmations and follow-up messages.",
        permission: "approval_required",
        risk_level: "medium",
        enabled: true,
      },
      {
        id: "tool_contact_reader",
        name: "Contact Reader",
        action: "contacts.read",
        purpose: "Looks up known callers and routing rules.",
        permission: "read_only",
        risk_level: "low",
        enabled: true,
      },
      {
        id: "tool_call_recording_export",
        name: "Call Recording Export",
        action: "phone.recordings.export",
        purpose: "Attempts to export raw call recordings outside the sandbox.",
        permission: "blocked",
        risk_level: "high",
        enabled: false,
      },
    ],
    policies: [
      {
        id: "policy_phone_receive",
        name: "Allow inbound calls",
        action: "phone.receive",
        effect: "allow",
        reason: "The receptionist needs inbound call access to operate.",
      },
      {
        id: "policy_calendar_read",
        name: "Allow calendar reading",
        action: "calendar.read",
        effect: "allow",
        reason: "Read-only calendar access is needed for availability checks.",
      },
      {
        id: "policy_calendar_create_approval",
        name: "Require approval for scheduling",
        action: "calendar.events.create",
        effect: "require_approval",
        reason: "Creating events changes the user's calendar.",
      },
      {
        id: "policy_sms_approval",
        name: "Require approval for SMS",
        action: "sms.send",
        effect: "require_approval",
        reason: "Outbound SMS represents the user externally.",
      },
      {
        id: "policy_block_recording_export",
        name: "Block call recording export",
        action: "phone.recordings.export",
        effect: "deny",
        reason: "Raw call recordings must stay inside the sandbox.",
      },
    ],
    memory_schema: [
      {
        id: "memory_call_preferences",
        name: "Call preferences",
        type: "preference",
        description: "Preferred routing, tone, meeting length, and escalation rules.",
      },
      {
        id: "memory_known_callers",
        name: "Known callers",
        type: "context",
        description: "Known callers, companies, and prior conversations.",
      },
      {
        id: "memory_scheduling_approvals",
        name: "Scheduling approvals",
        type: "approval",
        description: "Prior decisions for booking meetings and sending confirmations.",
      },
    ],
    workflow_steps: [
      {
        id: "step_answer_call",
        title: "Answer inbound call",
        description: "Receive the call and identify caller intent.",
        tool_id: "tool_phone_number",
      },
      {
        id: "step_transcribe_call",
        title: "Transcribe conversation",
        description: "Summarize caller needs inside NemoClaw.",
        tool_id: "tool_call_transcriber",
      },
      {
        id: "step_check_calendar",
        title: "Check availability",
        description: "Read calendar slots without changing events.",
        tool_id: "tool_calendar_reader",
      },
      {
        id: "step_request_booking_approval",
        title: "Request booking approval",
        description: "Pause before creating a calendar event.",
        tool_id: "tool_calendar_scheduler",
      },
      {
        id: "step_send_confirmation",
        title: "Draft confirmation",
        description: "Prepare SMS confirmation but require approval before sending.",
        tool_id: "tool_sms_sender",
      },
    ],
  },
  research_sandbox: {
    blueprint_id: "bp_research_sandbox_demo",
    agent_name: "ResearchClaw",
    description: "A NemoClaw-governed research assistant for source-grounded briefs",
    goal: "Collect sources, compare evidence, draft a research brief, and require approval before publishing or exporting results.",
    tools: [
      {
        id: "tool_source_search",
        name: "Source Search",
        action: "research.search",
        purpose: "Searches trusted sources for relevant material.",
        permission: "allowed",
        risk_level: "low",
        enabled: true,
      },
      {
        id: "tool_source_reader",
        name: "Source Reader",
        action: "research.sources.read",
        purpose: "Reads source excerpts inside the sandbox.",
        permission: "read_only",
        risk_level: "low",
        enabled: true,
      },
      {
        id: "tool_brief_writer",
        name: "Brief Writer",
        action: "research.brief.write",
        purpose: "Writes a source-grounded brief.",
        permission: "allowed",
        risk_level: "low",
        enabled: true,
      },
      {
        id: "tool_citation_checker",
        name: "Citation Checker",
        action: "research.citations.check",
        purpose: "Checks claims against saved source references.",
        permission: "allowed",
        risk_level: "low",
        enabled: true,
      },
      {
        id: "tool_publication_sender",
        name: "Publication Sender",
        action: "research.publish",
        purpose: "Publishes or shares the approved research brief.",
        permission: "approval_required",
        risk_level: "medium",
        enabled: true,
      },
      {
        id: "tool_source_bulk_export",
        name: "Source Bulk Export",
        action: "research.sources.export",
        purpose: "Attempts to export source archives outside the sandbox.",
        permission: "blocked",
        risk_level: "high",
        enabled: false,
      },
    ],
    policies: [
      {
        id: "policy_allow_research_search",
        name: "Allow source search",
        action: "research.search",
        effect: "allow",
        reason: "Research workflows require source discovery.",
      },
      {
        id: "policy_allow_brief_write",
        name: "Allow local brief writing",
        action: "research.brief.write",
        effect: "allow",
        reason: "Writing inside NemoClaw does not publish externally.",
      },
      {
        id: "policy_research_publish_approval",
        name: "Require approval for publishing",
        action: "research.publish",
        effect: "require_approval",
        reason: "Publishing shares conclusions outside the sandbox.",
      },
      {
        id: "policy_block_source_export",
        name: "Block bulk source export",
        action: "research.sources.export",
        effect: "deny",
        reason: "Bulk source export may violate data or copyright boundaries.",
      },
    ],
    memory_schema: [
      {
        id: "memory_research_preferences",
        name: "Research preferences",
        type: "preference",
        description: "Preferred source types, citation style, and review rules.",
      },
      {
        id: "memory_saved_sources",
        name: "Saved sources",
        type: "context",
        description: "Reviewed sources and claim-to-citation notes.",
      },
      {
        id: "memory_publication_approvals",
        name: "Publication approvals",
        type: "approval",
        description: "Prior publish and export decisions.",
      },
    ],
    workflow_steps: [
      {
        id: "step_search_sources",
        title: "Search sources",
        description: "Find relevant sources inside NemoClaw.",
        tool_id: "tool_source_search",
      },
      {
        id: "step_read_sources",
        title: "Read sources",
        description: "Review selected source excerpts without bulk export.",
        tool_id: "tool_source_reader",
      },
      {
        id: "step_write_brief",
        title: "Write brief",
        description: "Draft a concise research brief with citations.",
        tool_id: "tool_brief_writer",
      },
      {
        id: "step_check_citations",
        title: "Check citations",
        description: "Verify claims against saved source notes.",
        tool_id: "tool_citation_checker",
      },
      {
        id: "step_request_publish_approval",
        title: "Request publish approval",
        description: "Pause before sharing the brief outside NemoClaw.",
        tool_id: "tool_publication_sender",
      },
    ],
  },
};

function modelForProvider(provider: ProviderMode): string {
  const selectedProvider = provider === "auto" ? "nemotron" : provider;
  if (selectedProvider === "minimax") return "minimax/token-plan";
  if (selectedProvider === "mock") return "mock/nemoclaw-blueprint";
  if (selectedProvider === "pi") return "pi-coding/default";
  return "nvidia/nemotron";
}

function configPreview(
  templateId: AgentTemplateId,
  model: string,
  customGoal: string,
  policies: BlueprintResponse["policies"],
  integrations: IntegrationRequirement[],
) {
  const policyLines = policies.map((policy) => `  - ${policy.action}: ${policy.effect}`).join("\n");
  const integrationLines = integrations
    .map((integration) => `  - ${integration.label}: ${integration.status}`)
    .join("\n");

  return `runtime: openclaw
sandbox: nemoclaw
template: ${templateId}
custom_goal: ${customGoal}
model: ${model}
env:
  NVIDIA_API_KEY: ${"${NVIDIA_API_KEY}"}
  MINIMAX_API_KEY: ${"${MINIMAX_API_KEY}"}
  MINIMAX_PLAN_KEY: ${"${MINIMAX_PLAN_KEY}"}
integrations:
${integrationLines || "  - none: optional"}
policies:
${policyLines}`;
}

function goalId(prompt: string, templateId: AgentTemplateId): string {
  let hash = 0;
  for (let index = 0; index < prompt.length; index += 1) {
    hash = (hash * 31 + prompt.charCodeAt(index)) >>> 0;
  }
  return `bp_goal_${templateId}_${hash.toString(16)}`;
}

export function selectAgentTemplate(prompt: string): AgentTemplateId {
  const normalized = prompt.toLowerCase();
  if (
    /\b(phone|call|calls|receptionist|reception|sms|text message|voicemail|calendar|schedule|appointment|booking)\b/.test(
      normalized,
    )
  ) {
    return "phone_receptionist";
  }
  if (/\b(github|issue|issues|pull request|pr|repo|repository|label|comment)\b/.test(normalized)) {
    return "github_triage";
  }
  if (/\b(inbox|email|emails|mail|reply|replies|send|sender|archive)\b/.test(normalized)) {
    return "inbox_approval";
  }
  if (/\b(research|sources?|citations?|brief|topic|publish|publishing)\b/.test(normalized)) {
    return "research_sandbox";
  }
  return "incident_response";
}

function integrationRequirementsForGoal(prompt: string): IntegrationRequirement[] {
  const normalized = prompt.toLowerCase();
  const integrations: IntegrationRequirement[] = [];
  const add = (item: IntegrationRequirement) => {
    if (!integrations.some((integration) => integration.id === item.id)) integrations.push(item);
  };

  if (/\b(phone|call|calls|receptionist|voicemail)\b/.test(normalized)) {
    add({
      id: "phone_sms",
      label: "AgentPhone",
      purpose: "Answer calls, receive customer replies, and send approved text confirmations.",
      status: "required",
    });
  }
  if (/\b(sms|text|texts|message|confirmation)\b/.test(normalized)) {
    add({
      id: "phone_sms",
      label: "AgentPhone",
      purpose: "Send approved confirmations and follow-up messages.",
      status: "required",
    });
  }
  if (/\b(calendar|schedule|appointment|booking|book|availability)\b/.test(normalized)) {
    add({
      id: "calendar",
      label: "Calendar",
      purpose: "Read availability and create approved appointments.",
      status: "required",
    });
  }
  if (/\b(email|inbox|follow up|follow-up)\b/.test(normalized)) {
    add({
      id: "email",
      label: "Email",
      purpose: "Send approved follow-ups and summaries.",
      status: "required",
    });
  }
  if (/\b(customer|lead|crm|contact|contacts)\b/.test(normalized)) {
    add({
      id: "crm",
      label: "CRM",
      purpose: "Look up and update customer records after approval.",
      status: "optional",
    });
  }
  if (/\b(github|repo|repository|issue|pull request|pr)\b/.test(normalized)) {
    add({
      id: "github",
      label: "GitHub",
      purpose: "Read repository activity and apply approved issue updates.",
      status: "required",
    });
  }
  if (/\b(linear|ticket|tickets)\b/.test(normalized)) {
    add({
      id: "linear",
      label: "Linear",
      purpose: "Create approved tickets and engineering follow-ups.",
      status: "required",
    });
  }

  return integrations;
}

function customAgentName(templateId: AgentTemplateId): string {
  if (templateId === "phone_receptionist") return "ReceptionClaw";
  if (templateId === "github_triage") return "RepoClaw";
  if (templateId === "inbox_approval") return "InboxClaw";
  if (templateId === "research_sandbox") return "ResearchClaw";
  return "SentinelClaw";
}

export function createTemplateBlueprint(
  templateId: AgentTemplateId,
  provider: ProviderMode = "auto",
  customGoal = templateById[templateId].goal,
  blueprintId = templateById[templateId].blueprint_id,
): BlueprintResponse {
  const template = templateById[templateId];
  const model = modelForProvider(provider);
  const integrations = integrationRequirementsForGoal(customGoal);

  return {
    ...template,
    blueprint_id: blueprintId,
    provider,
    template_id: templateId,
    custom_goal: customGoal,
    agent_name: customAgentName(templateId),
    goal: customGoal,
    description:
      templateId === "phone_receptionist"
        ? "A custom phone receptionist agent generated from your goal."
        : template.description,
    model,
    fallback_provider: provider === "auto" ? "minimax" : "mock",
    runtime: "openclaw",
    sandbox: "nemoclaw",
    integration_requirements: integrations,
    config_preview: configPreview(templateId, model, customGoal, template.policies, integrations),
  };
}

export function createBlueprintFromPrompt(
  prompt: string,
  provider: ProviderMode = "auto",
): BlueprintResponse {
  const templateId = selectAgentTemplate(prompt);
  return createTemplateBlueprint(templateId, provider, prompt.trim(), goalId(prompt, templateId));
}

export function isKnownBlueprintId(blueprintId: string): boolean {
  return (
    blueprintId.startsWith("bp_goal_") ||
    Object.values(templateById).some((template) => template.blueprint_id === blueprintId)
  );
}

export function createSentinelBlueprint(provider: ProviderMode = "auto"): BlueprintResponse {
  return createTemplateBlueprint("incident_response", provider);
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
    type: "preference",
    content: "Prior preference: unknown source IP shell actions require human approval.",
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
    message:
      "Saved memory: user denied shell execution for unknown suspicious IPs; future remediation commands require explicit approval.",
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
  classification: "Credential access attempt with brute-force indicators",
  model_used: "NVIDIA Nemotron, with MiniMax as the fallback intelligence layer",
  runtime: "OpenClaw runtime inside NemoClaw sandbox",
  policy_triggered: "require_shell_approval",
  action_attempted: "block_ip 185.92.XX.XX",
  user_decision: "Command denied.",
  final_action:
    "SentinelClaw skipped automatic remediation and continued with a report-only workflow.",
  memory_update:
    "User denied shell execution for unknown suspicious IPs. Future remediation commands against unknown IPs require explicit approval.",
  safety_result:
    "NemoClaw kept the agent inside safe mode. No restricted action was executed without approval.",
  likely_threat: "Brute-force login attempt",
  mitre_mapping: "Credential Access",
  evidence: [
    "47 failed SSH login attempts in 2 minutes.",
    "Source IP: 185.92.XX.XX.",
    "Second suspicious source detected: 91.201.XX.XX.",
    "Memory retrieved: user denied shell execution for unknown suspicious IPs.",
    "No approved remediation command was executed.",
  ],
  recommended_action:
    "Review the source IP, monitor additional attempts, and block only after human approval.",
  actions_attempted: ["block_ip 185.92.XX.XX"],
  actions_blocked: ["Raw log export", "Shell command without approval"],
  approval_decisions: ["User denied command execution."],
  memory_updates: [
    ...demoMemory.map((item) => item.content),
    "Retrieved memory before handling 91.201.XX.XX and skipped automatic remediation.",
  ],
};
