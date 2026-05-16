import { DEMO_AGENT_ID } from "../fixtures";
import { checkPolicy } from "../policies";
import type {
  BlueprintResponse,
  PolicyDefinition,
  PolicyFinding,
  PredeploySandboxResult,
  RuntimeEvent,
  ToolCallRecord,
} from "../types";

type PredeployScenario = "happy_path" | "raw_export" | "policy_tamper" | "timeout";

type PredeployRun = {
  id: string;
  blueprint: BlueprintResponse;
  scenario: PredeployScenario;
  startedAt: string;
  destroyed: boolean;
  events: RuntimeEvent[];
  toolCalls: ToolCallRecord[];
  policyFindings: PolicyFinding[];
  result?: PredeploySandboxResult;
};

const runs = new Map<string, PredeployRun>();

function now(): string {
  return new Date().toISOString();
}

function envValue(name: string): string {
  const processEnv =
    typeof process !== "undefined" && typeof process.env === "object" ? process.env : undefined;
  return processEnv?.[name] ?? "";
}

function openHandsMode(): string {
  return envValue("OPENHANDS_MODE") || "disabled";
}

function event(
  run: PredeployRun,
  type: RuntimeEvent["type"],
  message: string,
  severity: RuntimeEvent["severity"] = "info",
  metadata?: Record<string, unknown>,
): RuntimeEvent {
  const nextEvent: RuntimeEvent = {
    id: `predeploy_event_${run.events.length + 1}_${Date.now()}`,
    agent_id: DEMO_AGENT_ID,
    type,
    message,
    timestamp: now(),
    severity,
    metadata: {
      run_id: run.id,
      openhands_mode: openHandsMode(),
      ...metadata,
    },
  };
  run.events.push(nextEvent);
  return nextEvent;
}

function smokeActions(run: PredeployRun): string[] {
  const allowedAction = run.blueprint.tools.find((tool) => tool.permission !== "blocked")?.action;
  const approvalAction = run.blueprint.tools.find(
    (tool) => tool.permission === "approval_required",
  )?.action;
  const readOrWriteActions = [allowedAction, approvalAction].filter(Boolean) as string[];

  if (run.scenario === "raw_export") return [...readOrWriteActions, "data.export"];
  if (run.scenario === "policy_tamper") return [...readOrWriteActions, "policy.modify"];
  if (run.scenario === "timeout") return readOrWriteActions;
  return readOrWriteActions;
}

function recordToolCall(run: PredeployRun, action: string, policies: PolicyDefinition[]) {
  const decision = checkPolicy(action, policies);
  const blocked = decision.effect === "deny";
  const approvalRequired = decision.effect === "require_approval";
  const toolCall: ToolCallRecord = {
    id: `tool_call_${run.toolCalls.length + 1}`,
    action,
    allowed: decision.effect === "allow",
    approval_required: approvalRequired,
    blocked,
    message:
      decision.effect === "allow"
        ? `${action} allowed in the predeploy sandbox.`
        : decision.effect === "require_approval"
          ? `${action} marked approval-required before deployment.`
          : `${action} blocked before deployment.`,
  };

  run.toolCalls.push(toolCall);
  run.policyFindings.push({
    id: `finding_${run.policyFindings.length + 1}`,
    action,
    effect: decision.effect,
    severity: blocked ? "error" : approvalRequired ? "warning" : "info",
    message: `${decision.policy_id}: ${decision.reason}`,
  });

  event(run, "policy.checked", toolCall.message, blocked ? "error" : "info", {
    action,
    policy_effect: decision.effect,
  });

  if (blocked) {
    event(run, "policy.blocked", `${action} failed the predeploy policy check.`, "error", {
      action,
    });
  } else if (approvalRequired) {
    event(run, "approval.requested", `${action} would pause for approval in NemoClaw.`, "warning", {
      action,
    });
  } else {
    event(run, "tool.called", `${action} ran inside the controlled predeploy sandbox.`, "success", {
      action,
    });
  }
}

export function createPredeployRun(
  blueprint: BlueprintResponse,
  scenario: PredeployScenario = "happy_path",
): PredeployRun {
  const id = `predeploy_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const run: PredeployRun = {
    id,
    blueprint,
    scenario,
    startedAt: now(),
    destroyed: false,
    events: [],
    toolCalls: [],
    policyFindings: [],
  };
  runs.set(id, run);
  event(run, "agent.started", "OpenHands predeploy sandbox test created.", "success", {
    blueprint_id: blueprint.blueprint_id,
    scenario,
  });
  return run;
}

export function runAgentSmokeTest(runId: string): PredeploySandboxResult {
  const run = runs.get(runId);
  if (!run) throw new Error("Unknown predeploy run.");

  event(run, "agent.thinking", "Testing generated NemoClaw plan before deployment.", "info");

  for (const action of smokeActions(run)) {
    recordToolCall(run, action, run.blueprint.policies);
  }

  if (run.scenario === "timeout") {
    event(run, "agent.error", "Predeploy sandbox timed out before completion.", "error");
  }

  const hasBlockedFinding = run.policyFindings.some((finding) => finding.effect === "deny");
  const timedOut = run.scenario === "timeout";
  const deploymentAllowed = !hasBlockedFinding && !timedOut;
  const status = deploymentAllowed ? "passed" : hasBlockedFinding ? "blocked" : "failed";

  if (deploymentAllowed) {
    event(run, "agent.completed", "Predeploy check passed. Deployment may continue.", "success");
  }

  run.result = {
    ok: deploymentAllowed,
    runId,
    status,
    events: run.events,
    policyFindings: run.policyFindings,
    toolCalls: run.toolCalls,
    deploymentAllowed,
    report: deploymentAllowed
      ? "Predeploy smoke test passed. Read-only actions ran, risky actions paused for approval, and no denied action executed."
      : "Predeploy smoke test failed. NemoClaw deployment is blocked until denied or timed-out actions are resolved.",
  };

  return run.result;
}

export function collectSandboxEvents(runId: string): RuntimeEvent[] {
  return runs.get(runId)?.events ?? [];
}

export function evaluatePolicyFindings(runId: string): PolicyFinding[] {
  return runs.get(runId)?.policyFindings ?? [];
}

export function destroySandbox(runId: string): void {
  const run = runs.get(runId);
  if (!run || run.destroyed) return;
  run.destroyed = true;
  event(run, "memory.updated", "Predeploy sandbox cleaned up after test.", "success", {
    started_at: run.startedAt,
  });
}

export function getPredeployRunResult(runId: string): PredeploySandboxResult | undefined {
  return runs.get(runId)?.result;
}

export function runPredeployCheck(
  blueprint: BlueprintResponse,
  scenario: PredeployScenario = "happy_path",
): PredeploySandboxResult {
  const run = createPredeployRun(blueprint, scenario);
  try {
    return runAgentSmokeTest(run.id);
  } catch (error) {
    event(
      run,
      "agent.error",
      error instanceof Error ? error.message : "Predeploy sandbox failed.",
      "error",
    );
    run.result = {
      ok: false,
      runId: run.id,
      status: "error",
      events: run.events,
      policyFindings: run.policyFindings,
      toolCalls: run.toolCalls,
      deploymentAllowed: false,
      report: "Predeploy sandbox returned an error and deployment was blocked.",
    };
    return run.result;
  } finally {
    destroySandbox(run.id);
  }
}
