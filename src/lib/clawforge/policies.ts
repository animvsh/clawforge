import { createSentinelBlueprint } from "./fixtures";
import type {
  PolicyDefinition,
  PolicyEffect,
  ActionEnvelope,
  AgentCapabilityManifest,
  Capability,
} from "./types";

export type PolicyDecision = {
  effect: PolicyEffect;
  policy_id: string;
  reason: string;
};

// Policy event types for logging
export type PolicyEventType = "policy.allow" | "policy.deny" | "policy.require_approval";

export type PolicyEvent = {
  type: PolicyEventType;
  action: string;
  policy_id: string;
  reason: string;
  timestamp: string;
  agent_id?: string;
};

// Policy event log - accumulates events for audit trail
const policyEventLog: PolicyEvent[] = [];

function emitPolicyEvent(event: PolicyEvent): PolicyEvent {
  policyEventLog.push(event);
  return event;
}

export function createPolicyEvent(
  action: string,
  effect: PolicyEffect,
  policyId: string,
  reason: string,
  agentId?: string,
): PolicyEvent {
  const eventType: PolicyEventType =
    effect === "allow"
      ? "policy.allow"
      : effect === "deny"
        ? "policy.deny"
        : "policy.require_approval";

  return emitPolicyEvent({
    type: eventType,
    action,
    policy_id: policyId,
    reason,
    timestamp: new Date().toISOString(),
    agent_id: agentId,
  });
}

const defaultPolicies = createSentinelBlueprint("mock").policies;

export function checkPolicy(
  action: string,
  policies: PolicyDefinition[] = defaultPolicies,
): PolicyDecision {
  const policy = policies.find((item) => item.action === action);
  if (!policy) {
    return {
      effect: "deny",
      policy_id: "policy_default_deny",
      reason: `No policy exists for ${action}.`,
    };
  }

  return {
    effect: policy.effect,
    policy_id: policy.id,
    reason: policy.reason,
  };
}

/**
 * Check policy and emit a policy event.
 * Returns the decision and the emitted event.
 */
export function checkPolicyWithEvent(
  action: string,
  policies: PolicyDefinition[] = defaultPolicies,
  agentId?: string,
): { decision: PolicyDecision; event: PolicyEvent } {
  const decision = checkPolicy(action, policies);
  const event = createPolicyEvent(
    action,
    decision.effect,
    decision.policy_id,
    decision.reason,
    agentId,
  );
  return { decision, event };
}

/**
 * Get all policy events from the log.
 */
export function getPolicyEventLog(): PolicyEvent[] {
  return [...policyEventLog];
}

/**
 * Clear the policy event log.
 */
export function clearPolicyEventLog(): void {
  policyEventLog.length = 0;
}

// ANU-57: Policy broker evaluates ActionEnvelope against policy rules
export function evaluateEnvelope(envelope: ActionEnvelope): PolicyDecision {
  const { action, capabilities } = envelope;

  // Find matching capability
  const capability = capabilities.capabilities.find((c) => c.action === action);

  if (!capability) {
    // No capability defined - safe default is deny
    return {
      effect: "deny",
      policy_id: "policy_capability_not_found",
      reason: `No capability defined for action: ${action}`,
    };
  }

  // Map capability permission to policy effect
  switch (capability.permission) {
    case "allowed":
      return {
        effect: "allow",
        policy_id: `capability_${capability.id}`,
        reason: `Capability ${capability.name} grants permission.`,
      };
    case "denied":
      return {
        effect: "deny",
        policy_id: `capability_${capability.id}`,
        reason: `Capability ${capability.name} denies action.`,
      };
    case "approval_required":
      return {
        effect: "require_approval",
        policy_id: `capability_${capability.id}`,
        reason: `Capability ${capability.name} requires approval.`,
      };
    default:
      return {
        effect: "deny",
        policy_id: "policy_capability_unknown_permission",
        reason: `Unknown permission on capability ${capability.name}.`,
      };
  }
}

// ANU-57: Generate capability manifest for SentinelClaw blueprint
export function generateSentinelClawManifest(
  agentId: string = "agent_sentinelclaw_demo",
  version: string = "1.0.0",
): AgentCapabilityManifest {
  const blueprint = createSentinelBlueprint("mock");

  const capabilities: Capability[] = blueprint.tools
    .filter((tool) => tool.enabled)
    .map((tool) => {
      // Map tool permission to capability permission
      let permission: Capability["permission"];
      switch (tool.permission) {
        case "allowed":
          permission = "allowed";
          break;
        case "blocked":
          permission = "denied";
          break;
        case "approval_required":
          permission = "approval_required";
          break;
        case "read_only":
          permission = "allowed";
          break;
        default:
          permission = "denied";
      }

      return {
        id: `cap_${tool.id}`,
        name: tool.name,
        action: tool.action,
        target: "tool" as const,
        permission,
      };
    });

  return {
    manifest_id: `manifest_${agentId}`,
    agent_id: agentId,
    agent_name: blueprint.agent_name,
    version,
    capabilities,
    created_at: new Date().toISOString(),
  };
}
