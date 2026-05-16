export type ProviderMode = "auto" | "nemotron" | "minimax" | "pi" | "mock";
export type AgentTemplateId =
  | "incident_response"
  | "github_triage"
  | "inbox_approval"
  | "phone_receptionist"
  | "research_sandbox";

export type ToolPermission = "allowed" | "read_only" | "approval_required" | "blocked";
export type RiskLevel = "low" | "medium" | "high";
export type PolicyEffect = "allow" | "deny" | "require_approval";

export type ToolDefinition = {
  id: string;
  name: string;
  action: string;
  purpose: string;
  permission: ToolPermission;
  risk_level: RiskLevel;
  enabled: boolean;
};

export type PolicyDefinition = {
  id: string;
  name: string;
  action: string;
  effect: PolicyEffect;
  reason: string;
};

export type MemorySchemaItem = {
  id: string;
  name: string;
  type: "incident" | "preference" | "blocked_action" | "approval" | "context";
  description: string;
};

export type WorkflowStep = {
  id: string;
  title: string;
  description: string;
  tool_id?: string;
};

export type IntegrationRequirement = {
  id: string;
  label: string;
  purpose: string;
  status: "required" | "optional" | "connected";
};

export type BlueprintResponse = {
  blueprint_id: string;
  template_id: AgentTemplateId;
  custom_goal: string;
  agent_name: string;
  description: string;
  goal: string;
  provider: ProviderMode;
  model: string;
  fallback_provider: "minimax" | "mock" | null;
  runtime: "openclaw";
  sandbox: "nemoclaw";
  tools: ToolDefinition[];
  policies: PolicyDefinition[];
  integration_requirements: IntegrationRequirement[];
  memory_schema: MemorySchemaItem[];
  workflow_steps: WorkflowStep[];
  config_preview: string;
};

export type BlueprintRequest = {
  prompt: string;
  provider?: ProviderMode;
  template_id?: AgentTemplateId;
};

export type BlueprintApiResponse = {
  ok: true;
  blueprint: BlueprintResponse;
};

export type DeployAgentRequest = {
  blueprint_id: string;
};

export type DeployAgentResponse = {
  ok: true;
  agent_id: string;
  status: "running";
  message: string;
};

export type RuntimeEventType =
  | "agent.started"
  | "agent.thinking"
  | "tool.called"
  | "policy.checked"
  | "policy.blocked"
  | "approval.requested"
  | "approval.resolved"
  | "memory.updated"
  | "report.created"
  | "agent.completed"
  | "agent.error";

export type RuntimeEvent = {
  id: string;
  agent_id: string;
  type: RuntimeEventType;
  message: string;
  timestamp: string;
  severity?: "info" | "success" | "warning" | "error";
  metadata?: Record<string, unknown>;
};

export type ApprovalRequest = {
  id: string;
  agent_id: string;
  action: string;
  command?: string;
  reason: string;
  policy_id: string;
  status: "pending" | "approved" | "denied" | "modified";
  created_at: string;
  resolved_at?: string;
};

export type ApprovalDecisionRequest = {
  decision: "approved" | "denied";
};

export type ApprovalDecisionResponse = {
  ok: true;
  approval: ApprovalRequest;
  memory_item: MemoryItem;
};

export type MemoryItem = {
  id: string;
  agent_id: string;
  type: MemorySchemaItem["type"];
  content: string;
  created_at: string;
};

export type IncidentReport = {
  id: string;
  agent_id: string;
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  detected_behavior: string;
  classification: string;
  model_used: string;
  runtime: string;
  policy_triggered: string;
  action_attempted: string;
  user_decision: string;
  final_action: string;
  memory_update: string;
  safety_result: string;
  likely_threat: string;
  mitre_mapping: string;
  evidence: string[];
  recommended_action: string;
  actions_attempted: string[];
  actions_blocked: string[];
  approval_decisions: string[];
  memory_updates: string[];
};

export type MemoryResponse = {
  ok: true;
  agent_id: string;
  memory: MemoryItem[];
};

export type IncidentReportResponse = {
  ok: true;
  agent_id: string;
  report: IncidentReport;
};

export type PolicyFinding = {
  id: string;
  action: string;
  effect: PolicyEffect;
  severity: "info" | "warning" | "error";
  message: string;
};

export type ToolCallRecord = {
  id: string;
  action: string;
  allowed: boolean;
  approval_required: boolean;
  blocked: boolean;
  message: string;
};

export type PredeploySandboxStatus = "passed" | "failed" | "blocked" | "error";

export type PredeploySandboxResult = {
  ok: boolean;
  runId: string;
  status: PredeploySandboxStatus;
  events: RuntimeEvent[];
  policyFindings: PolicyFinding[];
  toolCalls: ToolCallRecord[];
  deploymentAllowed: boolean;
  report: string;
};

