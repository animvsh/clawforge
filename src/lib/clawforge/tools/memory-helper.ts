/**
 * Memory Helper Tool Broker for ClawForge
 *
 * Implements ToolBroker interface for agent-facing memory operations.
 * Routes memory.search, memory.add, memory.list, memory.delete actions
 * through the agent memory helper to the ClawForge Memory Gateway.
 */

import type {
  ToolBroker,
  ToolExecuteParams,
  ToolExecuteResult,
  ToolMetadata,
  ValidationResult,
} from "./broker";
import {
  createAgentMemoryHelper,
  type MemorySearchOptions,
  type MemoryListFilters,
  type MemoryMetadata,
  type MemoryType,
} from "../memory/agent-helper";

/**
 * Maps action names to memory helper method names.
 */
type MemoryAction = "memory.search" | "memory.add" | "memory.list" | "memory.delete";

/**
 * Expected parameter shapes for each memory action.
 */
interface MemorySearchParams {
  query: string;
  project_id: string;
  user_id?: string;
  agent_id?: string;
  run_id?: string;
  workspace_id?: string;
  type?: MemoryType;
  limit?: number;
}

interface MemoryAddParams {
  content: string;
  type: MemoryType;
  project_id: string;
  user_id?: string;
  agent_id?: string;
  run_id?: string;
  workspace_id?: string;
  source_url?: string;
  confidence?: number;
  created_by?: "agent" | "user" | "system";
}

interface MemoryListParams {
  project_id: string;
  user_id?: string;
  agent_id?: string;
  run_id?: string;
  workspace_id?: string;
  type?: MemoryType;
}

interface MemoryDeleteParams {
  memory_id: string;
}

type MemoryParams = MemorySearchParams | MemoryAddParams | MemoryListParams | MemoryDeleteParams;

/**
 * MemoryHelperTool - ToolBroker implementation for memory operations.
 *
 * Actions:
 *   - memory.search: Search memories with query and filters
 *   - memory.add: Add a new memory item
 *   - memory.list: List memories with optional filters
 *   - memory.delete: Delete a memory by ID
 *
 * Permission: allowed (read/write memory access)
 * Risk level: medium (writes to persistent storage)
 */
export class MemoryHelperTool implements ToolBroker {
  action = "memory.helper";

  // Lazy initialization - helper is created on first execute(), not at module import time.
  // This avoids failing at import time when CLAWFORGE_USER_ID is not set.
  private _helper: ReturnType<typeof createAgentMemoryHelper> | null = null;

  private getHelper(): ReturnType<typeof createAgentMemoryHelper> {
    if (!this._helper) {
      this._helper = createAgentMemoryHelper();
    }
    return this._helper;
  }

  async execute(params: ToolExecuteParams): Promise<ToolExecuteResult> {
    const helper = this.getHelper();
    const action = params.params["action"] as MemoryAction | undefined;
    const p = params.params["params"] as MemoryParams | undefined;

    if (!action || !p) {
      return {
        success: false,
        error: "Missing required 'action' and 'params' fields",
      };
    }

    try {
      switch (action) {
        case "memory.search": {
          const searchParams = p as MemorySearchParams;
          const results = await helper.search(searchParams.query, {
            project_id: searchParams.project_id,
            user_id: searchParams.user_id,
            agent_id: searchParams.agent_id,
            run_id: searchParams.run_id,
            workspace_id: searchParams.workspace_id,
            type: searchParams.type,
            limit: searchParams.limit,
          });
          return { success: true, data: results };
        }

        case "memory.add": {
          const addParams = p as MemoryAddParams;
          const metadata: MemoryMetadata = {
            project_id: addParams.project_id,
            user_id: addParams.user_id,
            agent_id: addParams.agent_id,
            run_id: addParams.run_id,
            workspace_id: addParams.workspace_id,
            source_url: addParams.source_url,
            confidence: addParams.confidence,
            created_by: addParams.created_by,
          };
          const result = await helper.add(addParams.content, addParams.type, metadata);
          return { success: true, data: result };
        }

        case "memory.list": {
          const listParams = p as MemoryListParams;
          const filters: MemoryListFilters = {
            project_id: listParams.project_id,
            user_id: listParams.user_id,
            agent_id: listParams.agent_id,
            run_id: listParams.run_id,
            workspace_id: listParams.workspace_id,
            type: listParams.type,
          };
          const results = await helper.list(filters);
          return { success: true, data: results };
        }

        case "memory.delete": {
          const deleteParams = p as MemoryDeleteParams;
          const deleted = await helper.delete(deleteParams.memory_id);
          return { success: true, data: { deleted } };
        }

        default:
          return {
            success: false,
            error: `Unknown memory action: ${action}. Valid actions: memory.search, memory.add, memory.list, memory.delete`,
          };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `[memory.helper] ${action} failed: ${message}`,
      };
    }
  }

