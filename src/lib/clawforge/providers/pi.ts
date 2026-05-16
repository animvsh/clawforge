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
    .replace(/\/home\/[^\/]+/gi, "[internal-path]")
    .trim();
}

export function createPiProvider(
  env: Record<string, string | undefined> = {},
): ReasoningProvider {
  const apiKey = env.PI_CODING_API_KEY;
  const endpoint = env.PI_CODING_ENDPOINT || "https://api.pi.com/v1";
  const model = env.PI_CODING_MODEL || "pi-3-mini";

  if (!apiKey) {
    return createMockProvider();
  }

  return {
    mode: "pi",
    model,
    async plan(input: { prompt: string; context?: Record<string, unknown> }): Promise<string[]> {
      try {
        const response = await fetch(`${endpoint}/chat`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: "system",
                content: "You are a security planning assistant. Given a task, output a numbered list of steps. Only output the numbered list, no other text.",
              },
              {
                role: "user",
                content: input.prompt,
              },
            ],
            max_tokens: 512,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => "Unknown error");
          throw new Error(`Pi plan request failed (${response.status}): ${sanitizeError(errorText)}`);
        }

        const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
        const content = data?.choices?.[0]?.message?.content ?? "";

        // Parse numbered list from response
        const steps: string[] = [];
        const lines = content.split("\n");
        for (const line of lines) {
          const match = line.match(/^\s*\d+[.)]\s*(.+)/);
          if (match) {
            steps.push(match[1].trim());
          } else if (line.trim() && steps.length > 0 && !line.match(/^\s*\d/)) {
            // Continuation of previous step
            steps[steps.length - 1] += " " + line.trim();
          }
        }

        return steps.length > 0 ? steps : ["Analyze request", "Execute task", "Report results"];
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        throw new Error(`Plan failed: ${sanitizeError(message)}`);
      }
    },

    async classify(input: { prompt: string; context?: Record<string, unknown> }): Promise<{ label: string; severity: "low" | "medium" | "high" }> {
      try {
        const response = await fetch(`${endpoint}/classify`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
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
          throw new Error(`Pi classify request failed (${response.status}): ${sanitizeError(errorText)}`);
        }

        const data = await response.json() as { label?: string; severity?: "low" | "medium" | "high" };
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
            "Authorization": `Bearer ${apiKey}`,
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
          throw new Error(`Pi summarize request failed (${response.status}): ${sanitizeError(errorText)}`);
        }

        const data = await response.json() as { summary?: string };
        return data?.summary ?? "Summary unavailable.";
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        throw new Error(`Summarize failed: ${sanitizeError(message)}`);
      }
    },
  };
}