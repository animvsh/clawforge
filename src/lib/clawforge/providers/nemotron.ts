import { createMockProvider } from "./mock";
import type { ReasoningInput, ReasoningProvider } from ".";

const NEMOTRON_BLUEPRINT_SCHEMA = `You are ClawForge's NVIDIA Nemotron planning provider. You generate structured agent blueprints in strict JSON format.

OUTPUT FORMAT: Return ONLY valid JSON matching the schema below. No markdown, no prose, no explanations.

JSON SCHEMA:
{
  "agent_name": "string (short descriptive name, 2-4 words, e.g. 'Pizza Shop Receptionist')",
  "agent_description": "string (1-2 sentences describing the agent's purpose)",
  "goal": "string (the user's actual request rewritten as an actionable goal, be specific to their domain)",
  "model": "string (use 'nvidia/llama-3.1-nemotron-nano-8b-v1' unless a specific model is requested)",
  "provider": "string (use 'nemotron')",
  "workflow_steps": [
    {
      "title": "string (imperative action title specific to the user's request, e.g. 'Handle incoming call' for a receptionist)",
      "description": "string (1-2 sentences explaining how this step works in the context of the specific task)",
      "kind": "string (one of: 'input' | 'processing' | 'tool' | 'approval' | 'output')"
    }
  ],
  "tools": [
    {
      "name": "string (tool identifier, e.g. 'phone_call' or 'calendar_check')",
      "permission": "string (one of: 'allowed' | 'read_only' | 'approval_required' | 'blocked')",
      "risk_level": "string (one of: 'low' | 'medium' | 'high')"
    }
  ],
  "integrations_required": [
    {
      "id": "string (kebab-case, e.g. 'google-calendar')",
      "label": "string (human-readable, e.g. 'Google Calendar')",
      "purpose": "string (why this integration is needed)"
    }
  ],
  "policies": [
    {
      "name": "string (policy name)",
      "effect": "string (one of: 'allow' | 'deny' | 'require_approval')"
    }
  ],
  "approval_gates": [
    {
      "name": "string (gate name, e.g. 'Human approval for external calls')",
      "trigger": "string (condition that triggers approval, e.g. 'When contacting external phone numbers')"
    }
  ],
  "memory_schema": [
    {
      "name": "string (field name)",
      "type": "string (one of: 'incident' | 'preference' | 'blocked_action' | 'approval' | 'context')"
    }
  ],
  "canvas_graph": {
    "nodes": [
      {
        "id": "string (unique id)",
        "title": "string (node label)",
        "kind": "string (one of: 'input' | 'tool' | 'model' | 'policy' | 'approval' | 'memory' | 'output')"
      }
    ],
    "edges": [
      {
        "id": "string (unique id)",
        "sourceId": "string (source node id)",
        "targetId": "string (target node id)"
      }
    ]
  },
  "runtime_config": {
    "mode": "string (use 'openclaw')",
    "sandbox": "string (use 'nemoclaw')",
    "runtime": "string (use 'openclaw')"
  },
  "files_to_generate": ["string (list of file paths to generate for this agent)"]
}

IMPORTANT RULES:
- Do NOT use keyword templates or generic steps. Generate workflow_steps that are SPECIFIC to the user's actual request.
- If the user asks for a pizza shop receptionist, workflow_steps should include things like "Handle incoming call", "Transcribe voice message", "Check calendar availability" — not generic steps.
- Make all field values specific to the user's domain and request.
- workflow_steps must have at least 3 items and no more than 8.
- tools should be specific to what this agent actually needs to do.
- Return valid JSON only — no markdown fences, no explanatory text.`;

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

function parseBlueprintPlan(content: string): Record<string, unknown> {
  const parsedObject = parseJsonObject(content);
  if (parsedObject) return parsedObject;

  // Try to extract from markdown code blocks
  const fencePattern = /```(?:json)?\s*([\s\S]*?)```/gi;
  for (const match of content.matchAll(fencePattern)) {
    try {
      const parsed = JSON.parse(match[1].trim()) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Continue
    }
  }

  return {};
}

async function nvidiaChatCompletion(
  apiKey: string,
  baseUrl: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    signal: controller.signal,
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
  }).finally(() => clearTimeout(timeout));

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
  const baseUrl = env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1";
  const model = env.NVIDIA_NEMOTRON_MODEL || "nvidia/llama-3.1-nemotron-nano-8b-v1";

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
    async planBlueprint(input: ReasoningInput): Promise<Record<string, unknown>> {
      if (!input.prompt.trim()) return {};
      const content = await nvidiaChatCompletion(
        apiKey,
        baseUrl,
        model,
        NEMOTRON_BLUEPRINT_SCHEMA,
        input.prompt,
      );
      return parseBlueprintPlan(content);
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
