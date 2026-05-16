import {
  DEMO_AGENT_ID,
  demoApproval,
  demoReport,
  createBlueprintFromPrompt,
  createSentinelBlueprint,
  isKnownBlueprintId,
} from "./fixtures";
import { createProviderRegistry } from "./providers";
import {
  getRuntimeEvents,
  getRuntimeMemory,
  getRuntimeReport,
  getRuntimeState,
  getApprovalStatus,
  hydrateRuntimeForAgentId,
  isActiveRuntimeAgent,
  resolveApproval,
  resetLegacyRuntime,
  startRuntime,
  stopRuntime,
} from "./runtime";
import {
  getActivityEvents,
  getActivitySummary,
} from "./activity-store";
import {
  chatWithOpenHands,
  collectSandboxEvents,
  createBrevInstance,
  createBrevLaunchPlan,
  getBrevStatus,
  getPredeployRunResult,
  runPredeployCheck,
} from "./sandbox";
import {
  handleMemoryHealth,
  handleMemorySearch,
  handleMemoryAdd,
  handleMemoryUpdate,
  handleMemoryDelete,
  handleMemoryList,
} from "./memory/gateway";
import { createIntegrationConnectLink, getIntegrationStatus } from "./integrations/composio";
import { createAgentMailInbox } from "./integrations/agentmail";
import type {
  ProviderMode,
  BlueprintRequest,
  BlueprintApiResponse,
  DeployAgentRequest,
  DeployAgentResponse,
  MemoryResponse,
  RuntimeEvent,
  ApprovalDecisionRequest,
  ApprovalDecisionResponse,
  IncidentReportResponse,
  BlueprintResponse,
} from "./types";

// ============================================================
// API Namespace: /api/v1/clawforge
// Base URL: /api/v1/clawforge
// All responses follow: { ok: true, ...data } | { ok: false, error: ApiError }
// ============================================================

export const API_VERSION = "v1" as const;
export const API_NAMESPACE = "/api/v1/clawforge" as const;

// ============================================================
// Error Types
// ============================================================

export type ApiErrorCode =
  | "INVALID_REQUEST"
  | "MISSING_FIELD"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INTERNAL_ERROR"
  | "METHOD_NOT_ALLOWED";

export type ApiError = {
  code: ApiErrorCode;
  message: string;
  status: number;
  field?: string;
};

function apiError(code: ApiErrorCode, message: string, status: number, field?: string): ApiError {
  return { code, message, status, field };
}

// ============================================================
// Response Helpers
// ============================================================

function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...init?.headers,
    },
  });
}

function successResponse<T>(data: T, init?: ResponseInit): Response {
  return json({ ok: true, ...data }, init);
}

function errorResponse(
  message: string,
  status = 400,
  code: ApiErrorCode = "INVALID_REQUEST",
  field?: string,
): Response {
  return json({ ok: false, error: apiError(code, message, status, field) }, { status });
}

function notFoundError(resource: string): Response {
  return errorResponse(`${resource} not found.`, 404, "NOT_FOUND");
}

function methodNotAllowedError(): Response {
  return errorResponse("Method not allowed for this endpoint.", 405, "METHOD_NOT_ALLOWED");
}

// ============================================================
// API Request/Response Types
// ============================================================

export type HealthResponse = {
  ok: true;
  app: string;
  service: string;
  runtime: string;
  frontend: string;
};

export type BlueprintCreateRequest = BlueprintRequest;

export type BlueprintCreateResponse = BlueprintApiResponse;

export type AgentDeployRequest = DeployAgentRequest;

export type AgentDeployResponse = DeployAgentResponse;

export type AgentStartResponse = {
  ok: true;
  agent_id: string;
  status: "running" | "waiting_for_approval" | "completed" | "stopped";
};

export type AgentStopResponse = {
  ok: true;
  agent_id: string;
  status: "stopped";
};

export type AgentLogsStreamResponse = RuntimeEvent[];

export type AgentMemoryResponse = MemoryResponse;

