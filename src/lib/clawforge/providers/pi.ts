import { createMockProvider } from "./mock";
import type { ReasoningProvider } from ".";

export type PiConfig = {
  api_key?: string;
  endpoint?: string;
  model?: string;
};

function sanitizeError(message: string, context = ""): string {
  // Remove potential credential leaks, API keys, internal paths
  return message
    .replace(/\b[a-zA-Z0-9_-]{20,}\b/g, "[redacted]")
    .replace(/\bkey-[a-zA-Z0-9]{16,}\b/gi, "[redacted-key]")
    .replace(/\bsecret-[a-zA-Z0-9]{16,}\b/gi, "[redacted-secret]")
    .replace(/C:\\[^\\]*/gi, "[internal-path]")
    .replace(/\/home\/[^/]+/gi, "[internal-path]")
    .trim();
}

export function createPiProvider(env: Record<string, string | undefined> = {}): ReasoningProvider {
  const apiKey = env.PI_CODING_API_KEY;
  const endpoint = env.PI_CODING_ENDPOINT || "https://api.pi.com/v1";
  const model = env.PI_CODING_MODEL || "pi-3-mini";

  if (!apiKey) {
    const mock = createMockProvider();
    return { ...mock, mode: "mock" };
  }

  return {
    mode: "pi",
    model,
    async planBlueprint(): Promise<Record<string, unknown>> {
      return {};
    },
    async plan(input: { prompt: string; context?: Record<string, unknown> }): Promise<string[]> {
      if (!input.prompt.trim()) {
        return ["No task provided"];
      }
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30_000);
      try {
        const response = await fetch(`${endpoint}/chat`, {
          method: "POST",
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: "system",
                content:
                  "You are a security planning assistant. Given a task, output a numbered list of steps. Only output the numbered list, no other text.",
              },
              {
                role: "user",
                content: input.prompt,
              },
            ],
            max_tokens: 512,
          }),
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text().catch(() => "Unknown error");
          throw new Error(
            `Pi plan request failed (${response.status}): ${sanitizeError(errorText)}`,
          );
        }

        const data = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = data?.choices?.[0]?.message?.content ?? "";

        // Parse numbered list from response
        const steps: string[] = [];
        const lines = content.split("\n");
        let lastStepIndex = -1;
        for (const line of lines) {
          // Match various numbered formats: "1.", "1)", "1:", "1 -", etc.
          const numMatch = line.match(/^\s*(\d+)\s*[:.\-)]\s*(.+)/);
          if (numMatch) {
            steps.push(numMatch[2].trim());
            lastStepIndex = steps.length - 1;
          } else if (line.trim() && lastStepIndex >= 0) {
            // Continuation of previous step (no leading number)
            steps[lastStepIndex] += " " + line.trim();
          }
        }

        if (steps.length === 0) {
          // No steps parsed from response - use input as basis for fallback
          const truncated =
            input.prompt.length > 50 ? input.prompt.slice(0, 50) + "..." : input.prompt;
          return [`Analyze: ${truncated}`, "Execute investigation", "Report findings"];
        }
        return steps;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        throw new Error(`Plan failed: ${sanitizeError(message)}`);
      }
    },

    async classify(input: {
      prompt: string;
      context?: Record<string, unknown>;
    }): Promise<{ label: string; severity: "low" | "medium" | "high" }> {
      try {
        const response = await fetch(`${endpoint}/classify`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            prompt: input.prompt,
            context: input.context,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => "Unknown error");
          throw new Error(
            `Pi classify request failed (${response.status}): ${sanitizeError(errorText)}`,
          );
        }

        const data = (await response.json()) as {
          label?: string;
          severity?: "low" | "medium" | "high";
        };
        return {
          label: data?.label ?? "Unknown",
          severity: data?.severity ?? "medium",
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        throw new Error(`Classify failed: ${sanitizeError(message)}`);
      }
    },

    async summarize(input: { prompt: string; context?: Record<string, unknown> }): Promise<string> {
      try {
        const response = await fetch(`${endpoint}/summarize`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            prompt: input.prompt,
            context: input.context,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => "Unknown error");
          throw new Error(
            `Pi summarize request failed (${response.status}): ${sanitizeError(errorText)}`,
          );
        }

        const data = (await response.json()) as { summary?: string };
        const summary = data?.summary?.trim();
        return summary ? summary : "Summary unavailable.";
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        throw new Error(`Summarize failed: ${sanitizeError(message)}`);
      }
    },
  };
}
