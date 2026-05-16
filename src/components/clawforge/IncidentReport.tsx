import type { IncidentReport as IncidentReportModel } from "@/lib/clawforge/types";

function ReportRow({ label, value }: { label: string; value: string | string[] }) {
  const values = Array.isArray(value) ? value : [value];

  return (
    <div className="grid gap-2 bg-black p-4 text-sm md:grid-cols-[220px_1fr]">
      <div className="text-[11px] uppercase tracking-[0.18em] text-white/35">{label}</div>
      <div className="space-y-1 text-white/76">
        {values.map((item) => (
          <div key={`${label}-${item}`}>{item}</div>
        ))}
      </div>
    </div>
  );
}

export function IncidentReport({ report }: { report: IncidentReportModel }) {
  const rows: Array<[string, string | string[]]> = [
    ["Severity", report.severity],
    ["Detected behavior", report.detected_behavior],
    ["Classification", report.classification],
    ["Model used", report.model_used],
    ["Agent runtime", report.runtime],
    ["MITRE mapping", report.mitre_mapping],
    ["Policy triggered", report.policy_triggered],
    ["Action attempted", report.action_attempted],
    ["User decision", report.user_decision],
    ["Final action", report.final_action],
    ["Memory update", report.memory_update],
    ["Safety result", report.safety_result],
    ["Evidence", report.evidence],
    ["Recommended action", report.recommended_action],
    ["Actions blocked", report.actions_blocked],
    ["Approval decisions", report.approval_decisions],
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
