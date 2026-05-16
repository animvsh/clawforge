export type ProviderMode = "auto" | "nemotron" | "minimax" | "mock";
export type AgentTemplateId =
  | "incident_response"
  | "github_triage"
  | "inbox_approval"
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

export type BlueprintResponse = {
  blueprint_id: string;
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
  predeploy_run_id?: string;
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
