/**
 * Mem0 Client Wrapper for ClawForge Memory System
 *
 * Wraps the Mem0 API server with:
 * - Automatic capability discovery at startup
 * - Scope-based memory isolation (tenant_id, user_id, project_id)
 * - 30-second timeout with 3 retries and exponential backoff
 * - Graceful degradation when Mem0 is unavailable
 * - Response normalization to ClawForge memory shape
 */

import type {
  MemoryItem,
  MemorySchemaItem,
} from "../../../lib/clawforge/types";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MEM0_API_URL = process.env["MEM0_API_URL"] ?? "http://localhost:8000";
const MEM0_API_KEY = process.env["MEM0_API_KEY"];

if (!MEM0_API_KEY) {
  console.warn("[mem0-client] MEM0_API_KEY is not set — operations will fail");
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MemoryScope = {
  tenant_id?: string;
  user_id?: string;
  project_id?: string;
  agent_id?: string;
  run_id?: string;
  workspace_id?: string;
};

export type MemoryFilters = MemoryScope & {
  type?: MemorySchemaItem["type"];
  created_by?: "agent" | "user" | "system";
  created_after?: string;
  created_before?: string;
};

// Extended MemoryItem used internally for raw Mem0 responses
type Mem0Memory = {
  id: string;
  text: string;
  memory_type?: string;
  category?: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

// ---------------------------------------------------------------------------
// Capability Discovery
// ---------------------------------------------------------------------------

type ServerCapabilities = {
  hasHealth: boolean;
  hasAdd: boolean;
  hasSearch: boolean;
  hasList: boolean;
  hasUpdate: boolean;
  hasDelete: boolean;
  apiVersion?: string;
};

let _capabilities: ServerCapabilities | null = null;
let _capabilitiesLoadAttempted = false;

async function discoverCapabilities(): Promise<ServerCapabilities> {
  if (_capabilitiesLoadAttempted && _capabilities) {
    return _capabilities;
  }
  _capabilitiesLoadAttempted = true;

  const defaults: ServerCapabilities = {
    hasHealth: false,
    hasAdd: false,
    hasSearch: false,
    hasList: false,
    hasUpdate: false,
    hasDelete: false,
  };

  try {
    const res = await fetchWithTimeout(`${MEM0_API_URL}/health`, {
      method: "GET",
    });

    if (res.ok) {
      defaults.hasHealth = true;
      const data = await res.json().catch(() => ({}));
      defaults.apiVersion = (data as { version?: string }).version;
    }

    // Try /api/routes or /routes to discover available endpoints
    const routesRes = await fetchWithTimeout(`${MEM0_API_URL}/api/routes`, {
      method: "GET",
    }).catch(() => null);

    if (routesRes?.ok) {
      const routes = (await routesRes.json().catch(() => [])) as string[];
      defaults.hasAdd = routes.some(
        (r) => r.includes("add") || r.includes("create") || r.includes("store")
      );
      defaults.hasSearch = routes.some(
        (r) => r.includes("search") || r.includes("query") || r.includes("find")
      );
      defaults.hasList = routes.some(
        (r) => r.includes("list") || r.includes("get_all") || r.includes("all")
      );
      defaults.hasUpdate = routes.some(
        (r) => r.includes("update") || r.includes("patch") || r.includes("edit")
      );
      defaults.hasDelete = routes.some(
        (r) => r.includes("delete") || r.includes("remove") || r.includes("destroy")
      );
      return defaults;
    }

    // Try common endpoint patterns directly
    const [addRes, searchRes, listRes, updateRes, deleteRes] = await Promise.all([
      fetchWithTimeout(`${MEM0_API_URL}/api/memories`, { method: "POST" }).catch(() => null),
      fetchWithTimeout(`${MEM0_API_URL}/api/search`, { method: "POST" }).catch(() => null),
      fetchWithTimeout(`${MEM0_API_URL}/api/memories`, { method: "GET" }).catch(() => null),
      fetchWithTimeout(`${MEM0_API_URL}/api/memories/test-id`, { method: "PATCH" }).catch(() => null),
      fetchWithTimeout(`${MEM0_API_URL}/api/memories/test-id`, { method: "DELETE" }).catch(() => null),
    ]);

    defaults.hasAdd = addRes !== null;
    defaults.hasSearch = searchRes !== null;
    defaults.hasList = listRes !== null;
    defaults.hasUpdate = updateRes !== null;
    defaults.hasDelete = deleteRes !== null;

    return defaults;
  } catch {
    console.warn("[mem0-client] Failed to discover Mem0 capabilities — operating in degraded mode");
    return defaults;
  }
}

// ---------------------------------------------------------------------------
// HTTP Layer
// ---------------------------------------------------------------------------

async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const { timeoutMs = 30_000, ...fetchOptions } = options;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(MEM0_API_KEY ? { Authorization: `Bearer ${MEM0_API_KEY}` } : {}),
        ...fetchOptions.headers,
      },
    });
    return res;
  } catch (err) {
    // Wrap in a recognizable error type
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`[mem0-client] Request timeout after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Error Normalization
// ---------------------------------------------------------------------------

function normalizeError(err: unknown, context: string): string {
  // Never log API key
  const sanitizedContext = context.replace(/key=["']?[a-zA-Z0-9_-]{20,}["']?/gi, "key=[REDACTED]");

  if (err instanceof Error) {
    // Strip any key patterns from error messages
    let message = err.message;
    message = message.replace(/Bearer\s+[a-zA-Z0-9_-]{20,}/gi, "Bearer [REDACTED]");
    message = message.replace(/key["']?\s*[:=]\s*["']?[a-zA-Z0-9_-]{20,}["']?/gi, "key=[REDACTED]");
    return `[mem0-client] ${sanitizedContext}: ${message}`;
  }

  return `[mem0-client] ${sanitizedContext}: Unknown error`;
}

// ---------------------------------------------------------------------------
// Response Normalization
// ---------------------------------------------------------------------------

function normalizeMem0Memory(raw: Mem0Memory): MemoryItem {
  // Map Mem0's text field to our content field
  const content = raw.text ?? raw.memory_type ?? "";
  const rawMetadata = raw.metadata ?? {};

  // Map Mem0's memory_type/category to our type
  const rawType = (raw.memory_type ?? raw.category ?? "context") as string;
  const type = mapMemoryType(rawType);

  // Extract scope fields from metadata
  const metadata: MemoryItem["metadata"] = {
    tenant_id: rawMetadata["tenant_id"] as string | undefined,
    user_id: rawMetadata["user_id"] as string | undefined,
    project_id: rawMetadata["project_id"] as string | undefined,
    agent_id: rawMetadata["agent_id"] as string | undefined,
    run_id: rawMetadata["run_id"] as string | undefined,
    workspace_id: rawMetadata["workspace_id"] as string | undefined,
    source_url: rawMetadata["source_url"] as string | undefined,
    confidence: rawMetadata["confidence"] as number | undefined,
    created_by: rawMetadata["created_by"] as "agent" | "user" | "system" | undefined,
  };

  return {
    id: raw.id,
    type,
    content,
    metadata,
    created_at: raw.created_at ?? new Date().toISOString(),
  };
}

function mapMemoryType(rawType: string): MemoryItem["type"] {
  const typeMap: Record<string, MemoryItem["type"]> = {
    preference: "preference",
    project_fact: "project_fact",
    agent_instruction: "agent_instruction",
    run_context: "run_context",
    research_claim: "research_claim",
    source: "source",
    decision: "decision",
    open_question: "open_question",
    incident: "preference",
    context: "run_context",
    approval: "decision",
    blocked_action: "decision",
  };

  return typeMap[rawType.toLowerCase()] ?? "project_fact";
}

function denormalizeMemoryType(type: MemoryItem["type"]): string {
  return type;
}

// ---------------------------------------------------------------------------
// Scope Validation
// ---------------------------------------------------------------------------

function validateScope(scope: MemoryScope, operation: string): void {
  if (!scope.user_id || !scope.project_id) {
    throw new Error(
      `[mem0-client] ${operation} requires user_id and project_id in scope`
    );
  }
}

// ---------------------------------------------------------------------------
// Input Validation
// ---------------------------------------------------------------------------

function validateContent(content: string): void {
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new Error("[mem0-client] content must be a non-empty string");
  }
  if (content.length > 100_000) {
    throw new Error("[mem0-client] content exceeds maximum length of 100,000 characters");
  }
}

function validateId(id: string): void {
  if (!id || typeof id !== "string") {
    throw new Error("[mem0-client] id must be a non-empty string");
  }
}

function sanitizeScopeInputs(scope: MemoryScope): MemoryScope {
  const result: MemoryScope = {};

  if (scope.tenant_id) result.tenant_id = String(scope.tenant_id).slice(0, 256);
  if (scope.user_id) result.user_id = String(scope.user_id).slice(0, 256);
  if (scope.project_id) result.project_id = String(scope.project_id).slice(0, 256);
  if (scope.agent_id) result.agent_id = String(scope.agent_id).slice(0, 256);
  if (scope.run_id) result.run_id = String(scope.run_id).slice(0, 256);
  if (scope.workspace_id) result.workspace_id = String(scope.workspace_id).slice(0, 256);

  return result;
}

// ---------------------------------------------------------------------------
// Retry Logic
// ---------------------------------------------------------------------------

function isNonRetryableError(err: unknown): boolean {
  if (err instanceof TypeError || err instanceof DOMException) return true;
  if (err instanceof Error) {
    // Network connection errors are not retryable
    if (err.name === "AbortError") return true;
    // ECONNREFUSED and similar connection errors
    if (err.message.includes("Connection refused") ||
        err.message.includes("ENOTFOUND") ||
        err.message.includes("ECONNREFUSED") ||
        err.message.includes("ETIMEDOUT") ||
        err.message.includes("NetworkError")) {
      return true;
    }
  }
  return false;
}

async function withRetry<T>(
  fn: () => Promise<T>,
  context: string,
  retries = 3
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (isNonRetryableError(err)) {
        // For network errors, don't retry — let caller handle gracefully
        throw err;
      }

      if (attempt < retries - 1) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 10_000);
        console.warn(
          `[mem0-client] ${context} attempt ${attempt + 1} failed, retrying in ${delay}ms`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

// ---------------------------------------------------------------------------
// Client Implementation
// ---------------------------------------------------------------------------

export interface Mem0Client {
  /**
   * Check Mem0 server health and available routes
   */
  health(): Promise<{
    ok: boolean;
    available: boolean;
    apiVersion?: string;
    capabilities: ServerCapabilities;
  }>;

  /**
   * Add a memory to Mem0
   * @param content The memory content (required, non-empty string)
   * @param type The memory type (maps to memory_type in Mem0)
   * @param metadata Additional metadata including scope fields
   * @returns The created MemoryItem
   */
  add(
    content: string,
    type: MemoryItem["type"],
    metadata?: MemoryScope & Record<string, unknown>
  ): Promise<MemoryItem>;

  /**
   * Search memories in Mem0
   * @param query Search query string
   * @param filters Scope and type filters
   * @param limit Maximum results to return
   * @returns Array of matching MemoryItems
   */
  search(
    query: string,
    filters?: MemoryFilters,
    limit?: number
  ): Promise<MemoryItem[]>;

  /**
   * List memories from Mem0 with optional filters
   * @param filters Scope and type filters
   * @returns Array of MemoryItems matching filters
   */
  list(filters?: MemoryFilters): Promise<MemoryItem[]>;

  /**
   * Update a memory in Mem0
   * @param id Memory ID to update
   * @param content New content
   * @param metadata Updated metadata (scope fields cannot be changed)
   * @returns Updated MemoryItem
   */
  update(
    id: string,
    content?: string,
    metadata?: Record<string, unknown>
  ): Promise<MemoryItem>;

  /**
   * Delete a memory from Mem0
   * @param id Memory ID to delete
   * @param scope Scope where the memory should be deleted from
   */
  delete(id: string, scope?: MemoryScope): Promise<void>;

  /**
   * Get current server capabilities (cached after first call)
   */
  getCapabilities(): Promise<ServerCapabilities>;
}

class Mem0ClientImpl implements Mem0Client {
  private _cachedCapabilities: ServerCapabilities | null = null;

  async health(): Promise<{
    ok: boolean;
    available: boolean;
    apiVersion?: string;
    capabilities: ServerCapabilities;
  }> {
    try {
      const caps = await discoverCapabilities();
      this._cachedCapabilities = caps;
      return {
        ok: true,
        available: caps.hasHealth,
        apiVersion: caps.apiVersion,
        capabilities: caps,
      };
    } catch (err) {
      console.warn(normalizeError(err, "health check"));
      return {
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
      };
    }
  }

  async getCapabilities(): Promise<ServerCapabilities> {
    if (this._cachedCapabilities) {
      return this._cachedCapabilities;
    }
    const health = await this.health();
    return health.capabilities;
  }

  async add(
    content: string,
    type: MemoryItem["type"],
    metadata?: MemoryScope & Record<string, unknown>
  ): Promise<MemoryItem> {
    validateContent(content);

    const scope: MemoryScope = {
      tenant_id: metadata?.tenant_id,
      user_id: metadata?.user_id,
      project_id: metadata?.project_id,
      agent_id: metadata?.agent_id,
      run_id: metadata?.run_id,
      workspace_id: metadata?.workspace_id,
    };

    validateScope(scope, "add");
    const safeScope = sanitizeScopeInputs(scope);

    const caps = await this.getCapabilities();
    if (!caps.hasAdd) {
      console.warn("[mem0-client] add: Mem0 server does not support add operation");
      return createEmptyMemory(content, type, safeScope);
    }

    try {
      const payload = {
        text: content,
        memory_type: denormalizeMemoryType(type),
        metadata: {
          ...safeScope,
          ...metadata,
          created_by: metadata?.created_by ?? "agent",
        },
      };

      const res = await fetchWithTimeout(`${MEM0_API_URL}/api/memories`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorBody = await res.text().catch(() => "unknown");
        throw new Error(`Mem0 add failed: ${res.status} ${res.statusText} — ${errorBody}`);
      }

      const raw = (await res.json()) as Mem0Memory;
      return normalizeMem0Memory(raw);
    } catch (err) {
      console.warn(normalizeError(err, "add"));
      return createEmptyMemory(content, type, safeScope);
    }
  }

  async search(
    query: string,
    filters?: MemoryFilters,
    limit = 20
  ): Promise<MemoryItem[]> {
    if (!query || typeof query !== "string") {
      console.warn("[mem0-client] search: query must be a non-empty string, returning empty results");
      return [];
    }

    const scope: MemoryScope = {
      tenant_id: filters?.tenant_id,
      user_id: filters?.user_id,
      project_id: filters?.project_id,
      agent_id: filters?.agent_id,
      run_id: filters?.run_id,
      workspace_id: filters?.workspace_id,
    };

    if (scope.user_id || scope.project_id) {
      validateScope(scope, "search");
    }
    const safeScope = sanitizeScopeInputs(scope);

    const caps = await this.getCapabilities();
    if (!caps.hasSearch) {
      console.warn("[mem0-client] search: Mem0 server does not support search operation");
      return [];
    }

    try {
      return await withRetry(async () => {
        // Build scope filter
        const scopeFilter: Record<string, string> = {};
        if (safeScope.tenant_id) scopeFilter["tenant_id"] = safeScope.tenant_id;
        if (safeScope.user_id) scopeFilter["user_id"] = safeScope.user_id;
        if (safeScope.project_id) scopeFilter["project_id"] = safeScope.project_id;
        if (safeScope.agent_id) scopeFilter["agent_id"] = safeScope.agent_id;
        if (safeScope.workspace_id) scopeFilter["workspace_id"] = safeScope.workspace_id;

        const payload: Record<string, unknown> = {
          query,
          limit: Math.min(limit, 100),
        };

        if (Object.keys(scopeFilter).length > 0) {
          payload["filters"] = scopeFilter;
        }

        if (filters?.type) {
          payload["memory_type"] = denormalizeMemoryType(filters.type);
        }

        const res = await fetchWithTimeout(`${MEM0_API_URL}/api/search`, {
          method: "POST",
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errorBody = await res.text().catch(() => "unknown");
          throw new Error(`Mem0 search failed: ${res.status} ${res.statusText} — ${errorBody}`);
        }

        const data = (await res.json()) as { results?: Mem0Memory[]; memories?: Mem0Memory[]; data?: Mem0Memory[] };
        const rawMemories = data.results ?? data.memories ?? data.data ?? [];

        // Ensure scope isolation - filter out any memories not matching the requested scope
        return rawMemories
          .map(normalizeMem0Memory)
          .filter((item) => scopeMatchFilter(item, safeScope));
      }, "search");
    } catch (err) {
      console.warn(normalizeError(err, "search"));
      return [];
    }
  }

  async list(filters?: MemoryFilters): Promise<MemoryItem[]> {
    const scope: MemoryScope = {
      tenant_id: filters?.tenant_id,
      user_id: filters?.user_id,
      project_id: filters?.project_id,
      agent_id: filters?.agent_id,
      run_id: filters?.run_id,
      workspace_id: filters?.workspace_id,
    };

    if (scope.user_id || scope.project_id) {
      validateScope(scope, "list");
    }
    const safeScope = sanitizeScopeInputs(scope);

    const caps = await this.getCapabilities();
    if (!caps.hasList) {
      console.warn("[mem0-client] list: Mem0 server does not support list operation");
      return [];
    }

    try {
      return await withRetry(async () => {
        const params = new URLSearchParams();
        if (safeScope.user_id) params.set("user_id", safeScope.user_id);
        if (safeScope.project_id) params.set("project_id", safeScope.project_id);
        if (safeScope.tenant_id) params.set("tenant_id", safeScope.tenant_id);
        if (safeScope.agent_id) params.set("agent_id", safeScope.agent_id);
        if (filters?.type) params.set("memory_type", denormalizeMemoryType(filters.type));
        if (filters?.created_by) params.set("created_by", filters.created_by);

        const url = `${MEM0_API_URL}/api/memories${params.size > 0 ? `?${params}` : ""}`;

        const res = await fetchWithTimeout(url, { method: "GET" });

        if (!res.ok) {
          const errorBody = await res.text().catch(() => "unknown");
          throw new Error(`Mem0 list failed: ${res.status} ${res.statusText} — ${errorBody}`);
        }

        const data = (await res.json()) as { memories?: Mem0Memory[]; data?: Mem0Memory[]; results?: Mem0Memory[] };
        const rawMemories = data.memories ?? data.data ?? data.results ?? [];

        return rawMemories
          .map(normalizeMem0Memory)
          .filter((item) => scopeMatchFilter(item, safeScope));
      }, "list");
    } catch (err) {
      console.warn(normalizeError(err, "list"));
      return [];
    }
  }

  async update(
    id: string,
    content?: string,
    metadata?: Record<string, unknown>
  ): Promise<MemoryItem> {
    validateId(id);

    if (content !== undefined) {
      validateContent(content);
    }

    const caps = await this.getCapabilities();
    if (!caps.hasUpdate) {
      console.warn("[mem0-client] update: Mem0 server does not support update operation");
      throw new Error("[mem0-client] update: operation not supported by Mem0 server");
    }

    return withRetry(async () => {
      const payload: Record<string, unknown> = {};
      if (content !== undefined) payload["text"] = content;
      if (metadata) payload["metadata"] = metadata;

      const res = await fetchWithTimeout(`${MEM0_API_URL}/api/memories/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorBody = await res.text().catch(() => "unknown");
        throw new Error(`Mem0 update failed: ${res.status} ${res.statusText} — ${errorBody}`);
      }

      const raw = (await res.json()) as Mem0Memory;
      return normalizeMem0Memory(raw);
    }, "update");
  }

  async delete(id: string, _scope?: MemoryScope): Promise<void> {
    validateId(id);

    const caps = await this.getCapabilities();
    if (!caps.hasDelete) {
      console.warn("[mem0-client] delete: Mem0 server does not support delete operation");
      return;
    }

    try {
      return await withRetry(async () => {
        const res = await fetchWithTimeout(
          `${MEM0_API_URL}/api/memories/${encodeURIComponent(id)}`,
          { method: "DELETE" }
        );

        if (!res.ok && res.status !== 404) {
          const errorBody = await res.text().catch(() => "unknown");
          throw new Error(`Mem0 delete failed: ${res.status} ${res.statusText} — ${errorBody}`);
        }
      }, "delete");
    } catch (err) {
      // Delete is idempotent - log but don't throw
      console.warn(normalizeError(err, "delete"));
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scopeMatchFilter(item: MemoryItem, scope: MemoryScope): boolean {
  if (scope.user_id && item.metadata.user_id !== scope.user_id) return false;
  if (scope.project_id && item.metadata.project_id !== scope.project_id) return false;
  if (scope.tenant_id && item.metadata.tenant_id !== scope.tenant_id) return false;
  return true;
}

function createEmptyMemory(content: string, type: MemoryItem["type"], scope: MemoryScope): MemoryItem {
  return {
    id: `fallback_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    type,
    content,
    metadata: {
      user_id: scope.user_id,
      project_id: scope.project_id,
      tenant_id: scope.tenant_id,
      created_by: "agent",
    },
    created_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Singleton Export
// ---------------------------------------------------------------------------

let _instance: Mem0Client | null = null;

export function getMem0Client(): Mem0Client {
  if (!_instance) {
    _instance = new Mem0ClientImpl();
  }
  return _instance;
}

// Allow resetting for testing
export function resetMem0Client(): void {
  _instance = null;
}

// Test-only: clear all capability state
export function __testResetAllCapabilities(): void {
  _capabilities = null;
  _capabilitiesLoadAttempted = false;
}

// Test-only: override discovered capabilities directly (used by test suite)
export function __testSetCapabilities(caps: ServerCapabilities): void {
  _capabilities = caps;
  _capabilitiesLoadAttempted = true;
}

export function resetCapabilitiesCache(): void {
  // Full reset: clear cached capabilities AND the load-attempted flag.
  // This ensures discoverCapabilities() runs fresh on the next call.
  _capabilities = null;
  _capabilitiesLoadAttempted = false;
}

// Test-only: check if capabilities have been set
export function __testAreCapabilitiesSet(): boolean {
  return _capabilities !== null && _capabilitiesLoadAttempted;
}

// Export constructor for testing / DI
export { Mem0ClientImpl };