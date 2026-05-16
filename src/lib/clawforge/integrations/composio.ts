export type IntegrationId =
  | "phone_sms"
  | "calendar"
  | "email"
  | "crm"
  | "github"
  | "linear"
  | "slack"
  | "agent_email"
  | "voice_agent";

export type IntegrationConfig = {
  id: IntegrationId;
  label: string;
  toolkit: string;
  purpose: string;
  status: "connected" | "ready_to_connect" | "needs_auth_config" | "needs_api_key";
  auth_config_id: string | null;
  connected_account_id: string | null;
  connectable: boolean;
};

export type IntegrationStatus = {
  configured: boolean;
  connect_base_url: string;
  dashboard_url: string;
  phone_number: string | null;
  auth_configs: IntegrationConfig[];
};

type AuthConfigItem = {
  id?: string;
  name?: string;
  toolkit?: {
    slug?: string;
  };
  auth_config?: {
    id?: string;
    auth_scheme?: string;
    is_composio_managed?: boolean;
  };
};

type ConnectedAccountItem = {
  id?: string;
  status?: string;
  user_id?: string;
  toolkit?: {
    slug?: string;
  };
  auth_config?: {
    id?: string;
  };
};

type ComposioListResponse<T> = {
  items?: T[];
};

const COMPOSIO_API_BASE = "https://backend.composio.dev";

const integrationDefinitions: Array<{
  id: IntegrationId;
  label: string;
  toolkit: string;
  purpose: string;
  connectable: boolean;
}> = [
  {
    id: "phone_sms",
    label: "AgentPhone",
    toolkit: "vapi",
    purpose: "Provision or attach a phone number for call-based agents.",
    connectable: false,
  },
  {
    id: "voice_agent",
    label: "Voice agent",
    toolkit: "vapi",
    purpose: "Create Vapi voice agents for live calls with approval-gated tools.",
    connectable: false,
  },
  {
    id: "agent_email",
    label: "Agent inbox",
    toolkit: "agentmail",
    purpose: "Create a dedicated email inbox for each deployed agent.",
    connectable: false,
  },
  {
    id: "calendar",
    label: "Calendar",
    toolkit: "googlecalendar",
    purpose: "Read availability, book appointments, reschedule, and send confirmations.",
    connectable: true,
  },
  {
    id: "email",
    label: "Email",
    toolkit: "gmail",
    purpose: "Send approved confirmations, intake follow-ups, and call summaries.",
    connectable: true,
  },
  {
    id: "crm",
    label: "CRM",
    toolkit: "hubspot",
    purpose: "Create or update customer records after calls.",
    connectable: true,
  },
  {
    id: "github",
    label: "GitHub",
    toolkit: "github",
    purpose: "Issues, pull requests, repository context, and agent deployment tasks.",
    connectable: true,
  },
  {
    id: "linear",
    label: "Linear",
    toolkit: "linear",
    purpose: "Tickets, engineering tasks, and audit-linked follow-up work.",
    connectable: true,
  },
  {
    id: "slack",
    label: "Slack",
    toolkit: "slack",
    purpose: "Send approved internal notifications and collect team handoffs.",
    connectable: true,
  },
];

function runtimeEnv(workerEnv: Record<string, string | undefined> = {}) {
  const viteEnv = import.meta.env as Record<string, string | undefined>;
  const nodeEnv =
    typeof process !== "undefined" && typeof process.env === "object"
      ? (process.env as Record<string, string | undefined>)
      : {};
  return { ...nodeEnv, ...viteEnv, ...workerEnv };
}

function userIdFromRequest(request: Request): string {
  const url = new URL(request.url);
  const queryUser = url.searchParams.get("user_id")?.trim();
  if (queryUser) return queryUser;

  const headerUser = request.headers.get("x-clawforge-user")?.trim();
  if (headerUser) return headerUser;

  return "clawforge-demo-user";
}

