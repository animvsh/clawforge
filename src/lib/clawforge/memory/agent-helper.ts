/**
 * Agent-facing Memory Helper for ClawForge
 *
 * Provides a high-level interface for agents to interact with the Memory Gateway.
 * - Calls ClawForge Memory Gateway (NOT raw Mem0)
 * - Uses internal user_id from auth context, not client-provided
 * - Attaches scope metadata automatically
 * - Returns normalized MemoryItem objects
 */

import { getMem0Client } from "./mem0-client";
import type { MemoryItem } from "../types";

export type MemoryType = "preference" | "project_fact" | "agent_instruction" | "run_context" | "research_claim" | "source" | "decision" | "open_question";

export interface MemorySearchOptions {
  project_id: string;
  user_id: string;
  agent_id?: string;
  run_id?: string;
  workspace_id?: string;
  type?: MemoryType;
  limit?: number;
}

export interface MemoryListFilters {
  project_id: string;
  user_id: string;
  agent_id?: string;
  run_id?: string;
  workspace_id?: string;
  type?: MemoryType;
}

export interface MemoryMetadata {
  tenant_id?: string;
  project_id: string;
  user_id: string;
  agent_id?: string;
  run_id?: string;
  workspace_id?: string;
  source_url?: string;
  confidence?: number;
  created_by?: "agent" | "user" | "system";
}

/**
 * Auth context for extracting internal user_id.
 * In production, this comes from the authenticated session/JWT.
 */
export interface AuthContext {
  user_id: string;
  tenant_id?: string;
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Gets the current auth context.
 * In production, this would extract user_id from the session/JWT.
 * For agent use, we require user_id to be injected via auth context.
 */
function getAuthContext(): AuthContext {
  // In production: extract from session/JWT
  // For now, require it to be set via environment or throw
  const user_id = process.env["CLAWFORGE_USER_ID"];
  if (!user_id) {
    throw new Error("[agent-helper] CLAWFORGE_USER_ID is not set — cannot determine internal user_id");
  }
  return {
    user_id,
    tenant_id: process.env["CLAWFORGE_TENANT_ID"],
  };
}

/**
 * Builds a MemoryItem from gateway response with attached scope metadata.
 */
function buildMemoryItem(
  id: string,
  content: string,
  type: MemoryType,
  metadata: MemoryMetadata
): MemoryItem {
  return {
    id,
    content,
    type,
    metadata,
    created_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Memory Helper
// ---------------------------------------------------------------------------

export interface AgentMemoryHelper {
  search(query: string, options?: MemorySearchOptions): Promise<MemoryItem[]>;
  add(content: string, type: MemoryType, metadata?: MemoryMetadata): Promise<MemoryItem>;
  list(filters?: MemoryListFilters): Promise<MemoryItem[]>;
  delete(memoryId: string): Promise<boolean>;
}

/**
 * Creates an AgentMemoryHelper instance.
 * The helper uses the internal user_id from auth context, not client-provided.
 *
 * @param authContextOverride - Optional auth context override for testing
 */
export function createAgentMemoryHelper(
  authContextOverride?: AuthContext
): AgentMemoryHelper {
  const auth = authContextOverride ?? getAuthContext();
  const mem0 = getMem0Client();

  return {
    async search(
      query: string,
      options?: MemorySearchOptions
    ): Promise<MemoryItem[]> {
      if (!query || typeof query !== "string" || query.trim().length === 0) {
        throw new Error("[agent-helper] search requires a non-empty query string");
      }

      // Use client-provided project_id/user_id but override user_id with internal auth
      const filters = {
        project_id: options?.project_id ?? auth.user_id,
        user_id: auth.user_id, // Always use internal user_id, ignore client-provided
        agent_id: options?.agent_id,
        run_id: options?.run_id,
        workspace_id: options?.workspace_id,
        type: options?.type,
      };

      const limit = options?.limit ?? 20;

      const results = await mem0.search(query, filters, limit);

      // Normalize results to ensure metadata is properly attached
      return results.map((item) => ({
        ...item,
        metadata: {
          ...item.metadata,
          user_id: auth.user_id, // Ensure internal user_id is always set
          tenant_id: auth.tenant_id ?? item.metadata?.tenant_id,
        },
      }));
    },

    async add(
      content: string,
      type: MemoryType,
      metadata?: MemoryMetadata
    ): Promise<MemoryItem> {
      if (!content || typeof content !== "string" || content.trim().length === 0) {
        throw new Error("[agent-helper] add requires non-empty content string");
      }

      // Always use internal user_id from auth context
      const scopeMetadata: MemoryMetadata = {
        project_id: metadata?.project_id ?? auth.user_id,
        user_id: auth.user_id,
        tenant_id: auth.tenant_id,
        agent_id: metadata?.agent_id,
        run_id: metadata?.run_id,
        workspace_id: metadata?.workspace_id,
        source_url: metadata?.source_url,
        confidence: metadata?.confidence,
        created_by: metadata?.created_by ?? "agent",
      };

      const result = await mem0.add(content, type, scopeMetadata);

      return {
        ...result,
        metadata: {
          ...result.metadata,
          user_id: auth.user_id,
          tenant_id: auth.tenant_id ?? result.metadata?.tenant_id,
        },
      };
    },

    async list(filters?: MemoryListFilters): Promise<MemoryItem[]> {
      // Use client-provided filters but always override user_id with internal auth
      const listFilters = {
        project_id: filters?.project_id ?? auth.user_id,
        user_id: auth.user_id, // Always use internal user_id
        agent_id: filters?.agent_id,
        run_id: filters?.run_id,
        workspace_id: filters?.workspace_id,
        type: filters?.type,
      };

      const results = await mem0.list(listFilters);

      return results.map((item) => ({
        ...item,
        metadata: {
          ...item.metadata,
          user_id: auth.user_id,
          tenant_id: auth.tenant_id ?? item.metadata?.tenant_id,
        },
      }));
    },

    async delete(memoryId: string): Promise<boolean> {
      if (!memoryId || typeof memoryId !== "string" || memoryId.trim().length === 0) {
        throw new Error("[agent-helper] delete requires a valid memoryId string");
      }

      try {
        await mem0.delete(memoryId, {
          user_id: auth.user_id,
          project_id: auth.user_id,
        });
        return true;
      } catch (err) {
        console.error(`[agent-helper] delete failed for memory ${memoryId}:`, err);
        return false;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Singleton Export
// ---------------------------------------------------------------------------

let _helperInstance: AgentMemoryHelper | null = null;

export function getAgentMemoryHelper(): AgentMemoryHelper {
  if (!_helperInstance) {
    _helperInstance = createAgentMemoryHelper();
  }
  return _helperInstance;
}

export function resetAgentMemoryHelper(): void {
  _helperInstance = null;
}