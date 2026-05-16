import type { StoredMemory, StoredMemoryInput } from "./types";
import { getCurrentUserId, getSupabaseClient } from "./supabaseClient";

function newId(): string {
  return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// In-memory store for fallback mode
const _memory: Map<string, StoredMemory> = new Map();

export async function saveMemory(input: StoredMemoryInput): Promise<StoredMemory> {
  const client = getSupabaseClient();
  const userId = await getCurrentUserId();
  const now = new Date().toISOString();

  if (!client) {
    const item: StoredMemory = {
      id: newId(),
      user_id: userId,
      ...input,
      created_at: now,
    };
    _memory.set(item.id, item);
    return item;
  }

  const { data, error } = await client
    .from("clawforge_memory")
    .insert({ user_id: userId, agent_id: input.agent_id, type: input.type, content: input.content })
    .select()
    .single();

  if (error) throw error;
  return data as StoredMemory;
}

export async function getMemory(id: string): Promise<StoredMemory | null> {
  const client = getSupabaseClient();

  if (!client) {
    return _memory.get(id) ?? null;
  }

  const { data, error } = await client.from("clawforge_memory").select().eq("id", id).single();

  if (error) return null;
  return data as StoredMemory;
}

export async function listMemoryByAgent(agentId: string): Promise<StoredMemory[]> {
  const client = getSupabaseClient();

  if (!client) {
    return Array.from(_memory.values()).filter((m) => m.agent_id === agentId);
  }

  const { data, error } = await client
    .from("clawforge_memory")
    .select()
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false });

  if (error) return [];
  return (data as StoredMemory[]) ?? [];
}
