import type { IncidentReport, MemoryItem, RuntimeEvent } from "@/lib/clawforge/types";
import { useEffect, useState } from "react";

export function LiveDashboard({
  agentId,
  onReport,
}: {
  agentId?: string;
  onReport?: (report: IncidentReport) => void;
}) {
  const [events, setEvents] = useState<RuntimeEvent[]>([]);
  const [memory, setMemory] = useState<MemoryItem[]>([]);
  const [report, setReport] = useState<IncidentReport | null>(null);
  const [status, setStatus] = useState<
    "ready to deploy" | "running" | "waiting_for_approval" | "completed" | "stopped"
  >("ready to deploy");
  const [approvalStatus, setApprovalStatus] = useState<"pending" | "approved" | "denied">(
    "pending",
  );

  useEffect(() => {
    if (!agentId) {
      setStatus("ready to deploy");
      return;
    }
    setEvents([]);
    setApprovalStatus("pending");
    setStatus("waiting_for_approval");
    const source = new EventSource(`/api/agents/${agentId}/logs/stream`);
    source.onmessage = (message) => {
      setEvents((current) => [...current, JSON.parse(message.data)]);
    };
    source.onerror = () => source.close();

    fetch(`/api/agents/${agentId}/memory`)
      .then((response) => response.json())
      .then((data) => setMemory(data.memory ?? []))
      .catch(() => setMemory([]));

    fetch(`/api/agents/${agentId}/report`)
      .then((response) => response.json())
      .then((data) => {
        setReport(data.report ?? null);
        if (data.report) onReport?.(data.report);
      })
      .catch(() => setReport(null));

    return () => source.close();
  }, [agentId, onReport]);

  async function setRuntime(nextAction: "start" | "stop") {
    if (!agentId) return;
    const response = await fetch(`/api/agents/${agentId}/${nextAction}`, { method: "POST" });
    const data = await response.json();
    if (data.ok) {
      setStatus(data.status ?? (nextAction === "start" ? "running" : "stopped"));
      setEvents((current) => [
        ...current,
        {
          id: `runtime_${nextAction}_${Date.now()}`,
          agent_id: agentId,
          type: nextAction === "start" ? "agent.started" : "agent.completed",
          message: nextAction === "start" ? "Agent runtime resumed." : "Agent runtime stopped.",
          timestamp: new Date().toISOString(),
          severity: nextAction === "start" ? "success" : "warning",
        },
      ]);
    }
  }

  async function decide(decision: "approved" | "denied") {
    const response = await fetch("/api/approvals/approval_shell_block_ip/decision", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    const data = await response.json();
    if (data.ok) {
      setApprovalStatus(decision);
      if (data.runtime_status) setStatus(data.runtime_status);
      setMemory((current) => {
        const nextItem = data.memory_item as MemoryItem;
        if (current.some((item) => item.id === nextItem.id || item.content === nextItem.content)) {
          return current;
        }
        return [...current, nextItem];
      });
      setEvents((current) => [...current, ...((data.events as RuntimeEvent[] | undefined) ?? [])]);
      if (data.report) {
        setReport(data.report);
        onReport?.(data.report);
      }
    }
  }

  const activeAgent = agentId ?? "agent_sentinelclaw_demo";

  return (
    <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr_0.9fr]">
      <div className="rounded-2xl border border-white/10 bg-black/35 p-5">
        <div className="text-[11px] uppercase tracking-[0.24em] text-white/40">agent</div>
        <h3 className="mt-4 text-2xl font-semibold lowercase text-white">SentinelClaw</h3>
        <div className="mt-4 grid gap-2 text-sm text-white/65">
          <div>Status: {status}</div>
          <div>Agent ID: {activeAgent}</div>
          <div>Sandbox: NemoClaw</div>
          <div>Runtime: OpenClaw</div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setRuntime("start")}
            disabled={!agentId || status === "running"}
            className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-45"
          >
            Start
          </button>
          <button
            type="button"
            onClick={() => setRuntime("stop")}
            disabled={!agentId || status === "stopped"}
            className="rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
          >
            Stop
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#06070a]">
        <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-3">
          <div className="text-[11px] uppercase tracking-[0.24em] text-white/45">
            live agent activity
          </div>
          <div className="text-[11px] lowercase text-emerald-300/75">
            {agentId && status !== "stopped" && status !== "completed" ? "streaming" : "waiting"}
          </div>
        </div>
        <div className="min-h-72 p-5 font-mono text-xs leading-relaxed">
          {(events.length ? events : []).map((event, index) => (
            <div
              key={`${event.id}-${index}`}
              className="grid grid-cols-[72px_1fr] gap-3 border-b border-white/[0.05] py-2 last:border-0"
            >
              <span className="text-white/30">{event.type}</span>
              <span className={event.severity === "warning" ? "text-amber-200" : "text-white/75"}>
                {event.message}
              </span>
            </div>
          ))}
          {!events.length && <div className="text-white/35">Deploy the agent to start logs.</div>}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/35 p-5">
        <div className="text-[11px] uppercase tracking-[0.24em] text-white/40">policy + memory</div>
        <div className="mt-5 rounded-xl border border-amber-400/30 bg-amber-400/[0.07] p-4 text-sm text-amber-100">
          <div className="font-semibold lowercase">Approval Required</div>
          <p className="mt-2 text-xs leading-relaxed opacity-80">
            Command: `block_ip 185.92.XX.XX`
          </p>
          <div className="mt-2 text-xs opacity-80">Status: {approvalStatus}</div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => decide("approved")}
              disabled={!agentId || approvalStatus !== "pending"}
              className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-45"
            >
              Approve Action
            </button>
            <button
              type="button"
              onClick={() => decide("denied")}
              disabled={!agentId || approvalStatus !== "pending"}
              className="rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
            >
              Deny Action
            </button>
          </div>
        </div>
        <div className="mt-5 grid gap-2">
          {memory.slice(-4).map((item, index) => (
            <div
              key={`${item.id}-${index}`}
              className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
            >
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">
                {item.type}
              </div>
              <div className="mt-1 text-xs leading-relaxed text-white/65">{item.content}</div>
            </div>
          ))}
        </div>
        {report && (
          <div className="mt-5 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.06] p-4 text-sm text-emerald-100">
            Report ready: {report.title} ({report.severity})
          </div>
        )}
      </div>
    </div>
  );
}
