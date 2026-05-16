import type { IncidentReport as IncidentReportModel } from "@/lib/clawforge/types";

export function IncidentReport({ report }: { report: IncidentReportModel }) {
  const rows = [
    ["Severity", report.severity],
    ["Detected behavior", report.detected_behavior],
    ["Likely threat", report.likely_threat],
    ["MITRE mapping", report.mitre_mapping],
    ["Recommended action", report.recommended_action],
    ["Actions attempted", report.actions_attempted.join(", ")],
    ["Actions blocked", report.actions_blocked.join(", ")],
    ["Approval decisions", report.approval_decisions.join("; ")],
    ["Memory update", report.memory_updates[0]],
  ];

  return (
    <div className="border border-white/12 bg-white/[0.025]">
      <div className="border-b border-white/10 p-6">
        <div className="text-[11px] uppercase tracking-[0.24em] text-white/38">
          incident report generated
        </div>
        <h3 className="mt-4 text-4xl font-semibold tracking-tight text-white">{report.title}</h3>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/56">
          SentinelClaw completed the workflow safely inside NemoClaw. No restricted action was
          executed without approval.
        </p>
      </div>

      <div className="grid gap-px bg-white/10">
        {rows.map(([label, value]) => (
          <div key={label} className="grid gap-2 bg-black p-4 text-sm md:grid-cols-[220px_1fr]">
            <div className="text-[11px] uppercase tracking-[0.18em] text-white/35">{label}</div>
            <div className="text-white/76">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
