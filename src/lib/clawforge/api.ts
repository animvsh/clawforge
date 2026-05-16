import {
  DEMO_AGENT_ID,
  demoApproval,
  demoReport,
  createBlueprintFromPrompt,
  createSentinelBlueprint,
  createTemplateBlueprint,
  isKnownBlueprintId,
  templateById,
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
  resetRuntimeSystem,
} from "./runtime";
import {
  chatWithOpenHands,
  collectSandboxEvents,
  createBrevInstance,
  createBrevLaunchPlan,
  getBrevStatus,
  getPredeployRunResult,
  runPredeployCheck,
  runBrevCommand,
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
import { createPipedreamConnectToken, getPipedreamStatus } from "./integrations/pipedream";
import { createAgentMailInbox } from "./integrations/agentmail";
import { saveAgentRun, saveMemory } from "./storage";
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
  ToolDefinition,
  PolicyDefinition,
  WorkflowStep,
  MemorySchemaItem,
  CanvasGraph,
} from "./types";
import { z } from "zod";
import { buildBlueprintWorkflowGraph } from "./workflow-graph";
import {
  saveAgentRun,
  getAgentRun,
  getAgentRunByAgentId,
  updateAgentRun,
  listMemoryByAgent,
  listReportsByAgent,
} from "./storage";
import { createTemplateBlueprint } from "./fixtures";

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

// ---------------------------------------------------------------------------
// Zod schema for BlueprintResponse validation
// ---------------------------------------------------------------------------

const ToolDefinitionSchema: z.ZodType<ToolDefinition> = z.object({
  id: z.string(),
  name: z.string(),
  action: z.string(),
  purpose: z.string(),
  permission: z.enum(["allowed", "read_only", "approval_required", "blocked"]),
  risk_level: z.enum(["low", "medium", "high"]),
  enabled: z.boolean(),
});

const PolicyDefinitionSchema: z.ZodType<PolicyDefinition> = z.object({
  id: z.string(),
  name: z.string(),
  action: z.string(),
  effect: z.enum(["allow", "deny", "require_approval"]),
  reason: z.string(),
});

const WorkflowStepSchema: z.ZodType<WorkflowStep> = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  tool_id: z.string().optional(),
});

const MemorySchemaItemSchema: z.ZodType<MemorySchemaItem> = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["incident", "preference", "blocked_action", "approval", "context"]),
  description: z.string(),
});

const CanvasGraphSchema: z.ZodType<CanvasGraph> = z.object({
  nodes: z.array(z.object({
    id: z.string(),
    title: z.string(),
    subtitle: z.string().optional(),
    kind: z.enum(["input", "tool", "model", "policy", "approval", "memory", "output"]),
    status: z.enum(["idle", "generating", "ready", "running", "waiting", "blocked", "done"]).optional(),
    icon: z.string().optional(),
  })),
  edges: z.array(z.object({
    id: z.string(),
    sourceId: z.string(),
    targetId: z.string(),
    type: z.enum(["execution", "dependency"]).optional(),
  })),
});

const BlueprintResponseSchema = z.object({
  blueprint_id: z.string(),
  template_id: z.enum(["incident_response", "github_triage", "inbox_approval", "phone_receptionist", "research_sandbox"]),
  custom_goal: z.string(),
  agent_name: z.string(),
  description: z.string(),
  goal: z.string(),
  provider: z.enum(["auto", "nemotron", "minimax", "pi", "mock"]),
  model: z.string(),
  fallback_provider: z.union([z.enum(["minimax", "mock"]), z.null()]),
  runtime: z.enum(["openclaw"]),
  sandbox: z.enum(["nemoclaw"]),
  tools: z.array(ToolDefinitionSchema),
  policies: z.array(PolicyDefinitionSchema),
  integration_requirements: z.array(z.object({
    id: z.string(),
    label: z.string(),
    purpose: z.string(),
    status: z.enum(["required", "optional", "connected"]),
  })),
  memory_schema: z.array(MemorySchemaItemSchema),
  workflow_steps: z.array(WorkflowStepSchema),
  config_preview: z.string(),
  canvas_graph: CanvasGraphSchema.optional(),
  approval_gates: z.array(z.object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    description: z.string(),
  })).optional(),
  files_to_generate: z.array(z.string()).optional(),
  runtime_config: z.object({
    mode: z.enum(["openclaw", "direct"]),
    sandbox: z.enum(["nemoclaw", "brev", "local"]),
    runtime: z.string(),
  }).optional(),
});

