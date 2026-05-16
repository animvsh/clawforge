import type {
  ActivityEvent,
  ActivityEventType,
  ActivityEventSeverity,
  ActivityEventSummary,
  ActivityQueryFilters,
  PolicyEffect,
} from "./types";

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function now(): string {
  return new Date().toISOString();
}

// In-memory activity store keyed by agent_id
const activityStore: Map<string, ActivityEvent[]> = new Map();

// Session tracking for duration and state
const sessionTracker: Map<
  string,
  { started_at: string; last_event_at: string; states: Set<string> }
> = new Map();

export function createActivityEvent(
  agentId: string,
  type: ActivityEventType,
  message: string,
  severity: ActivityEventSeverity = "info",
  options?: {
    sessionId?: string;
    durationMs?: number;
    metadata?: Record<string, unknown>;
    toolExecution?: ActivityEvent["tool_execution"];
    policyCheck?: ActivityEvent["policy_check"];
    approvalWorkflow?: ActivityEvent["approval_workflow"];
    memoryOperation?: ActivityEvent["memory_operation"];
    agentThinking?: ActivityEvent["agent_thinking"];
  },
): ActivityEvent {
  return {
    id: generateId("act"),
    agent_id: agentId,
    session_id: options?.sessionId,
    type,
    message,
    timestamp: now(),
    severity,
    duration_ms: options?.durationMs,
    metadata: options?.metadata,
    tool_execution: options?.toolExecution,
    policy_check: options?.policyCheck,
    approval_workflow: options?.approvalWorkflow,
    memory_operation: options?.memoryOperation,
    agent_thinking: options?.agentThinking,
  };
}

export function appendActivityEvent(event: ActivityEvent): void {
  const existing = activityStore.get(event.agent_id) ?? [];
  existing.push(event);
  activityStore.set(event.agent_id, existing);
}

export function getActivityEvents(
  agentId: string,
  filters?: ActivityQueryFilters,
): { events: ActivityEvent[]; totalCount: number } {
  let events = activityStore.get(agentId) ?? [];

  if (filters) {
    if (filters.event_types?.length) {
      events = events.filter((e) => filters.event_types!.includes(e.type));
    }
    if (filters.severity?.length) {
      events = events.filter((e) => filters.severity!.includes(e.severity));
    }
    if (filters.tool_action) {
      events = events.filter(
        (e) => e.tool_execution?.action === filters.tool_action,
      );
    }
    if (filters.policy_id) {
      events = events.filter((e) => e.policy_check?.policy_id === filters.policy_id);
    }
    if (filters.from_timestamp) {
      events = events.filter((e) => e.timestamp >= filters.from_timestamp!);
    }
    if (filters.to_timestamp) {
      events = events.filter((e) => e.timestamp <= filters.to_timestamp!);
    }
  }

  const totalCount = events.length;

  // Apply pagination
  const limit = filters?.limit ?? 50;
  const offset = filters?.offset ?? 0;
  events = events.slice(offset, offset + limit);

  return { events, totalCount };
}

export function getActivitySummary(agentId: string): ActivityEventSummary {
  const events = activityStore.get(agentId) ?? [];

  const summary: ActivityEventSummary = {
    total_events: events.length,
    events_by_type: {} as Record<ActivityEventType, number>,
    events_by_severity: {} as Record<ActivityEventSeverity, number>,
    tool_call_counts: {},
    policy_blocked_count: 0,
    approval_requested_count: 0,
    approval_granted_count: 0,
    approval_denied_count: 0,
  };

  // Initialize all possible types to 0
  const allEventTypes: ActivityEventType[] = [
    "agent.started",
    "agent.thinking",
    "agent.resumed",
    "agent.paused",
    "tool.called",
    "tool.executed",
    "tool.blocked",
    "tool.pending_approval",
    "policy.checked",
    "policy.blocked",
    "policy.approved",
    "approval.requested",
    "approval.granted",
    "approval.denied",
    "memory.updated",
    "memory.retrieved",
    "report.generated",
    "report.viewed",
    "session.created",
    "session.deployed",
    "session.running",
    "session.waiting_for_approval",
    "session.completed",
    "session.terminated",
    "session.error",
  ];
  const allSeverities: ActivityEventSeverity[] = [
    "debug",
    "info",
    "warning",
    "error",
    "success",
  ];

  for (const t of allEventTypes) summary.events_by_type[t] = 0;
  for (const s of allSeverities) summary.events_by_severity[s] = 0;

  for (const event of events) {
    summary.events_by_type[event.type]++;
    summary.events_by_severity[event.severity]++;

    if (event.tool_execution) {
      const action = event.tool_execution.action;
      summary.tool_call_counts[action] = (summary.tool_call_counts[action] ?? 0) + 1;
    }

    if (event.type === "policy.blocked") summary.policy_blocked_count++;
    if (event.type === "approval.requested") summary.approval_requested_count++;
    if (event.type === "approval.granted") summary.approval_granted_count++;
    if (event.type === "approval.denied") summary.approval_denied_count++;
  }

  // Calculate session duration
  const tracker = sessionTracker.get(agentId);
  if (tracker) {
    const start = new Date(tracker.started_at).getTime();
    const end = new Date(tracker.last_event_at).getTime();
    summary.session_duration_ms = end - start;
  }

  return summary;
}

export function trackSession(agentId: string, event: ActivityEvent): void {
  const existing = sessionTracker.get(agentId);
  if (!existing) {
    sessionTracker.set(agentId, {
      started_at: event.timestamp,
      last_event_at: event.timestamp,
      states: new Set([event.type]),
    });
  } else {
    existing.last_event_at = event.timestamp;
    existing.states.add(event.type);
  }
}

export function clearAgentActivity(agentId: string): void {
  activityStore.delete(agentId);
  sessionTracker.delete(agentId);
}

export function getActivityEventCounts(agentId: string): number {
  return activityStore.get(agentId)?.length ?? 0;
}