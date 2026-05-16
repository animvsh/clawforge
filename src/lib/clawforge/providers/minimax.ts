import { createMockProvider } from "./mock";
import type { ReasoningProvider } from "./index";
import type { ReasoningInput } from "./mock";

const MINIMAX_API_BASE = "https://api.minimax.chat/v1";

function sanitizeError(message: string, context?: Record<string, unknown>): string {
  // Strip any key values, tokens, or sensitive patterns from error messages
  const sanitized = message
    .replace(/sk-[A-Za-z0-9]{20,}/g, "[redacted-key]")
    .replace(/MINIMAX_API_KEY/g, "[redacted-env]")
    .replace(/MINIMAX[^"]*?:[^\s,"}]+/g, "[redacted-env]")
    .replace(/"api_key"\s*:\s*"[^"]+"/g, '"api_key":"[redacted]"')
    .replace(/"plan_key"\s*:\s*"[^"]+"/g, '"plan_key":"[redacted]"');
  return sanitized;
}

async function miniMaxChatCompletion(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const response = await fetch(`${MINIMAX_API_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "Unknown error");
    throw new Error(`MiniMax API error ${response.status}: ${sanitizeError(errorBody)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };

  if (data.error) {
    throw new Error(sanitizeError(data.error.message ?? "MiniMax returned an error"));
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("MiniMax returned an empty response");
  }

  return content;
}

export function createMiniMaxProvider(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): ReasoningProvider {
  const apiKey = env.MINIMAX_API_KEY;
  const planKey = env.MINIMAX_PLAN_KEY;
  const model = env.MINIMAX_MODEL || "minimax/token-plan";

  if (!apiKey && !planKey) {
    return createMockProvider();
  }

  const effectiveKey = apiKey ?? planKey ?? "";

  return {
    ...createMockProvider(),
    mode: "minimax",
    model,

    async plan(input: ReasoningInput): Promise<string[]> {
      if (!input.prompt.trim()) {
        return ["No task provided"];
      }
      try {
        const response = await miniMaxChatCompletion(
          effectiveKey,
          model,
          `You are a security reasoning assistant. Given an incident description, output a JSON array of step-by-step tasks to investigate and remediate. Each step should be a concise action verb phrase. Output ONLY the JSON array, nothing else.`,
          input.prompt,
        );

        try {
          const parsed = JSON.parse(response) as unknown;
          if (Array.isArray(parsed)) {
            return parsed.filter((item): item is string => typeof item === "string");
          }
        } catch {
          // Fallback: try to extract lines from non-JSON response
          return response
            .split("\n")
            .map((s) => s.replace(/^\d+[.)]\s*/, "").trim())
            .filter(Boolean);
        }
        throw new Error("Invalid response format: expected JSON array");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(sanitizeError(`Plan generation failed: ${message}`));
      }
    },

    async classify(
      input: ReasoningInput,
    ): Promise<{ label: string; severity: "low" | "medium" | "high" }> {
      try {
        const response = await miniMaxChatCompletion(
          effectiveKey,
          model,
          `You are a security classification assistant. Given an incident description, output a JSON object with exactly two fields: "label" (string, the incident type) and "severity" (one of: low, medium, high). Output ONLY the JSON object, nothing else.`,
          input.prompt,
        );

        const parsed = JSON.parse(response) as unknown;
        if (
          parsed &&
          typeof parsed === "object" &&
          "label" in parsed &&
          "severity" in parsed &&
          typeof parsed.label === "string" &&
          ["low", "medium", "high"].includes(parsed.severity)
        ) {
          return { label: parsed.label, severity: parsed.severity as "low" | "medium" | "high" };
        }
        throw new Error("Invalid classification response format");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(sanitizeError(`Classification failed: ${message}`));
      }
    },

    async summarize(input: ReasoningInput): Promise<string> {
      try {
        return await miniMaxChatCompletion(
          effectiveKey,
          model,
          `You are a security summarization assistant. Given an incident with context, write a concise executive summary (2-3 sentences) covering what happened, the likely threat, and recommended action. Be direct and actionable.`,
          input.prompt,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(sanitizeError(`Summarization failed: ${message}`));
      }
    },
  };
}
