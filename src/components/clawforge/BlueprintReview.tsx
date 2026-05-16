import type { BlueprintResponse } from "@/lib/clawforge/types";
import { useState } from "react";

const deploymentSteps = [
  "OpenClaw config generated",
  "Nemotron provider selected",
  "NemoClaw policies applied",
  "Tools connected",
  "Memory initialized",
  "Agent running",
];

export function BlueprintReview({
  blueprint,
  onDeployed,
}: {
  blueprint: BlueprintResponse;
  onDeployed?: (agentId: string) => void;
}) {
  const [deploying, setDeploying] = useState(false);
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
      onDeployed?.(data.agent_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deploy failed.");
    } finally {
      setDeploying(false);
    }
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-2xl border border-white/10 bg-black/35 p-6">
          <div className="mb-4 text-[11px] uppercase tracking-[0.28em] text-white/40">
            your secure agent blueprint is ready
          </div>
          <h3 className="text-3xl font-semibold tracking-tight lowercase">
            {blueprint.agent_name}
          </h3>
          <p className="mt-4 text-sm leading-relaxed text-white/65 lowercase">
            {blueprint.description}. {blueprint.goal}
          </p>
          <div className="mt-6 grid grid-cols-2 gap-2 text-xs">
            {[
              ["Model", blueprint.model],
              ["Provider", blueprint.provider],
              ["Runtime", blueprint.runtime],
              ["Sandbox", blueprint.sandbox],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="text-[10px] uppercase tracking-[0.2em] text-white/35">{label}</div>
                <div className="mt-1 text-white/80">{value}</div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={deploy}
            disabled={deploying}
            className="mt-6 rounded-xl bg-white px-5 py-3 text-sm font-medium lowercase text-black transition hover:bg-white/90 disabled:opacity-50"
          >
            {deploying ? "Deploying..." : "Deploy Secure Agent"}
          </button>
          {error && <div className="mt-3 text-sm text-rose-200">{error}</div>}
          {deploying && (
            <div className="mt-5 grid gap-2">
              {deploymentSteps.map((step) => (
                <div
                  key={step}
                  className="flex items-center gap-3 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.05] px-3 py-2 text-xs text-emerald-100/80"
                >
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-400/15 text-[10px]">
                    ✓
                  </span>
                  {step}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="grid gap-2">
          {blueprint.tools.map((tool) => (
            <div key={tool.id} className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold lowercase text-white/95">{tool.name}</div>
                  <div className="mt-1 text-xs lowercase text-white/55">{tool.purpose}</div>
                </div>
                <div className="flex gap-2 text-[10px] uppercase tracking-[0.14em]">
                  <span className="rounded-full border border-white/10 px-2.5 py-1 text-white/55">
                    {tool.permission.replace("_", " ")}
                  </span>
                  <span className="rounded-full border border-white/10 px-2.5 py-1 text-white/55">
                    {tool.risk_level}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
          <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">workflow</div>
          <div className="mt-4 grid gap-3">
            {blueprint.workflow_steps.map((step, index) => (
              <div key={step.id} className="grid grid-cols-[28px_1fr] gap-3">
                <div className="grid h-7 w-7 place-items-center rounded-full border border-white/10 text-[10px] text-white/45">
                  {index + 1}
                </div>
                <div>
                  <div className="text-sm font-semibold lowercase text-white/85">{step.title}</div>
                  <div className="mt-1 text-xs leading-relaxed text-white/50">
                    {step.description}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
          <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">policies</div>
          <div className="mt-4 grid gap-3">
            {blueprint.policies.map((policy) => (
              <div key={policy.id} className="rounded-xl border border-white/10 bg-black/30 p-3">
                <div className="text-sm font-semibold lowercase text-white/85">{policy.name}</div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-white/35">
                  {policy.action} · {policy.effect.replace("_", " ")}
                </div>
                <div className="mt-2 text-xs leading-relaxed text-white/50">{policy.reason}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
          <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">memory</div>
          <div className="mt-4 grid gap-3">
            {blueprint.memory_schema.map((item) => (
              <div key={item.id} className="rounded-xl border border-white/10 bg-black/30 p-3">
                <div className="text-sm font-semibold lowercase text-white/85">{item.name}</div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-white/35">
                  {item.type}
                </div>
                <div className="mt-2 text-xs leading-relaxed text-white/50">{item.description}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <pre className="overflow-x-auto rounded-2xl border border-white/10 bg-[#06070a] p-5 text-xs leading-relaxed text-white/65">
        {blueprint.config_preview}
      </pre>
    </div>
  );
}
