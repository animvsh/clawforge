import type { BlueprintResponse, ProviderMode } from "@/lib/clawforge/types";
import { useEffect, useState } from "react";

export type AgentBuilderProps = {
  provider?: ProviderMode;
  onBlueprint?: (blueprint: BlueprintResponse) => void;
};

const defaultPrompt =
  "Create a NemoClaw agent that monitors system logs, detects suspicious behavior, writes an incident report, and asks before executing commands.";

const loadingSteps = [
  "Understanding requested workflow",
  "Identifying risky actions",
  "Selecting NemoClaw sandbox profile",
  "Choosing allowed tools",
  "Creating approval gates",
  "Writing NemoClaw policy pack",
  "Configuring Nemotron reasoning",
  "Setting memory boundaries",
  "Preparing live audit stream",
  "NemoClaw blueprint ready",
];

const promptTemplates = [
  ["Incident response", defaultPrompt],
  [
    "GitHub triage",
    "Create a NemoClaw agent that reads GitHub issues, identifies urgent bugs, drafts responses, and asks before posting.",
  ],
  [
    "Inbox approval",
    "Create a NemoClaw agent that summarizes important emails, drafts replies, and asks before sending anything.",
  ],
  [
    "Research only",
    "Create a NemoClaw agent that researches a topic, saves sources to memory, writes a brief, and asks before publishing.",
  ],
] as const;

const providerLabels: Array<[ProviderMode, string]> = [
  ["auto", "Auto"],
  ["nemotron", "Nemotron"],
  ["minimax", "MiniMax"],
  ["mock", "Mock"],
];

export function AgentBuilder({ provider = "auto", onBlueprint }: AgentBuilderProps) {
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [selectedProvider, setSelectedProvider] = useState<ProviderMode>(provider);
  const [loading, setLoading] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [blueprintReady, setBlueprintReady] = useState(false);

  useEffect(() => {
    if (!loading) return;
    setActiveStep(0);
    const timer = window.setInterval(() => {
      setActiveStep((current) => Math.min(current + 1, loadingSteps.length - 1));
    }, 180);
    return () => window.clearInterval(timer);
  }, [loading]);

  async function generateBlueprint() {
    setLoading(true);
    setError(null);
    setBlueprintReady(false);
    try {
      const response = await fetch("/api/blueprints", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt, provider: selectedProvider }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error?.message || "Blueprint generation failed.");
      }
      setActiveStep(loadingSteps.length - 1);
      setBlueprintReady(true);
      onBlueprint?.(data.blueprint);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Blueprint generation failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <div className="border border-white/12 bg-white/[0.025] p-5">
        <label
          htmlFor="agent-prompt"
          className="text-[11px] uppercase tracking-[0.24em] text-white/38"
        >
          prompt
        </label>
        <textarea
          id="agent-prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          className="mt-4 min-h-44 w-full resize-none border border-white/12 bg-black p-4 font-mono text-sm leading-relaxed text-white/86 outline-none transition placeholder:text-white/28 focus:border-white/35"
          placeholder="Describe the NemoClaw agent you want to create..."
        />

        <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <div className="mb-2 text-[11px] uppercase tracking-[0.24em] text-white/35">
              reasoning
            </div>
            <div className="flex flex-wrap gap-px overflow-hidden border border-white/12 bg-white/12">
              {providerLabels.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSelectedProvider(value)}
                  className={`bg-black px-4 py-2 text-sm transition ${
                    selectedProvider === value
                      ? "text-white"
                      : "text-white/45 hover:bg-white/[0.04] hover:text-white/75"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={generateBlueprint}
            disabled={loading || !prompt.trim()}
            className="h-12 bg-white px-6 text-sm font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Forging" : "Forge Agent"}
          </button>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {promptTemplates.map(([label, templatePrompt]) => (
            <button
              key={label}
              type="button"
              onClick={() => setPrompt(templatePrompt)}
              className="border border-white/12 px-3 py-1.5 text-xs text-white/55 transition hover:border-white/28 hover:text-white"
            >
              {label}
            </button>
          ))}
        </div>

        {error && (
          <div className="mt-4 border border-red-400/30 p-3 text-sm text-red-100">{error}</div>
        )}
      </div>

      <div className="border border-white/12 bg-black">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="text-[11px] uppercase tracking-[0.24em] text-white/38">forge status</div>
          <div className="text-xs text-white/50">
            {blueprintReady ? "ready" : loading ? "running" : "waiting"}
          </div>
        </div>
        <div className="grid gap-px bg-white/10">
          {loadingSteps.map((step, index) => {
            const completed = blueprintReady || (loading && index <= activeStep);
            const active = loading && index === activeStep;
            return (
              <div key={step} className="grid grid-cols-[32px_1fr] bg-black px-4 py-3 text-sm">
                <span className={completed ? "text-emerald-300" : "text-white/25"}>
                  {completed ? "✓" : active ? "…" : "·"}
                </span>
                <span className={completed ? "text-white/75" : "text-white/38"}>{step}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
