/**
 * Memory type definitions for ClawForge memory system.
 *
 * These types define the shape of memory items used across the memory system,
 * including scope isolation fields and normalized response shapes.
 */

/**
 * Memory types supported by ClawForge.
 * Maps to Mem0's memory_type field but with ClawForge-specific taxonomy.
 */
export type MemoryType =
  | "preference"
  | "project_fact"
  | "agent_instruction"
  | "run_context"
  | "research_claim"
  | "source"
  | "decision"
  | "open_question";

/**
 * Who created the memory item.
 */
export type MemoryCreatedBy = "agent" | "user" | "system";

/**
 * Memory scope fields for multi-tenant isolation.
 * All operations require at least user_id and project_id.
 */
export type MemoryScope = {
  tenant_id?: string;
  user_id?: string;
  project_id?: string;
  agent_id?: string;
  run_id?: string;
  workspace_id?: string;
};

/**
 * Extended filters for memory queries.
 */
export type MemoryFilters = MemoryScope & {
  type?: MemoryType;
  created_by?: MemoryCreatedBy;
  created_after?: string;
  created_before?: string;
};

/**
 * Memory item metadata containing scope and provenance information.
 */
export type MemoryMetadata = {
  tenant_id?: string;
  user_id?: string;
  project_id?: string;
  agent_id?: string;
  run_id?: string;
  workspace_id?: string;
  source_url?: string;
  confidence?: number;
  created_by?: MemoryCreatedBy;
};

/**
 * Normalized memory item as returned by the ClawForge memory system.
 * This is the canonical shape for all memory operations.
 */
export type MemoryItem = {
  id: string;
  type: MemoryType;
  content: string;
  metadata: MemoryMetadata;
  created_at: string;
};

/**
 * Server capabilities discovered from Mem0 API.
 * Indicates which operations are available on the Mem0 server.
 */
export type ServerCapabilities = {
  hasHealth: boolean;
  hasAdd: boolean;
  hasSearch: boolean;
  hasList: boolean;
  hasUpdate: boolean;
  hasDelete: boolean;
  apiVersion?: string;
};

/**
 * Health check result from Mem0 server.
 */
export type HealthResult = {
  ok: boolean;
  available: boolean;
  apiVersion?: string;
  capabilities: ServerCapabilities;
};

/**
 * Options for adding a new memory.
 */
export type AddMemoryOptions = {
  content: string;
  type: MemoryType;
  metadata?: MemoryScope & Record<string, unknown>;
};

/**
 * Options for searching memories.
 */
export type SearchMemoryOptions = {
  query: string;
  filters?: MemoryFilters;
  limit?: number;
};

/**
 * Result of a memory search operation.
 */
export type SearchResult = {
  items: MemoryItem[];
  total: number;
};

/**
 * Error codes for memory operations.
 */
export enum MemoryErrorCode {
  VALIDATION_ERROR = "VALIDATION_ERROR",
  NOT_FOUND = "NOT_FOUND",
  UNAUTHORIZED = "UNAUTHORIZED",
  SERVER_ERROR = "SERVER_ERROR",
  NETWORK_ERROR = "NETWORK_ERROR",
  OPERATION_NOT_SUPPORTED = "OPERATION_NOT_SUPPORTED",
}

/**
 * Error class for memory operations.
 */
export class MemoryError extends Error {
  constructor(
    message: string,
    public code: MemoryErrorCode,
    public cause?: unknown
  ) {
    super(message);
    this.name = "MemoryError";
  }
}