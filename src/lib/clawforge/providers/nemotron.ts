import { createMockProvider } from "./mock";
import type { ReasoningProvider } from ".";

export function createNemotronProvider(
  env: Record<string, string | undefined> = {},
): ReasoningProvider {
  if (!env.NVIDIA_API_KEY) {
    return createMockProvider();
  }

  return {
    ...createMockProvider(),
    mode: "nemotron",
    model: env.NVIDIA_NEMOTRON_MODEL || "nvidia/nemotron",
  };
}