async function composioFetch<T>(
  path: string,
  env: Record<string, string | undefined>,
  init: RequestInit = {},
): Promise<T> {
  const apiKey = env.COMPOSIO_API_KEY;
  if (!apiKey) throw new Error("Integration API key is not configured.");

  const response = await fetch(`${COMPOSIO_API_BASE}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": "ClawForge/1.0",
      "x-api-key": apiKey,
      ...init.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Integration provider returned ${response.status}: ${body.slice(0, 300)}`);
  }

  return (await response.json()) as T;
}

async function listAuthConfigs(env: Record<string, string | undefined>) {
  const params = new URLSearchParams({
    limit: "1000",
    toolkit_slug: integrationDefinitions.map((integration) => integration.toolkit).join(","),
  });
  const response = await composioFetch<ComposioListResponse<AuthConfigItem>>(
    `/api/v3/auth_configs?${params.toString()}`,
    env,
  );
  return response.items ?? [];
}

async function listConnectedAccounts(env: Record<string, string | undefined>, userId: string) {
  const params = new URLSearchParams({
    limit: "1000",
    user_ids: userId,
  });
  const response = await composioFetch<ComposioListResponse<ConnectedAccountItem>>(
    `/api/v3/connected_accounts?${params.toString()}`,
    env,
  );
  return response.items ?? [];
}

async function createManagedAuthConfig(
  env: Record<string, string | undefined>,
  toolkit: string,
): Promise<string | null> {
  const response = await composioFetch<AuthConfigItem>("/api/v3.1/auth_configs", env, {
    method: "POST",
    body: JSON.stringify({ toolkit: { slug: toolkit } }),
  });
  return response.auth_config?.id ?? response.id ?? null;
}

async function ensureAuthConfig(
  env: Record<string, string | undefined>,
  integrationId: IntegrationId,
): Promise<string | null> {
  const definition = integrationDefinitions.find((integration) => integration.id === integrationId);
  if (!definition || !definition.connectable) return null;

  const existing = await listAuthConfigs(env);
  const match = existing.find((item) => item.toolkit?.slug === definition.toolkit);
  if (match?.id) return match.id;

  return createManagedAuthConfig(env, definition.toolkit);
}

export async function getIntegrationStatus(
  workerEnv: Record<string, string | undefined> = {},
  userId = "clawforge-demo-user",
): Promise<IntegrationStatus> {
  const env = runtimeEnv(workerEnv);
  const configured = Boolean(env.COMPOSIO_API_KEY);
  const dashboardUrl =
    env.COMPOSIO_DASHBOARD_URL ||
    "https://dashboard.composio.dev/aalang_workspace/clawforge/getting-started";

  if (!configured) {
    return {
      configured: false,
      connect_base_url: env.COMPOSIO_MCP_URL || "https://connect.composio.dev/mcp",
      dashboard_url: dashboardUrl,
      phone_number: env.COMPOSIO_PHONE_NUMBER || null,
      auth_configs: integrationDefinitions.map((definition) => ({
        id: definition.id,
        label: definition.label,
        toolkit: definition.toolkit,
        purpose: definition.purpose,
        status: "needs_api_key",
        auth_config_id: null,
        connected_account_id: null,
        connectable: definition.connectable,
      })),
    };
  }

  try {
    const [authConfigs, connectedAccounts] = await Promise.all([
      listAuthConfigs(env),
      listConnectedAccounts(env, userId),
    ]);

    return {
      configured: true,
      connect_base_url: env.COMPOSIO_MCP_URL || "https://connect.composio.dev/mcp",
      dashboard_url: dashboardUrl,
      phone_number: env.COMPOSIO_PHONE_NUMBER || null,
      auth_configs: integrationDefinitions.map((definition) => {
        const authConfig = authConfigs.find((item) => item.toolkit?.slug === definition.toolkit);
        const account = connectedAccounts.find(
          (item) =>
            item.toolkit?.slug === definition.toolkit ||
            (authConfig?.id && item.auth_config?.id === authConfig.id),
        );
        return {
          id: definition.id,
          label: definition.label,
          toolkit: definition.toolkit,
          purpose: definition.purpose,
          status:
            account?.status === "ACTIVE"
              ? "connected"
              : authConfig?.id
                ? "ready_to_connect"
                : definition.connectable
                  ? "ready_to_connect"
                  : "needs_auth_config",
          auth_config_id: authConfig?.id ?? null,
          connected_account_id: account?.id ?? null,
          connectable: definition.connectable,
        };
      }),
    };
  } catch {
    return {
      configured: true,
      connect_base_url: env.COMPOSIO_MCP_URL || "https://connect.composio.dev/mcp",
      dashboard_url: dashboardUrl,
      phone_number: env.COMPOSIO_PHONE_NUMBER || null,
      auth_configs: integrationDefinitions.map((definition) => ({
        id: definition.id,
        label: definition.label,
        toolkit: definition.toolkit,
        purpose: definition.purpose,
        status: definition.connectable ? "ready_to_connect" : "needs_auth_config",
        auth_config_id: null,
        connected_account_id: null,
        connectable: definition.connectable,
      })),
    };
  }
}

