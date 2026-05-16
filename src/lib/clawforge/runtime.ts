import { DEMO_AGENT_ID, demoEvents } from "./fixtures";
import type { RuntimeEvent } from "./types";

export type RuntimeState = "created" | "running" | "waiting_for_approval" | "completed" | "stopped";

let state: RuntimeState = "created";

export function startRuntime(): { agent_id: string; status: RuntimeState } {
  state = "running";
  return { agent_id: DEMO_AGENT_ID, status: state };
}

export function stopRuntime(): { agent_id: string; status: RuntimeState } {
  state = "stopped";
  return { agent_id: DEMO_AGENT_ID, status: state };
}

export function getRuntimeEvents(): RuntimeEvent[] {
  return demoEvents;
}
