import type { IncidentReport, MemoryItem, RuntimeEvent } from "@/lib/clawforge/types";
import { useEffect, useState } from "react";

function eventTone(event: RuntimeEvent): string {
  if (event.type.includes("blocked") || event.severity === "error") {
    return "border-rose-400/25 bg-rose-400/[0.06] text-rose-100";
  }
  if (event.type.includes("approval") || event.severity === "warning") {
    return "border-amber-400/25 bg-amber-400/[0.06] text-amber-100";
  }
  if (
    event.type.includes("memory") ||
    event.type.includes("report") ||
    event.severity === "success"
  ) {
    return "border-emerald-400/25 bg-emerald-400/[0.06] text-emerald-100";
  }
  return "border-white/10 bg-white/[0.03] text-white/70";
}

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
  const [commandReply, setCommandReply] = useState(
    "Deploy SentinelClaw to ask about the run, current incident, pause reason, memory, or stop command.",
  );

  useEffect(() => {
    if (!agentId) {
      setStatus("ready to deploy");
      return;
    }
    setEvents([]);
    setApprovalStatus("pending");
    setCommandReply(
      "SentinelClaw is running inside NemoClaw. Ask for status or inspect the pause.",
    );
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
      setCommandReply(nextAction === "start" ? "Runtime resumed." : "Stop command sent.");
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
      setCommandReply(
        decision === "approved"
          ? "Command approved. NemoClaw logged the decision before completion."
          : "Command denied. NemoClaw kept the agent inside safe mode.",
      );
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
  const latestEvent = events[events.length - 1];
  const statusCards = [
    ["Running", agentId ? status : "not deployed"],
    ["NemoClaw Active", agentId ? "active" : "waiting"],
    [
      "Enforced",
      events.some((event) => event.type.startsWith("policy.")) ? "policy checks" : "pending",
    ],
    ["NVIDIA Nemotron", "ready"],
    ["Active memory", `${memory.length} items`],
    ["Live audit stream", events.length ? `${events.length} events` : "waiting"],
  ];

  function runCommand(command: "step" | "incident" | "pause" | "memory" | "stop") {
    if (command === "stop") {
      void setRuntime("stop");
      return;
    }

    const replies = {
      step: latestEvent
        ? `Current step: ${latestEvent.type}: ${latestEvent.message}`
        : "No live step yet. Deploy the agent to start the audit stream.",
      incident:
        "Current incident: repeated failed SSH login attempts from 185.92.XX.XX, mapped to Credential Access.",
      pause:
        "Pause reason: NemoClaw requires approval before shell execution because block_ip can change system state.",
      memory: memory.length
        ? `Memory boundary has ${memory.length} items. Latest: ${memory[memory.length - 1].content}`
        : "Memory boundary is waiting for the first deployed run.",
    };
    setCommandReply(replies[command]);
  }

  return (
    <div className="grid gap-5">
      <div className="rounded-2xl border border-white/10 bg-black/35 p-5">
        <div className="text-[11px] uppercase tracking-[0.24em] text-white/40">live dashboard</div>
        <h3 className="mt-3 text-3xl font-semibold tracking-tight text-white">
          SentinelClaw is running inside NemoClaw.
        </h3>
        <div className="mt-5 grid gap-2 md:grid-cols-3 lg:grid-cols-6">
          {statusCards.map(([label, value]) => (
            <div key={label} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div className="text-[10px] uppercase tracking-[0.16em] text-white/35">{label}</div>
              <div className="mt-2 text-sm text-white/80">{value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.82fr_1.18fr_0.9fr]">
        <div className="rounded-2xl border border-white/10 bg-black/35 p-5">
          <div className="text-[11px] uppercase tracking-[0.24em] text-white/40">
            Agent Control Chat
          </div>
          <div className="mt-4 text-sm text-white/65">
            <div>Agent ID: {activeAgent}</div>
            <div>Status: {status}</div>
            <div>Sandbox: NemoClaw</div>
          </div>
          <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-relaxed text-white/70">
            {commandReply}
          </div>
          <div className="mt-5 grid gap-2">
            {[
              ["Current step", "step"],
              ["Current incident", "incident"],
              ["Why paused?", "pause"],
              ["Show memory", "memory"],
              ["Stop", "stop"],
            ].map(([label, command]) => (
              <button
                key={command}
                type="button"
                onClick={() =>
                  runCommand(command as "step" | "incident" | "pause" | "memory" | "stop")
                }
                disabled={!agentId && command !== "incident"}
                className="rounded-lg border border-white/10 px-3 py-2 text-left text-xs font-semibold text-white/75 transition hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {label}
              </button>
            ))}
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
              Live NemoClaw Audit Stream
            </div>
            <div className="text-[11px] lowercase text-emerald-300/75">
              {agentId && status !== "stopped" && status !== "completed" ? "streaming" : "waiting"}
            </div>
          </div>
          <div className="min-h-96 p-5 font-mono text-xs leading-relaxed">
            {(events.length ? events : []).map((event, index) => (
              <div
                key={`${event.id}-${index}`}
                className={`mb-2 rounded-xl border px-3 py-2 ${eventTone(event)}`}
              >
                <div className="mb-1 text-[10px] uppercase tracking-[0.16em] opacity-60">
                  {event.type}
                </div>
                <div>{event.message}</div>
              </div>
            ))}
            {!events.length && <div className="text-white/35">Deploy the agent to start logs.</div>}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/35 p-5">
          <div className="text-[11px] uppercase tracking-[0.24em] text-white/40">
            Security + Memory Panel
          </div>
          <div className="mt-5 rounded-xl border border-amber-400/30 bg-amber-400/[0.07] p-4 text-sm text-amber-100">
            <div className="font-semibold">NemoClaw Approval Required</div>
            <p className="mt-2 text-xs leading-relaxed opacity-80">
              Command: `block_ip 185.92.XX.XX`
            </p>
            <div className="mt-2 text-xs opacity-80">Policy: shell.execute requires approval</div>
            <div className="mt-2 text-xs opacity-80">Status: {approvalStatus}</div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => decide("approved")}
                disabled={!agentId || approvalStatus !== "pending"}
                className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-45"
              >
                Approve Command
              </button>
              <button
                type="button"
                onClick={() => decide("denied")}
                disabled={!agentId || approvalStatus !== "pending"}
                className="rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
              >
                Deny Command
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
    </div>
  );
}
