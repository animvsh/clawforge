type AgentMailInbox = {
  pod_id?: string;
  inbox_id?: string;
  email?: string;
  updated_at?: string;
  created_at?: string;
  display_name?: string;
  client_id?: string;
};

function runtimeEnv(workerEnv: Record<string, string | undefined> = {}) {
  const viteEnv = import.meta.env as Record<string, string | undefined>;
  const nodeEnv =
    typeof process !== "undefined" && typeof process.env === "object"
      ? (process.env as Record<string, string | undefined>)
      : {};
  return { ...nodeEnv, ...viteEnv, ...workerEnv };
}

function safeUsername(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42);
  return normalized || `clawforge-${Date.now().toString(36)}`;
}

export async function createAgentMailInbox(
  request: Request,
  workerEnv: Record<string, string | undefined> = {},
) {
  const env = runtimeEnv(workerEnv);
  if (!env.AGENTMAIL_API_KEY) {
    throw new Error("Agent email API key is not configured.");
  }

  const body = (await request.json().catch(() => ({}))) as {
    agent_name?: unknown;
    blueprint_id?: unknown;
    username?: unknown;
  };
  const agentName =
    typeof body.agent_name === "string" && body.agent_name.trim()
      ? body.agent_name.trim()
      : "ClawForge Agent";
  const blueprintId =
    typeof body.blueprint_id === "string" && body.blueprint_id.trim()
      ? body.blueprint_id.trim()
      : `blueprint-${Date.now().toString(36)}`;
  const username =
    typeof body.username === "string" && body.username.trim()
      ? safeUsername(body.username)
      : safeUsername(`${agentName}-${blueprintId.slice(-8)}`);

  const response = await fetch("https://api.agentmail.to/v0/inboxes", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.AGENTMAIL_API_KEY}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      username,
      domain: "agentmail.to",
      display_name: agentName,
      client_id: `clawforge-${blueprintId}`,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Agent email inbox failed: ${response.status} ${text.slice(0, 240)}`);
  }

  const inbox = (await response.json()) as AgentMailInbox;
  return {
    id: inbox.inbox_id ?? inbox.email ?? username,
    email: inbox.email ?? `${username}@agentmail.to`,
    display_name: inbox.display_name ?? agentName,
    client_id: inbox.client_id ?? `clawforge-${blueprintId}`,
    created_at: inbox.created_at ?? new Date().toISOString(),
    status: "ready",
  };
}