// ANU-57: Capability manifest and policy broker

export type CapabilityTarget = "agent" | "tool" | "user" | "system";

export type CapabilityPermission = "allowed" | "denied" | "approval_required";

export type Capability = {
  id: string;
  name: string;
  action: string;
  target: CapabilityTarget;
  permission: CapabilityPermission;
  conditions?: Record<string, unknown>;
};

export type AgentCapabilityManifest = {
  manifest_id: string;
  agent_id: string;
  agent_name: string;
  version: string;
  capabilities: Capability[];
  created_at: string;
};

export type ActionEnvelopeContext = {
  agent_id?: string;
  session_id?: string;
  user_id?: string;
  metadata?: Record<string, unknown>;
};

export type ActionEnvelopeParams = Record<string, unknown>;

export type ActionEnvelope = {
  action: string;
  tool?: string;
  params: ActionEnvelopeParams;
  context: ActionEnvelopeContext;
  capabilities: AgentCapabilityManifest;
};

// ANU-58: Provider configuration (env var references, not values)

export type ProviderConfig = {
  mode: ProviderMode;
  env_vars: {
    nemotron?: string; // NVIDIA_API_KEY
    minimax_api_key?: string; // MINIMAX_API_KEY
    minimax_plan_key?: string; // MINIMAX_PLAN_KEY
    pi_coding_api_key?: string; // PI_CODING_API_KEY
  };
  fallback_chain: ProviderMode[];
};

export type ProviderStatus = {
  mode: ProviderMode;
  model: string;
  available: boolean;
  error?: string;
};

// ============================================================
// ANU-54: Agent Activity Monitoring
// ============================================================

export type ActivityEventType =
  | "agent.started"
  | "agent.thinking"
  | "agent.resumed"
  | "agent.paused"
  | "tool.called"
  | "tool.executed"
  | "tool.blocked"
  | "tool.pending_approval"
  | "policy.checked"
  | "policy.blocked"
  | "policy.approved"
  | "approval.requested"
  | "approval.granted"
  | "approval.denied"
  | "memory.updated"
  | "memory.retrieved"
  | "report.generated"
  | "report.viewed"
  | "session.created"
  | "session.deployed"
  | "session.running"
  | "session.waiting_for_approval"
  | "session.completed"
  | "session.terminated"
  | "session.error";

export type ActivityEventSeverity = "debug" | "info" | "warning" | "error" | "success";

export type ToolExecutionMetadata = {
  tool_id: string;
  tool_name: string;
  action: string;
  args?: Record<string, unknown>;
  result?: string;
  duration_ms?: number;
  allowed: boolean;
  approval_required: boolean;
  blocked: boolean;
};

export type PolicyCheckMetadata = {
  policy_id: string;
  policy_name: string;
  action: string;
  effect: PolicyEffect;
  reason: string;
  allowed: boolean;
};

export type ApprovalWorkflowMetadata = {
  approval_id: string;
  action: string;
  command?: string;
  reason: string;
  policy_id: string;
  decision?: "approved" | "denied";
  modified_command?: string;
};

export type MemoryOperationMetadata = {
  memory_id: string;
  operation: "created" | "read" | "updated" | "deleted";
  memory_type: MemorySchemaItem["type"];
  content_preview: string;
};

export type AgentThinkingMetadata = {
  provider: string;
  model: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  reasoning?: string;
};

export type ActivityEvent = {
  id: string;
  agent_id: string;
  session_id?: string;
  type: ActivityEventType;
  message: string;
  timestamp: string;
  severity: ActivityEventSeverity;
  duration_ms?: number;
  metadata?: Record<string, unknown>;
  // Structured metadata for specific event categories
  tool_execution?: ToolExecutionMetadata;
  policy_check?: PolicyCheckMetadata;
  approval_workflow?: ApprovalWorkflowMetadata;
  memory_operation?: MemoryOperationMetadata;
  agent_thinking?: AgentThinkingMetadata;
};

export type ActivityEventSummary = {
  total_events: number;
  events_by_type: Record<ActivityEventType, number>;
  events_by_severity: Record<ActivityEventSeverity, number>;
  tool_call_counts: Record<string, number>;
  policy_blocked_count: number;
  approval_requested_count: number;
  approval_granted_count: number;
  approval_denied_count: number;
  session_duration_ms?: number;
};

export type ActivityQueryFilters = {
  event_types?: ActivityEventType[];
  severity?: ActivityEventSeverity[];
  tool_action?: string;
  policy_id?: string;
  from_timestamp?: string;
  to_timestamp?: string;
  limit?: number;
  offset?: number;
};

export type ActivityQueryResponse = {
  ok: true;
  agent_id: string;
  events: ActivityEvent[];
  total_count: number;
  has_more: boolean;
  next_offset: number | null;
  summary: ActivityEventSummary;
};
