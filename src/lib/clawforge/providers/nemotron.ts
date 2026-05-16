import { createMockProvider } from "./mock";
import type { ReasoningInput, ReasoningProvider } from ".";

const DEFAULT_NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
const DEFAULT_NEMOTRON_MODEL = "nvidia/llama-3.1-nemotron-nano-8b-v1";

function sanitizeError(message: string): string {
  return message
    .replace(/nvapi-[A-Za-z0-9_-]+/g, "[redacted-nvidia-key]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/[A-Za-z0-9+/=_-]{24,}/g, "[redacted]");
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  for (const candidate of extractJsonCandidates(value, "{", "}")) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

function extractJsonCandidates(value: string, opener: "{" | "[", closer: "}" | "]"): string[] {
  const candidates = [value.trim()];
  const fencePattern = /```(?:json)?\s*([\s\S]*?)```/gi;
  for (const match of value.matchAll(fencePattern)) {
    candidates.push(match[1].trim());
  }

  for (let start = 0; start < value.length; start += 1) {
    if (value[start] !== opener) continue;
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < value.length; index += 1) {
      const char = value[index];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;

      if (char === opener) depth += 1;
      if (char === closer) depth -= 1;
      if (depth === 0) {
        candidates.push(value.slice(start, index + 1).trim());
        break;
      }
    }
  }

  return [...new Set(candidates)].filter(Boolean);
}

function extractJsonArray(value: string): unknown[] | null {
  for (const candidate of extractJsonCandidates(value, "[", "]")) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

function cleanStepText(value: string): string {
  return value
    .replace(/^\s*(?:[-*]|\d+[.)-])\s*/, "")
    .replace(/^step\s+\d+\s*[:.)-]\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stepTextFromUnknown(item: unknown): string | null {
  if (typeof item === "string") return cleanStepText(item) || null;
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;

  const record = item as Record<string, unknown>;
  const value =
    record.title ??
    record.step ??
    record.action ??
    record.task ??
    record.name ??
    record.objective ??
    record.summary ??
    record.description;

  return typeof value === "string" ? cleanStepText(value) || null : null;
}

function stepsFromObject(record: Record<string, unknown>): string[] {
  const stepKeys = ["steps", "workflow_steps", "workflow", "plan", "tasks", "actions"];
  for (const key of stepKeys) {
    const value = record[key];
    if (!Array.isArray(value)) continue;
    const steps = value.map(stepTextFromUnknown).filter((step): step is string => Boolean(step));
    if (steps.length) return steps;
  }

  for (const value of Object.values(record)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const nestedSteps = stepsFromObject(value as Record<string, unknown>);
    if (nestedSteps.length) return nestedSteps;
  }

  return [];
}

function parsePlan(content: string): string[] {
  const parsedObject = parseJsonObject(content);
  const objectSteps = parsedObject ? stepsFromObject(parsedObject) : [];
  if (objectSteps.length) return objectSteps;

  const parsedArray = extractJsonArray(content);
  const parsedSteps = parsedArray
    ?.map(stepTextFromUnknown)
    .filter((step): step is string => Boolean(step));
  if (parsedSteps?.length) return parsedSteps;

  const lines = content
    .split("\n")
    .map(cleanStepText)
    .filter(
      (line) =>
        line &&
        line !== "```" &&
        line !== "```json" &&
        !/^"[^"]+"\s*:\s*/.test(line) &&
        !/^"[^"]+"\s*,?$/.test(line) &&
        !/^(?:sure|certainly|here(?:'s| is)|the plan is|assistant:|json\b)/i.test(line) &&
        !/^[\][{},]+$/.test(line),
    );

  return lines.length
    ? lines.slice(0, 8)
    : [
        "Read relevant system context",
        "Classify the requested workflow",
        "Create safety policy gates",
        "Prepare the agent run",
      ];
}

async function nvidiaChatCompletion(
  apiKey: string,
  baseUrl: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 700,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "Unknown NVIDIA error");
    throw new Error(`NVIDIA API error ${response.status}: ${sanitizeError(errorBody)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };

  if (data.error?.message) {
    throw new Error(sanitizeError(data.error.message));
  }

  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("NVIDIA returned an empty response");
  return content;
}

export function createNemotronProvider(
  env: Record<string, string | undefined> = {},
): ReasoningProvider {
  const apiKey = env.NVIDIA_API_KEY;
  const baseUrl = env.NVIDIA_BASE_URL || DEFAULT_NVIDIA_BASE_URL;
  const model = env.NVIDIA_NEMOTRON_MODEL || DEFAULT_NEMOTRON_MODEL;

  if (!apiKey) {
    return createMockProvider();
  }

  return {
    mode: "nemotron",
    model,
    async plan(input: ReasoningInput): Promise<string[]> {
      if (!input.prompt.trim()) return ["No task provided"];
      const content = await nvidiaChatCompletion(
        apiKey,
        baseUrl,
        model,
        "You are ClawForge's NVIDIA Nemotron planning provider. Return only a JSON array of concise agent workflow steps. Do not include markdown.",
        input.prompt,
      );
      return parsePlan(content);
    },
    async classify(
      input: ReasoningInput,
    ): Promise<{ label: string; severity: "low" | "medium" | "high" }> {
      const content = await nvidiaChatCompletion(
        apiKey,
        baseUrl,
        model,
        'Classify the security or automation workflow. Return only JSON like {"label":"Credential Access","severity":"high"}. Severity must be low, medium, or high.',
        input.prompt,
      );
      const parsed = parseJsonObject(content);
      const severity =
        parsed?.severity === "low" || parsed?.severity === "medium" || parsed?.severity === "high"
          ? parsed.severity
          : "medium";
      return {
        label: typeof parsed?.label === "string" ? parsed.label : "Workflow Risk",
        severity,
      };
    },
    async summarize(input: ReasoningInput): Promise<string> {
      return nvidiaChatCompletion(
        apiKey,
        baseUrl,
        model,
        "Summarize the agent workflow in two concise sentences for a product demo. Mention safety controls when relevant.",
        input.prompt,
      );
    },
  };
}
