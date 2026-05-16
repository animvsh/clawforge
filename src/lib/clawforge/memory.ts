import { demoMemory } from "./fixtures";
import type { MemoryItem, MemorySchemaItem } from "./types";

export type MemoryUpdate = {
  id: string;
  agent_id: string;
  type: MemorySchemaItem["type"];
  content: string;
  timestamp: string;
};

let memoryStore: MemoryItem[] = [...demoMemory];

export function listMemory(): MemoryItem[] {
  return memoryStore;
}

export function createMemoryItem(
  type: MemorySchemaItem["type"],
  content: string,
  agentId: string = "agent_sentinelclaw_demo",
): MemoryItem {
  const item: MemoryItem = {
    id: `memory_${type}_${Date.now()}`,
    agent_id: agentId,
    type,
    content,
    created_at: new Date().toISOString(),
  };
  memoryStore.push(item);
  return item;
}

export function createApprovalMemory(
  content: string,
  agentId: string = "agent_sentinelclaw_demo",
): MemoryItem {
  return createMemoryItem("approval", content, agentId);
}

export function createIncidentMemory(
  content: string,
  agentId: string = "agent_sentinelclaw_demo",
): MemoryItem {
  return createMemoryItem("incident", content, agentId);
}

export function createBlockedActionMemory(
  content: string,
  agentId: string = "agent_sentinelclaw_demo",
): MemoryItem {
  return createMemoryItem("blocked_action", content, agentId);
}

export function createContextMemory(
  content: string,
  agentId: string = "agent_sentinelclaw_demo",
): MemoryItem {
  return createMemoryItem("context", content, agentId);
}

export function createPreferenceMemory(
  content: string,
  agentId: string = "agent_sentinelclaw_demo",
): MemoryItem {
  return createMemoryItem("preference", content, agentId);
}

export function getMemoryByType(type: MemorySchemaItem["type"]): MemoryItem[] {
  return memoryStore.filter((item) => item.type === type);
}

export function clearMemory(): void {
  memoryStore = [];
}

export function resetMemory(): void {
  memoryStore = [...demoMemory];
}
