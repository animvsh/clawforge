import type { ProviderMode } from "../types";

export type ReasoningInput = {
  prompt: string;
  context?: Record<string, unknown>;
};

export type ReasoningProvider = {
  mode: ProviderMode;
  model: string;
  plan(input: ReasoningInput): Promise<string[]>;
  classify(input: ReasoningInput): Promise<{ label: string; severity: "low" | "medium" | "high" }>;
  summarize(input: ReasoningInput): Promise<string>;
};

export function redactSecret(value: string | undefined): string {
  if (!value) return "";
  return value.length <= 8 ? "[redacted]" : `${value.slice(0, 3)}...[redacted]`;
}

export { createMockProvider } from "./mock";
export { createMiniMaxProvider } from "./minimax";
export { createNemotronProvider } from "./nemotron";
