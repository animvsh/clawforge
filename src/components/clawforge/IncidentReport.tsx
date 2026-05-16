import type { IncidentReport as IncidentReportModel } from "@/lib/clawforge/types";

export function IncidentReport({ report }: { report: IncidentReportModel }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-6">
      <div className="text-[11px] uppercase tracking-[0.24em] text-white/40">
        incident report generated
      </div>
      <h3 className="mt-4 text-3xl font-semibold lowercase text-white">{report.title}</h3>
      <div className="mt-6 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10">
        {[
          ["Severity", report.severity],
          ["Detected Behavior", report.detected_behavior],
          ["Likely Threat", report.likely_threat],
          ["MITRE Mapping", report.mitre_mapping],
          ["Recommended Action", report.recommended_action],
          ["Approval Decisions", report.approval_decisions.join("; ")],
          ["Memory Updates", report.memory_updates[0]],
        ].map(([label, value]) => (
          <div key={label} className="grid gap-2 bg-black p-4 text-sm md:grid-cols-[200px_1fr]">
            <div className="text-[11px] uppercase tracking-[0.18em] text-white/35">{label}</div>
            <div className="text-white/75">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
