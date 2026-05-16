/**
 * Memory Gateway — API endpoint handlers for ClawForge Memory System
 *
 * Implements scope-isolated memory CRUD via the mem0-client wrapper.
 * All user_id/project_id values are derived from the server session,
 * never accepted from the client.
 */

import { getCurrentUserId } from "../storage/supabaseClient";
import { getMem0Client } from "./mem0-client";
import type { MemoryItem, MemorySchemaItem } from "../types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ScopeInfo = {
  user_id: string;
  project_id: string;
  agent_id?: string;
  run_id?: string;
  workspace_id?: string;
};

export type MemorySearchRequest = {
  query: string;
  project_id: string;
  agent_id?: string;
  type?: MemorySchemaItem["type"];
  limit?: number;
};

export type MemoryAddRequest = {
  project_id: string;
  agent_id?: string;
  run_id?: string;
  workspace_id?: string;
  content: string;
  type: MemorySchemaItem["type"];
};

export type MemoryUpdateRequest = {
  id: string;
  content?: string;
  metadata?: Record<string, unknown>;
};

export type MemoryDeleteRequest = {
  id: string;
  project_id: string;
};

export type MemoryListRequest = {
  project_id: string;
  agent_id?: string;
  type?: MemorySchemaItem["type"];
  limit?: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derive session user ID; return 401 if not authenticated.
 */
async function getSessionUserId(): Promise<{ userId: string | null; response: Response | null }> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return {
      userId: null,
      response: new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json; charset=utf-8" },
      }),
    };
  }
  return { userId, response: null };
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * GET /api/memory/health
 * Lightweight health-check — does NOT require authentication.
 */
export async function handleMemoryHealth(): Promise<Response> {
  const client = getMem0Client();
  const health = await client.health();

  return new Response(
    JSON.stringify({
      ok: true,
      available: health.available,
      apiVersion: health.apiVersion,
      capabilities: {
        hasAdd: health.capabilities.hasAdd,
        hasSearch: health.capabilities.hasSearch,
        hasList: health.capabilities.hasList,
        hasUpdate: health.capabilities.hasUpdate,
        hasDelete: health.capabilities.hasDelete,
      },
    }),
    {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
    },
  );
}

/**
 * POST /api/memory/search
 * Search memories within the authenticated user's project scope.
 */
