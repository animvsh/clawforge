import { createSentinelBlueprint } from "./fixtures";
import type {
  PolicyDefinition,
  PolicyEffect,
  ActionEnvelope,
  AgentCapabilityManifest,
  Capability,
  PolicyDecision,
} from "./types";

export type PolicyDecision = {
  effect: PolicyEffect;
  policy_id: string;
  reason: string;
};

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