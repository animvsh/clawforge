import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ClawForgeFrame, PageShell } from "@/components/clawforge/ClawForgeFrame";
import { LiveDashboard } from "@/components/clawforge/LiveDashboard";
import { DEMO_AGENT_ID, DEMO_BLUEPRINT_ID } from "@/lib/clawforge/fixtures";
import type { IncidentReport } from "@/lib/clawforge/types";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — ClawForge" },
      {
        name: "description",
        content: "Watch the ClawForge demo agent run with live policy and memory events.",
      },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const [agentId, setAgentId] = useState<string | undefined>();
  const [report, setReport] = useState<IncidentReport | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlAgentId = params.get("agentId");
    if (urlAgentId) {
      window.sessionStorage.setItem("clawforge.agentId", urlAgentId);
      setAgentId(urlAgentId);
    } else {
      const stored = window.sessionStorage.getItem("clawforge.agentId");
      if (stored) setAgentId(stored);
    }
  }, []);

  useEffect(() => {
    if (!agentId) return;
    fetch(`/api/agents/${agentId}/start`, { method: "POST" }).catch(() => {});
  }, [agentId]);

  async function deployDemoAgent() {
    setDeploying(true);
    setError(null);

    try {
      const response = await fetch("/api/agents/deploy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ blueprint_id: DEMO_BLUEPRINT_ID }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error?.message || "Deploy failed.");
      }
      window.sessionStorage.setItem("clawforge.agentId", data.agent_id || DEMO_AGENT_ID);
      setAgentId(data.agent_id || DEMO_AGENT_ID);
      setReport(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deploy failed.");
    } finally {
      setDeploying(false);
    }
  }

  return (
    <ClawForgeFrame>
      <PageShell
        eyebrow="runtime"
        title="Watch it run."
        body="Deploy SentinelClaw, follow every tool call, and approve or deny risky actions from the live control surface."
      >
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={deployDemoAgent}
            disabled={deploying}
            className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deploying ? "Deploying" : agentId ? "Restart Demo Agent" : "Deploy Demo Agent"}
          </button>
          {report && <span className="text-sm text-emerald-300">Report generated.</span>}
          {error && <span className="text-sm text-red-200">{error}</span>}
        </div>
        <LiveDashboard
          agentId={agentId}
          onReport={(nextReport) => {
            setReport(nextReport);
            window.sessionStorage.setItem("clawforge.report", JSON.stringify(nextReport));
          }}
        />
      </PageShell>
    </ClawForgeFrame>
  );
}