// ---------------------------------------------------------------------------
// normalizeBlueprint
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Blueprint response normalization helpers
// ---------------------------------------------------------------------------

function normalizeWorkflowSteps(blueprintPlan: Record<string, unknown>): WorkflowStep[] {
  const stepArrays = [
    blueprintPlan.workflow_steps,
    (blueprintPlan as Record<string, unknown>).steps,
    (blueprintPlan as Record<string, unknown>).plan,
  ];
  for (const arr of stepArrays) {
    if (Array.isArray(arr)) {
      return arr
        .map((item, index): WorkflowStep | null => {
          if (typeof item === "string") {
            return { id: `step_${index}`, title: item, description: item };
          }
          if (item && typeof item === "object" && !Array.isArray(item)) {
            const rec = item as Record<string, unknown>;
            const title =
              typeof rec.title === "string"
              || typeof rec.name === "string"
              || typeof rec.step === "string"
              || typeof rec.action === "string"
              || typeof rec.description === "string"
              || typeof rec.task === "string"
              ? (rec.title ?? rec.name ?? rec.step ?? rec.action ?? rec.task ?? rec.description ?? `Step ${index + 1}`) as string
              : null;
            if (title) {
              return {
                id: typeof rec.id === "string" ? rec.id : `step_${index}`,
                title,
                description: typeof rec.description === "string" ? rec.description : title,
                tool_id: typeof rec.tool_id === "string" ? rec.tool_id : undefined,
              };
            }
          }
          return null;
        })
        .filter((step): step is WorkflowStep => step !== null);
    }
  }
  return [];
}

function deriveAgentName(prompt: string): string {
  const lower = prompt.toLowerCase();
  if (/phone|call|receptionist|voicemail|booking|calendar/.test(lower)) return "ReceptionClaw";
  if (/github|issue|repo|pull request|pr/.test(lower)) return "RepoClaw";
  if (/inbox|email|mail/.test(lower)) return "InboxClaw";
  if (/research|sources?|brief/.test(lower)) return "ResearchClaw";
  return "SentinelClaw";
}

function deriveTemplateId(prompt: string): AgentTemplateId {
  const lower = prompt.toLowerCase();
  if (/phone|call|receptionist|voicemail|booking|calendar/.test(lower)) return "phone_receptionist";
  if (/github|issue|repo|pull request|pr/.test(lower)) return "github_triage";
  if (/inbox|email|mail/.test(lower)) return "inbox_approval";
  if (/research|sources?|brief/.test(lower)) return "research_sandbox";
  return "incident_response";
}