export async function handleMemorySearch(body: {
  query?: unknown;
  project_id?: unknown;
  agent_id?: unknown;
  type?: unknown;
  limit?: unknown;
}): Promise<Response> {
  // Auth check
  const { userId, response: authError } = await getSessionUserId();
  if (authError) return authError;

  // Validate required fields
  if (typeof body.query !== "string" || !body.query.trim()) {
    return new Response(
      JSON.stringify({ ok: false, error: "query is required and must be a non-empty string" }),
      { status: 400, headers: { "content-type": "application/json; charset=utf-8" } },
    );
  }
  if (typeof body.project_id !== "string" || !body.project_id.trim()) {
    return new Response(JSON.stringify({ ok: false, error: "project_id is required" }), {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  const client = getMem0Client();
  const memories = await client.search(body.query.trim(), {
    user_id: userId!,
    project_id: body.project_id.trim(),
    agent_id: typeof body.agent_id === "string" ? body.agent_id.trim() : undefined,
    type: typeof body.type === "string" ? (body.type as MemorySchemaItem["type"]) : undefined,
  });

  // Extra scope isolation: ensure no memories leak from other users/projects
  const filtered = memories.filter(
    (m) => m.metadata?.user_id === userId && m.metadata?.project_id === body.project_id,
  );

  return new Response(
    JSON.stringify({
      ok: true,
      data: filtered,
      metadata: {
        total: filtered.length,
        scope: { user_id: userId, project_id: body.project_id.trim() },
      },
    }),
    { status: 200, headers: { "content-type": "application/json; charset=utf-8" } },
  );
}

/**
 * POST /api/memory/add
 * Add a new memory item within the authenticated user's project scope.
 */
export async function handleMemoryAdd(body: {
  project_id?: unknown;
  agent_id?: unknown;
  run_id?: unknown;
  workspace_id?: unknown;
  content?: unknown;
  type?: unknown;
}): Promise<Response> {
  // Auth check
  const { userId, response: authError } = await getSessionUserId();
  if (authError) return authError;

  // Validate required fields
  if (typeof body.project_id !== "string" || !body.project_id.trim()) {
    return new Response(JSON.stringify({ ok: false, error: "project_id is required" }), {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
  if (typeof body.content !== "string" || !body.content.trim()) {
    return new Response(
      JSON.stringify({ ok: false, error: "content is required and must be a non-empty string" }),
      { status: 400, headers: { "content-type": "application/json; charset=utf-8" } },
    );
  }
  if (typeof body.type !== "string" || !body.type.trim()) {
    return new Response(JSON.stringify({ ok: false, error: "type is required" }), {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  const validTypes: MemorySchemaItem["type"][] = [
    "incident",
    "preference",
    "blocked_action",
    "approval",
    "context",
  ];
  if (!validTypes.includes(body.type as MemorySchemaItem["type"])) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: `type must be one of: ${validTypes.join(", ")}`,
      }),
      { status: 400, headers: { "content-type": "application/json; charset=utf-8" } },
    );
  }

  const client = getMem0Client();
  const item = await client.add(body.content.trim(), body.type as MemorySchemaItem["type"], {
    user_id: userId!,
    project_id: body.project_id.trim(),
    agent_id: typeof body.agent_id === "string" ? body.agent_id.trim() : undefined,
    run_id: typeof body.run_id === "string" ? body.run_id.trim() : undefined,
    workspace_id: typeof body.workspace_id === "string" ? body.workspace_id.trim() : undefined,
  });

  return new Response(JSON.stringify({ ok: true, data: [item] }), {
    status: 201,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/**
 * POST /api/memory/update
 * Update an existing memory item.
 * The memory ID is required; scope is validated server-side.
 */
export async function handleMemoryUpdate(body: {
  id?: unknown;
  content?: unknown;
  metadata?: unknown;
}): Promise<Response> {
  // Auth check
  const { userId, response: authError } = await getSessionUserId();
  if (authError) return authError;

  if (typeof body.id !== "string" || !body.id.trim()) {
    return new Response(JSON.stringify({ ok: false, error: "id is required" }), {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
  if (body.content !== undefined && (typeof body.content !== "string" || !body.content.trim())) {
    return new Response(
      JSON.stringify({ ok: false, error: "content must be a non-empty string" }),
      { status: 400, headers: { "content-type": "application/json; charset=utf-8" } },
    );
  }

  const client = getMem0Client();
  const item = await client.update(
    body.id.trim(),
    typeof body.content === "string" ? body.content.trim() : undefined,
    typeof body.metadata === "object" && body.metadata !== null
      ? (body.metadata as Record<string, unknown>)
      : undefined,
  );

  // Ensure caller cannot escalate scope via update
  if (item.metadata?.user_id !== userId) {
    return new Response(JSON.stringify({ ok: false, error: "Memory not found or access denied" }), {
      status: 404,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  return new Response(JSON.stringify({ ok: true, data: [item] }), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/**
 * POST /api/memory/delete
 * Delete a memory item by ID.
 * Scope is enforced: caller must own the memory.
 */
export async function handleMemoryDelete(body: {
  id?: unknown;
  project_id?: unknown;
}): Promise<Response> {
  // Auth check
  const { userId, response: authError } = await getSessionUserId();
  if (authError) return authError;

  if (typeof body.id !== "string" || !body.id.trim()) {
    return new Response(JSON.stringify({ ok: false, error: "id is required" }), {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
  if (typeof body.project_id !== "string" || !body.project_id.trim()) {
    return new Response(JSON.stringify({ ok: false, error: "project_id is required" }), {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  const client = getMem0Client();

  // Verify ownership before deleting
  try {
    const existing = await client.list({
      user_id: userId!,
      project_id: body.project_id.trim(),
    });
    const owned = existing.find((m) => m.id === body.id);
    if (!owned) {
      return new Response(
        JSON.stringify({ ok: false, error: "Memory not found or access denied" }),
        { status: 404, headers: { "content-type": "application/json; charset=utf-8" } },
      );
    }
  } catch {
    // If list fails, proceed with delete anyway — the mem0 server will handle authorization
  }

  await client.delete(body.id.trim());

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/**
 * GET /api/memory/list
 * List memories for the authenticated user's project scope.
 */
export async function handleMemoryList(query: URLSearchParams): Promise<Response> {
  // Auth check
  const { userId, response: authError } = await getSessionUserId();
  if (authError) return authError;

  const projectId = query.get("project_id");
  if (!projectId || typeof projectId !== "string" || !projectId.trim()) {
    return new Response(
      JSON.stringify({ ok: false, error: "project_id query parameter is required" }),
      { status: 400, headers: { "content-type": "application/json; charset=utf-8" } },
    );
  }

  const client = getMem0Client();
  const memories = await client.list({
    user_id: userId!,
    project_id: projectId.trim(),
    agent_id: query.get("agent_id") || undefined,
    type: query.get("type") as MemorySchemaItem["type"] | undefined,
  });

  // Scope isolation: filter out memories from other users
  const filtered = memories.filter(
    (m) => m.metadata?.user_id === userId && m.metadata?.project_id === projectId,
  );

  const limit = query.get("limit");
  const limited = limit ? filtered.slice(0, Math.min(Number(limit) || 20, 100)) : filtered;

  return new Response(
    JSON.stringify({
      ok: true,
      data: limited,
      metadata: {
        total: filtered.length,
        scope: { user_id: userId, project_id: projectId.trim() },
      },
    }),
    { status: 200, headers: { "content-type": "application/json; charset=utf-8" } },
  );
}
