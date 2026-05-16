import type { ActivityEvent, ActivityEventSeverity, ActivityEventType, ActivityEventSummary } from "@/lib/clawforge/types";
import { useEffect, useState, useCallback } from "react";

type SeverityColors = Record<ActivityEventSeverity, string>;
const severityColors: SeverityColors = {
  error: "text-red-200",
  warning: "text-amber-200",
  success: "text-emerald-200",
  info: "text-white/72",
  debug: "text-white/35",
};

const typeColors: Record<string, string> = {
  "tool.executed": "bg-blue-500/20 text-blue-200",
  "tool.blocked": "bg-red-500/20 text-red-200",
  "tool.pending_approval": "bg-amber-500/20 text-amber-200",
  "policy.blocked": "bg-red-500/20 text-red-200",
  "policy.approved": "bg-emerald-500/20 text-emerald-200",
  "approval.granted": "bg-emerald-500/20 text-emerald-200",
  "approval.denied": "bg-red-500/20 text-red-200",
  "approval.requested": "bg-amber-500/20 text-amber-200",
  "memory.updated": "bg-purple-500/20 text-purple-200",
  "session.waiting_for_approval": "bg-amber-500/20 text-amber-200",
};

function TypeBadge({ type }: { type: ActivityEventType }) {
  return (
    <span className={`rounded px-2 py-0.5 text-[10px] ${typeColors[type] ?? "bg-white/10 text-white/50"}`}>
      {type.replace(".", "_")}
    </span>
  );
}

function EventRow({ event, onSelect }: { event: ActivityEvent; onSelect?: (e: ActivityEvent) => void }) {
  return (
    <div
      onClick={() => onSelect?.(event)}
      className="grid grid-cols-[1fr_auto] gap-3 border-b border-white/[0.04] py-3 pr-2 cursor-pointer hover:bg-white/[0.03] transition-colors"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <TypeBadge type={event.type} />
          <span className={`text-xs ${severityColors[event.severity]}`}>{event.message}</span>
        </div>
        {event.tool_execution && (
          <div className="mt-1.5 text-[10px] text-white/35">
            Tool: {event.tool_execution.tool_name} · Action: {event.tool_execution.action}
            {event.tool_execution.allowed === false && " · blocked"}
          </div>
        )}
        {event.policy_check && (
          <div className="mt-1.5 text-[10px] text-white/35">
            Policy: {event.policy_check.policy_id} · {event.policy_check.effect}
          </div>
        )}
        {event.approval_workflow && (
          <div className="mt-1.5 text-[10px] text-white/35">
            Approval: {event.approval_workflow.action}
            {event.approval_workflow.command && ` · "${event.approval_workflow.command}"`}
          </div>
        )}
      </div>
      <div className="text-right">
        <div className="text-[10px] text-white/28">
          {new Date(event.timestamp).toLocaleTimeString()}
        </div>
        {event.duration_ms !== undefined && (
          <div className="mt-1 text-[10px] text-white/28">
            {event.duration_ms}ms
          </div>
        )}
      </div>
    </div>
  );
}

interface ActivitySummaryCardsProps {
  summary: ActivityEventSummary;
}

function ActivitySummaryCards({ summary }: ActivitySummaryCardsProps) {
  const cards = [
    { label: "Total events", value: summary.total_events },
    { label: "Blocked", value: summary.policy_blocked_count, highlight: "text-red-300" },
    { label: "Approval req.", value: summary.approval_requested_count, highlight: "text-amber-300" },
    { label: "Approved", value: summary.approval_granted_count, highlight: "text-emerald-300" },
    { label: "Denied", value: summary.approval_denied_count, highlight: "text-red-300" },
  ];

  return (
    <div className="grid grid-cols-3 gap-px overflow-hidden border border-white/12 bg-white/10 sm:grid-cols-5">
      {cards.map(({ label, value, highlight }) => (
        <div key={label} className="bg-black p-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-white/32">{label}</div>
          <div className={`mt-1 text-xl font-semibold ${highlight ?? "text-white/78"}`}>{value}</div>
        </div>
      ))}
    </div>
  );
}

interface AgentActivityTimelineProps {
  agentId?: string;
  onEventSelect?: (event: ActivityEvent) => void;
  autoLoad?: boolean;
}

export function AgentActivityTimeline({ agentId, onEventSelect, autoLoad = true }: AgentActivityTimelineProps) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [summary, setSummary] = useState<ActivityEventSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const LIMIT = 30;

  const fetchActivity = useCallback(async (agentId: string, nextOffset = 0, append = false) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/agents/${agentId}/activity?limit=${LIMIT}&offset=${nextOffset}`,
      );
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error?.message ?? "Failed to load activity");

      setSummary(data.summary);
      setEvents((prev) => (append ? [...prev, ...data.events] : data.events));
      setHasMore(data.has_more);
      setOffset(nextOffset);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load activity");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!agentId || !autoLoad) return;
    fetchActivity(agentId, 0, false);
  }, [agentId, autoLoad, fetchActivity]);

  function loadMore() {
    if (!agentId || !hasMore) return;
    fetchActivity(agentId, offset + LIMIT, true);
  }

  if (!agentId) {
    return (
      <div className="border border-white/12 bg-white/[0.025]">
        <div className="border-b border-white/10 px-4 py-3 text-[11px] uppercase tracking-[0.24em] text-white/38">
          agent activity
        </div>
        <div className="p-6 text-center text-sm text-white/35">
          Deploy an agent to see activity.
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {summary && <ActivitySummaryCards summary={summary} />}

      <div className="border border-white/12 bg-white/[0.025]">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
          <div className="text-[11px] uppercase tracking-[0.24em] text-white/38">
            activity timeline
          </div>
          <div className="text-xs text-white/35">
            {events.length} events{hasMore ? " (load more)" : ""}
          </div>
        </div>

        <div className="max-h-96 overflow-auto p-4">
          {error && (
            <div className="mb-3 border border-red-400/30 p-3 text-xs text-red-100">{error}</div>
          )}
          {!events.length && !loading && (
            <div className="text-center text-sm text-white/35">No activity recorded yet.</div>
          )}
          {events.map((event, i) => (
            <EventRow key={`${event.id}-${i}`} event={event} onSelect={onEventSelect} />
          ))}
          {loading && (
            <div className="py-4 text-center text-xs text-white/35">Loading...</div>
          )}
          {!loading && hasMore && (
            <button
              type="button"
              onClick={loadMore}
              className="mt-3 w-full border border-white/12 py-2 text-xs text-white/50 transition hover:border-white/25 hover:text-white"
            >
              Load more
            </button>
          )}
        </div>
      </div>
    </div>
  );
}