export function normalizeBlueprint(
  raw: unknown,
  fallbackBlueprint: BlueprintResponse,
): BlueprintResponse {
  // Try strict Zod validation first
  const result = BlueprintResponseSchema.safeParse(raw);
  if (result.success) {
    const bp = result.data;
    // Ensure canvas_graph is always present
    if (!bp.canvas_graph) {
      bp.canvas_graph = buildBlueprintWorkflowGraph(bp.custom_goal || fallbackBlueprint.goal, bp as BlueprintResponse);
    }
    return bp as BlueprintResponse;
  }

  // Validation failed — log and fall back to template blueprint
  console.error("[normalizeBlueprint] Zod validation failed:", result.error.flatten());
  console.error("[normalizeBlueprint] Falling back to template blueprint.");

  // Attempt partial normalization on the raw object
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const partial = raw as Record<string, unknown>;
    // Build a normalized version using the fallback as base
    const normalized: BlueprintResponse = {
      ...fallbackBlueprint,
      blueprint_id: typeof partial.blueprint_id === "string" ? partial.blueprint_id : fallbackBlueprint.blueprint_id,
      agent_name: typeof partial.agent_name === "string" ? partial.agent_name : fallbackBlueprint.agent_name,
      description: typeof partial.description === "string" ? partial.description : fallbackBlueprint.description,
      goal: typeof partial.goal === "string" ? partial.goal : fallbackBlueprint.goal,
      custom_goal: typeof partial.custom_goal === "string" ? partial.custom_goal : fallbackBlueprint.custom_goal,
      model: typeof partial.model === "string" ? partial.model : fallbackBlueprint.model,
      provider: (["auto", "nemotron", "minimax", "pi", "mock"].includes(partial.provider as string))
        ? (partial.provider as ProviderMode)
        : fallbackBlueprint.provider,
      template_id: (["incident_response", "github_triage", "inbox_approval", "phone_receptionist", "research_sandbox"].includes(partial.template_id as string))
        ? (partial.template_id as AgentTemplateId)
        : fallbackBlueprint.template_id,
      tools: Array.isArray(partial.tools) ? partial.tools as ToolDefinition[] : fallbackBlueprint.tools,
      policies: Array.isArray(partial.policies) ? partial.policies as PolicyDefinition[] : fallbackBlueprint.policies,
      memory_schema: Array.isArray(partial.memory_schema) ? partial.memory_schema as MemorySchemaItem[] : fallbackBlueprint.memory_schema,
      workflow_steps: Array.isArray(partial.workflow_steps) ? partial.workflow_steps as WorkflowStep[] : fallbackBlueprint.workflow_steps,
      canvas_graph: (!partial.canvas_graph)
        ? buildBlueprintWorkflowGraph(
            (typeof partial.custom_goal === "string" ? partial.custom_goal : fallbackBlueprint.custom_goal) || fallbackBlueprint.goal,
            fallbackBlueprint,
          )
        : partial.canvas_graph as CanvasGraph,
      approval_gates: Array.isArray(partial.approval_gates)
        ? partial.approval_gates as { id: string; name: string; type: string; description: string }[]
        : [{
            id: "gate_human_approval",
            name: "Human Approval Gate",
            type: "human_approval",
            description: "Require human approval before executing high-risk actions.",
          }],
      files_to_generate: Array.isArray(partial.files_to_generate) ? partial.files_to_generate as string[] : ["agent.md"],
      runtime_config: (partial.runtime_config && typeof partial.runtime_config === "object")
        ? partial.runtime_config as { mode: "openclaw" | "direct"; sandbox: "nemoclaw" | "brev" | "local"; runtime: string }
        : { mode: "openclaw", sandbox: "nemoclaw", runtime: "openclaw" },
    };
    return normalized;
  }

  return fallbackBlueprint;
}

