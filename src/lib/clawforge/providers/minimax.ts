import { createMockProvider } from "./mock";
import type { ReasoningProvider } from ".";

export function createMiniMaxProvider(
  env: Record<string, string | undefined> = {},
): ReasoningProvider {
  if (!env.MINIMAX_API_KEY && !env.MINIMAX_PLAN_KEY) {
    return createMockProvider();
  }

  return {
    ...createMockProvider(),
    mode: "minimax",
    model: env.MINIMAX_MODEL || "minimax/token-plan",
  };
}
