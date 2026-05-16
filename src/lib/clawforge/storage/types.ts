import type { MemorySchemaItem, IncidentReport, MemoryItem } from "../types";

/**
 * User account record stored in Supabase.
 */
export interface Account {
  id: string;
  email: string;
  display_name?: string;
  created_at: string;
  updated_at: string;
}

export interface AccountInput {
  email: string;
  display_name?: string;
}

/**
 * An agent run record stored in Supabase.
 */
export interface AgentRun {
  id: string;
  agent_name: string;
  agent_id: string;
  blueprint_id: string;
  provider: string;
  model: string;
  status: "created" | "running" | "completed" | "stopped" | "error";
  started_at: string;
  finished_at?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface AgentRunInput {
  agent_name: string;
  agent_id: string;
  blueprint_id: string;
  provider: string;
  model: string;
  status: AgentRun["status"];
  metadata?: Record<string, unknown>;
}

/**
 * A stored memory item from the agent memory system.
 */
export interface StoredMemory {
  id: string;
  agent_id: string;
  type: MemorySchemaItem["type"];
  content: string;
  created_at: string;
}

export interface StoredMemoryInput {
  agent_id: string;
  type: MemorySchemaItem["type"];
  content: string;
}

/**
 * A stored incident report.
 */
export interface StoredReport {
  id: string;
  agent_id: string;
  title: string;
  severity: IncidentReport["severity"];
  detected_behavior: string;
  likely_threat: string;
  mitre_mapping: string;
  evidence: string[];
  recommended_action: string;
  actions_attempted: string[];
  actions_blocked: string[];
  approval_decisions: string[];
  memory_updates: string[];
  created_at: string;
}

export interface StoredReportInput {
  agent_id: string;
  title: string;
  severity: IncidentReport["severity"];
  detected_behavior: string;
  likely_threat: string;
  mitre_mapping: string;
  evidence: string[];
  recommended_action: string;
  actions_attempted: string[];
  actions_blocked: string[];
  approval_decisions: string[];
  memory_updates: string[];
}