export type AgentReportResponse = IncidentReportResponse;

export type ApprovalDecisionApiResponse = ApprovalDecisionResponse;

// ============================================================
// Helper Functions
// ============================================================

function hasCompletedCookie(request: Request): boolean {
  return request.headers.get("cookie")?.includes("clawforge_completed=1") ?? false;
}

function getCompletedDemoReport() {
  return demoReport;
}

async function readJsonBody<T extends Record<string, unknown>>(request: Request): Promise<T> {
  if (!request.body) return {} as T;
  const body = await request.json().catch(() => undefined);
  if (!body || Array.isArray(body) || typeof body !== "object") return {} as T;
  return body as T;
}

function normalizeProvider(value: unknown): ProviderMode | null {
  if (value === undefined || value === null || value === "") return "auto";
  if (
    value === "nemotron" ||
    value === "minimax" ||
    value === "pi" ||
    value === "mock" ||
    value === "auto"
  ) {
    return value;
  }
  return null; // Invalid provider - caller should return 400
}

function providerModelEnvOverride(
  provider: ProviderMode,
  value: unknown,
): Record<string, string | undefined> {
  if (typeof value !== "string") return {};
  const model = value.trim();
  if (!model || model === "auto") return {};
  if (provider === "nemotron") return { NVIDIA_NEMOTRON_MODEL: model };
  if (provider === "minimax") return { MINIMAX_MODEL: model };
  if (provider === "pi") return { PI_CODING_MODEL: model };
  return {};
}

function normalizePredeployScenario(
  value: unknown,
): "happy_path" | "raw_export" | "policy_tamper" | "timeout" {
  if (value === "raw_export" || value === "policy_tamper" || value === "timeout") return value;
  return "happy_path";
}

function isBlueprintResponse(value: unknown): value is BlueprintResponse {
  if (!value || Array.isArray(value) || typeof value !== "object") return false;
  const candidate = value as Partial<BlueprintResponse>;
  return (
    typeof candidate.blueprint_id === "string" &&
    typeof candidate.agent_name === "string" &&
    typeof candidate.template_id === "string" &&
    typeof candidate.goal === "string" &&
    Array.isArray(candidate.tools) &&
    Array.isArray(candidate.policies)
  );
}

function runtimeEnv(
  workerEnv: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  const viteEnv = import.meta.env as Record<string, string | undefined>;
  const nodeEnv =
    typeof process !== "undefined" && typeof process.env === "object"
      ? (process.env as Record<string, string | undefined>)
      : {};
  return { ...nodeEnv, ...viteEnv, ...workerEnv };
}

function providerFallbackConfig(configPreview: string): string {
  const redactedPreview = configPreview
    .split("\n")
    .filter(
      (line) =>
        !/^\s*(?:NVIDIA_API_KEY|MINIMAX_API_KEY|MINIMAX_PLAN_KEY|PI_CODING_API_KEY)\s*:/.test(line),
    )
    .join("\n");

  return `${redactedPreview}
provider_status: fallback
provider_error: live provider unavailable; using deterministic fallback`;
}

