import type { BlueprintResponse } from "@/lib/clawforge/types";
import { useState } from "react";

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
    <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
      <div className="rounded-2xl border border-white/10 bg-black/35 p-6">
        <div className="mb-4 text-[11px] uppercase tracking-[0.28em] text-white/40">
          your secure agent blueprint is ready
        </div>
        <h3 className="text-3xl font-semibold tracking-tight lowercase">{blueprint.agent_name}</h3>
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
  );
}
