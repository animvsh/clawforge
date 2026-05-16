import type { BlueprintResponse } from "@/lib/clawforge/types";
import { useState } from "react";

const deploymentSteps = [
  "NemoClaw sandbox created",
  "Nemotron route selected",
  "Policy pack loaded",
  "Tool permissions applied",
  "Memory boundary initialized",
  "Live audit stream enabled",
  "Agent runtime started",
];

function StatusPill({ value }: { value: string }) {
  return (
    <span className="border border-white/12 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-white/56">
      {value.replace("_", " ")}
    </span>
  );
}

export function BlueprintReview({
  blueprint,
  onDeployed,
}: {
  blueprint: BlueprintResponse;
  onDeployed?: (agentId: string) => void;
}) {
  const [deploying, setDeploying] = useState(false);
  const [deployed, setDeployed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deploy() {
    setDeploying(true);
    setError(null);
    try {
      const response = await fetch("/api/agents/deploy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ blueprint_id: blueprint.blueprint_id }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error?.message || "Deploy failed.");
      setDeployed(true);
      onDeployed?.(data.agent_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deploy failed.");
    } finally {
      setDeploying(false);
    }
  }

  return (
    <div className="grid gap-5">
      <div className="grid gap-px overflow-hidden border border-white/12 bg-white/10 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="bg-black p-6">
          <div className="text-[11px] uppercase tracking-[0.24em] text-white/38">
            generated blueprint
          </div>
          <h3 className="mt-5 text-4xl font-semibold tracking-tight text-white">
            {blueprint.agent_name}
          </h3>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/56">
            A NemoClaw incident response agent with policy gates, memory, and live audit.
          </p>

          <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden border border-white/12 bg-white/10 text-sm">
            {[
              ["Workflow", "Incident response"],
              ["Runtime", "NemoClaw"],
              ["Model", blueprint.model],
              ["Policy", "Enforced"],
              ["Memory", "Enabled"],
              ["Audit", "Live"],
            ].map(([label, value]) => (
              <div key={label} className="bg-black p-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-white/32">{label}</div>
                <div className="mt-1 text-white/75">{value}</div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={deploy}
              disabled={deploying}
              className="bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-50"
            >
              {deploying ? "Deploying" : deployed ? "Deploy Again" : "Deploy in NemoClaw"}
            </button>
            {deployed && <span className="text-sm text-emerald-300">SentinelClaw is running.</span>}
          </div>
          {error && (
            <div className="mt-4 border border-red-400/30 p-3 text-sm text-red-100">{error}</div>
          )}
        </div>

        <div className="bg-black">
          <div className="border-b border-white/10 px-5 py-3 text-[11px] uppercase tracking-[0.24em] text-white/38">
            tool permission map
          </div>
          <div className="grid gap-px bg-white/10">
            {blueprint.tools.map((tool) => (
              <div key={tool.id} className="grid gap-3 bg-black p-4 md:grid-cols-[1fr_auto]">
                <div className="min-w-0">
                  <div className="font-semibold text-white/92">{tool.name}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.14em] text-white/36">
                    {tool.action}
                  </div>
                </div>
                <div className="flex flex-wrap items-start gap-2">
                  <StatusPill value={tool.permission} />
                  <StatusPill value={tool.risk_level} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {deploying && (
        <div className="grid gap-px overflow-hidden border border-emerald-300/20 bg-emerald-300/20 md:grid-cols-7">
          {deploymentSteps.map((step) => (
            <div key={step} className="bg-black px-3 py-4 text-xs text-emerald-100/78">
              ✓ {step}
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="border border-white/12 bg-white/[0.025] p-5">
          <div className="text-[11px] uppercase tracking-[0.24em] text-white/38">workflow</div>
          <div className="mt-5 grid gap-4">
            {blueprint.workflow_steps.map((step, index) => (
              <div key={step.id} className="grid grid-cols-[34px_1fr] gap-3">
                <div className="text-sm text-white/35">{String(index + 1).padStart(2, "0")}</div>
                <div>
                  <div className="text-sm font-semibold text-white/82">{step.title}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border border-white/12 bg-white/[0.025] p-5">
          <div className="text-[11px] uppercase tracking-[0.24em] text-white/38">
            NemoClaw policy pack
          </div>
          <div className="mt-5 grid gap-3">
            {blueprint.policies.map((policy) => (
              <div key={policy.id} className="border border-white/10 p-3">
                <div className="text-sm font-semibold text-white/82">{policy.name}</div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-white/35">
                  {policy.action} · {policy.effect.replace("_", " ")}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border border-white/12 bg-white/[0.025] p-5">
          <div className="text-[11px] uppercase tracking-[0.24em] text-white/38">
            memory boundary
          </div>
          <div className="mt-5 grid gap-3">
            {blueprint.memory_schema.map((item) => (
              <div key={item.id} className="border border-white/10 p-3">
                <div className="text-sm font-semibold text-white/82">{item.name}</div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-white/35">
                  {item.type}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <pre className="max-h-72 overflow-auto border border-white/12 bg-[#050505] p-5 text-xs leading-relaxed text-white/62">
        {blueprint.config_preview}
      </pre>
    </div>
  );
}
