import type { ProviderMode, ProviderConfig, ProviderStatus } from "../types";
import { createMockProvider } from "./mock";
import { createMiniMaxProvider } from "./minimax";
import { createNemotronProvider } from "./nemotron";
import { createPiProvider } from "./pi";

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

function sanitizeError(providerMode: ProviderMode, error: unknown): string {
  if (error instanceof Error) {
    // Remove any API key references from error messages (20+ char alphanumeric strings)
    const message = error.message;
    return `[${providerMode}] ${message.replace(/[A-Za-z0-9+/=]{20,}/g, "[redacted]")}`;
  }
  return `[${providerMode}] Unknown error occurred`;
}

export class ProviderRegistry {
  private providers: Map<ProviderMode, ReasoningProvider> = new Map();
  private env: Record<string, string | undefined>;
  private currentMode: ProviderMode = "auto";

  constructor(
    env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
  ) {
    this.env = env;
    this.registerAll();
  }

  private registerAll(): void {
    // Register all providers
    const nemotronProvider = createNemotronProvider(this.env);
    this.providers.set("nemotron", nemotronProvider);

    const minimaxProvider = createMiniMaxProvider(this.env);
    this.providers.set("minimax", minimaxProvider);

    const piProvider = createPiProvider(this.env);
    this.providers.set("pi", piProvider);

    const mockProvider = createMockProvider();
    this.providers.set("mock", mockProvider);
  }

  private resolveMode(mode: ProviderMode): ProviderMode {
    if (mode !== "auto") return mode;

    // Auto fallback chain: nemotron -> minimax -> pi -> mock
    if (this.isProviderAvailable("nemotron")) return "nemotron";
    if (this.isProviderAvailable("minimax")) return "minimax";
    if (this.isProviderAvailable("pi")) return "pi";
    return "mock";
  }

  private isProviderAvailable(mode: ProviderMode): boolean {
    const provider = this.providers.get(mode);
    if (!provider) return false;

    // Check if provider has valid credentials (not mock)
    if (mode === "mock") return true;
    if (mode === "nemotron") return !!this.env.NVIDIA_API_KEY;
    if (mode === "minimax") return !!(this.env.MINIMAX_API_KEY || this.env.MINIMAX_PLAN_KEY);
    if (mode === "pi") return !!this.env.PI_CODING_API_KEY;

    return true;
  }

  getProvider(mode: ProviderMode = "auto"): ReasoningProvider {
    const resolvedMode = this.resolveMode(mode);
    const provider = this.providers.get(resolvedMode);

    if (!provider) {
      // Fallback to mock if mode not found
      return this.providers.get("mock")!;
    }

    return provider;
  }

  getStatus(mode: ProviderMode): ProviderStatus {
    const provider = this.providers.get(mode);
    if (!provider) {
      return { mode, model: "", available: false, error: "Provider not registered" };
    }

    const available = this.isProviderAvailable(mode);
    return {
      mode,
      model: provider.model,
      available,
      error: undefined,
    };
  }

  getConfig(): ProviderConfig {
    const chain: ProviderMode[] = [];
    if (this.isProviderAvailable("nemotron")) chain.push("nemotron");
    if (this.isProviderAvailable("minimax")) chain.push("minimax");
    if (this.isProviderAvailable("pi")) chain.push("pi");
    chain.push("mock");

    return {
      mode: this.currentMode,
      env_vars: {
        nemotron: this.env.NVIDIA_API_KEY ? "NVIDIA_API_KEY" : undefined,
        minimax_api_key: this.env.MINIMAX_API_KEY ? "MINIMAX_API_KEY" : undefined,
        minimax_plan_key: this.env.MINIMAX_PLAN_KEY ? "MINIMAX_PLAN_KEY" : undefined,
        pi_coding_api_key: this.env.PI_CODING_API_KEY ? "PI_CODING_API_KEY" : undefined,
      },
      fallback_chain: chain,
    };
  }

  setMode(mode: ProviderMode): void {
    this.currentMode = mode;
  }

  async plan(input: ReasoningInput, mode: ProviderMode = "auto"): Promise<string[]> {
    const requestedMode = mode;
    const provider = this.getProvider(mode);
    try {
      return await provider.plan(input);
    } catch (error) {
      throw new Error(sanitizeError(requestedMode, error));
    }
  }

  async classify(
    input: ReasoningInput,
    mode: ProviderMode = "auto",
  ): Promise<{ label: string; severity: "low" | "medium" | "high" }> {
    const requestedMode = mode;
    const provider = this.getProvider(mode);
    try {
      return await provider.classify(input);
    } catch (error) {
      throw new Error(sanitizeError(requestedMode, error));
    }
  }

  async summarize(input: ReasoningInput, mode: ProviderMode = "auto"): Promise<string> {
    const requestedMode = mode;
    const provider = this.getProvider(mode);
    try {
      return await provider.summarize(input);
    } catch (error) {
      throw new Error(sanitizeError(requestedMode, error));
    }
  }
}

// Factory function for convenience
export function createProviderRegistry(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): ProviderRegistry {
  return new ProviderRegistry(env);
}

export { createMockProvider } from "./mock";
export { createMiniMaxProvider } from "./minimax";
export { createNemotronProvider } from "./nemotron";
export { createPiProvider } from "./pi";
