import type { IncidentReport as IncidentReportModel } from "@/lib/clawforge/types";

function ReportRow({ label, value }: { label: string; value: string | string[] }) {
  const values = Array.isArray(value) ? value : [value];

  return (
    <div className="grid gap-2 bg-black p-4 text-sm md:grid-cols-[190px_1fr]">
      <div className="text-[11px] uppercase tracking-[0.18em] text-white/35">{label}</div>
      <div className="space-y-1 text-white/75">
        {values.map((item) => (
          <div key={`${label}-${item}`}>{item}</div>
        ))}
      </div>
    </div>
  );
}

export function IncidentReport({ report }: { report: IncidentReportModel }) {
  const reportRows: Array<[string, string | string[]]> = [
    ["Severity", report.severity],
    ["Detected Behavior", report.detected_behavior],
    ["Classification", report.classification],
    ["Model Used", report.model_used],
    ["Agent Runtime", report.runtime],
    ["NemoClaw Policy Triggered", report.policy_triggered],
    ["Action Attempted", report.action_attempted],
    ["User Decision", report.user_decision],
    ["Final Action", report.final_action],
    ["Memory Update", report.memory_update],
    ["Safety Result", report.safety_result],
    ["Evidence", report.evidence],
    ["Recommended Action", report.recommended_action],
  ];

  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-6">
      <div className="text-[11px] uppercase tracking-[0.24em] text-white/40">
        output
      </div>
      <h3 className="mt-4 text-3xl font-semibold text-white">Incident Report Generated</h3>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/62">
        SentinelClaw completed the workflow safely inside NemoClaw. No restricted action was
        executed without approval.
      </p>
      <div className="mt-5 border-l border-emerald-300/40 pl-4">
        <div className="text-xs uppercase tracking-[0.2em] text-emerald-200/70">case</div>
        <div className="mt-1 text-lg font-semibold text-white">{report.title}</div>
      </div>
      <div className="mt-6 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10">
        {reportRows.map(([label, value]) => (
          <ReportRow key={label} label={label} value={value} />
        ))}
      </div>
    </div>
  );
}
