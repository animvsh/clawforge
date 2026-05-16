import type { AgentRun, AgentRunInput } from "./types";
import { getCurrentUserId, getSupabaseClient } from "./supabaseClient";

function newId(): string {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// In-memory store for fallback mode
const _runs: Map<string, AgentRun> = new Map();

export async function saveAgentRun(input: AgentRunInput): Promise<AgentRun> {
  const client = getSupabaseClient();
  const userId = await getCurrentUserId();
  const now = new Date().toISOString();

  if (!client) {
    const run: AgentRun = {
      id: newId(),
      user_id: userId,
      ...input,
      started_at: now,
      created_at: now,
    };
    _runs.set(run.id, run);
    return run;
  }

  const { data, error } = await client
    .from("clawforge_runs")
    .insert({
      user_id: userId,
      agent_name: input.agent_name,
      agent_id: input.agent_id,
      blueprint_id: input.blueprint_id,
      provider: input.provider,
      model: input.model,
      status: input.status,
      metadata: input.metadata,
      started_at: now,
    })
    .select()
    .single();

  if (error) throw error;
  return data as AgentRun;
}

export async function getAgentRunByAgentId(agentId: string): Promise<AgentRun | null> {
  const client = getSupabaseClient();

  if (!client) {
    for (const run of _runs.values()) {
      if (run.agent_id === agentId) return run;
    }
    return null;
  }

  const { data, error } = await client.from("clawforge_runs").select().eq("agent_id", agentId).single();

  if (error) return null;
  return data as AgentRun;
}

export async function listAgentRunsByAgent(agentId: string): Promise<AgentRun[]> {
  const client = getSupabaseClient();

  if (!client) {
    return Array.from(_runs.values()).filter((r) => r.agent_id === agentId);
  }

  const { data, error } = await client
    .from("clawforge_runs")
    .select()
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false });

  if (error) return [];
  return (data as AgentRun[]) ?? [];
}

export async function updateAgentRun(
  id: string,
  input: Partial<Pick<AgentRun, "status" | "finished_at" | "metadata">>,
): Promise<AgentRun | null> {
  const client = getSupabaseClient();
  const now = new Date().toISOString();

  if (!client) {
    const existing = _runs.get(id);
    if (!existing) return null;
    const updated: AgentRun = {
      ...existing,
      status: input.status ?? existing.status,
      finished_at: input.finished_at ?? existing.finished_at,
      metadata: input.metadata ?? existing.metadata,
    };
    _runs.set(id, updated);
    return updated;
  }

  const { data, error } = await client
    .from("clawforge_runs")
    .update({
      status: input.status,
      finished_at: input.finished_at ?? now,
      metadata: input.metadata,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return null;
  return data as AgentRun;
}