async function createProviderBackedBlueprint(
  provider: ProviderMode,
  prompt: string,
  workerEnv: Record<string, string | undefined> = {},
  modelOverride?: string,
) {
  const blueprint = createBlueprintFromPrompt(prompt, provider);
  if (provider === "mock") return blueprint;

  try {
    const modelProvider: ProviderMode = provider === "auto" ? "nemotron" : provider;
    const envOverrides = modelOverride
      ? providerModelEnvOverride(modelProvider, modelOverride)
      : {};
    const registry = createProviderRegistry({
      ...runtimeEnv(workerEnv),
      ...envOverrides,
    });
    const liveProvider = registry.getProvider(provider);
    if (liveProvider.mode === "mock") {
      return {
        ...blueprint,
        config_preview: providerFallbackConfig(blueprint.config_preview),
      };
    }

    const liveModel = liveProvider.model;
    const [blueprintPlan, rawSummary, classification] = await Promise.all([
      registry.planBlueprint({ prompt }, provider),
      registry.summarize({ prompt }, provider),
      registry.classify({ prompt }, provider),
    ]);
    const summary = cleanProviderSummary(rawSummary);

    // Merge provider blueprint with fallback blueprint, with provider taking precedence
    const providerWorkflowSteps = normalizeWorkflowSteps(blueprintPlan);
    const fallbackSteps = blueprint.workflow_steps.map((step) => step.title);
    const providerSteps =
      blueprint.template_id === "phone_receptionist"
        ? fallbackSteps
        : providerWorkflowSteps.length >= 4
          ? cleanProviderSteps(providerWorkflowSteps.map((s) => s.title), fallbackSteps)
          : fallbackSteps;

    const result: BlueprintResponse = {
      ...blueprint,
      provider: liveProvider.mode,
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
      ...(blueprintPlan.approval_gates && Array.isArray(blueprintPlan.approval_gates)
        ? { approval_gates: blueprintPlan.approval_gates as BlueprintResponse["approval_gates"] }
        : {}),
      ...(blueprintPlan.canvas_graph && typeof blueprintPlan.canvas_graph === "object"
        ? { canvas_graph: blueprintPlan.canvas_graph as BlueprintResponse["canvas_graph"] }
        : {}),
      ...(blueprintPlan.runtime_config && typeof blueprintPlan.runtime_config === "object"
        ? { runtime_config: blueprintPlan.runtime_config as BlueprintResponse["runtime_config"] }
        : {}),
      ...(blueprintPlan.files_to_generate && Array.isArray(blueprintPlan.files_to_generate)
        ? { files_to_generate: blueprintPlan.files_to_generate as string[] }
        : {}),
      config_preview: `${blueprint.config_preview}
provider_status: live
provider_classification: ${classification.label}
provider_severity: ${classification.severity}`,
    };
    return normalizeBlueprint(result, blueprint);
  } catch {
    return normalizeBlueprint(
      {
        ...blueprint,
        config_preview: providerFallbackConfig(blueprint.config_preview),
      },
      blueprint,
    );
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

/**
 * SSE streaming Response that yields events from an async generator.
 * Polls getRuntimeEvents() and any Brev sandbox events for the agent,
 * yielding new events as they arrive. Handles cleanup on client disconnect.
 * Closes after first poll if no events are yielded (allows testing with res.text()).
 */
async function* streamSseEvents(
  agentId: string,
  pollIntervalMs = 1000,
): AsyncGenerator<RuntimeEvent, void, unknown> {
  const startTime = Date.now();
  const seenIds = new Set<string>();
  let hasYieldedEvents = false;

  while (true) {
    // Collect new events from the runtime
    const events = getRuntimeEvents().filter((e) => {
      if (seenIds.has(e.id)) return false;
      seenIds.add(e.id);
      return true;
    });

    for (const event of events) {
      hasYieldedEvents = true;
      yield event;
    }

    // Also check if there's a Brev run for this agent with new events
    const run = await getAgentRunByAgentId(agentId);
    if (run?.metadata?.run_id) {
      const brevEvents = collectSandboxEvents(run.metadata.run_id as string).filter((e) => {
        if (seenIds.has(e.id)) return false;
        seenIds.add(e.id);
        return true;
      });
      for (const event of brevEvents) {
        hasYieldedEvents = true;
        yield { ...event, agent_id: agentId };
      }
    }

    // If this was the first poll and we yielded events, close the stream
    // (allows testing with res.text() which requires stream termination)
    if (hasYieldedEvents) {
      break;
    }

    // Safety timeout after 30 minutes
    if (Date.now() - startTime > 30 * 60 * 1000) {
      break;
    }

    // Poll interval
    await new Promise<void>((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}

function createSseStreamResponse(agentId: string): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of streamSseEvents(agentId)) {
          const chunk = encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
          controller.enqueue(chunk);
        }
      } catch {
        // Client disconnected or stream error
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      connection: "keep-alive",
      "x-accel-buffering": "no",
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
    const body = await readJsonBody<{ prompt?: unknown; provider?: unknown; model?: unknown }>(request);

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

    const modelOverride = typeof body.model === "string" && body.model.trim() ? body.model.trim() : undefined;

    return successResponse({
      blueprint: await createProviderBackedBlueprint(provider, prompt, workerEnv, modelOverride),
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
    (apiPath === "/api/clawforge/pipedream/status" || apiPath === "/clawforge/pipedream/status") &&
    request.method === "POST"
  ) {
    const body = await readJsonBody<{ blueprint?: unknown }>(request);
    const blueprint = isBlueprintResponse(body.blueprint) ? body.blueprint : undefined;
    return successResponse({
      pipedream: await getPipedreamStatus(workerEnv, blueprint?.integration_requirements ?? []),
    });
  }

  if (
    (apiPath === "/api/clawforge/pipedream/connect" ||
      apiPath === "/clawforge/pipedream/connect") &&
    request.method === "POST"
  ) {
    try {
      return successResponse({
        connect: await createPipedreamConnectToken(request.clone(), workerEnv),
      });
    } catch (error) {
      return errorResponse(
        error instanceof Error ? error.message : "Could not create tool connect link.",
        400,
        "INVALID_REQUEST",
      );
    }
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
        : "l40s-48gb.1x";
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
    const blueprint = isBlueprintResponse(body.blueprint) ? body.blueprint : undefined;
    if (blueprint) {
      await saveAgentRun({
        agent_name: blueprint.agent_name,
        agent_id: launch.integrationManifest.agent.id,
        blueprint_id: blueprint.blueprint_id,
        provider: blueprint.provider,
        model: blueprint.model,
        status:
          launch.mode === "created"
            ? "running"
            : launch.mode === "create_failed"
              ? "error"
              : "created",
        metadata: {
          runtime_target: "brev",
          instance_name: launch.instanceName,
          instance_type: instanceType,
          mode: launch.mode,
          command: launch.command,
          openhands: launch.openHands,
          integrations: launch.integrationManifest.integrations,
          startup_script: launch.startupScript,
        },
      }).catch(() => undefined);
      await saveMemory({
        agent_id: launch.integrationManifest.agent.id,
        type: "context",
        content: `Brev launch ${launch.mode} for ${launch.instanceName}. Runtime target: NemoClaw on Brev.`,
      }).catch(() => undefined);
    }
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

  if (
    (apiPath === "/api/clawforge/remote-chat" || apiPath === "/clawforge/remote-chat") &&
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
          CLAWFORGE_ALLOW_REMOTE_OPENHANDS: "0",
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
      provider?: unknown;
    }>(request);
    const blueprintId = typeof body.blueprint_id === "string" ? body.blueprint_id : "";

    if (!blueprintId) {
      return errorResponse("blueprint_id is required.", 400, "MISSING_FIELD", "blueprint_id");
    }

    if (!isKnownBlueprintId(blueprintId)) {
      return errorResponse("Known ClawForge blueprint_id is required.", 400, "INVALID_REQUEST");
    }

    // Derive template from blueprint_id by matching against known templates
    const templateEntry = Object.entries(templateById).find(
      ([, template]) => template.blueprint_id === blueprintId,
    );
    const templateId = (templateEntry?.[0] as AgentTemplateId) ?? "incident_response";

    const provider = normalizeProvider(body.provider) ?? "auto";
    const blueprint = createTemplateBlueprint(templateId, provider);

    const run = await saveAgentRun({
      agent_name: blueprint.agent_name,
      agent_id: `agent_${blueprint.template_id}_${blueprintId.slice(-8)}`,
      blueprint_id: blueprintId,
      provider,
      model: blueprint.model,
      status: "created",
      metadata: { template_id: blueprint.template_id },
    });

    return successResponse({
      agent_id: run.agent_id,
      status: "created" as const,
      message: `${blueprint.agent_name} ready to deploy. Call POST /agents/${run.agent_id}/start to launch.`,
    });
  }

  // GET /api/agents/:id/approvals — list pending approvals for an agent
  // Legacy: /api/agents/([^/]+)/approvals -> groups: [full, agentId]
  // New:     (/api/v1/clawforge)?/agents/([^/]+)/approvals -> groups: [full, prefix, agentId]
  const legacyApprovalsListMatch = path.match(/^\/api\/agents\/([^/]+)\/approvals$/);
  const newApprovalsListMatch = path.match(/^(\/api\/v1\/clawforge)?\/agents\/([^/]+)\/approvals$/);

  if (legacyApprovalsListMatch || newApprovalsListMatch) {
    const match = legacyApprovalsListMatch || newApprovalsListMatch;
    if (!match) {
      return methodNotAllowedError();
    }
    const agentId = legacyApprovalsListMatch ? match[1] : match[2];

    if (!isActiveRuntimeAgent(agentId) && !hydrateRuntimeForAgentId(agentId)) {
      return notFoundError("Agent");
    }

    if (request.method === "GET") {
      const pendingApproval = getPendingApproval();
      // Only return approvals that belong to this agent and are pending
      const pending =
        pendingApproval && pendingApproval.agent_id === agentId && pendingApproval.status === "pending"
          ? [pendingApproval]
          : [];

      return successResponse({
        agent_id: agentId,
        approvals: pending,
      });
    }

    // POST /api/agents/:id/approvals — create an approval request record
    if (request.method === "POST") {
      const body = await readJsonBody<{
        action?: unknown;
        command?: unknown;
        reason?: unknown;
        policy_id?: unknown;
      }>(request);

      if (typeof body.action !== "string" || !body.action.trim()) {
        return errorResponse("action is required and must be a non-empty string.", 400, "MISSING_FIELD", "action");
      }
      if (typeof body.reason !== "string" || !body.reason.trim()) {
        return errorResponse("reason is required and must be a non-empty string.", 400, "MISSING_FIELD", "reason");
      }
      if (typeof body.policy_id !== "string") {
        return errorResponse("policy_id is required and must be a string.", 400, "MISSING_FIELD", "policy_id");
      }

      const approval: import("./types").ApprovalRequest = {
        id: `approval_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        agent_id: agentId,
        action: body.action.trim(),
        command: typeof body.command === "string" ? body.command : undefined,
        reason: body.reason.trim(),
        policy_id: body.policy_id,
        status: "pending",
        created_at: new Date().toISOString(),
      };

      return successResponse({ approval });
    }

    return methodNotAllowedError();
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

    // POST /api/agents/:agentId/start
    if (action === "start" && request.method === "POST") {
      const run = await getAgentRunByAgentId(agentId);
      if (!run) {
        return notFoundError("Agent");
      }
      if (run.status === "running") {
        return errorResponse("Agent is already running.", 409, "CONFLICT");
      }

      // Get the blueprint for this run
      const blueprint = createTemplateBlueprint(
        (run.metadata?.template_id as BlueprintResponse["template_id"]) ?? "incident_response",
        (run.provider as ProviderMode) ?? "auto",
      );

      // Launch the Brev instance
      const brevPlan = await createBrevInstance(`clawforge-${agentId.slice(-8)}`, "verda_L40S", true, {
        blueprint,
      });

      await updateAgentRun(agentId, {
        status: "running",
        metadata: {
          ...run.metadata,
          instance_name: brevPlan.instanceName,
          brev_mode: brevPlan.mode,
        },
      });

      return successResponse({
        status: "running" as const,
        instance_id: brevPlan.instanceName,
        message: brevPlan.ok
          ? `Agent ${agentId} started in NemoClaw sandbox.`
          : `Agent ${agentId} start initiated; Brev instance creation is ${brevPlan.mode}.`,
      });
    }

    // POST /api/agents/:agentId/stop
    if (action === "stop" && request.method === "POST") {
      const run = await getAgentRunByAgentId(agentId);
      if (!run) {
        return notFoundError("Agent");
      }
      if (run.status === "stopped" || run.status === "completed") {
        return errorResponse(`Agent is not running (current state: ${run.status}).`, 409, "CONFLICT");
      }

      // Get Brev CLI and stop the instance
      const instanceName = (run.metadata?.instance_name as string | undefined) ?? `clawforge-${agentId.slice(-8)}`;
      const brevStatus = await getBrevStatus();
      if (brevStatus.ok && brevStatus.cliPath) {
        await runBrevCommand(brevStatus.cliPath, ["delete", instanceName, "--yes"], 30_000);
      }

      await updateAgentRun(agentId, {
        status: "stopped",
        metadata: { ...run.metadata, instance_name: instanceName },
      });

      return successResponse({ status: "stopped" as const });
    }

    // GET /api/agents/:id/logs/stream
    if (action === "logs" && nested === "stream" && request.method === "GET") {
      return createSseStreamResponse(agentId);
    }

    // GET /api/agents/:id/memory
    if (action === "memory" && request.method === "GET") {
      // First check in-memory runtime memory
      const runtimeMemory = getRuntimeMemory();
      const storedMemories = await listMemoryByAgent(agentId);
      // Merge runtime memory with stored memories, deduping by id
      const memoryMap = new Map<string, (typeof runtimeMemory)[0]>();
      for (const m of runtimeMemory) memoryMap.set(m.id, m);
      for (const m of storedMemories) {
        if (!memoryMap.has(m.id)) {
          memoryMap.set(m.id, {
            id: m.id,
            agent_id: m.agent_id,
            type: m.type,
            content: m.content,
            created_at: m.created_at,
          });
        }
      }
      const memory = Array.from(memoryMap.values());
      return successResponse({
        agent_id: agentId,
        memory,
      } satisfies Omit<AgentMemoryResponse, "ok">);
    }

    // GET /api/agents/:id/report
    if (action === "report" && request.method === "GET") {
      // First check in-memory runtime report
      let report = getRuntimeReport();
      // Fall back to most recent stored report for this agent
      if (!report) {
        const storedReports = await listReportsByAgent(agentId);
        const latest = storedReports[0] ?? null;
        if (latest) {
          // Build a minimal IncidentReport from stored data
          report = {
            id: latest.id,
            agent_id: latest.agent_id,
            title: latest.title,
            severity: latest.severity,
            detected_behavior: latest.detected_behavior,
            classification: "See report details",
            model_used: "NemoClaw",
            runtime: "NemoClaw",
            policy_triggered: "See approval decisions",
            action_attempted: latest.actions_attempted.join("; "),
            user_decision: "See approval decisions",
            final_action: latest.recommended_action,
            memory_update: latest.memory_updates.join("; "),
            safety_result: "Report retrieved from storage",
            likely_threat: latest.likely_threat,
            mitre_mapping: latest.mitre_mapping,
            evidence: latest.evidence,
            recommended_action: latest.recommended_action,
            actions_attempted: latest.actions_attempted,
            actions_blocked: latest.actions_blocked,
            approval_decisions: latest.approval_decisions,
            memory_updates: latest.memory_updates,
          };
        }
      }
      if (!report) {
        return notFoundError("Report");
      }
      return successResponse({
        agent_id: agentId,
        report,
      } satisfies Omit<AgentReportResponse, "ok">);
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

    // Find the approval record by ID
    const pendingApproval = getPendingApproval();
    const approval =
      pendingApproval && pendingApproval.id === approvalId ? pendingApproval : null;

    if (!approval) {
      // If no pending approval matches, check if it was already resolved (for demo approval)
      if (approvalId === demoApproval.id && getApprovalStatus() !== "pending") {
        return errorResponse(
          `Approval already resolved (current status: ${getApprovalStatus()}).`,
          409,
          "CONFLICT",
        );
      }
      return notFoundError("Approval");
    }

    if (approval.status !== "pending") {
      return errorResponse(
        `Approval already resolved (current status: ${approval.status}).`,
        409,
        "CONFLICT",
      );
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

    const decision = body.decision as "approved" | "denied";
    const result = resolveApproval(decision);

    // Get the updated approval from runtime
    const updatedApproval = getPendingApproval() ?? {
      ...approval,
      status: decision,
      resolved_at: new Date().toISOString(),
    };

    return successResponse(
      {
        ok: true as const,
        approval: updatedApproval,
        memory_item: result.memory_item,
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
