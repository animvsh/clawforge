import type { ToolCallResult } from "../tools";

/**
 * Base interface for all SentinelClaw tool brokers.
 * Each tool must implement execute(), validate(), and getMetadata().
 */
export interface ToolBroker {
  /** Unique action identifier (e.g., "logs.read", "shell.execute") */
  action: string;

  /** Execute the tool with given parameters after policy check passes */
  execute(params: ToolExecuteParams): Promise<ToolExecuteResult>;

  /** Validate parameters before execution */
  validate(params: Record<string, unknown>): ValidationResult;

  /** Return tool metadata for discovery and documentation */
  getMetadata(): ToolMetadata;
}

export type ToolExecuteParams = {
  /** Agent that owns this tool call */
  agent_id: string;
  /** Session context for the call */
  session_id?: string;
  /** Tool-specific parameters */
  params: Record<string, unknown>;
  /** Optional context from action envelope */
  context?: Record<string, unknown>;
};

export type ToolExecuteResult = {
  success: boolean;
  data?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
};

export type ValidationResult = {
  valid: boolean;
  errors?: string[];
};

export type ToolMetadata = {
  id: string;
  name: string;
  action: string;
  description: string;
  permission: "allowed" | "read_only" | "approval_required" | "blocked";
  risk_level: "low" | "medium" | "high";
  enabled: boolean;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
};

/**
 * Execute a tool through policy-gated route.
 * Returns ToolCallResult with allow/deny/approval_required decision.
 */
export async function executeToolWithPolicy(
  broker: ToolBroker,
  params: ToolExecuteParams,
  routeToolCall: (action: string) => ToolCallResult,
): Promise<{ decision: ToolCallResult; result?: ToolExecuteResult }> {
  // Check if tool is enabled at broker level
  if (broker.getMetadata().enabled === false) {
    return {
      decision: {
        action: broker.action,
        allowed: false,
        approval_required: false,
        message: `Tool '${broker.action}' is disabled and cannot execute.`,
      },
      result: {
        success: false,
        error: `Tool is disabled.`,
      },
    };
  }

  // First validate parameters
  const validation = broker.validate(params.params);
  if (!validation.valid) {
    return {
      decision: {
        action: broker.action,
        allowed: false,
        approval_required: false,
        message: `Validation failed: ${validation.errors?.join(", ")}`,
      },
      result: {
        success: false,
        error: `Validation failed: ${validation.errors?.join(", ")}`,
      },
    };
  }

  // Check policy
  const decision = routeToolCall(broker.action);

  if (!decision.allowed) {
    return {
      decision,
      result: {
        success: false,
        error: decision.message,
      },
    };
  }

  // Execute if allowed
  const result = await broker.execute(params);
  return { decision, result };
}
