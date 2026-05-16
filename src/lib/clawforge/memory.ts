import { demoMemory } from "./fixtures";
import type { MemoryItem } from "./types";

export function listMemory(): MemoryItem[] {
  return demoMemory;
}

export function createApprovalMemory(content: string): MemoryItem {
  return {
    ...demoMemory[1],
    id: `memory_approval_${Date.now()}`,
    content,
    created_at: new Date().toISOString(),
  };
}
