import type { BlueprintResponse, IntegrationRequirement } from "../types";

export type IntegrationId =
  | "phone_sms"
  | "calendar"
  | "calendly"
  | "email"
  | "crm"
  | "github"
  | "google_docs"
  | "google_drive"
  | "google_slides"
  | "google_sheets"
  | "jira"
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

export type IntegrationConnectionNeed = {
  id: IntegrationId;
  label: string;
  purpose: string;
  required: boolean;
  status: IntegrationConfig["status"];
  connectable: boolean;
  connected: boolean;
  reason: string;
  action_label: string;
};

export type IntegrationReadiness = {
  configured: boolean;
  requirements: IntegrationRequirement[];
  connection_needs: IntegrationConnectionNeed[];
  message: string;
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
    id: "calendly",
    label: "Calendly",
    toolkit: "calendly",
    purpose: "Read booking links, scheduled events, and appointment context.",
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
    id: "google_docs",
    label: "Docs",
    toolkit: "googledocs",
    purpose: "Read, draft, and update approved documents for the agent workflow.",
    connectable: true,
  },
  {
    id: "google_slides",
    label: "Slides",
    toolkit: "googleslides",
    purpose: "Create and update approved slide decks and presentation artifacts.",
    connectable: true,
  },
  {
    id: "google_sheets",
    label: "Sheets",
    toolkit: "googlesheets",
    purpose: "Read and update approved spreadsheets, trackers, and structured records.",
    connectable: true,
  },
  {
    id: "google_drive",
    label: "Drive",
    toolkit: "googledrive",
    purpose: "Find and store approved documents, sheets, and generated reports.",
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
    id: "jira",
    label: "Jira",
    toolkit: "jira",
    purpose: "Create approved Jira issues and track operational work.",
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

const integrationDefinitionById = new Map(
  integrationDefinitions.map((definition) => [definition.id, definition]),
);

const defaultAuthConfigIds: Partial<Record<IntegrationId, string>> = {};

function runtimeEnv(workerEnv: Record<string, string | undefined> = {}) {
  const viteEnv = import.meta.env as Record<string, string | undefined>;
  const nodeEnv =
    typeof process !== "undefined" && typeof process.env === "object"
      ? (process.env as Record<string, string | undefined>)
      : {};
  return { ...nodeEnv, ...viteEnv, ...workerEnv };
}

function envAuthConfigKey(integrationId: IntegrationId) {
  return `COMPOSIO_AUTH_CONFIG_${integrationId.toUpperCase()}`;
}

function fallbackAuthConfigId(
  env: Record<string, string | undefined>,
  integrationId: IntegrationId,
) {
  return env[envAuthConfigKey(integrationId)] || defaultAuthConfigIds[integrationId] || null;
}

function hasVapiCredentials(env: Record<string, string | undefined>) {
  return Boolean(
    env.VAPI_API_KEY || env.VAPI_PRIVATE_KEY || env.VITE_VAPI_PUBLIC_KEY || env.VAPI_PUBLIC_KEY,
  );
}

function integrationStatusForDefinition(
  definition: (typeof integrationDefinitions)[number],
  env: Record<string, string | undefined>,
  authConfigId: string | null,
  connected = false,
): IntegrationConfig["status"] {
  if (connected) return "connected";
  if (definition.id === "phone_sms" || definition.id === "voice_agent") {
    return hasVapiCredentials(env) ? "ready_to_connect" : "needs_auth_config";
  }
  if (!definition.connectable) return "needs_auth_config";
  if (authConfigId || env.COMPOSIO_API_KEY) return "ready_to_connect";
  return "needs_api_key";
}

function addRequirement(
  requirements: IntegrationRequirement[],
  id: IntegrationId,
  status: IntegrationRequirement["status"],
  purpose?: string,
) {
  if (requirements.some((requirement) => requirement.id === id)) return;
  const definition = integrationDefinitionById.get(id);
  if (!definition) return;
  requirements.push({
    id,
    label: definition.label,
    purpose: purpose ?? definition.purpose,
    status,
  });
}

export function inferIntegrationRequirements(prompt: string): IntegrationRequirement[] {
  const normalized = prompt.toLowerCase();
  const requirements: IntegrationRequirement[] = [];

  if (/\b(phone|call|calls|receptionist|voicemail)\b/.test(normalized)) {
    addRequirement(
      requirements,
      "phone_sms",
      "required",
      "Answer calls, receive customer replies, and send approved text confirmations.",
    );
  }
  if (/\b(phone|call|calls|receptionist|voicemail|voice|voice agent)\b/.test(normalized)) {
    addRequirement(
      requirements,
      "voice_agent",
      "required",
      "Create a live voice agent with approval-gated tools and NemoClaw policies.",
    );
  }
  if (/\b(sms|text|texts|message|confirmation)\b/.test(normalized)) {
    addRequirement(
      requirements,
      "phone_sms",
      "required",
      "Send approved confirmations and follow-up messages.",
    );
  }
  if (/\b(calendar|schedule|appointment|booking|book|availability)\b/.test(normalized)) {
    addRequirement(
      requirements,
      "calendar",
      "required",
      "Read availability and create approved appointments.",
    );
    addRequirement(
      requirements,
      "calendly",
      "optional",
      "Use existing booking links and scheduled-event context when available.",
    );
  }
  if (/\b(gmail|email|inbox|follow up|follow-up)\b/.test(normalized)) {
    addRequirement(requirements, "email", "required", "Send approved follow-ups and summaries.");
  }
  if (/\b(dedicated inbox|agent inbox|agent email)\b/.test(normalized)) {
    addRequirement(
      requirements,
      "agent_email",
      "required",
      "Create a dedicated email inbox for confirmations, replies, and OTPs.",
    );
  }
  if (/\b(doc|docs|document|documents|google doc|writeup|brief)\b/.test(normalized)) {
    addRequirement(
      requirements,
      "google_docs",
      "required",
      "Draft, review, and update approved documents for this workflow.",
    );
    addRequirement(
      requirements,
      "google_drive",
      "optional",
      "Find and store approved documents and generated reports.",
    );
  }
  if (/\b(slide|slides|deck|presentation|presentations)\b/.test(normalized)) {
    addRequirement(
      requirements,
      "google_slides",
      "required",
      "Create or update approved slide decks for this workflow.",
    );
    addRequirement(
      requirements,
      "google_drive",
      "optional",
      "Find and store approved slide decks and generated reports.",
    );
  }
  if (/\b(sheet|sheets|spreadsheet|spread spreadsheets|tracker|row|rows)\b/.test(normalized)) {
    addRequirement(
      requirements,
      "google_sheets",
      "required",
      "Read and update approved spreadsheets or trackers.",
    );
    addRequirement(
      requirements,
      "google_drive",
      "optional",
      "Find and store approved spreadsheets and generated reports.",
    );
  }
  if (/\b(slack|channel|channels|team notification|internal notification)\b/.test(normalized)) {
    addRequirement(
      requirements,
      "slack",
      "required",
      "Send approved internal updates and team handoffs.",
    );
  }
  if (/\b(customer|lead|crm|contact|contacts)\b/.test(normalized)) {
    addRequirement(
      requirements,
      "crm",
      "optional",
      "Look up and update customer records after approval.",
    );
  }
  if (/\b(github|repo|repository|issue|pull request|pr)\b/.test(normalized)) {
    addRequirement(
      requirements,
      "github",
      "required",
      "Read repository activity and apply approved issue updates.",
    );
  }
  if (/\b(linear|ticket|tickets)\b/.test(normalized)) {
    addRequirement(
      requirements,
      "linear",
      "required",
      "Create approved tickets and engineering follow-ups.",
    );
  }
  if (/\b(jira|atlassian|issue key|sprint)\b/.test(normalized)) {
    addRequirement(
      requirements,
      "jira",
      "required",
      "Create approved Jira issues and track sprint handoffs.",
    );
  }

  return requirements;
}

function normalizeRequirement(requirement: IntegrationRequirement): IntegrationRequirement | null {
  const definition = integrationDefinitionById.get(requirement.id as IntegrationId);
  if (!definition) return null;
  return {
    id: definition.id,
    label: requirement.label || definition.label,
    purpose: requirement.purpose || definition.purpose,
    status: requirement.status,
  };
}

function dedupeRequirements(requirements: IntegrationRequirement[]): IntegrationRequirement[] {
  const byId = new Map<string, IntegrationRequirement>();
  for (const requirement of requirements) {
    const normalized = normalizeRequirement(requirement);
    if (!normalized) continue;
    const previous = byId.get(normalized.id);
    byId.set(normalized.id, {
      ...normalized,
      status: previous?.status === "required" ? "required" : normalized.status,
    });
  }
  return Array.from(byId.values());
}

function connectionReason(requirement: IntegrationRequirement, config: IntegrationConfig): string {
  if (config.status === "needs_api_key") {
    return `${config.label} is needed for this agent, but Integrations is not configured yet.`;
  }
  if (!config.connectable) {
    if (config.id === "phone_sms" || config.id === "voice_agent") {
      if (config.status === "ready_to_connect") {
        return `${config.label} is configured. Deploy will attach the voice or phone capability before calls run.`;
      }
      return `${config.label} is needed for this agent. Add a business number or voice provider before calls can run.`;
    }
    if (config.id === "agent_email") {
      return `${config.label} is needed for this agent. Create the agent inbox before email-only workflows run.`;
    }
    return `${config.label} is needed for this agent and requires admin setup before it can be connected.`;
  }
  if (config.status === "needs_auth_config") {
    return `${config.label} is needed for this agent. An admin needs to finish setup before the user can connect.`;
  }
  return `${config.label} is needed for this agent: ${requirement.purpose}`;
}

function actionLabel(config: IntegrationConfig): string {
  if (config.status === "needs_api_key") return "Configure Integrations";
  if (!config.connectable) return config.status === "ready_to_connect" ? "Ready" : "Setup required";
  if (config.status === "needs_auth_config") return "Finish setup";
  return "Connect";
}

export async function getIntegrationReadiness(
  workerEnv: Record<string, string | undefined> = {},
  options: {
    userId?: string;
    prompt?: string;
    requirements?: IntegrationRequirement[];
    blueprint?: Pick<BlueprintResponse, "integration_requirements"> | null;
  } = {},
): Promise<IntegrationReadiness> {
  const requirements = dedupeRequirements([
    ...(options.requirements ?? []),
    ...(options.blueprint?.integration_requirements ?? []),
    ...(options.prompt ? inferIntegrationRequirements(options.prompt) : []),
  ]);
  const status = await getIntegrationStatus(workerEnv, options.userId ?? "clawforge-demo-user");
  const configsById = new Map(status.auth_configs.map((config) => [config.id, config]));
  const connectionNeeds = requirements
    .filter((requirement) => requirement.status !== "connected")
    .map((requirement) => {
      const config = configsById.get(requirement.id as IntegrationId);
      if (!config) return null;
      return {
        id: config.id,
        label: config.label,
        purpose: requirement.purpose,
        required: requirement.status === "required",
        status: config.status,
        connectable: config.connectable,
        connected: config.status === "connected",
        reason: connectionReason(requirement, config),
        action_label: actionLabel(config),
      } satisfies IntegrationConnectionNeed;
    })
    .filter((need): need is IntegrationConnectionNeed => Boolean(need))
    .filter((need) => !need.connected);

  return {
    configured: status.configured,
    requirements,
    connection_needs: connectionNeeds,
    message: connectionNeeds.length
      ? "Connect these Integrations before the agent can use those tools."
      : requirements.length
        ? "All inferred Integrations are connected or ready."
        : "No external Integrations were inferred for this prompt.",
  };
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

  const fallbackId = fallbackAuthConfigId(env, integrationId);
  if (fallbackId) return fallbackId;
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
        status: integrationStatusForDefinition(
          definition,
          env,
          fallbackAuthConfigId(env, definition.id),
        ),
        auth_config_id: fallbackAuthConfigId(env, definition.id),
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
        const authConfigId =
          fallbackAuthConfigId(env, definition.id) ??
          authConfigs.find((item) => item.toolkit?.slug === definition.toolkit)?.id ??
          null;
        const account = connectedAccounts.find(
          (item) =>
            item.toolkit?.slug === definition.toolkit ||
            (authConfigId && item.auth_config?.id === authConfigId),
        );
        const accountIsConnected =
          Boolean(account?.id) && !/failed|expired|deleted/i.test(account.status ?? "");
        return {
          id: definition.id,
          label: definition.label,
          toolkit: definition.toolkit,
          purpose: definition.purpose,
          status: integrationStatusForDefinition(definition, env, authConfigId, accountIsConnected),
          auth_config_id: authConfigId,
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
        status: integrationStatusForDefinition(
          definition,
          env,
          fallbackAuthConfigId(env, definition.id),
        ),
        auth_config_id: fallbackAuthConfigId(env, definition.id),
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
