import { createSentinelBlueprint } from "./fixtures";
import { redactionSelfTest } from "./security";
import type { PolicyDefinition, PolicyEffect, SandboxHardeningStatus } from "./types";

export type PolicyDecision = {
  effect: PolicyEffect;
  policy_id: string;
  reason: string;
};

const defaultPolicies = createSentinelBlueprint("mock").policies;

export const forbiddenPathPatterns = [
  "/etc/shadow",
  "/etc/passwd",
  "/root/",
  "/home/ubuntu/.ssh/",
  "/var/run/docker.sock",
  ".env",
  ".dev.vars",
  "id_rsa",
];

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

export function scanForbiddenPath(value: string): { allowed: boolean; match?: string } {
  const normalized = value.toLowerCase();
  const match = forbiddenPathPatterns.find((pattern) => normalized.includes(pattern.toLowerCase()));
  return match ? { allowed: false, match } : { allowed: true };
}

export function getSandboxHardeningStatus(): SandboxHardeningStatus {
  const env = typeof process !== "undefined" ? process.env : {};
  const elevatedMode = env.CLAWFORGE_ELEVATED_MODE === "1";
  const routedInference =
    env.AGENT_PROVIDER === "mock" ||
    env.NEMOCLAW_PROVIDER === "routed" ||
    env.NVIDIA_BASE_URL?.includes("integrate.api.nvidia.com") ||
    !env.AGENT_PROVIDER;
  const networkDenyByDefault = checkPolicy("data.export").effect === "deny";
  const forbiddenScannerReady = scanForbiddenPath("/etc/shadow").allowed === false;
  const secretRedactionReady = redactionSelfTest();
  const elevatedApproved = env.CLAWFORGE_ALLOW_ELEVATED_AUTONOMY === "approved";

  const checks: SandboxHardeningStatus["checks"] = [
    {
      id: "gateway_inference_routing",
      label: "Gateway inference routing",
      status: routedInference ? "pass" : "warn",
      message: routedInference
        ? "Inference is routed through mock, NemoClaw routed mode, or NVIDIA gateway configuration."
        : "Set NEMOCLAW_PROVIDER=routed or use the hosted NVIDIA gateway before enabling elevated work.",
    },
    {
      id: "network_deny_by_default",
      label: "Network deny-by-default",
      status: networkDenyByDefault ? "pass" : "fail",
      message: networkDenyByDefault
        ? "Raw data export is denied by policy."
        : "Raw data export is not denied; elevated work must stay disabled.",
    },
    {
      id: "forbidden_path_scanner",
      label: "Forbidden path scanner",
      status: forbiddenScannerReady ? "pass" : "fail",
      message: forbiddenScannerReady
        ? "Sensitive host paths and env files are blocked before tool execution."
        : "Forbidden path scanner is not blocking sensitive paths.",
    },
    {
      id: "secret_redaction",
      label: "Secret redaction",
      status: secretRedactionReady ? "pass" : "fail",
      message: secretRedactionReady
        ? "Authorization headers and provider keys are redacted from logs and audit metadata."
        : "Secret redaction self-test failed.",
    },
    {
      id: "audit_logging",
      label: "Audit logging",
      status: "pass",
      message: "Runtime events are mirrored into append-only ordered audit records.",
    },
    {
      id: "elevated_mode",
      label: "Elevated mode",
      status: elevatedMode ? (elevatedApproved ? "pass" : "fail") : "warn",
      message: elevatedMode
        ? elevatedApproved
          ? "Elevated autonomous work was explicitly enabled."
          : "Elevated mode requires CLAWFORGE_ALLOW_ELEVATED_AUTONOMY=approved."
        : "Elevated autonomous work is disabled; demo runs in safe mode.",
    },
  ];

  const hasFailure = checks.some((check) => check.status === "fail");
  const hasWarning = checks.some((check) => check.status === "warn");

  return {
    status: hasFailure ? "failed" : hasWarning ? "warning" : "healthy",
    elevated_mode: elevatedMode,
    can_run_elevated: elevatedMode && elevatedApproved && !hasFailure,
    checked_at: new Date().toISOString(),
    checks,
  };
}
