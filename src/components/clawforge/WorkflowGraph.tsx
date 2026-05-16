import type { RuntimeEvent } from "@/lib/clawforge/types";
import type { SessionState } from "@/lib/clawforge/runtime";
import { useCallback, useEffect, useRef, useState } from "react";

type LifecycleState = SessionState | "initial";

const GRAPH_STATES: { id: LifecycleState; label: string; description: string }[] = [
  { id: "initial", label: "Initial", description: "Session created, blueprint loaded" },
  { id: "created", label: "Created", description: "Agent instance initialized" },
  { id: "deployed", label: "Deployed", description: "Agent deployed into NemoClaw sandbox" },
  { id: "running", label: "Running", description: "Agent actively executing workflow steps" },
  { id: "paused", label: "Paused", description: "Agent paused, awaiting resume or approval" },
  { id: "waiting_for_approval", label: "Approval Gate", description: "Human approval required before continuing" },
  { id: "completed", label: "Completed", description: "Workflow finished successfully" },
  { id: "stopped", label: "Stopped", description: "Session terminated without completion" },
];

const EDGES: Array<{ from: LifecycleState; to: LifecycleState; label?: string }> = [
  { from: "initial", to: "created" },
  { from: "created", to: "deployed" },
  { from: "deployed", to: "running" },
  { from: "running", to: "paused" },
  { from: "paused", to: "running" },
  { from: "running", to: "waiting_for_approval" },
  { from: "waiting_for_approval", to: "running" },
  { from: "waiting_for_approval", to: "completed" },
  { from: "waiting_for_approval", to: "stopped" },
  { from: "running", to: "completed" },
  { from: "running", to: "stopped" },
  { from: "deployed", to: "stopped" },
];

function stateIndex(state: LifecycleState): number {
  return GRAPH_STATES.findIndex((s) => s.id === state);
}

function nodeColor(state: LifecycleState, active: boolean, reached: boolean): string {
  if (!reached) return "fill-white/[0.06] stroke-white/[0.12]";
  if (active) return "fill-amber-500/20 stroke-amber-400";
  return "fill-emerald-500/10 stroke-emerald-500/40";
}

function edgeColor(from: LifecycleState, to: LifecycleState, activePath: boolean): string {
  if (!activePath) return "stroke-white/[0.12]";
  return "stroke-amber-400";
}

type ReplayMode = "idle" | "playing" | "paused" | "stepping";

interface WorkflowGraphProps {
  currentState: LifecycleState;
  reachedStates?: LifecycleState[];
  events?: RuntimeEvent[];
  onEventClick?: (event: RuntimeEvent, index: number) => void;
  compact?: boolean;
}

