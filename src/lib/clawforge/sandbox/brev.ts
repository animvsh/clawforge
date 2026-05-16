import { DEMO_AGENT_ID } from "../fixtures";
import { getIntegrationStatus, type IntegrationConfig } from "../integrations/composio";
import { getPipedreamStatus } from "../integrations/pipedream";
import { createProviderRegistry } from "../providers";
import type { BlueprintResponse, ProviderMode, RuntimeEvent } from "../types";

export type BrevInstanceStatus = "not_installed" | "not_authenticated" | "ready" | "error";

export type BrevStatus = {
  ok: boolean;
  status: BrevInstanceStatus;
  cliPath: string | null;
  instances: Array<Record<string, unknown>>;
  message: string;
  installCommand: string;
};

export type BrevLaunchPlan = {
  ok: boolean;
  mode: "dry_run" | "create_blocked" | "created" | "create_failed";
  instanceName: string;
  command: string;
  status: BrevStatus;
  events: RuntimeEvent[];
  openHands: OpenHandsConnection;
  integrationManifest: NemoClawIntegrationManifest;
  startupScript: {
    path: string | null;
    inline: boolean;
  };
};

export type OpenHandsConnection = {
  mode: "local" | "remote" | "simulated";
  workspaceUrl: string | null;
  runtimeApiUrl: string | null;
  serverImage: string;
  conversationId: string;
};

export type OpenHandsChatResponse = {
  ok: true;
  reply: string;
  events: RuntimeEvent[];
  openHands: OpenHandsConnection;
};

type CommandResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
};

export type NemoClawIntegrationManifest = {
  version: 1;
  instance_name: string;
  generated_at: string;
  agent: {
    id: string;
    name: string;
    blueprint_id: string | null;
    template_id: string | null;
    goal: string | null;
    model: string | null;
    provider: ProviderMode | null;
  };
  memory: {
    engine: "mem0";
    hosted_on: "brev";
    embedding_model: string;
    reasoning_model: string | null;
    scope: "workspace";
    status: "configured";
  };
  integrations: Array<{
    id: string;
    label: string;
    toolkit: string;
    purpose: string;
    status: string;
    auth_config_id: string | null;
    connected_account_id: string | null;
    required: boolean;
    connectable: boolean;
  }>;
  pipedream: {
    configured: boolean;
    project_id: string | null;
    environment: string;
    connections: Array<{
      id: string;
      label: string;
      app: string;
      required: boolean;
      status: string;
    }>;
  };
  inbox: {
    email: string | null;
    status: string;
  };
  capabilities: {
    agentphone: boolean;
    voice_agent: boolean;
    agent_inbox: boolean;
    calendar: boolean;
    gmail: boolean;
    google_docs: boolean;
    google_drive: boolean;
    google_sheets: boolean;
  };
  secret_names: string[];
};

type BrevIntegrationOptions = {
  blueprint?: BlueprintResponse;
  agentInbox?: {
    email?: string | null;
    status?: string | null;
  };
  workerEnv?: Record<string, string | undefined>;
};

const INSTALL_COMMAND = "brew install brevdev/homebrew-brev/brev";
const DEFAULT_SERVER_IMAGE = "ghcr.io/openhands/agent-server:main-python";
const BREV_CANDIDATE_PATHS = [
  "/opt/homebrew/bin/brev",
  "/usr/local/bin/brev",
  "/usr/bin/brev",
  "brev",
];

function now(): string {
  return new Date().toISOString();
}

