/**
 * Tests for Memory Gateway handlers
 *
 * Tests authentication, request validation, scope isolation, and
 * correct delegation to the mem0-client.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  handleMemoryHealth,
  handleMemorySearch,
  handleMemoryAdd,
  handleMemoryUpdate,
  handleMemoryDelete,
  handleMemoryList,
} from "./gateway";
import type { MemoryItem } from "../types";

// ---------------------------------------------------------------------------
// Mock Dependencies
// ---------------------------------------------------------------------------

// Stable mock memory item factory
function makeMemory(overrides: Partial<MemoryItem> & { id: string }): MemoryItem {
  return {
    id: "mem_abc123",
    agent_id: "agent_001",
    type: "preference",
    content: "Test memory content",
    metadata: {},
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// Mock mem0 client
const mockMem0Client = {
  health: vi.fn(),
  add: vi.fn(),
  search: vi.fn(),
  list: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  getCapabilities: vi.fn(),
};

vi.mock("./mem0-client", () => ({
  getMem0Client: () => mockMem0Client,
}));

// Mock supabase client
const mockGetCurrentUserId = vi.fn();
vi.mock("../storage/supabaseClient", () => ({
  getCurrentUserId: () => mockGetCurrentUserId(),
}));

function resetMocks() {
  vi.clearAllMocks();
  mockGetCurrentUserId.mockResolvedValue(null);
  mockMem0Client.health.mockResolvedValue({
    ok: true,
    available: true,
    apiVersion: "1.0.0",
    capabilities: {
      hasHealth: true,
      hasAdd: true,
      hasSearch: true,
      hasList: true,
      hasUpdate: true,
      hasDelete: true,
    },
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function parseJsonResponse(response: Response): Promise<unknown> {
  return response.json();
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe("handleMemoryHealth", () => {
  beforeEach(resetMocks);
  afterEach(resetMocks);

  it("returns 200 with capabilities when Mem0 is available", async () => {
    mockMem0Client.health.mockResolvedValue({
      ok: true,
      available: true,
      apiVersion: "1.0.0",
      capabilities: {
        hasHealth: true,
        hasAdd: true,
        hasSearch: true,
        hasList: true,
        hasUpdate: true,
        hasDelete: true,
      },
    });

    const response = await handleMemoryHealth();
    expect(response.status).toBe(200);

    const body = (await parseJsonResponse(response)) as Record<string, unknown>;
    expect(body["ok"]).toBe(true);
    expect(body["available"]).toBe(true);
    expect(body["apiVersion"]).toBe("1.0.0");
  });

  it("returns available=false when Mem0 is unavailable", async () => {
    mockMem0Client.health.mockResolvedValue({
      ok: false,
      available: false,
      capabilities: {
        hasHealth: false,
        hasAdd: false,
        hasSearch: false,
        hasList: false,
        hasUpdate: false,
        hasDelete: false,
      },
    });

    const response = await handleMemoryHealth();
    const body = (await parseJsonResponse(response)) as Record<string, unknown>;
    expect(body["available"]).toBe(false);
  });
});

describe("handleMemorySearch", () => {
  beforeEach(resetMocks);
  afterEach(resetMocks);

  it("returns 401 when user is not authenticated", async () => {
    mockGetCurrentUserId.mockResolvedValue(null);

    const response = await handleMemorySearch({ query: "test", project_id: "proj1" });
    expect(response.status).toBe(401);
  });

  it("returns 400 when query is missing", async () => {
    mockGetCurrentUserId.mockResolvedValue("user1");

    const response = await handleMemorySearch({ project_id: "proj1" });
    expect(response.status).toBe(400);

    const body = (await parseJsonResponse(response)) as Record<string, unknown>;
    expect((body["error"] as string).toLowerCase()).toContain("query");
  });

  it("returns 400 when project_id is missing", async () => {
    mockGetCurrentUserId.mockResolvedValue("user1");

    const response = await handleMemorySearch({ query: "test" });
    expect(response.status).toBe(400);

    const body = (await parseJsonResponse(response)) as Record<string, unknown>;
    expect((body["error"] as string).toLowerCase()).toContain("project_id");
  });

  it("searches with correct scope and filters", async () => {
    mockGetCurrentUserId.mockResolvedValue("user1");
    mockMem0Client.search.mockResolvedValue([
      makeMemory({
        id: "mem_1",
        metadata: { user_id: "user1", project_id: "proj1" },
      }),
    ]);

    const response = await handleMemorySearch({
      query: "test query",
      project_id: "proj1",
      agent_id: "agent_001",
      type: "preference",
      limit: 10,
    });

    expect(response.status).toBe(200);
    expect(mockMem0Client.search).toHaveBeenCalledWith(
      "test query",
      expect.objectContaining({
        user_id: "user1",
        project_id: "proj1",
        agent_id: "agent_001",
        type: "preference",
      }),
    );
  });

  it("filters out memories from other users after mem0 returns results", async () => {
    mockGetCurrentUserId.mockResolvedValue("user1");
    // Mem0 returns memories from user1 and user2
    mockMem0Client.search.mockResolvedValue([
      makeMemory({ id: "mem_user1", metadata: { user_id: "user1", project_id: "proj1" } }),
      makeMemory({ id: "mem_user2", metadata: { user_id: "user2", project_id: "proj1" } }),
    ]);

    const response = await handleMemorySearch({ query: "test", project_id: "proj1" });
    const body = (await parseJsonResponse(response)) as Record<string, unknown>;
    const data = body["data"] as MemoryItem[];

    // Should only return user1's memory
    expect(data).toHaveLength(1);
    expect(data[0].metadata?.user_id).toBe("user1");
  });

  it("filters out memories from other projects after mem0 returns results", async () => {
    mockGetCurrentUserId.mockResolvedValue("user1");
    mockMem0Client.search.mockResolvedValue([
      makeMemory({ id: "mem_proj1", metadata: { user_id: "user1", project_id: "proj1" } }),
      makeMemory({ id: "mem_proj2", metadata: { user_id: "user1", project_id: "proj2" } }),
    ]);

    const response = await handleMemorySearch({ query: "test", project_id: "proj1" });
    const body = (await parseJsonResponse(response)) as Record<string, unknown>;
    const data = body["data"] as MemoryItem[];

    expect(data).toHaveLength(1);
    expect(data[0].metadata?.project_id).toBe("proj1");
  });

  it("includes scope metadata in response", async () => {
    mockGetCurrentUserId.mockResolvedValue("user1");
    mockMem0Client.search.mockResolvedValue([]);

    const response = await handleMemorySearch({ query: "test", project_id: "proj1" });
    const body = (await parseJsonResponse(response)) as Record<string, unknown>;

    const metadata = body["metadata"] as Record<string, unknown>;
    expect(metadata["scope"]).toEqual({ user_id: "user1", project_id: "proj1" });
  });
});

describe("handleMemoryAdd", () => {
  beforeEach(resetMocks);
  afterEach(resetMocks);

  it("returns 401 when user is not authenticated", async () => {
    mockGetCurrentUserId.mockResolvedValue(null);

    const response = await handleMemoryAdd({
      project_id: "proj1",
      content: "test content",
      type: "preference",
    });
    expect(response.status).toBe(401);
  });

  it("returns 400 when project_id is missing", async () => {
    mockGetCurrentUserId.mockResolvedValue("user1");

    const response = await handleMemoryAdd({
      content: "test content",
      type: "preference",
    });
    expect(response.status).toBe(400);

    const body = (await parseJsonResponse(response)) as Record<string, unknown>;
    expect((body["error"] as string).toLowerCase()).toContain("project_id");
  });

  it("returns 400 when content is missing", async () => {
    mockGetCurrentUserId.mockResolvedValue("user1");

    const response = await handleMemoryAdd({
      project_id: "proj1",
      type: "preference",
    });
    expect(response.status).toBe(400);

    const body = (await parseJsonResponse(response)) as Record<string, unknown>;
    expect((body["error"] as string).toLowerCase()).toContain("content");
  });

  it("returns 400 when type is invalid", async () => {
    mockGetCurrentUserId.mockResolvedValue("user1");

    const response = await handleMemoryAdd({
      project_id: "proj1",
      content: "test content",
      type: "invalid_type",
    });
    expect(response.status).toBe(400);

    const body = (await parseJsonResponse(response)) as Record<string, unknown>;
    expect((body["error"] as string).toLowerCase()).toContain("type");
  });

  it("creates memory with correct scope", async () => {
    mockGetCurrentUserId.mockResolvedValue("user1");
    const created = makeMemory({
      id: "mem_new",
      metadata: { user_id: "user1", project_id: "proj1" },
    });
    mockMem0Client.add.mockResolvedValue(created);

    const response = await handleMemoryAdd({
      project_id: "proj1",
      agent_id: "agent_001",
      run_id: "run_001",
      workspace_id: "ws_001",
      content: "test content",
      type: "preference",
    });

    expect(response.status).toBe(201);
    expect(mockMem0Client.add).toHaveBeenCalledWith(
      "test content",
      "preference",
      expect.objectContaining({
        user_id: "user1",
        project_id: "proj1",
        agent_id: "agent_001",
        run_id: "run_001",
        workspace_id: "ws_001",
      }),
    );
  });
});

describe("handleMemoryUpdate", () => {
  beforeEach(resetMocks);
  afterEach(resetMocks);

  it("returns 401 when user is not authenticated", async () => {
    mockGetCurrentUserId.mockResolvedValue(null);

    const response = await handleMemoryUpdate({ id: "mem_123", content: "updated" });
    expect(response.status).toBe(401);
  });

  it("returns 400 when id is missing", async () => {
    mockGetCurrentUserId.mockResolvedValue("user1");

    const response = await handleMemoryUpdate({ content: "updated" });
    expect(response.status).toBe(400);

    const body = (await parseJsonResponse(response)) as Record<string, unknown>;
    expect((body["error"] as string).toLowerCase()).toContain("id");
  });

  it("returns 400 when content is empty string", async () => {
    mockGetCurrentUserId.mockResolvedValue("user1");

    const response = await handleMemoryUpdate({ id: "mem_123", content: "   " });
    expect(response.status).toBe(400);
  });

  it("returns 404 when memory belongs to different user", async () => {
    mockGetCurrentUserId.mockResolvedValue("user1");
    mockMem0Client.update.mockResolvedValue(
      makeMemory({ id: "mem_123", metadata: { user_id: "other_user", project_id: "proj1" } }),
    );

    const response = await handleMemoryUpdate({ id: "mem_123", content: "updated" });
    expect(response.status).toBe(404);
  });

  it("updates memory when caller owns it", async () => {
    mockGetCurrentUserId.mockResolvedValue("user1");
    const updated = makeMemory({
      id: "mem_123",
      content: "updated content",
      metadata: { user_id: "user1", project_id: "proj1" },
    });
    mockMem0Client.update.mockResolvedValue(updated);

    const response = await handleMemoryUpdate({ id: "mem_123", content: "updated content" });
    expect(response.status).toBe(200);
  });
});

describe("handleMemoryDelete", () => {
  beforeEach(resetMocks);
  afterEach(resetMocks);

  it("returns 401 when user is not authenticated", async () => {
    mockGetCurrentUserId.mockResolvedValue(null);

    const response = await handleMemoryDelete({ id: "mem_123", project_id: "proj1" });
    expect(response.status).toBe(401);
  });

  it("returns 400 when id is missing", async () => {
    mockGetCurrentUserId.mockResolvedValue("user1");

    const response = await handleMemoryDelete({ project_id: "proj1" });
    expect(response.status).toBe(400);

    const body = (await parseJsonResponse(response)) as Record<string, unknown>;
    expect((body["error"] as string).toLowerCase()).toContain("id");
  });

  it("returns 400 when project_id is missing", async () => {
    mockGetCurrentUserId.mockResolvedValue("user1");

    const response = await handleMemoryDelete({ id: "mem_123" });
    expect(response.status).toBe(400);

    const body = (await parseJsonResponse(response)) as Record<string, unknown>;
    expect((body["error"] as string).toLowerCase()).toContain("project_id");
  });

  it("returns 404 when memory not found or not owned by user", async () => {
    mockGetCurrentUserId.mockResolvedValue("user1");
    mockMem0Client.list.mockResolvedValue([]); // empty = no ownership

    const response = await handleMemoryDelete({ id: "mem_123", project_id: "proj1" });
    expect(response.status).toBe(404);
  });

  it("deletes memory when user owns it", async () => {
    mockGetCurrentUserId.mockResolvedValue("user1");
    mockMem0Client.list.mockResolvedValue([
      makeMemory({ id: "mem_123", metadata: { user_id: "user1", project_id: "proj1" } }),
    ]);
    mockMem0Client.delete.mockResolvedValue(undefined);

    const response = await handleMemoryDelete({ id: "mem_123", project_id: "proj1" });
    expect(response.status).toBe(200);
    expect(mockMem0Client.delete).toHaveBeenCalledWith("mem_123");
  });
});

describe("handleMemoryList", () => {
  beforeEach(resetMocks);
  afterEach(resetMocks);

  it("returns 401 when user is not authenticated", async () => {
    mockGetCurrentUserId.mockResolvedValue(null);

    const params = new URLSearchParams({ project_id: "proj1" });
    const response = await handleMemoryList(params);
    expect(response.status).toBe(401);
  });

  it("returns 400 when project_id is missing", async () => {
    mockGetCurrentUserId.mockResolvedValue("user1");

    const params = new URLSearchParams();
    const response = await handleMemoryList(params);
    expect(response.status).toBe(400);

    const body = (await parseJsonResponse(response)) as Record<string, unknown>;
    expect((body["error"] as string).toLowerCase()).toContain("project_id");
  });

  it("lists memories with correct scope filters", async () => {
    mockGetCurrentUserId.mockResolvedValue("user1");
    mockMem0Client.list.mockResolvedValue([
      makeMemory({ id: "mem_1", metadata: { user_id: "user1", project_id: "proj1" } }),
    ]);

    const params = new URLSearchParams({ project_id: "proj1", agent_id: "agent_001" });
    const response = await handleMemoryList(params);

    expect(response.status).toBe(200);
    expect(mockMem0Client.list).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user1",
        project_id: "proj1",
        agent_id: "agent_001",
      }),
    );
  });

  it("filters out memories from other users", async () => {
    mockGetCurrentUserId.mockResolvedValue("user1");
    mockMem0Client.list.mockResolvedValue([
      makeMemory({ id: "mem_user1", metadata: { user_id: "user1", project_id: "proj1" } }),
      makeMemory({ id: "mem_other", metadata: { user_id: "other_user", project_id: "proj1" } }),
    ]);

    const params = new URLSearchParams({ project_id: "proj1" });
    const response = await handleMemoryList(params);
    const body = (await parseJsonResponse(response)) as Record<string, unknown>;
    const data = body["data"] as MemoryItem[];

    expect(data).toHaveLength(1);
    expect(data[0].metadata?.user_id).toBe("user1");
  });

  it("applies limit parameter", async () => {
    mockGetCurrentUserId.mockResolvedValue("user1");
    mockMem0Client.list.mockResolvedValue(
      Array.from({ length: 50 }, (_, i) =>
        makeMemory({ id: `mem_${i}`, metadata: { user_id: "user1", project_id: "proj1" } }),
      ),
    );

    const params = new URLSearchParams({ project_id: "proj1", limit: "5" });
    const response = await handleMemoryList(params);
    const body = (await parseJsonResponse(response)) as Record<string, unknown>;
    const data = body["data"] as MemoryItem[];

    expect(data).toHaveLength(5);
  });
});

describe("scope isolation — cross-user prevention", () => {
  beforeEach(resetMocks);
  afterEach(resetMocks);

  it("search cannot return memories from user B when called as user A", async () => {
    mockGetCurrentUserId.mockResolvedValue("user_a");
    mockMem0Client.search.mockResolvedValue([
      makeMemory({ id: "mem_a1", metadata: { user_id: "user_a", project_id: "proj1" } }),
      makeMemory({ id: "mem_b1", metadata: { user_id: "user_b", project_id: "proj1" } }),
    ]);

    const response = await handleMemorySearch({ query: "test", project_id: "proj1" });
    const body = (await parseJsonResponse(response)) as Record<string, unknown>;
    const data = body["data"] as MemoryItem[];

    // user_a should never see user_b's memory
    expect(data.every((m) => m.metadata?.user_id === "user_a")).toBe(true);
    expect(data.find((m) => m.id === "mem_b1")).toBeUndefined();
  });

  it("list cannot return memories from project B when called for project A", async () => {
    mockGetCurrentUserId.mockResolvedValue("user1");
    mockMem0Client.list.mockResolvedValue([
      makeMemory({ id: "mem_projA", metadata: { user_id: "user1", project_id: "projA" } }),
      makeMemory({ id: "mem_projB", metadata: { user_id: "user1", project_id: "projB" } }),
    ]);

    const params = new URLSearchParams({ project_id: "projA" });
    const response = await handleMemoryList(params);
    const body = (await parseJsonResponse(response)) as Record<string, unknown>;
    const data = body["data"] as MemoryItem[];

    // Should only see projA memories
    expect(data.every((m) => m.metadata?.project_id === "projA")).toBe(true);
    expect(data.find((m) => m.id === "mem_projB")).toBeUndefined();
  });
});