export function WorkflowGraph({
  currentState,
  reachedStates = ["initial", "created", "deployed", "running"],
  events = [],
  onEventClick,
  compact = false,
}: WorkflowGraphProps) {
  const [hoveredState, setHoveredState] = useState<LifecycleState | null>(null);
  const stateSet = new Set(reachedStates);

  return (
    <div className="relative overflow-hidden border border-white/12 bg-white/[0.025]">
      <div className="border-b border-white/10 px-4 py-2.5 text-[11px] uppercase tracking-[0.24em] text-white/38">
        NemoClaw lifecycle
      </div>
      <div className={compact ? "p-3" : "p-4"}>
        {!compact && (
          <div className="mb-4 text-xs text-white/48">
            {GRAPH_STATES.filter((s) => stateSet.has(s.id)).length} of {GRAPH_STATES.length} states reached
          </div>
        )}
        <div className={compact ? "flex gap-3" : "grid gap-4 sm:grid-cols-2 lg:grid-cols-4"}>
          {GRAPH_STATES.map((state, index) => {
            const reached = stateSet.has(state.id);
            const active = state.id === currentState;
            const hover = state.id === hoveredState;
            return (
              <div
                key={state.id}
                className="relative"
                onMouseEnter={() => setHoveredState(state.id)}
                onMouseLeave={() => setHoveredState(null)}
              >
                <div
                  className={`relative rounded-lg border-2 p-3 transition-all duration-300 ${hover && reached ? "scale-102" : ""} ${nodeColor(state.id, active, reached)}`}
                >
                  {active && (
                    <div className="absolute -right-1.5 -top-1.5 h-3 w-3 rounded-full bg-amber-400 animate-pulse" />
                  )}
                  <div className="text-[10px] uppercase tracking-[0.18em] text-white/32">
                    {String(index + 1).padStart(2, "0")}
                  </div>
                  <div className={`mt-1 text-sm font-semibold ${active ? "text-amber-100" : reached ? "text-white/82" : "text-white/35"}`}>
                    {state.label}
                  </div>
                  {hover && !compact && (
                    <div className="absolute -left-px -top-px z-10 w-48 rounded-lg border border-white/20 bg-black p-3 text-xs leading-relaxed text-white/62 shadow-xl">
                      {state.description}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {!compact && events.length > 0 && (
          <div className="mt-4 border-t border-white/10 pt-4">
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/32">
              workflow trace ({events.length} events)
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {events.slice(-12).map((event, i) => (
                <div
                  key={`${event.id}-${i}`}
                  className={`text-[10px] px-2 py-1 rounded ${
                    event.severity === "error" || event.type === "policy.blocked"
                      ? "bg-red-500/20 text-red-200"
                      : event.severity === "warning" || event.type === "approval.requested"
                        ? "bg-amber-500/20 text-amber-200"
                        : event.severity === "success"
                          ? "bg-emerald-500/20 text-emerald-200"
                          : "bg-white/10 text-white/50"
                  }`}
                >
                  {event.type.replace(".", "_")}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface AuditReplayProps {
  events: RuntimeEvent[];
  onEventClick?: (event: RuntimeEvent, index: number) => void;
  initialMode?: "idle" | "autoplay";
}

export function AuditReplay({
  events,
  onEventClick,
  initialMode = "idle",
}: AuditReplayProps) {
  const [replayIndex, setReplayIndex] = useState(initialMode === "autoplay" ? 0 : -1);
  const [replayMode, setReplayMode] = useState<ReplayMode>(initialMode === "autoplay" ? "playing" : "idle");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const eventsRef = useRef(events);

  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  const clearReplayInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => clearReplayInterval();
  }, [clearReplayInterval]);

  useEffect(() => {
    if (replayMode === "playing" && replayIndex >= 0 && replayIndex < eventsRef.current.length) {
      intervalRef.current = setInterval(() => {
        setReplayIndex((prev) => {
          const next = prev + 1;
          if (next >= eventsRef.current.length) {
            clearReplayInterval();
            setReplayMode("idle");
            return prev;
          }
          onEventClick?.(eventsRef.current[next], next);
          return next;
        });
      }, 1200);
    } else {
      clearReplayInterval();
    }
    return clearReplayInterval;
  }, [replayMode, clearReplayInterval, onEventClick]);

  function play() {
    if (replayIndex < 0) {
      setReplayIndex(0);
      onEventClick?.(eventsRef.current[0], 0);
    }
    setReplayMode("playing");
  }

  function pause() {
    setReplayMode("paused");
    clearReplayInterval();
  }

  function step() {
    clearReplayInterval();
    setReplayMode("stepping");
    setReplayIndex((prev) => {
      const next = prev < 0 ? 0 : Math.min(prev + 1, eventsRef.current.length - 1);
      onEventClick?.(eventsRef.current[next], next);
      return next;
    });
  }

  function reset() {
    clearReplayInterval();
    setReplayMode("idle");
    setReplayIndex(-1);
  }

  const progress = events.length > 0 ? ((replayIndex < 0 ? 0 : replayIndex + 1) / events.length) * 100 : 0;

  return (
    <div className="border border-white/12 bg-white/[0.025]">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
        <div className="text-[11px] uppercase tracking-[0.24em] text-white/38">
          audit replay
        </div>
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full bg-amber-400 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-[10px] text-white/35">
            {replayIndex < 0 ? "0" : replayIndex + 1}/{events.length}
          </span>
        </div>
      </div>
      <div className="p-4">
        <div className="mb-4 flex items-center gap-2">
          <button
            type="button"
            onClick={replayMode === "playing" ? pause : play}
            disabled={!events.length}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {replayMode === "playing" ? (
              <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg className="ml-0.5 h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5.14v14.72a1 1 0 001.5.86l11-7.36a1 1 0 000-1.72l-11-7.36a1 1 0 00-1.5.86z" />
              </svg>
            )}
          </button>
          <button
            type="button"
            onClick={step}
            disabled={!events.length || replayIndex >= events.length - 1}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-white/60 transition hover:border-white/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 4h2v16H6zm8 0h2v16h-2z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={reset}
            disabled={!events.length}
            className="text-xs text-white/35 transition hover:text-white/60 disabled:cursor-not-allowed disabled:opacity-40"
          >
            reset
          </button>
        </div>
        <div className="min-h-48 max-h-80 overflow-auto font-mono text-xs">
          {events.length === 0 ? (
            <div className="text-white/35">No events to replay.</div>
          ) : (
            events.map((event, index) => {
              const highlighted = replayIndex >= 0 && index === replayIndex;
              const dimmed = replayIndex >= 0 && index < replayIndex;
              return (
                <div
                  key={`${event.id}-${index}`}
                  onClick={() => {
                    setReplayIndex(index);
                    onEventClick?.(event, index);
                  }}
                  className={`grid grid-cols-[100px_1fr] gap-3 border-b border-white/[0.04] py-2.5 pr-2 cursor-pointer transition-colors ${highlighted ? "bg-amber-500/15 text-amber-100" : dimmed ? "text-white/25" : "text-white/60"} ${!dimmed && !highlighted ? "hover:bg-white/[0.04]" : ""}`}
                >
                  <span className="text-white/28">{event.type}</span>
                  <span className={highlighted ? "text-amber-200" : ""}>{event.message}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export { GRAPH_STATES, EDGES, stateIndex };
export type { LifecycleState, ReplayMode };