export async function createIntegrationConnectLink(
  request: Request,
  workerEnv: Record<string, string | undefined> = {},
): Promise<{
  integration: IntegrationConfig;
  redirect_url: string | null;
  connected_account_id: string | null;
  expires_at: string | null;
  message: string;
}> {
  const env = runtimeEnv(workerEnv);
  if (!env.COMPOSIO_API_KEY) {
    throw new Error("Integration API key is not configured.");
  }

  const body = (await request.json().catch(() => ({}))) as {
    integration_id?: unknown;
    user_id?: unknown;
    callback_url?: unknown;
  };
  const integrationId = String(body.integration_id || "").trim() as IntegrationId;
  const definition = integrationDefinitions.find((integration) => integration.id === integrationId);
  if (!definition) throw new Error("Unknown integration.");
  if (!definition.connectable) {
    const status = await getIntegrationStatus(workerEnv, userIdFromRequest(request));
    const integration = status.auth_configs.find((config) => config.id === definition.id);
    return {
      integration: integration ?? {
        id: definition.id,
        label: definition.label,
        toolkit: definition.toolkit,
        purpose: definition.purpose,
        status: "needs_auth_config",
        auth_config_id: null,
        connected_account_id: null,
        connectable: false,
      },
      redirect_url: null,
      connected_account_id: null,
      expires_at: null,
      message:
        "This integration needs a custom auth config or business number before hosted connection is available.",
    };
  }

  const authConfigId = await ensureAuthConfig(env, integrationId);
  if (!authConfigId) throw new Error("Could not create auth config.");

  const userId =
    typeof body.user_id === "string" && body.user_id.trim()
      ? body.user_id.trim()
      : userIdFromRequest(request);
  const callbackUrl =
    typeof body.callback_url === "string" && body.callback_url.trim()
      ? body.callback_url.trim()
      : new URL("/", request.url).toString();

  const link = await composioFetch<{
    redirect_url?: string;
    connected_account_id?: string;
    expires_at?: string;
  }>("/api/v3/connected_accounts/link", env, {
    method: "POST",
    body: JSON.stringify({
      auth_config_id: authConfigId,
      user_id: userId,
      callback_url: callbackUrl,
    }),
  });

  return {
    integration: {
      id: definition.id,
      label: definition.label,
      toolkit: definition.toolkit,
      purpose: definition.purpose,
      status: "ready_to_connect",
      auth_config_id: authConfigId,
      connected_account_id: link.connected_account_id ?? null,
      connectable: true,
    },
    redirect_url: link.redirect_url ?? null,
    connected_account_id: link.connected_account_id ?? null,
    expires_at: link.expires_at ?? null,
    message: "Open the secure connect link to finish integration access.",
  };
}
