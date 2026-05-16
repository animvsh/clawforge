import { agentTemplates } from "@/lib/clawforge/fixtures";
import type { AgentTemplateId, BlueprintResponse, ProviderMode } from "@/lib/clawforge/types";
import { useEffect, useState } from "react";

export type AgentBuilderProps = {
  provider?: ProviderMode;
  onBlueprint?: (blueprint: BlueprintResponse) => void;
};

const defaultPrompt =
  "Create a NemoClaw agent that monitors system logs, detects suspicious behavior, writes an incident report, and asks before executing commands.";

const loadingSteps = [
  "Understanding requested workflow...",
  "Identifying risky actions...",
  "Selecting NemoClaw sandbox profile...",
  "Choosing allowed tools...",
  "Creating approval gates...",
  "Writing NemoClaw policy pack...",
  "Configuring Nemotron reasoning...",
  "Setting memory boundaries...",
  "Preparing live audit stream...",
  "NemoClaw blueprint ready.",
];

const promptTemplates = [
  {
    id: "incident_response",
    label: "Incident response agent",
    note: "Primary SentinelClaw hackathon demo.",
    prompt: defaultPrompt,
  },
  {
    id: "github_triage",
    label: "GitHub triage agent",
    note: "Read issues, draft triage, ask before posting.",
    prompt:
      "Create a NemoClaw agent that reads GitHub issues, identifies urgent bugs, drafts responses, and asks before posting.",
  },
  {
    id: "inbox_approval",
    label: "Inbox approval agent",
    note: "Summarize mail, draft replies, ask before sending.",
    prompt:
      "Create a NemoClaw agent that summarizes important emails, drafts replies, and asks before sending anything.",
  },
  {
    id: "research_sandbox",
    label: "Research-only sandboxed agent",
    note: "Read sources, save memory, block publishing.",
    prompt:
      "Create a NemoClaw agent that researches a topic, saves sources to memory, writes a brief, and cannot publish outside the sandbox.",
  },
] satisfies {
  id: AgentTemplateId;
  label: string;
  note: string;
  prompt: string;
}[];

export function AgentBuilder({ provider = "auto", onBlueprint }: AgentBuilderProps) {
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [selectedProvider, setSelectedProvider] = useState<ProviderMode>(provider);
  const [selectedTemplate, setSelectedTemplate] = useState<AgentTemplateId>("incident_response");
  const [loading, setLoading] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [blueprint, setBlueprint] = useState<BlueprintResponse | null>(null);

  useEffect(() => {
    if (!loading) return;
    setActiveStep(0);
    const timer = window.setInterval(() => {
      setActiveStep((current) => Math.min(current + 1, loadingSteps.length - 1));
    }, 220);
    return () => window.clearInterval(timer);
  }, [loading]);

  async function generateBlueprint() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/blueprints", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt, provider: selectedProvider, template_id: selectedTemplate }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error?.message || "Blueprint generation failed.");
      }
      setActiveStep(loadingSteps.length - 1);
      setBlueprint(data.blueprint);
      onBlueprint?.(data.blueprint);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Blueprint generation failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_0.85fr]">
      <div className="rounded-2xl border border-white/10 bg-black/45 p-5 md:p-6">
        <div className="mb-3 text-[10px] uppercase tracking-[0.26em] text-white/40">builder</div>
        <h3 className="mb-4 text-2xl font-semibold tracking-tight text-white">
          Describe your NemoClaw agent.
        </h3>
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          className="min-h-36 w-full resize-none rounded-xl border border-white/10 bg-white/[0.035] p-4 font-mono text-sm leading-relaxed text-white/85 outline-none transition placeholder:text-white/25 focus:border-white/30"
          placeholder="Create a NemoClaw agent that monitors system logs, detects suspicious behavior, writes an incident report, and asks before executing commands."
        />
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {promptTemplates.map((template) => (
            <button
              key={template.label}
              type="button"
              onClick={() => {
                setSelectedTemplate(template.id);
                setPrompt(template.prompt);
              }}
              className={`rounded-xl border px-3 py-3 text-left transition ${
                selectedTemplate === template.id
                  ? "border-emerald-300/40 bg-emerald-300/[0.08] text-white"
                  : "border-white/10 bg-white/[0.02] text-white/65 hover:border-white/25 hover:text-white"
              }`}
            >
              <span className="block text-xs font-semibold">{template.label}</span>
              <span className="mt-1 block text-[11px] leading-relaxed text-white/45">
                {template.note}
              </span>
            </button>
          ))}
        </div>
        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs leading-relaxed text-white/55">
          {agentTemplates.find((template) => template.id === selectedTemplate)?.label} generates a
          NemoClaw sandbox profile with allowed tools, approval gates, blocked actions, and memory
          rules.
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <select
            value={selectedProvider}
            onChange={(event) => setSelectedProvider(event.target.value as ProviderMode)}
            className="h-11 rounded-xl border border-white/10 bg-black px-3 text-sm text-white/75 outline-none focus:border-white/30"
          >
            <option value="auto">Auto</option>
            <option value="nemotron">Nemotron</option>
            <option value="minimax">MiniMax</option>
            <option value="mock">Mock</option>
          </select>
          <button
            type="button"
            onClick={generateBlueprint}
            disabled={loading || !prompt.trim()}
            className="h-11 rounded-xl bg-white px-5 text-sm font-medium text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Forging..." : "Generate NemoClaw Blueprint"}
          </button>
        </div>
        {error && <div className="mt-4 text-sm text-rose-200">{error}</div>}
      </div>

      <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01]">
        <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-3">
          <div className="text-[11px] uppercase tracking-[0.24em] text-white/45">
            generation status
          </div>
          <div className="text-[11px] lowercase text-emerald-300/80">
            {blueprint ? "ready" : loading ? "running" : "waiting"}
          </div>
        </div>
        <div className="grid gap-2 p-5">
          {loadingSteps.map((step, index) => {
            const completed = blueprint || (loading && index <= activeStep);
            const pending = loading && index === activeStep;
            return (
              <div
                key={step}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-white/75"
              >
                <span
                  className={`grid h-5 w-5 place-items-center rounded-full text-[11px] ${
                    completed ? "bg-emerald-400/15 text-emerald-200" : "bg-white/5 text-white/30"
                  }`}
                >
                  {completed ? "✓" : pending ? "…" : "·"}
                </span>
                {step}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
