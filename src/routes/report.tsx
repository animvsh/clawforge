import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ClawForgeFrame, PageShell } from "@/components/clawforge/ClawForgeFrame";
import { IncidentReport } from "@/components/clawforge/IncidentReport";
import { DEMO_AGENT_ID, demoReport } from "@/lib/clawforge/fixtures";
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
  const [report, setReport] = useState<IncidentReportModel>(() =>
    typeof window === "undefined" ? demoReport : (readStoredReport() ?? demoReport),
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
        title="Read the result."
        body="The final report captures the threat, policy checks, blocked actions, approval decision, and memory updates."
      >
        <IncidentReport report={report} />
      </PageShell>
    </ClawForgeFrame>
  );
}
