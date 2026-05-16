export type ProviderMode = "auto" | "nemotron" | "minimax" | "mock";

export type ToolPermission = "allowed" | "read_only" | "approval_required" | "blocked";
export type RiskLevel = "low" | "medium" | "high";
export type PolicyEffect = "allow" | "deny" | "require_approval";
export type ApprovalRiskLabel = "low" | "medium" | "high" | "critical";

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
  | "security.checked"
  | "approval.requested"
  | "approval.resolved"
  | "audit.recorded"
  | "memory.retrieved"
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
  preview?: string;
  destination?: string;
  reason: string;
  policy_id: string;
  risk_label: ApprovalRiskLabel;
  timeout_seconds: number;
  status: "pending" | "approved" | "denied" | "modified";
  created_at: string;
  expires_at: string;
  resolved_at?: string;
};

export type ApprovalArtifact = {
  id: string;
  approval_id: string;
  agent_id: string;
  decision: "approved" | "denied";
  policy_id: string;
  command?: string;
  created_at: string;
  side_effect_allowed: boolean;
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
  sandbox: string;
  provider: string;
  policy_triggered: string;
  action_attempted: string;
  user_decision: string;
  final_action: string;
  memory_update: string;
  safety_result: string;
  audit_summary: string;
  likely_threat: string;
  mitre_mapping: string;
  evidence: string[];
  recommended_action: string;
  actions_attempted: string[];
  actions_blocked: string[];
  approval_decisions: string[];
  memory_updates: string[];
};

export type AuditRecord = {
  id: string;
  sequence: number;
  event_id: string;
  agent_id: string;
  type: RuntimeEventType;
  message: string;
  timestamp: string;
  severity?: RuntimeEvent["severity"];
  metadata?: Record<string, unknown>;
  previous_hash: string | null;
  hash: string;
  redaction_applied: boolean;
  immutable: true;
};

export type SandboxHardeningCheck = {
  id:
    | "gateway_inference_routing"
    | "network_deny_by_default"
    | "forbidden_path_scanner"
    | "secret_redaction"
    | "audit_logging"
    | "elevated_mode";
  label: string;
  status: "pass" | "warn" | "fail";
  message: string;
};

export type SandboxHardeningStatus = {
  status: "healthy" | "warning" | "failed";
  elevated_mode: boolean;
  can_run_elevated: boolean;
  checked_at: string;
  checks: SandboxHardeningCheck[];
};

export type RuntimeSnapshot = {
  version: 1;
  agent_id: string;
  status: "created" | "running" | "waiting_for_approval" | "completed" | "stopped";
  approval_status: "pending" | "approved" | "denied";
  events: RuntimeEvent[];
  audit: AuditRecord[];
  memory: MemoryItem[];
  approvals: ApprovalRequest[];
  approval_artifacts: ApprovalArtifact[];
  report: IncidentReport | null;
  hardening: SandboxHardeningStatus | null;
  updated_at: string;
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
