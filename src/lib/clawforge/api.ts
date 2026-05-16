import { DEMO_AGENT_ID, demoApproval, demoReport, createSentinelBlueprint } from "./fixtures";
import {
  getRuntimeEvents,
  getRuntimeMemory,
  getRuntimeReport,
  resolveApproval,
  startRuntime,
  stopRuntime,
} from "./runtime";
import { collectSandboxEvents, getPredeployRunResult, runPredeployCheck } from "./sandbox";
import type { AgentTemplateId, BlueprintResponse, ProviderMode } from "./types";

function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...init?.headers,
    },
  });
}

function errorResponse(message: string, status = 400): Response {
  return json({ ok: false, error: { message, status } }, { status });
}

function hasCompletedCookie(request: Request): boolean {
  return request.headers.get("cookie")?.includes("clawforge_completed=1") ?? false;
}

function getCompletedDemoReport() {
  return demoReport;
}

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.body) return {};
  const body = await request.json().catch(() => undefined);
  if (!body || Array.isArray(body) || typeof body !== "object") return {};
  return body as Record<string, unknown>;
}

function normalizeProvider(value: unknown): ProviderMode {
  return value === "nemotron" || value === "minimax" || value === "mock" || value === "auto"
    ? value
    : "auto";
}

function normalizeTemplate(value: unknown): AgentTemplateId {
  return value === "github_triage" ||
    value === "inbox_approval" ||
    value === "research_sandbox" ||
    value === "incident_response"
    ? value
    : "incident_response";
}

function templateFromBlueprintId(value: unknown): AgentTemplateId {
  if (value === "bp_github_triage_demo") return "github_triage";
  if (value === "bp_inbox_approval_demo") return "inbox_approval";
  if (value === "bp_research_sandbox_demo") return "research_sandbox";
  return "incident_response";
}

function createBlueprintForRequest(body: Record<string, unknown>): BlueprintResponse {
  const template =
    typeof body.template_id === "string"
      ? normalizeTemplate(body.template_id)
      : templateFromBlueprintId(body.blueprint_id);
  return createSentinelBlueprint(normalizeProvider(body.provider), template);
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

export async function handleClawForgeApi(request: Request): Promise<Response | undefined> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === "/api/blueprints" && request.method === "POST") {
    const body = await readJsonBody(request);
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) return errorResponse("Prompt is required.");

    return json({
      ok: true,
      blueprint: createSentinelBlueprint(
        normalizeProvider(body.provider),
        normalizeTemplate(body.template_id),
      ),
    });
  }

  if (path === "/api/clawforge/agents/predeploy-test" && request.method === "POST") {
    const body = await readJsonBody(request);
    const scenario =
      body.scenario === "raw_export" ||
      body.scenario === "policy_tamper" ||
      body.scenario === "timeout"
        ? body.scenario
        : "happy_path";
    const result = runPredeployCheck(createBlueprintForRequest(body), scenario);
    return json({ ok: true, predeploy: result });
  }

  const predeployEventsMatch = path.match(/^\/api\/clawforge\/predeploy-runs\/([^/]+)\/events$/);
  if (predeployEventsMatch && request.method === "GET") {
    const [, runId] = predeployEventsMatch;
    return json({ ok: true, run_id: runId, events: collectSandboxEvents(runId) });
  }

  const predeployReportMatch = path.match(/^\/api\/clawforge\/predeploy-runs\/([^/]+)\/report$/);
  if (predeployReportMatch && request.method === "GET") {
    const [, runId] = predeployReportMatch;
    const result = getPredeployRunResult(runId);
    if (!result) return errorResponse("Unknown predeploy run.", 404);
    return json({ ok: true, run_id: runId, report: result.report, predeploy: result });
  }

  if (path === "/api/agents/deploy" && request.method === "POST") {
    const body = await readJsonBody(request);
    const blueprintId = typeof body.blueprint_id === "string" ? body.blueprint_id : "";
    if (!blueprintId.startsWith("bp_") || !blueprintId.endsWith("_demo")) {
      return errorResponse("Known demo blueprint_id is required.", 400);
    }
    const existingPredeploy =
      typeof body.predeploy_run_id === "string"
        ? getPredeployRunResult(body.predeploy_run_id)
        : undefined;
    const predeploy =
      existingPredeploy ??
      runPredeployCheck(createSentinelBlueprint("mock", templateFromBlueprintId(blueprintId)));
    if (!predeploy.deploymentAllowed) {
      return errorResponse(`Predeploy sandbox blocked deployment: ${predeploy.report}`, 409);
    }
    startRuntime();
    return json(
      {
        ok: true,
        agent_id: DEMO_AGENT_ID,
        status: "running",
        message: "Agent deployed successfully inside NemoClaw.",
      },
      {
        headers: {
          "set-cookie": "clawforge_completed=; Path=/; Max-Age=0; SameSite=Lax",
        },
      },
    );
  }

  const agentMatch = path.match(/^\/api\/agents\/([^/]+)\/([^/]+)(?:\/([^/]+))?$/);
  if (agentMatch) {
    const [, agentId, action, nested] = agentMatch;
    if (agentId !== DEMO_AGENT_ID) return errorResponse("Unknown demo agent.", 404);

    if (action === "start" && request.method === "POST") {
      return json({ ok: true, ...startRuntime() });
    }

    if (action === "stop" && request.method === "POST") {
      return json({ ok: true, ...stopRuntime() });
    }

    if (action === "logs" && nested === "stream" && request.method === "GET") {
      return sse(getRuntimeEvents());
    }

    if (action === "memory" && request.method === "GET") {
      return json({ ok: true, agent_id: agentId, memory: getRuntimeMemory() });
    }

    if (action === "report" && request.method === "GET") {
      const report = getRuntimeReport();
      if (!report && !hasCompletedCookie(request)) {
        return errorResponse("Report is not ready until the workflow completes.", 409);
      }
      return json({ ok: true, agent_id: agentId, report: report ?? getCompletedDemoReport() });
    }
  }

  const approvalMatch = path.match(/^\/api\/approvals\/([^/]+)\/decision$/);
  if (approvalMatch && request.method === "POST") {
    const [, approvalId] = approvalMatch;
    if (approvalId !== demoApproval.id) return errorResponse("Unknown approval request.", 404);

    const body = await readJsonBody(request);
    const decision = body.decision === "approved" ? "approved" : "denied";
    const result = resolveApproval(decision);

    return json(
      {
        ok: true,
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

  return undefined;
}
