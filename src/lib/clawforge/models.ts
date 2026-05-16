import type { AgentTemplateId, ProviderMode } from "./types";

export type ChatModelOption = {
  provider: ProviderMode;
  model: string;
  label: string;
  shortLabel: string;
  note: string;
  bestFor: AgentTemplateId[] | "all";
};

export const chatModelOptions: ChatModelOption[] = [
  {
    provider: "auto",
    model: "auto",
    label: "Auto pick",
    shortLabel: "Auto",
    note: "ClawForge picks the fastest model that fits this agent.",
    bestFor: "all",
  },
  {
    provider: "nemotron",
    model: "nvidia/llama-3.1-nemotron-nano-8b-v1",
    label: "Nemotron Nano",
    shortLabel: "Nano",
    note: "Fast default for log checks, triage, and simple approvals.",
    bestFor: ["incident_response", "github_triage", "inbox_approval"],
  },
  {
    provider: "nemotron",
    model: "nvidia/llama-3.3-nemotron-super-49b-v1",
    label: "Nemotron Super",
    shortLabel: "Super",
    note: "Best fit for phone agents, scheduling, and multi-step tool use.",
    bestFor: ["phone_receptionist", "research_sandbox"],
  },
  {
    provider: "nemotron",
    model: "nvidia/llama-3.1-nemotron-70b-instruct",
    label: "Nemotron 70B",
    shortLabel: "70B",
    note: "Balanced choice for deeper incident analysis.",
    bestFor: ["incident_response", "research_sandbox"],
  },
  {
    provider: "nemotron",
    model: "nvidia/llama-3.1-nemotron-ultra-253b-v1",
    label: "Nemotron Ultra",
    shortLabel: "Ultra",
    note: "Highest quality reasoning when speed matters less.",
    bestFor: ["research_sandbox"],
  },
  {
    provider: "minimax",
    model: "minimax-text-01",
    label: "MiniMax Text",
    shortLabel: "MiniMax",
    note: "Friendly fallback for customer conversations and inbox agents.",
    bestFor: ["phone_receptionist", "inbox_approval"],
  },
  {
    provider: "pi",
    model: "pi-coding-agent",
    label: "Pi Coding SDK",
    shortLabel: "Pi",
    note: "Useful for code-heavy agent testing and sandbox edits.",
    bestFor: ["github_triage"],
  },
];

export function modelKey(option: Pick<ChatModelOption, "provider" | "model">): string {
  return `${option.provider}:${option.model}`;
}

export function parseModelKey(value: string): Pick<ChatModelOption, "provider" | "model"> | null {
  const selected = chatModelOptions.find((option) => modelKey(option) === value);
  return selected ? { provider: selected.provider, model: selected.model } : null;
}

export function recommendModelForTemplate(templateId?: AgentTemplateId): ChatModelOption {
  if (!templateId) return chatModelOptions[0];
  if (templateId === "phone_receptionist") {
    return chatModelOptions.find((option) => option.shortLabel === "Super") ?? chatModelOptions[0];
  }
  if (templateId === "research_sandbox") {
    return chatModelOptions.find((option) => option.shortLabel === "Super") ?? chatModelOptions[0];
  }
  if (templateId === "github_triage") {
    return chatModelOptions.find((option) => option.shortLabel === "Nano") ?? chatModelOptions[0];
  }
  if (templateId === "inbox_approval") {
    return chatModelOptions.find((option) => option.shortLabel === "Nano") ?? chatModelOptions[0];
  }
  return chatModelOptions.find((option) => option.shortLabel === "Nano") ?? chatModelOptions[0];
}

export function optionForModel(provider: ProviderMode = "auto", model = "auto"): ChatModelOption {
  return (
    chatModelOptions.find((option) => option.provider === provider && option.model === model) ??
    chatModelOptions[0]
  );
}

export function matchModelCommand(message: string): ChatModelOption | null {
  const lower = message.toLowerCase();
  if (lower.includes("nemotron super") || lower.includes("use super")) {
    return chatModelOptions.find((option) => option.shortLabel === "Super") ?? null;
  }
  if (lower.includes("nemotron nano") || lower.includes("use nano")) {
    return chatModelOptions.find((option) => option.shortLabel === "Nano") ?? null;
  }
  if (lower.includes("nemotron ultra") || lower.includes("use ultra")) {
    return chatModelOptions.find((option) => option.shortLabel === "Ultra") ?? null;
  }
  if (lower.includes("70b") || lower.includes("nemotron 70")) {
    return chatModelOptions.find((option) => option.shortLabel === "70B") ?? null;
  }
  if (lower.includes("minimax")) {
    return chatModelOptions.find((option) => option.provider === "minimax") ?? null;
  }
  if (lower.includes("pi coding") || lower.includes("pi sdk") || lower.includes("use pi")) {
    return chatModelOptions.find((option) => option.provider === "pi") ?? null;
  }
  if (lower.includes("auto model") || lower.includes("pick the model")) return chatModelOptions[0];
  return null;
}
