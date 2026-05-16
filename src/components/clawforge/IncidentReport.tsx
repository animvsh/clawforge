import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { IncidentReport as IncidentReportModel } from "@/lib/clawforge/types";
import type { IncidentReportResponse } from "@/lib/clawforge/api";

function ReportRow({ label, value }: { label: string; value: string | string[] | ReactNode }) {
  const isReactNode = typeof value !== "string" && !Array.isArray(value);

  return (
    <div className="grid gap-2 bg-black p-4 text-sm md:grid-cols-[220px_1fr]">
      <div className="text-[11px] uppercase tracking-[0.18em] text-white/35">{label}</div>
      <div className="space-y-1 text-white/76">
        {isReactNode ? (
          <div>{value}</div>
        ) : (
          (Array.isArray(value) ? value : [value]).map((item) => (
            <div key={`${label}-${item}`}>{item}</div>
          ))
        )}
      </div>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: IncidentReportModel["severity"] }) {
  const colors: Record<IncidentReportModel["severity"], string> = {
    low: "bg-emerald-500/20 text-emerald-300",
    medium: "bg-yellow-500/20 text-yellow-300",
    high: "bg-orange-500/20 text-orange-300",
    critical: "bg-red-500/20 text-red-300",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium ${colors[severity]}`}>
      {severity}
    </span>
  );
}

interface IncidentReportProps {
  agentId?: string;
  report?: IncidentReportModel;
}

export function IncidentReport({ agentId, report: propReport }: IncidentReportProps) {
  const [report, setReport] = useState<IncidentReportModel | null>(propReport ?? null);
  const [loading, setLoading] = useState(!propReport && !report);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!agentId) return;
    if (propReport) {
      setReport(propReport);
      setLoading(false);
      return;
    }
    if (report) return; // already have data

    let cancelled = false;
    setLoading(true);
    setError(null);
    setNotFound(false);

    fetch(`/api/agents/${agentId}/report`)
      .then((res) => {
        if (res.status === 404) {
          if (!cancelled) {
            setNotFound(true);
            setLoading(false);
          }
          return null;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<IncidentReportResponse>;
      })
      .then((data) => {
        if (!cancelled && data?.report) {
          setReport(data.report);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load report");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [agentId, propReport, report]);

  if (loading) {
    return (
      <div className="overflow-hidden border border-white/12 bg-white/[0.025]">
        <div className="border-b border-white/10 p-6">
          <div className="text-[11px] uppercase tracking-[0.24em] text-white/38">
            incident report generated
          </div>
          <div className="mt-4 h-10 w-2/3 animate-pulse rounded bg-white/10" />
          <div className="mt-4 h-4 w-full animate-pulse rounded bg-white/5" />
          <div className="mt-2 h-4 w-5/6 animate-pulse rounded bg-white/5" />
        </div>
        <div className="p-6">
          <div className="h-4 w-1/4 animate-pulse rounded bg-white/5" />
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="overflow-hidden border border-white/12 bg-white/[0.025]">
        <div className="border-b border-white/10 p-6">
          <div className="text-[11px] uppercase tracking-[0.24em] text-white/38">
            incident report generated
          </div>
          <h3 className="mt-4 text-4xl font-semibold tracking-tight text-white">No report generated yet</h3>
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-white/56">
            Run an agent and resolve the approval gate to generate the final NemoClaw report.
          </p>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="overflow-hidden border border-white/12 bg-white/[0.025]">
        <div className="border-b border-white/10 p-6">
          <div className="text-[11px] uppercase tracking-[0.24em] text-white/38">
            incident report generated
          </div>
          <h3 className="mt-4 text-4xl font-semibold tracking-tight text-white">Error loading report</h3>
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-white/56">
            {error ?? "An unexpected error occurred."}
          </p>
        </div>
      </div>
    );
  }

  const rows: Array<[string, string | string[] | ReactNode]> = [
    ["Severity", <SeverityBadge key="sev" severity={report.severity} />],
    ["Detected behavior", report.detected_behavior],
    ["Classification", report.classification],
    ["Likely threat", report.likely_threat],
    ["MITRE mapping", report.mitre_mapping],
    ["Model used", report.model_used],
    ["Agent runtime", report.runtime],
    ["Policy triggered", report.policy_triggered],
    ["Action attempted", report.action_attempted],
    ["User decision", report.user_decision],
    ["Final action", report.final_action],
    ["Memory update", report.memory_update],
    ["Safety result", report.safety_result],
    ["Evidence", report.evidence],
    ["Recommended action", report.recommended_action],
    ["Actions attempted", report.actions_attempted],
    ["Actions blocked", report.actions_blocked],
    ["Approval decisions", report.approval_decisions],
    ["Memory updates", report.memory_updates],
  ];

  return (
    <div className="overflow-hidden border border-white/12 bg-white/[0.025]">
      <div className="border-b border-white/10 p-6">
        <div className="text-[11px] uppercase tracking-[0.24em] text-white/38">
          incident report generated
        </div>
        <h3 className="mt-4 text-4xl font-semibold tracking-tight text-white">{report.title}</h3>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-white/56">
          SentinelClaw completed the workflow safely inside NemoClaw. No restricted action was
          executed without approval.
        </p>
      </div>

      <div className="grid gap-px bg-white/10">
        {rows.map(([label, value]) => (
          <ReportRow key={label} label={label} value={value} />
        ))}
      </div>
    </div>
  );
}
