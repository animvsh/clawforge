import type { BlueprintResponse, ProviderMode } from "@/lib/clawforge/types";
import { useCallback, useEffect, useRef, useState } from "react";

export type AgentBuilderProps = {
  initialPrompt?: string;
  autoBuildSignal?: number;
  provider?: ProviderMode;
  onBlueprint?: (blueprint: BlueprintResponse) => void;
};

const defaultPrompt =
  "Create an agent that watches system logs, spots suspicious activity, writes a report, and asks before taking action.";

const loadingSteps = ["Parse", "Sandbox", "Tools", "Policies", "Memory", "Ready"];

const promptTemplates = [
  ["Incident", defaultPrompt],
  [
    "GitHub",
    "Create an agent that reads GitHub issues, finds urgent bugs, drafts responses, and asks before posting.",
  ],
  [
    "Inbox",
    "Create an agent that summarizes important emails, drafts replies, and asks before sending anything.",
  ],
  [
    "Receptionist",
    "Create a phone receptionist agent that answers calls, takes messages, checks my calendar, books appointments, and asks before sending texts.",
  ],
  [
    "Research",
    "Create an agent that researches a topic, saves sources, writes a brief, and asks before publishing.",
  ],
] as const;

const providerLabels: Array<[ProviderMode, string]> = [
  ["auto", "Auto"],
  ["nemotron", "Nemotron"],
  ["minimax", "MiniMax"],
  ["pi", "Pi"],
  ["mock", "Mock"],
];

export function AgentBuilder({
  initialPrompt = defaultPrompt,
  autoBuildSignal = 0,
  provider = "auto",
  onBlueprint,
}: AgentBuilderProps) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [selectedProvider, setSelectedProvider] = useState<ProviderMode>(provider);
  const [loading, setLoading] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [blueprintReady, setBlueprintReady] = useState(false);
  const latestGenerateBlueprint = useRef<(nextPrompt?: string) => Promise<void>>(async () => {});
  const lastAutoBuildSignal = useRef(0);

  const generateBlueprint = useCallback(
    async (nextPrompt = prompt) => {
      setLoading(true);
      setError(null);
      setBlueprintReady(false);
      try {
        const response = await fetch("/api/blueprints", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ prompt: nextPrompt, provider: selectedProvider }),
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
    },
    [onBlueprint, prompt, selectedProvider],
  );

  useEffect(() => {
    latestGenerateBlueprint.current = generateBlueprint;
  }, [generateBlueprint]);

  useEffect(() => {
    if (!loading) return;
    setActiveStep(0);
    const timer = window.setInterval(() => {
      setActiveStep((current) => Math.min(current + 1, loadingSteps.length - 1));
    }, 190);
    return () => window.clearInterval(timer);
  }, [loading]);

  useEffect(() => {
    setPrompt(initialPrompt);
  }, [initialPrompt]);

  useEffect(() => {
    if (
      autoBuildSignal > 0 &&
      autoBuildSignal !== lastAutoBuildSignal.current &&
      initialPrompt.trim()
    ) {
      lastAutoBuildSignal.current = autoBuildSignal;
      void latestGenerateBlueprint.current(initialPrompt);
    }
  }, [autoBuildSignal, initialPrompt]);

  return (
    <div className="border border-white/12 bg-white/[0.018] p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">new agent</div>
        <div className="flex flex-wrap gap-px border border-white/10 bg-white/10">
          {providerLabels.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setSelectedProvider(value)}
              className={`bg-black px-3 py-1.5 text-xs transition ${
                selectedProvider === value ? "text-white" : "text-white/42 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <textarea
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        className="mt-5 min-h-36 w-full resize-none border-0 bg-transparent text-lg leading-relaxed text-white outline-none placeholder:text-white/25 sm:text-xl md:text-2xl"
        placeholder="Describe the agent you want..."
      />

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-5">
        <div className="flex flex-wrap gap-2">
          {promptTemplates.map(([label, templatePrompt]) => (
            <button
              key={label}
              type="button"
              onClick={() => setPrompt(templatePrompt)}
              className="border border-white/10 px-3 py-1.5 text-xs text-white/45 transition hover:border-white/25 hover:text-white"
            >
              {label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => void generateBlueprint()}
          disabled={loading || !prompt.trim()}
          className="w-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          {loading ? "Building" : "Build Agent"}
        </button>
      </div>

      {(loading || blueprintReady) && (
        <div className="mt-5 grid gap-px bg-white/10 md:grid-cols-6">
          {loadingSteps.map((step, index) => {
            const completed = blueprintReady || index <= activeStep;
            return (
              <div key={step} className="bg-black px-3 py-3 text-xs">
                <span className={completed ? "text-emerald-300" : "text-white/22"}>
                  {completed ? "✓ " : "· "}
                </span>
                <span className={completed ? "text-white/65" : "text-white/35"}>{step}</span>
              </div>
            );
          })}
        </div>
      )}

      {error && (
        <div className="mt-4 border border-red-400/30 p-3 text-sm text-red-100">{error}</div>
      )}
    </div>
  );
}
