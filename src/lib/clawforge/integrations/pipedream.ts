import type { IntegrationRequirement } from "../types";

type PipedreamAppConnection = {
  id: string;
  label: string;
  app: string;
  purpose: string;
  required: boolean;
  status: "ready_to_connect" | "needs_api_key" | "token_created" | "error";
};

type PipedreamStatus = {
  configured: boolean;
  project_id: string | null;
  environment: string;
  connections: PipedreamAppConnection[];
  message: string;
};

const PIPEDREAM_API_BASE = "https://api.pipedream.com";

const pipedreamAppByIntegration: Record<string, string> = {
  calendar: "google_calendar",
  email: "gmail",
  github: "github",
  google_docs: "google_docs",
  google_drive: "google_drive",
  google_sheets: "google_sheets",
  linear: "linear",
  slack: "slack",
};

function runtimeEnv(workerEnv: Record<string, string | undefined> = {}) {
  const viteEnv = import.meta.env as Record<string, string | undefined>;
  const nodeEnv =
    typeof process !== "undefined" && typeof process.env === "object"
      ? (process.env as Record<string, string | undefined>)
      : {};
  return { ...nodeEnv, ...viteEnv, ...workerEnv };
}

function projectId(env: Record<string, string | undefined>) {
  return env.PIPEDREAM_PROJECT_ID || env.PIPEDREAM_PROJECT || null;
}

function environmentName(env: Record<string, string | undefined>) {
  return env.PIPEDREAM_ENVIRONMENT || "production";
}

function accessToken(env: Record<string, string | undefined>) {
  return env.PIPEDREAM_ACCESS_TOKEN || env.PIPEDREAM_OAUTH_ACCESS_TOKEN || "";
}

function appConnections(requirements: IntegrationRequirement[]): PipedreamAppConnection[] {
  const connections: PipedreamAppConnection[] = [];
  for (const requirement of requirements) {
    const app = pipedreamAppByIntegration[requirement.id];
    if (!app) continue;
    connections.push({
      id: requirement.id,
      label: requirement.label,
      app,
      purpose: requirement.purpose,
      required: requirement.status === "required",
      status: "ready_to_connect",
    });
  }
  return connections;
}

export async function getPipedreamStatus(
  workerEnv: Record<string, string | undefined> = {},
  requirements: IntegrationRequirement[] = [],
): Promise<PipedreamStatus> {
  const env = runtimeEnv(workerEnv);
  const configured = Boolean(projectId(env) && accessToken(env));
  const connections = appConnections(requirements).map((connection) => ({
    ...connection,
    status: configured ? ("ready_to_connect" as const) : ("needs_api_key" as const),
  }));

  return {
    configured,
    project_id: projectId(env),
    environment: environmentName(env),
    connections,
    message: configured
      ? "Pipedream Connect is ready to create app access links."
      : "Pipedream Connect needs project and access token secrets before app access links can be created.",
  };
}

export async function createPipedreamConnectToken(
  request: Request,
  workerEnv: Record<string, string | undefined> = {},
) {
  const env = runtimeEnv(workerEnv);
  const project = projectId(env);
  const token = accessToken(env);
  if (!project || !token) {
    throw new Error("Pipedream Connect is not configured.");
  }

  const body = (await request.json().catch(() => ({}))) as {
    integration_id?: unknown;
    app?: unknown;
    user_id?: unknown;
    callback_url?: unknown;
  };
  const integrationId = String(body.integration_id || "").trim();
  const app = String(body.app || pipedreamAppByIntegration[integrationId] || "").trim();
  if (!app) throw new Error("Unknown Pipedream app connection.");

  const externalUserId =
    typeof body.user_id === "string" && body.user_id.trim()
      ? body.user_id.trim()
      : "clawforge-demo-user";
  const callbackUrl =
    typeof body.callback_url === "string" && body.callback_url.trim()
      ? body.callback_url.trim()
      : new URL("/", request.url).toString();

  const response = await fetch(`${PIPEDREAM_API_BASE}/v1/connect/${project}/tokens`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json",
      "user-agent": "ClawForge/1.0",
    },
    body: JSON.stringify({
      external_user_id: externalUserId,
      app,
      success_redirect_uri: callbackUrl,
      error_redirect_uri: callbackUrl,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Pipedream Connect returned ${response.status}: ${text.slice(0, 240)}`);
  }

  const data = (await response.json()) as {
    token?: string;
    connect_link_url?: string;
    url?: string;
    expires_at?: string;
  };

  return {
    integration_id: integrationId || app,
    app,
    token: data.token ?? null,
    redirect_url: data.connect_link_url ?? data.url ?? null,
    expires_at: data.expires_at ?? null,
    message: "Open the secure connect link to finish tool access.",
  };
}
