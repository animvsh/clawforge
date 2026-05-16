import { readRuntimeSnapshot, writeRuntimeSnapshot } from "./storage";
import type { MemoryItem } from "./types";

export async function listMemory(): Promise<MemoryItem[]> {
  return (await readRuntimeSnapshot()).memory;
}

export async function createApprovalMemory(content: string): Promise<MemoryItem> {
  const snapshot = await readRuntimeSnapshot();
  const item: MemoryItem = {
    agent_id: snapshot.agent_id,
    type: "approval",
    id: `memory_approval_${Date.now()}`,
    content,
    created_at: new Date().toISOString(),
  };
  snapshot.memory.push(item);
  await writeRuntimeSnapshot(snapshot);
  return item;
}
