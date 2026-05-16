import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ClawForgeFrame, PageShell } from "@/components/clawforge/ClawForgeFrame";
import { IncidentReport } from "@/components/clawforge/IncidentReport";
import { DEMO_AGENT_ID } from "@/lib/clawforge/fixtures";
import type { IncidentReport as IncidentReportModel } from "@/lib/clawforge/types";

export const Route = createFileRoute("/report")({
  head: () => ({
    meta: [
      { title: "Report — ClawForge" },
      {
        name: "description",
        content: "Review the final ClawForge incident report and safety result.",
      },
    ],
  }),
  component: ReportPage,
});

function readStoredReport(): IncidentReportModel | null {
  const stored = window.sessionStorage.getItem("clawforge.report");
  if (!stored) return null;

  try {
    return JSON.parse(stored) as IncidentReportModel;
  } catch {
    return null;
  }
}

function ReportPage() {
  const [report, setReport] = useState<IncidentReportModel | null>(() =>
    typeof window === "undefined" ? null : readStoredReport(),
  );

  useEffect(() => {
    fetch(`/api/agents/${DEMO_AGENT_ID}/report`)
      .then((response) => (response.ok ? response.json() : undefined))
      .then((data) => {
        if (data?.report) setReport(data.report);
      })
      .catch(() => undefined);
  }, []);

  return (
    <ClawForgeFrame>
      <PageShell
        eyebrow="output"
        title={report ? "Read the result." : "No report yet."}
        body={
          report
            ? "The final report captures the threat, policy checks, blocked actions, approval decision, and memory updates."
            : "Run an agent and resolve the approval gate to generate the final NemoClaw report."
        }
      >
        {report ? (
          <IncidentReport report={report} />
        ) : (
          <div className="border border-white/12 bg-white/[0.025] p-8">
            <p className="max-w-xl text-sm leading-relaxed text-white/58">
              ClawForge only shows this page after a run creates a real report. Start from the
              builder, deploy the agent, and approve or deny the pending action.
            </p>
            <Link
              to="/builder"
              className="mt-6 inline-flex border border-white bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-white/90"
            >
              Build an agent
            </Link>
          </div>
        )}
      </PageShell>
    </ClawForgeFrame>
  );
}