function runtimeEvent(
  type: RuntimeEvent["type"],
  message: string,
  severity: RuntimeEvent["severity"] = "info",
  metadata?: Record<string, unknown>,
): RuntimeEvent {
  return {
    id: `brev_event_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    agent_id: DEMO_AGENT_ID,
    type,
    message,
    timestamp: now(),
    severity,
    metadata,
  };
}

function readEnv(name: string): string {
  const processEnv =
    typeof process !== "undefined" && typeof process.env === "object" ? process.env : undefined;
  const viteEnv = import.meta.env as Record<string, string | undefined>;
  return processEnv?.[name] ?? viteEnv[name] ?? "";
}

function hasNodeRuntime(): boolean {
  return (
    typeof process !== "undefined" &&
    typeof process.versions === "object" &&
    typeof process.versions.node === "string"
  );
}

function base64Encode(value: string): string {
  if (typeof Buffer !== "undefined") return Buffer.from(value, "utf8").toString("base64");
  return btoa(value);
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

function sanitizeFilePart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function requiredIntegrationIds(blueprint?: BlueprintResponse): Set<string> {
  return new Set(
    (blueprint?.integration_requirements ?? [])
      .filter((integration) => integration.status === "required")
      .map((integration) => integration.id),
  );
}

function secretNamesForIntegrations(integrations: IntegrationConfig[]): string[] {
  const names = new Set<string>(["NVIDIA_API_KEY", "MINIMAX_PLAN_KEY", "COMPOSIO_API_KEY"]);

  if (integrations.some((integration) => integration.id === "agent_email")) {
    names.add("AGENTMAIL_API_KEY");
  }
  if (
    integrations.some(
      (integration) => integration.id === "phone_sms" || integration.id === "voice_agent",
    )
  ) {
    names.add("VAPI_API_KEY");
  }
  return Array.from(names);
}

async function buildIntegrationManifest(
  instanceName: string,
  options: BrevIntegrationOptions = {},
): Promise<NemoClawIntegrationManifest> {
  const integrationStatus = await getIntegrationStatus(options.workerEnv ?? {});
  const pipedreamStatus = await getPipedreamStatus(
    options.workerEnv ?? {},
    options.blueprint?.integration_requirements ?? [],
  );
  const requiredIds = requiredIntegrationIds(options.blueprint);
  const integrations = integrationStatus.auth_configs.map((integration) => ({
    id: integration.id,
    label: integration.label,
    toolkit: integration.toolkit,
    purpose: integration.purpose,
    status: integration.status,
    auth_config_id: integration.auth_config_id,
    connected_account_id: integration.connected_account_id,
    required: requiredIds.has(integration.id),
    connectable: integration.connectable,
  }));

  return {
    version: 1,
    instance_name: instanceName,
    generated_at: now(),
    agent: {
      id: options.blueprint?.blueprint_id
        ? `agent_${options.blueprint.template_id}_${options.blueprint.blueprint_id.slice(-8)}`
        : DEMO_AGENT_ID,
      name: options.blueprint?.agent_name ?? "ClawForge Agent",
      blueprint_id: options.blueprint?.blueprint_id ?? null,
      template_id: options.blueprint?.template_id ?? null,
      goal: options.blueprint?.goal ?? null,
      model: options.blueprint?.model ?? null,
      provider: options.blueprint?.provider ?? null,
    },
    memory: {
      engine: "mem0",
      hosted_on: "brev",
      embedding_model: "nvidia/nv-embedqa-e5-v5",
      reasoning_model: options.blueprint?.model ?? null,
      scope: "workspace",
      status: "configured",
    },
    integrations,
    pipedream: {
      configured: pipedreamStatus.configured,
      project_id: pipedreamStatus.project_id,
      environment: pipedreamStatus.environment,
      connections: pipedreamStatus.connections.map((connection) => ({
        id: connection.id,
        label: connection.label,
        app: connection.app,
        required: connection.required,
        status: connection.status,
      })),
    },
    inbox: {
      email: options.agentInbox?.email ?? null,
      status: options.agentInbox?.status ?? (options.agentInbox?.email ? "ready" : "not_created"),
    },
    capabilities: {
      agentphone: requiredIds.has("phone_sms"),
      voice_agent:
        requiredIds.has("phone_sms") || options.blueprint?.template_id === "phone_receptionist",
      agent_inbox: Boolean(options.agentInbox?.email) || requiredIds.has("email"),
      calendar: requiredIds.has("calendar"),
      gmail: requiredIds.has("email"),
      google_docs: requiredIds.has("google_docs"),
      google_drive: requiredIds.has("google_drive"),
      google_sheets: requiredIds.has("google_sheets"),
    },
    secret_names: secretNamesForIntegrations(integrationStatus.auth_configs),
  };
}

async function writeStartupScript(
  instanceName: string,
  manifest: NemoClawIntegrationManifest,
): Promise<{ arg: string; path: string | null; inline: boolean }> {
  const manifestJson = JSON.stringify(manifest, null, 2);
  const manifestB64 = base64Encode(manifestJson);
  const secretNames = manifest.secret_names.join(",");
  const script = `#!/usr/bin/env bash
set -euo pipefail
set +x
export CLAWFORGE_REPO_URL="\${CLAWFORGE_REPO_URL:-https://github.com/animvsh/clawforge.git}"
export CLAWFORGE_ROOT="\${CLAWFORGE_ROOT:-/home/ubuntu/workspace/clawforge}"
export CLAWFORGE_INTEGRATION_MANIFEST_B64=${shellQuote(manifestB64)}
export CLAWFORGE_REQUIRED_SECRET_NAMES=${shellQuote(secretNames)}
export CLAWFORGE_AGENT_NAME=${shellQuote(manifest.agent.name)}
export CLAWFORGE_BLUEPRINT_ID=${shellQuote(manifest.agent.blueprint_id ?? "")}
export CLAWFORGE_MODEL=${shellQuote(manifest.agent.model ?? "")}
export CLAWFORGE_PROVIDER=${shellQuote(manifest.agent.provider ?? "")}
export CLAWFORGE_MEMORY_ENGINE="mem0"
export CLAWFORGE_MEMORY_HOST="brev"
if ! command -v git >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y git
fi
mkdir -p "$(dirname "\${CLAWFORGE_ROOT}")"
if [[ ! -d "\${CLAWFORGE_ROOT}/.git" ]]; then
  git clone "\${CLAWFORGE_REPO_URL}" "\${CLAWFORGE_ROOT}"
else
  git -C "\${CLAWFORGE_ROOT}" pull --ff-only || true
fi
cd "\${CLAWFORGE_ROOT}"
./scripts/brev/setup-clawforge.sh
`;

  if (hasNodeRuntime()) {
    try {
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      const directory = path.join(process.cwd(), ".runtime", "brev");
      await fs.mkdir(directory, { recursive: true, mode: 0o700 });
      const filePath = path.join(directory, `${sanitizeFilePart(instanceName)}-startup.sh`);
      await fs.writeFile(filePath, script, { mode: 0o700 });
      return { arg: `@${filePath}`, path: filePath, inline: false };
    } catch {
      // Cloudflare Workers cannot write local files. Inline startup still carries the manifest.
    }
  }

  return { arg: script, path: null, inline: true };
}

async function runCommand(
  command: string,
  args: string[],
  timeoutMs = 8_000,
): Promise<CommandResult> {
  if (!hasNodeRuntime()) {
    return { ok: false, stdout: "", stderr: "Server runtime unavailable.", exitCode: null };
  }

  try {
    const childProcess = await import("node:child_process");
    const result = await new Promise<CommandResult>((resolve) => {
      const env = {
        ...process.env,
        PATH: [
          "/opt/homebrew/bin",
          "/usr/local/bin",
          "/usr/bin",
          "/bin",
          "/usr/sbin",
          "/sbin",
          process.env.PATH ?? "",
        ].join(":"),
      };
      const child = childProcess.execFile(
        command,
        args,
        { timeout: timeoutMs, env },
        (error, stdout, stderr) => {
          resolve({
            ok: !error,
            stdout: String(stdout ?? ""),
            stderr: String(stderr ?? ""),
            exitCode:
              error && typeof (error as { code?: unknown }).code === "number"
                ? ((error as { code: number }).code ?? null)
                : error
                  ? 1
                  : 0,
          });
        },
      );
      child.on("error", (error) => {
        resolve({ ok: false, stdout: "", stderr: error.message, exitCode: null });
      });
    });
    return result;
  } catch (error) {
    return {
      ok: false,
      stdout: "",
      stderr: error instanceof Error ? error.message : "Command runtime unavailable.",
      exitCode: null,
    };
  }
}

function parseBrevInstances(stdout: string): Array<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(stdout) as unknown;
    if (Array.isArray(parsed))
      return parsed.filter((item) => item && typeof item === "object") as Array<
        Record<string, unknown>
      >;
    if (
      parsed &&
      typeof parsed === "object" &&
      Array.isArray((parsed as { instances?: unknown }).instances)
    ) {
      return (parsed as { instances: Array<Record<string, unknown>> }).instances;
    }
  } catch {
    // Text output is still useful to the operator but not structured enough for cards.
  }
  return [];
}

async function resolveBrevCli(): Promise<string | null> {
  for (const candidate of BREV_CANDIDATE_PATHS) {
    const result =
      candidate === "brev"
        ? await runCommand("which", ["brev"], 3_000)
        : await runCommand(candidate, ["--help"], 3_000);

    if (result.ok) {
      return candidate === "brev" ? result.stdout.trim() : candidate;
    }
  }

  return null;
}

export async function getBrevStatus(): Promise<BrevStatus> {
  const cliPath = await resolveBrevCli();

  if (!cliPath) {
    return {
      ok: false,
      status: "not_installed",
      cliPath: null,
      instances: [],
      message: "Brev CLI is not installed on this machine.",
      installCommand: INSTALL_COMMAND,
    };
  }

  const list = await runCommand(cliPath, ["ls", "--json"], 10_000);
  if (!list.ok) {
    const message = [list.stderr, list.stdout].filter(Boolean).join("\n").trim();
    const needsAuth = /login|auth|token|forbidden|logged out/i.test(message);
    return {
      ok: false,
      status: needsAuth ? "not_authenticated" : "error",
      cliPath,
      instances: [],
      message: needsAuth
        ? "Brev CLI is installed but needs a fresh login before it can create a NemoClaw instance."
        : message || "Brev CLI is installed but could not list instances.",
      installCommand: INSTALL_COMMAND,
    };
  }

  return {
    ok: true,
    status: "ready",
    cliPath,
    instances: parseBrevInstances(list.stdout),
    message: "Brev CLI is installed and reachable.",
    installCommand: INSTALL_COMMAND,
  };
}

function envOrRuntime(env: Record<string, string | undefined>, name: string): string {
  return env[name] ?? readEnv(name);
}

export function openHandsConnection(
  env: Record<string, string | undefined> = {},
): OpenHandsConnection {
  const workspaceUrl =
    envOrRuntime(env, "OPENHANDS_WORKSPACE_URL") || envOrRuntime(env, "NEMOCLAW_OPENHANDS_URL");
  const runtimeApiUrl =
    envOrRuntime(env, "OPENHANDS_RUNTIME_API_URL") || envOrRuntime(env, "RUNTIME_API_URL");
  return {
    mode: workspaceUrl ? "remote" : runtimeApiUrl ? "remote" : "simulated",
    workspaceUrl: workspaceUrl || null,
    runtimeApiUrl: runtimeApiUrl || null,
    serverImage: envOrRuntime(env, "OPENHANDS_SERVER_IMAGE") || DEFAULT_SERVER_IMAGE,
    conversationId: `clawforge_${DEMO_AGENT_ID}`,
  };
}

async function proxyRemoteRuntimeChat(
  openHands: OpenHandsConnection,
  message: string,
  provider: ProviderMode,
): Promise<OpenHandsChatResponse | null> {
  if (!openHands.runtimeApiUrl) return null;
  try {
    const endpoint = new URL("/api/clawforge/remote-chat", openHands.runtimeApiUrl);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message,
        provider,
        conversation_id: openHands.conversationId,
      }),
    });
    const data = (await response.json()) as {
      ok?: boolean;
      chat?: OpenHandsChatResponse;
      error?: { message?: string };
    };
    if (!response.ok || !data.ok || !data.chat) {
      throw new Error(data.error?.message || "Remote NemoClaw runtime did not accept the chat.");
    }
    return data.chat;
  } catch {
    return null;
  }
}

export async function createBrevLaunchPlan(
  instanceName = "clawforge-nemoclaw",
  options: BrevIntegrationOptions = {},
): Promise<BrevLaunchPlan> {
  const status = await getBrevStatus();
  const integrationManifest = await buildIntegrationManifest(instanceName, options);
  const startupScript = await writeStartupScript(instanceName, integrationManifest);
  const command = `brev create ${instanceName} --type l40s-48gb.1x --startup-script ${
    startupScript.inline ? "<inline-clawforge-startup>" : startupScript.arg
  }`;
  const openHands = openHandsConnection();
  const events = [
    runtimeEvent("agent.started", "Prepared Brev NemoClaw launch plan.", "success", {
      instance_name: instanceName,
      command,
      agent_name: integrationManifest.agent.name,
      integrations: integrationManifest.integrations
        .filter((integration) => integration.required)
        .map((integration) => integration.label),
    }),
    runtimeEvent(
      "memory.updated",
      "Attached custom integration manifest to the NemoClaw startup payload.",
      "success",
      {
        manifest_version: integrationManifest.version,
        auth_configs: integrationManifest.integrations.filter((integration) =>
          Boolean(integration.auth_config_id),
        ).length,
        agent_inbox: integrationManifest.inbox.email,
      },
    ),
    runtimeEvent(
      "tool.called",
      status.ok
        ? "Brev CLI is reachable. Launch is held in dry-run mode until a human confirms cloud creation."
        : status.message,
      status.ok ? "info" : "warning",
      { brev_status: status.status },
    ),
    runtimeEvent(
      "policy.checked",
      "Cloud instance creation requires human confirmation.",
      "warning",
      {
        action: "brev.create",
        effect: "require_approval",
      },
    ),
  ];

  return {
    ok: status.ok,
    mode: "dry_run",
    instanceName,
    command,
    status,
    events,
    openHands,
    integrationManifest,
    startupScript: {
      path: startupScript.path,
      inline: startupScript.inline,
    },
  };
}

export async function createBrevInstance(
  instanceName = "clawforge-nemoclaw",
  instanceType = "l40s-48gb.1x",
  confirmed = false,
  options: BrevIntegrationOptions = {},
): Promise<BrevLaunchPlan> {
  const status = await getBrevStatus();
  const integrationManifest = await buildIntegrationManifest(instanceName, options);
  const startupScript = await writeStartupScript(instanceName, integrationManifest);
  const command = `brev create ${instanceName} --type ${instanceType} --startup-script ${
    startupScript.inline ? "<inline-clawforge-startup>" : startupScript.arg
  }`;
  const openHands = openHandsConnection();
  const events = [
    runtimeEvent(
      "policy.checked",
      "Human approval checked before Brev cloud creation.",
      "warning",
      {
        action: "brev.create",
        effect: confirmed ? "allow" : "require_approval",
        instance_type: instanceType,
        estimated_cost: "about $1.74/hr for the current cheapest L40S option",
        agent_name: integrationManifest.agent.name,
        integration_manifest: {
          integrations: integrationManifest.integrations
            .filter((integration) => integration.required)
            .map((integration) => integration.id),
          inbox: integrationManifest.inbox.email,
        },
      },
    ),
    runtimeEvent(
      "memory.updated",
      "Prepared custom integration manifest for the created NemoClaw instance.",
      "success",
      {
        secret_names: integrationManifest.secret_names,
        startup_script: startupScript.path,
      },
    ),
  ];

  if (!confirmed) {
    events.push(
      runtimeEvent(
        "approval.requested",
        "Brev instance creation is blocked until the user confirms cloud spend.",
        "warning",
      ),
    );
    return {
      ok: false,
      mode: "create_blocked",
      instanceName,
      command,
      status,
      events,
      openHands,
      integrationManifest,
      startupScript: {
        path: startupScript.path,
        inline: startupScript.inline,
      },
    };
  }

  if (!status.ok || !status.cliPath) {
    events.push(
      runtimeEvent("agent.error", status.message, "error", {
        brev_status: status.status,
      }),
    );
    return {
      ok: false,
      mode: "create_failed",
      instanceName,
      command,
      status,
      events,
      openHands,
      integrationManifest,
      startupScript: {
        path: startupScript.path,
        inline: startupScript.inline,
      },
    };
  }

  const result = await runCommand(
    status.cliPath,
    ["create", instanceName, "--type", instanceType, "--startup-script", startupScript.arg],
    180_000,
  );

  if (!result.ok) {
    events.push(
      runtimeEvent("agent.error", "Brev instance creation failed.", "error", {
        stderr: result.stderr.slice(0, 600),
        exit_code: result.exitCode,
      }),
    );
    return {
      ok: false,
      mode: "create_failed",
      instanceName,
      command,
      status,
      events,
      openHands,
      integrationManifest,
      startupScript: {
        path: startupScript.path,
        inline: startupScript.inline,
      },
    };
  }

  events.push(
    runtimeEvent("agent.started", "Brev instance creation started for NemoClaw.", "success", {
      stdout: result.stdout.slice(0, 800),
      instance_name: instanceName,
      instance_type: instanceType,
    }),
  );

  return {
    ok: true,
    mode: "created",
    instanceName,
    command,
    status: await getBrevStatus(),
    events,
    openHands,
    integrationManifest,
    startupScript: {
      path: startupScript.path,
      inline: startupScript.inline,
    },
  };
}

export async function chatWithOpenHands(
  message: string,
  env: Record<string, string | undefined> = {},
  provider: ProviderMode = "auto",
): Promise<OpenHandsChatResponse> {
  const openHands = openHandsConnection(env);
  const normalized = message.trim() || "Inspect the NemoClaw sandbox.";
  if (env.CLAWFORGE_ALLOW_REMOTE_OPENHANDS !== "0") {
    const remote = await proxyRemoteRuntimeChat(openHands, normalized, provider);
    if (remote) {
      return {
        ...remote,
        events: [
          runtimeEvent(
            "tool.called",
            "Forwarded chat to the deployed NemoClaw runtime.",
            "success",
            {
              runtime_api_url: openHands.runtimeApiUrl,
            },
          ),
          ...remote.events,
        ],
      };
    }
  }
  const isReceptionistRequest =
    /\b(phone|call|calls|receptionist|sms|text|calendar|schedule|appointment|booking)\b/i.test(
      normalized,
    );
  const registry = createProviderRegistry(env);
  const activeProvider = registry.getProvider(provider);
  const fallbackChain = registry.getConfig().fallback_chain.join(" -> ");
  const providerReply = await registry
    .summarize(
      {
        prompt: `User is chatting with an OpenHands-powered NemoClaw sandbox control panel. Reply in two concise sentences. User request: ${normalized}`,
        context: {
          openhands_mode: openHands.mode,
          fallback_chain: fallbackChain,
        },
      },
      provider,
    )
    .catch(() =>
      openHands.mode === "simulated"
        ? "I can inspect the generated NemoClaw plan, run predeploy policy checks, and show the sandbox trace. Connect Brev/OpenHands to execute this in a remote workspace."
        : "OpenHands is ready to route this request into the configured remote NemoClaw workspace.",
    );
  const reply = isReceptionistRequest
    ? `${providerReply}\n\nTo finish this agent, connect Phone/SMS and Calendar access. I will keep booking, texting, and customer-record updates approval-gated before anything changes outside the sandbox.`
    : providerReply;
  const events = [
    runtimeEvent("agent.thinking", `OpenHands received: ${normalized}`, "info", {
      openhands_mode: openHands.mode,
      conversation_id: openHands.conversationId,
      provider: activeProvider.mode,
      model: activeProvider.model,
      fallback_chain: fallbackChain,
    }),
    runtimeEvent(
      "tool.called",
      openHands.mode === "simulated"
        ? "Simulated OpenHands workspace checked the NemoClaw plan locally."
        : "OpenHands workspace connection prepared for remote sandbox interaction.",
      "success",
      {
        workspace_url: openHands.workspaceUrl,
        runtime_api_url: openHands.runtimeApiUrl,
        server_image: openHands.serverImage,
      },
    ),
    runtimeEvent(
      "policy.checked",
      "NemoClaw policy broker kept shell execution approval-gated.",
      "warning",
      {
        action: "shell.execute",
        effect: "require_approval",
      },
    ),
  ];

  return {
    ok: true,
    reply,
    events,
    openHands,
  };
}
