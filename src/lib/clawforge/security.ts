const SECRET_NAMES = [
  "NVIDIA_API_KEY",
  "NGC_CLI_API_KEY",
  "MINIMAX_API_KEY",
  "MINIMAX_PLAN_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "COMPOSIO_API_KEY",
  "AUTHORIZATION",
];

const SECRET_PATTERNS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\b(?:sk|nvapi|ghp|xoxb)-[A-Za-z0-9._-]{8,}\b/g,
  /\bAIza[0-9A-Za-z_-]{16,}\b/g,
  /\b(?:NVIDIA_API_KEY|NGC_CLI_API_KEY|MINIMAX_API_KEY|MINIMAX_PLAN_KEY|SUPABASE_SERVICE_ROLE_KEY|COMPOSIO_API_KEY)\s*[:=]\s*[^,\s"']+/gi,
];

function envSecretValues(): string[] {
  const env = typeof process !== "undefined" ? process.env : undefined;
  if (!env) return [];

  return Object.entries(env)
    .filter(([name, value]) => Boolean(value) && /(?:KEY|TOKEN|SECRET|AUTHORIZATION)/i.test(name))
    .map(([, value]) => value)
    .filter((value): value is string => Boolean(value) && value.length >= 8);
}

export function redactText(value: string): string {
  let redacted = value;
  for (const pattern of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, "[REDACTED_SECRET]");
  }

  for (const secretValue of envSecretValues()) {
    redacted = redacted.split(secretValue).join("[REDACTED_SECRET]");
  }

  for (const name of SECRET_NAMES) {
    redacted = redacted.replace(new RegExp(`${name}\\s*[:=]\\s*[^,\\s"']+`, "gi"), `${name}=[REDACTED_SECRET]`);
  }

  return redacted;
}

export function redactSecrets<T>(value: T): T {
  if (typeof value === "string") return redactText(value) as T;
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item)) as T;
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => {
      if (/(authorization|api.?key|token|secret)/i.test(key)) {
        return [key, "[REDACTED_SECRET]"];
      }
      return [key, redactSecrets(item)];
    }),
  ) as T;
}

export function redactionSelfTest(): boolean {
  const sample = "Authorization: Bearer demo-secret-value-123456";
  return !redactText(sample).includes("demo-secret-value-123456");
}
