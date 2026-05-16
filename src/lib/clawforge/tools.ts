import { demoReport } from "./fixtures";
import { checkPolicy } from "./policies";

export type ToolCallResult = {
  action: string;
  allowed: boolean;
  approval_required: boolean;
  message: string;
};

export function routeToolCall(action: string): ToolCallResult {
  const decision = checkPolicy(action);

  if (decision.effect === "deny") {
    return {
      action,
      allowed: false,
      approval_required: false,
      message: `Blocked by ${decision.policy_id}: ${decision.reason}`,
    };
  }

  if (decision.effect === "require_approval") {
    return {
      action,
      allowed: false,
      approval_required: true,
      message: `Approval required by ${decision.policy_id}: ${decision.reason}`,
    };
  }

  return {
    action,
    allowed: true,
    approval_required: false,
    message: action === "report.write" ? demoReport.title : `${action} allowed.`,
  };
}