  validate(params: Record<string, unknown>): ValidationResult {
    const errors: string[] = [];

    const action = params["action"] as string | undefined;
    const p = params["params"] as Record<string, unknown> | undefined;

    if (!action) {
      errors.push("Missing required parameter: action");
    } else {
      const validActions = ["memory.search", "memory.add", "memory.list", "memory.delete"];
      if (!validActions.includes(action)) {
        errors.push(`Invalid action '${action}'. Must be one of: ${validActions.join(", ")}`);
      }
    }

    if (!p || typeof p !== "object") {
      errors.push("Missing required parameter: params (must be an object)");
      return { valid: false, errors };
    }

    // Validate per-action parameters
    switch (action) {
      case "memory.search": {
        if (!(p as MemorySearchParams).query || typeof (p as MemorySearchParams).query !== "string") {
          errors.push("params.query is required and must be a string");
        }
        if (!(p as MemorySearchParams).project_id || typeof (p as MemorySearchParams).project_id !== "string") {
          errors.push("params.project_id is required and must be a string");
        }
        break;
      }

      case "memory.add": {
        if (!(p as MemoryAddParams).content || typeof (p as MemoryAddParams).content !== "string") {
          errors.push("params.content is required and must be a string");
        }
        if (!(p as MemoryAddParams).type || typeof (p as MemoryAddParams).type !== "string") {
          errors.push("params.type is required and must be a string");
        }
        if (!(p as MemoryAddParams).project_id || typeof (p as MemoryAddParams).project_id !== "string") {
          errors.push("params.project_id is required and must be a string");
        }
        break;
      }

      case "memory.list": {
        if (!(p as MemoryListParams).project_id || typeof (p as MemoryListParams).project_id !== "string") {
          errors.push("params.project_id is required and must be a string");
        }
        break;
      }

      case "memory.delete": {
        if (!(p as MemoryDeleteParams).memory_id || typeof (p as MemoryDeleteParams).memory_id !== "string") {
          errors.push("params.memory_id is required and must be a string");
        }
        break;
      }
    }

    return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
  }

  getMetadata(): ToolMetadata {
    return {
      id: "tool_memory_helper",
      name: "Memory Helper",
      action: "memory.helper",
      description:
        "Provides agent-facing memory operations via the ClawForge Memory Gateway. Supports search, add, list, and delete of memory items with automatic scope metadata attachment.",
      permission: "allowed",
      risk_level: "medium",
      enabled: true,
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["memory.search", "memory.add", "memory.list", "memory.delete"],
            description: "The memory operation to perform",
          },
          params: {
            type: "object",
            description: "Parameters for the memory operation",
          },
        },
        required: ["action", "params"],
      },
      outputSchema: {
        type: "object",
        properties: {
          success: { type: "boolean" },
          data: { type: "object" },
          error: { type: "string" },
        },
      },
    };
  }
}

export const memoryHelperTool = new MemoryHelperTool();