import { DEMO_AGENT_ID, demoApproval, createSentinelBlueprint } from "./fixtures";
import { createApprovalMemory, listMemory } from "./memory";
import { getIncidentReport } from "./reports";
import { getRuntimeEvents, startRuntime, stopRuntime } from "./runtime";
import type { ProviderMode } from "./types";

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
      blueprint: createSentinelBlueprint(normalizeProvider(body.provider)),
    });
  }

  if (path === "/api/agents/deploy" && request.method === "POST") {
    const body = await readJsonBody(request);
    if (body.blueprint_id !== "bp_sentinelclaw_demo") {
      return errorResponse("Known demo blueprint_id is required.", 400);
    }
    startRuntime();
    return json({
      ok: true,
      agent_id: DEMO_AGENT_ID,
      status: "running",
      message: "Agent deployed successfully inside NemoClaw.",
    });
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
      return json({ ok: true, agent_id: agentId, memory: listMemory() });
    }

    if (action === "report" && request.method === "GET") {
      return json({ ok: true, agent_id: agentId, report: getIncidentReport() });
    }
  }

  const approvalMatch = path.match(/^\/api\/approvals\/([^/]+)\/decision$/);
  if (approvalMatch && request.method === "POST") {
    const [, approvalId] = approvalMatch;
    if (approvalId !== demoApproval.id) return errorResponse("Unknown approval request.", 404);

    const body = await readJsonBody(request);
    const decision = body.decision === "approved" ? "approved" : "denied";

    return json({
      ok: true,
      approval: {
        ...demoApproval,
        status: decision,
        resolved_at: new Date().toISOString(),
      },
      memory_item: createApprovalMemory(
        decision === "approved"
          ? "User approved shell execution for 185.92.XX.XX."
          : "User denied shell execution for 185.92.XX.XX.",
      ),
    });
  }

  return undefined;
}
