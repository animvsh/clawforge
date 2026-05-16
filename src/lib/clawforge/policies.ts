import { createSentinelBlueprint } from "./fixtures";
import type { PolicyDefinition, PolicyEffect } from "./types";

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