function cleanProviderSummary(value: string): string {
  const cleaned = value
    .replace(/^\s*(?:here(?:'s| is)|sure|certainly)[\s\S]*?:\s*/i, "")
    .replace(/["“”]/g, "")
    .replace(/\s*\((?:safety controls|if you'd like|note:)[\s\S]*$/i, "")
    .replace(/\n{2,}[\s\S]*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .slice(0, 2)
    .join(" ");
}

function cleanProviderSteps(steps: string[], fallbackSteps: string[]): string[] {
  const cleaned = steps
    .map((step) =>
      step
        .replace(/^\s*(?:[-*]|\d+[.)-])\s*/, "")
        .replace(/^["'`]+|["'`,]+$/g, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(
      (step) =>
        step.length >= 3 &&
        step.length <= 80 &&
        !/```|import\s|from\s+['"]|function\s|\b(?:const|let|var)\s|=>|=/.test(step) &&
        !/\b(?:api[_ -]?key|auth[_ -]?key|account[_ -]?id|twilio|python)\b/i.test(step),
    );

  return cleaned.length >= 3 ? cleaned : fallbackSteps;
}

async function createProviderBackedBlueprint(
  provider: ProviderMode,
  prompt: string,
  workerEnv: Record<string, string | undefined> = {},
) {
  const blueprint = createBlueprintFromPrompt(prompt, provider);
  if (provider === "mock") return blueprint;

  try {
    const registry = createProviderRegistry(runtimeEnv(workerEnv));
    const liveProvider = registry.getProvider(provider);
    if (liveProvider.mode === "mock") {
      return {
        ...blueprint,
        config_preview: providerFallbackConfig(blueprint.config_preview),
      };
    }

    const liveModel = liveProvider.model;
    const [steps, rawSummary, classification] = await Promise.all([
      registry.plan({ prompt }, provider),
      registry.summarize({ prompt }, provider),
      registry.classify({ prompt }, provider),
    ]);
    const summary = cleanProviderSummary(rawSummary);
    const fallbackSteps = blueprint.workflow_steps.map((step) => step.title);
    const providerSteps =
      blueprint.template_id === "phone_receptionist"
        ? fallbackSteps
        : steps.length >= 4 && !steps.every((step) => /^initialize\.?$/i.test(step))
          ? cleanProviderSteps(steps, fallbackSteps)
          : fallbackSteps;

    return {
      ...blueprint,
      model: liveModel,
      description: summary || blueprint.description,
      workflow_steps: providerSteps.slice(0, 6).map((step, index) => ({
        id: `step_provider_${index + 1}`,
        title: step,
        description:
          index === 0
            ? `Generated by ${liveModel}. Classification: ${classification.label} (${classification.severity}).`
            : `Generated by ${liveModel}.`,
        tool_id: blueprint.workflow_steps[index]?.tool_id,
      })),
      config_preview: `${blueprint.config_preview}
provider_status: live
provider_classification: ${classification.label}
provider_severity: ${classification.severity}`,
    };
  } catch {
    return {
      ...blueprint,
      config_preview: providerFallbackConfig(blueprint.config_preview),
    };
  }
}

function sse(events: unknown[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });
}

// ============================================================
// API Handler
// ============================================================

export async function handleClawForgeApi(
  request: Request,
  workerEnv: Record<string, string | undefined> = {},
): Promise<Response | undefined> {
  const url = new URL(request.url);
  const path = url.pathname;

  // Normalize path: strip /api/v1/clawforge prefix if present
  let apiPath = path;
  if (path.startsWith(API_NAMESPACE)) {
    apiPath = path.slice(API_NAMESPACE.length) || "/";
  } else if (path.startsWith("/api/")) {
    apiPath = path; // Support legacy /api/blueprints format
  }

  // POST /api/blueprints or /api/v1/clawforge/blueprints
  if ((apiPath === "/api/blueprints" || apiPath === "/blueprints") && request.method === "POST") {
    const body = await readJsonBody<{ prompt?: unknown; provider?: unknown }>(request);

    // Check if prompt field is truly missing (undefined/null) vs empty string
    if (body.prompt === undefined || body.prompt === null) {
      return errorResponse("Prompt is required.", 400, "MISSING_FIELD", "prompt");
    }

    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) {
      // Empty string is INVALID_REQUEST, not MISSING_FIELD
      return errorResponse("Prompt cannot be empty.", 400, "INVALID_REQUEST", "prompt");
    }

    // Validate provider - return 400 for invalid values, not auto-default
    const provider = normalizeProvider(body.provider);
    if (provider === null) {
      return errorResponse(
        "Invalid provider value. Must be one of: auto, nemotron, minimax, pi, mock.",
        400,
        "INVALID_REQUEST",
        "provider",
      );
    }

    return successResponse({
      blueprint: await createProviderBackedBlueprint(provider, prompt, workerEnv),
    } satisfies Pick<BlueprintCreateResponse, "blueprint">);
  }

  if (
    (apiPath === "/api/clawforge/agents/predeploy-test" ||
      apiPath === "/clawforge/agents/predeploy-test") &&
    request.method === "POST"
  ) {
    const body = await readJsonBody<{
      provider?: unknown;
      scenario?: unknown;
    }>(request);
    const provider = normalizeProvider(body.provider) ?? "mock";
    const result = runPredeployCheck(
      createSentinelBlueprint(provider),
      normalizePredeployScenario(body.scenario),
    );
    return successResponse({ predeploy: result });
  }

  if (
    (apiPath === "/api/clawforge/brev/status" || apiPath === "/clawforge/brev/status") &&
    request.method === "GET"
  ) {
    return successResponse({ brev: await getBrevStatus() });
  }

  if (
    (apiPath === "/api/clawforge/composio/status" || apiPath === "/clawforge/composio/status") &&
    request.method === "GET"
  ) {
    const userId = url.searchParams.get("user_id") || "clawforge-demo-user";
    return successResponse({ composio: await getIntegrationStatus(workerEnv, userId) });
  }

  if (
    (apiPath === "/api/clawforge/integrations" || apiPath === "/clawforge/integrations") &&
    request.method === "GET"
  ) {
    const userId = url.searchParams.get("user_id") || "clawforge-demo-user";
    return successResponse({ integrations: await getIntegrationStatus(workerEnv, userId) });
  }

  if (
    (apiPath === "/api/clawforge/integrations/connect" ||
      apiPath === "/clawforge/integrations/connect") &&
    request.method === "POST"
  ) {
    try {
      return successResponse({
        connect: await createIntegrationConnectLink(request.clone(), workerEnv),
      });
    } catch (error) {
      return errorResponse(
        error instanceof Error ? error.message : "Could not create integration connect link.",
        400,
        "INVALID_REQUEST",
      );
    }
  }

  if (
    (apiPath === "/api/clawforge/agentmail/inboxes" ||
      apiPath === "/clawforge/agentmail/inboxes") &&
    request.method === "POST"
  ) {
    try {
      return successResponse({
        inbox: await createAgentMailInbox(request.clone(), workerEnv),
      });
    } catch (error) {
      return errorResponse(
        error instanceof Error ? error.message : "Could not create agent inbox.",
        400,
        "INVALID_REQUEST",
      );
    }
  }

  if (
    (apiPath === "/api/clawforge/brev/launch-plan" || apiPath === "/clawforge/brev/launch-plan") &&
    request.method === "POST"
  ) {
    const body = await readJsonBody<{
      instance_name?: unknown;
      blueprint?: unknown;
      agent_inbox?: unknown;
    }>(request);
    const instanceName =
      typeof body.instance_name === "string" && body.instance_name.trim()
        ? body.instance_name.trim()
        : "clawforge-nemoclaw";
    const agentInbox =
      body.agent_inbox && typeof body.agent_inbox === "object" && !Array.isArray(body.agent_inbox)
        ? (body.agent_inbox as { email?: string; status?: string })
        : undefined;
    return successResponse({
      launch: await createBrevLaunchPlan(instanceName, {
        blueprint: isBlueprintResponse(body.blueprint) ? body.blueprint : undefined,
        agentInbox,
        workerEnv,
      }),
    });
  }

  if (
    (apiPath === "/api/clawforge/brev/instances" || apiPath === "/clawforge/brev/instances") &&
    request.method === "POST"
  ) {
    const body = await readJsonBody<{
      instance_name?: unknown;
      instance_type?: unknown;
      confirmation?: unknown;
      blueprint?: unknown;
      agent_inbox?: unknown;
    }>(request);
    const instanceName =
      typeof body.instance_name === "string" && body.instance_name.trim()
        ? body.instance_name.trim()
        : "clawforge-nemoclaw";
    const instanceType =
      typeof body.instance_type === "string" && body.instance_type.trim()
        ? body.instance_type.trim()
        : "verda_L40S";
    const agentInbox =
      body.agent_inbox && typeof body.agent_inbox === "object" && !Array.isArray(body.agent_inbox)
        ? (body.agent_inbox as { email?: string; status?: string })
        : undefined;
    const launch = await createBrevInstance(
      instanceName,
      instanceType,
      body.confirmation === "CREATE_BREV_INSTANCE",
      {
        blueprint: isBlueprintResponse(body.blueprint) ? body.blueprint : undefined,
        agentInbox,
        workerEnv,
      },
    );
    return successResponse({ launch });
  }

  if (
    (apiPath === "/api/clawforge/openhands/chat" || apiPath === "/clawforge/openhands/chat") &&
    request.method === "POST"
  ) {
    const body = await readJsonBody<{ message?: unknown; provider?: unknown; model?: unknown }>(
      request,
    );
    const message = typeof body.message === "string" ? body.message : "";
    const provider = normalizeProvider(body.provider);
    if (provider === null) {
      return errorResponse(
        "Invalid provider value. Must be one of: auto, nemotron, minimax, pi, mock.",
        400,
        "INVALID_REQUEST",
        "provider",
      );
    }
    return successResponse({
      chat: await chatWithOpenHands(
        message,
        {
          ...runtimeEnv(workerEnv),
          ...providerModelEnvOverride(provider, body.model),
        },
        provider,
      ),
    });
  }

  const predeployEventsMatch = path.match(/^\/api\/clawforge\/predeploy-runs\/([^/]+)\/events$/);
  if (predeployEventsMatch && request.method === "GET") {
    const [, runId] = predeployEventsMatch;
    return successResponse({ run_id: runId, events: collectSandboxEvents(runId) });
  }

  const predeployReportMatch = path.match(/^\/api\/clawforge\/predeploy-runs\/([^/]+)\/report$/);
  if (predeployReportMatch && request.method === "GET") {
    const [, runId] = predeployReportMatch;
    const result = getPredeployRunResult(runId);
    if (!result) return notFoundError("Predeploy run");
    return successResponse({ run_id: runId, report: result.report, predeploy: result });
  }

  // POST /api/agents/deploy or /api/v1/clawforge/agents/deploy
  if (
    (apiPath === "/api/agents/deploy" || apiPath === "/agents/deploy") &&
    request.method === "POST"
  ) {
    const body = await readJsonBody<{
      blueprint_id?: unknown;
      blueprint?: unknown;
      predeploy_run_id?: unknown;
    }>(request);
    const blueprintId = typeof body.blueprint_id === "string" ? body.blueprint_id : "";
    const blueprint = isBlueprintResponse(body.blueprint) ? body.blueprint : undefined;

    if (!blueprintId) {
      return errorResponse("blueprint_id is required.", 400, "MISSING_FIELD", "blueprint_id");
    }

    if (!isKnownBlueprintId(blueprintId)) {
      return errorResponse("Known ClawForge blueprint_id is required.", 400, "INVALID_REQUEST");
    }

    const existingPredeploy =
      typeof body.predeploy_run_id === "string"
        ? getPredeployRunResult(body.predeploy_run_id)
        : undefined;
    const predeploy = existingPredeploy ?? runPredeployCheck(createSentinelBlueprint("mock"));
    if (!predeploy.deploymentAllowed) {
      return errorResponse(
        `Predeploy sandbox blocked deployment: ${predeploy.report}`,
        409,
        "CONFLICT",
      );
    }

    resetLegacyRuntime();
    const runtime = startRuntime(blueprint);
    return successResponse(
      {
        agent_id: runtime.agent_id,
        status: "running" as const,
        message: `${blueprint?.agent_name ?? "Agent"} deployed successfully inside NemoClaw.`,
      },
      {
        headers: {
          "set-cookie": "clawforge_completed=; Path=/; Max-Age=0; SameSite=Lax",
        },
      },
    );
  }

  // Agent action routes: /api/agents/:agentId/:action or /api/v1/clawforge/agents/:agentId/:action
  // Legacy: /api/agents/([^/]+)/([^/]+)(?:/([^/]+))? -> groups: [full, agentId, action, nested]
  // New:     (/api/v1/clawforge)?/agents/([^/]+)/([^/]+)(?:/([^/]+))? -> groups: [full, prefix, agentId, action, nested]
  const legacyAgentMatch = path.match(/^\/api\/agents\/([^/]+)\/([^/]+)(?:\/([^/]+))?$/);
  const newAgentMatch = path.match(
    /^(\/api\/v1\/clawforge)?\/agents\/([^/]+)\/([^/]+)(?:\/([^/]+))?$/,
  );

  if (legacyAgentMatch || newAgentMatch) {
    const match = legacyAgentMatch || newAgentMatch;
    if (!match) {
      return methodNotAllowedError();
    }
    // Extract agent ID and action from appropriate capture groups
    const agentId = legacyAgentMatch ? match[1] : match[2];
    const action = legacyAgentMatch ? match[2] : match[3];
    const nested = legacyAgentMatch ? match[3] : match[4];

    if (!isActiveRuntimeAgent(agentId) && !hydrateRuntimeForAgentId(agentId)) {
      return notFoundError("Agent");
    }

    // POST /api/agents/:id/start
    if (action === "start" && request.method === "POST") {
      const state = getRuntimeState();
      if (state === "running" || state === "waiting_for_approval") {
        return errorResponse(`Agent is already ${state}.`, 409, "CONFLICT");
      }
      return successResponse(startRuntime());
    }

    // POST /api/agents/:id/stop
    if (action === "stop" && request.method === "POST") {
      const state = getRuntimeState();
      if (state === "stopped" || state === "completed" || state === "created") {
        return errorResponse(`Agent is not running (current state: ${state}).`, 409, "CONFLICT");
      }
      try {
        return successResponse(stopRuntime());
      } catch (e) {
        return errorResponse(
          `Failed to stop agent: ${e instanceof Error ? e.message : String(e)}`,
          409,
          "CONFLICT",
        );
      }
    }

    // GET /api/agents/:id/logs/stream
    if (action === "logs" && nested === "stream" && request.method === "GET") {
      return sse(getRuntimeEvents());
    }

    // GET /api/agents/:id/memory
    if (action === "memory" && request.method === "GET") {
      return successResponse({
        agent_id: agentId,
        memory: getRuntimeMemory(),
      } satisfies Omit<AgentMemoryResponse, "ok">);
    }

    // GET /api/agents/:id/report
    if (action === "report" && request.method === "GET") {
      const report = getRuntimeReport();
      if (!report) {
        // Report genuinely unavailable - return 404, not fallback
        return notFoundError("Report");
      }
      return successResponse({
        agent_id: agentId,
        report: report,
      } satisfies Omit<AgentReportResponse, "ok">);
    }

    // GET /api/agents/:id/activity
    if (action === "activity" && request.method === "GET") {
      const url = new URL(request.url);
      const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 200);
      const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);

      const { events, totalCount } = getActivityEvents(agentId, { limit, offset });

      const summary = getActivitySummary(agentId);
      const hasMore = offset + events.length < totalCount;

      return successResponse({
        agent_id: agentId,
        events,
        total_count: totalCount,
        has_more: hasMore,
        next_offset: hasMore ? offset + limit : null,
        summary,
      });
    }

    // GET /api/agents/:id/activity/summary
    if (action === "activity" && nested === "summary" && request.method === "GET") {
      const summary = getActivitySummary(agentId);
      return successResponse({ agent_id: agentId, summary });
    }

    return methodNotAllowedError();
  }

  // POST /api/approvals/:id/decision or /api/v1/clawforge/approvals/:id/decision
  // Legacy: /api/approvals/([^/]+)/decision -> groups: [full, approvalId]
  // New:     (/api/v1/clawforge)?/approvals/([^/]+)/decision -> groups: [full, prefix, approvalId]
  const legacyApprovalMatch = path.match(/^\/api\/approvals\/([^/]+)\/decision$/);
  const newApprovalMatch = path.match(/^(\/api\/v1\/clawforge)?\/approvals\/([^/]+)\/decision$/);

  if ((legacyApprovalMatch || newApprovalMatch) && request.method === "POST") {
    const match = legacyApprovalMatch || newApprovalMatch;
    if (!match) {
      return methodNotAllowedError();
    }
    // Extract approval ID from appropriate capture groups
    const approvalId = legacyApprovalMatch ? match[1] : match[2];

    if (approvalId !== demoApproval.id) {
      return notFoundError("Approval");
    }

    const body = await readJsonBody<{ decision?: unknown }>(request);

    // Validate decision value - must be exactly "approved" or "denied"
    if (
      typeof body.decision !== "string" ||
      (body.decision !== "approved" && body.decision !== "denied")
    ) {
      return errorResponse(
        "Invalid decision value. Must be 'approved' or 'denied'.",
        400,
        "INVALID_REQUEST",
        "decision",
      );
    }

    // Check if approval is already resolved (idempotency)
    const existingStatus = getApprovalStatus();
    if (existingStatus !== "pending") {
      return errorResponse(
        `Approval already resolved (current status: ${existingStatus}).`,
        409,
        "CONFLICT",
      );
    }

    const decision = body.decision as "approved" | "denied";
    const result = resolveApproval(decision);

    return successResponse(
      {
        approval: {
          ...demoApproval,
          status: decision,
          resolved_at: new Date().toISOString(),
        },
        memory_item: result.memory_item,
        runtime_status: result.status,
        events: result.events,
        report: result.report,
      },
      {
        headers: {
          "set-cookie": "clawforge_completed=1; Path=/; Max-Age=3600; SameSite=Lax",
        },
      },
    );
  }

  // ============================================================
// Memory Gateway — /api/memory/*
//
// All memory operations are scope-isolated. user_id is derived
// from the server session and never accepted from the client.
// ============================================================

// GET /api/memory/health — no auth required
if (apiPath === "/api/memory/health" && request.method === "GET") {
  return handleMemoryHealth();
}

// POST /api/memory/search
if (apiPath === "/api/memory/search" && request.method === "POST") {
  const body = await readJsonBody<{
    query?: unknown;
    project_id?: unknown;
    agent_id?: unknown;
    type?: unknown;
    limit?: unknown;
  }>(request);
  return handleMemorySearch(body);
}

// POST /api/memory/add
if (apiPath === "/api/memory/add" && request.method === "POST") {
  const body = await readJsonBody<{
    project_id?: unknown;
    agent_id?: unknown;
    run_id?: unknown;
    workspace_id?: unknown;
    content?: unknown;
    type?: unknown;
  }>(request);
  return handleMemoryAdd(body);
}

// POST /api/memory/update
if (apiPath === "/api/memory/update" && request.method === "POST") {
  const body = await readJsonBody<{
    id?: unknown;
    content?: unknown;
    metadata?: unknown;
  }>(request);
  return handleMemoryUpdate(body);
}

// POST /api/memory/delete
if (apiPath === "/api/memory/delete" && request.method === "POST") {
  const body = await readJsonBody<{
    id?: unknown;
    project_id?: unknown;
  }>(request);
  return handleMemoryDelete(body);
}

// GET /api/memory/list
if (apiPath === "/api/memory/list" && request.method === "GET") {
  return handleMemoryList(url.searchParams);
}

return undefined;
}

// Re-export types for external consumption
export type {
  ProviderMode,
  BlueprintRequest,
  BlueprintApiResponse,
  DeployAgentRequest,
  DeployAgentResponse,
  MemoryResponse,
  RuntimeEvent,
  ApprovalDecisionRequest,
  ApprovalDecisionResponse,
  IncidentReportResponse,
} from "./types";
