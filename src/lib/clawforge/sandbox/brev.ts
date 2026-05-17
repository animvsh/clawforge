import { DEMO_AGENT_ID } from "../fixtures";
import { getIntegrationStatus, type IntegrationConfig } from "../integrations/composio";
import { getPipedreamStatus } from "../integrations/pipedream";
import { createProviderRegistry } from "../providers";
import type { AgentTemplateId, BlueprintResponse, ProviderMode, RuntimeEvent } from "../types";

export type BrevInstanceStatus = "not_installed" | "not_authenticated" | "ready" | "error";

export type BrevDetectedInstance = {
  name: string | null;
  state: string | null;
  running: boolean;
  raw: Record<string, unknown>;
};

export type BrevStatus = {
  ok: boolean;
  status: BrevInstanceStatus;
  cliPath: string | null;
  instances: Array<Record<string, unknown>>;
  targetInstanceName: string | null;
  targetInstance: BrevDetectedInstance | null;
  runningNemoClawInstance: BrevDetectedInstance | null;
  auth: {
    tokenConfigured: boolean;
    loginAttempted: boolean;
    loginSucceeded: boolean | null;
    message: string | null;
  };
  message: string;
  installCommand: string;
};

export type BrevLaunchPlan = {
  ok: boolean;
  mode: "dry_run" | "create_blocked" | "created" | "already_running" | "create_failed";
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

type NemoClawChatContext = {
  agentName: string;
  templateId: AgentTemplateId | null;
  goal: string | null;
  tools: string[];
  integrations: string[];
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
const DEFAULT_BREV_INSTANCE_NAME = "clawforge-nemoclaw";
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

function parseChatContext(env: Record<string, string | undefined>): NemoClawChatContext {
  const fallbackName =
    env.CLAWFORGE_INSTANCE_NAME?.replace(/^clawforge-/, "").replace(/-/g, " ") || "NemoClaw";
  const fallback: NemoClawChatContext = {
    agentName: fallbackName
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" "),
    templateId: null,
    goal: null,
    tools: [],
    integrations: [],
  };
  if (!env.CLAWFORGE_BLUEPRINT_JSON) return fallback;
  try {
    const blueprint = JSON.parse(env.CLAWFORGE_BLUEPRINT_JSON) as BlueprintResponse;
    return {
      agentName: blueprint.agent_name || fallback.agentName,
      templateId: blueprint.template_id ?? null,
      goal: blueprint.goal ?? null,
      tools: blueprint.tools
        .filter((tool) => tool.enabled)
        .map((tool) => tool.name)
        .slice(0, 6),
      integrations: blueprint.integration_requirements
        .filter((integration) => integration.status === "required")
        .map((integration) => integration.label),
    };
  } catch {
    return fallback;
  }
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

function normalizeInstanceName(value?: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function configuredBrevInstanceName(): string {
  return (
    normalizeInstanceName(readEnv("BREV_INSTANCE_NAME")) ??
    normalizeInstanceName(readEnv("NEMOCLAW_BREV_INSTANCE_NAME")) ??
    normalizeInstanceName(readEnv("NEMOCLAW_SANDBOX_NAME")) ??
    DEFAULT_BREV_INSTANCE_NAME
  );
}

function authState(
  loginAttempted = false,
  loginSucceeded: boolean | null = null,
  message: string | null = null,
): BrevStatus["auth"] {
  return {
    tokenConfigured: Boolean(readEnv("BREV_TOKEN")),
    loginAttempted,
    loginSucceeded,
    message,
  };
}

function redactBrevOutput(value: string): string {
  const token = readEnv("BREV_TOKEN");
  if (!token) return value;
  return value.replaceAll(token, "[redacted-brev-token]");
}

function stringField(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

function detectInstance(record: Record<string, unknown>): BrevDetectedInstance {
  const name = stringField(record, ["name", "instance_name", "instanceName", "machine_name", "id"]);
  const state = stringField(record, [
    "status",
    "state",
    "phase",
    "lifecycle_state",
    "lifecycleState",
    "health_status",
    "shell_status",
    "build_status",
  ]);
  const running = state ? /running|ready|active|started|healthy|available/i.test(state) : false;
  return { name, state, running, raw: record };
}

function isNemoClawInstance(instance: BrevDetectedInstance): boolean {
  return /clawforge|nemoclaw|openclaw/i.test(instance.name ?? "");
}

function selectBrevInstances(
  instances: Array<Record<string, unknown>>,
  targetInstanceName: string | null,
): Pick<BrevStatus, "targetInstance" | "runningNemoClawInstance"> {
  const detected = instances.map(detectInstance);
  const targetInstance = targetInstanceName
    ? (detected.find((instance) => instance.name === targetInstanceName) ?? null)
    : null;
  const runningInstances = detected.filter((instance) => instance.running);
  const runningNemoClawInstance =
    detected.find((instance) => instance.running && isNemoClawInstance(instance)) ??
    (runningInstances.length === 1 ? runningInstances[0] : null);
  return { targetInstance, runningNemoClawInstance };
}

function existingRunningInstance(status: BrevStatus): BrevDetectedInstance | null {
  if (status.targetInstance?.running) return status.targetInstance;
  return status.runningNemoClawInstance;
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
export CLAWFORGE_ROOT="\${CLAWFORGE_ROOT:-/home/shadeform/clawforge}"
export CLAWFORGE_REPO_BUNDLE="\${CLAWFORGE_REPO_BUNDLE:-}"
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
if [[ -n "\${CLAWFORGE_REPO_BUNDLE}" && -f "\${CLAWFORGE_REPO_BUNDLE}" ]]; then
  rm -rf "\${CLAWFORGE_ROOT}"
  mkdir -p "\${CLAWFORGE_ROOT}"
  tar -xzf "\${CLAWFORGE_REPO_BUNDLE}" -C "\${CLAWFORGE_ROOT}"
elif [[ ! -d "\${CLAWFORGE_ROOT}/.git" ]]; then
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

async function runShellCommand(command: string, timeoutMs = 8_000): Promise<CommandResult> {
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
      childProcess.exec(command, { timeout: timeoutMs, env }, (error, stdout, stderr) => {
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

function runBrevExecShell(
  cliPath: string,
  instanceName: string,
  remoteCommand: string,
  timeoutMs = 30_000,
): Promise<CommandResult> {
  return runShellCommand(
    `${shellQuote(cliPath)} exec ${shellQuote(instanceName)} ${shellQuote(remoteCommand)}`,
    timeoutMs,
  );
}

async function runStartupOnBrevInstance(
  cliPath: string,
  instanceName: string,
  startupScript: { arg: string; path: string | null; inline: boolean },
): Promise<CommandResult> {
  if (!startupScript.path) {
    return runCommand(cliPath, ["exec", instanceName, startupScript.arg], 240_000);
  }
  const remotePath = `/tmp/clawforge-${sanitizeFilePart(instanceName)}-startup.sh`;
  const remoteLogPath = `/tmp/clawforge-${sanitizeFilePart(instanceName)}-deploy.log`;
  const copied = await runCommand(
    cliPath,
    ["copy", startupScript.path, `${instanceName}:${remotePath}`],
    120_000,
  );
  if (!copied.ok) return copied;
  const bundle = await createRepoBundle(instanceName);
  if (!bundle.ok || !bundle.path) return bundle;
  const remoteBundlePath = `/tmp/clawforge-${sanitizeFilePart(instanceName)}-source.tar.gz`;
  const copiedBundle = await runCommand(
    cliPath,
    ["copy", bundle.path, `${instanceName}:${remoteBundlePath}`],
    180_000,
  );
  if (!copiedBundle.ok) return copiedBundle;
  const remoteCommand = [
    `chmod +x ${remotePath}`,
    `(nohup env CLAWFORGE_REPO_BUNDLE=${remoteBundlePath} bash ${remotePath} > ${remoteLogPath} 2>&1 < /dev/null & echo "clawforge-deploy-started:$!")`,
  ].join(" && ");
  const started = await runCommand(
    cliPath,
    ["exec", instanceName, `bash -lc ${shellQuote(remoteCommand)}`],
    30_000,
  );
  if (!started.ok) return started;
  const healthy = await pollBrevRuntimeHealth(cliPath, instanceName, remoteLogPath);
  return {
    ok: healthy.ok,
    stdout: [started.stdout, healthy.stdout].filter(Boolean).join("\n"),
    stderr: healthy.ok
      ? started.stderr
      : [started.stderr, healthy.stderr].filter(Boolean).join("\n"),
    exitCode: healthy.ok ? 0 : 1,
  };
}

async function createRepoBundle(instanceName: string): Promise<CommandResult & { path?: string }> {
  if (!hasNodeRuntime()) {
    return {
      ok: false,
      stdout: "",
      stderr: "Cannot package ClawForge source outside the Node runtime.",
      exitCode: null,
    };
  }
  try {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const directory = path.join(process.cwd(), ".runtime", "brev");
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const bundlePath = path.join(directory, `${sanitizeFilePart(instanceName)}-source.tar.gz`);
    const result = await runCommand(
      "tar",
      [
        "-czf",
        bundlePath,
        "--exclude",
        ".git",
        "--exclude",
        "node_modules",
        "--exclude",
        "dist",
        "--exclude",
        ".runtime",
        "--exclude",
        ".env",
        "--exclude",
        ".env.local",
        "--exclude",
        "playwright-report",
        "--exclude",
        "test-results",
        ".",
      ],
      120_000,
    );
    return result.ok
      ? { ...result, path: bundlePath }
      : { ...result, stderr: result.stderr || "Could not package ClawForge source." };
  } catch (error) {
    return {
      ok: false,
      stdout: "",
      stderr: error instanceof Error ? error.message : "Could not package ClawForge source.",
      exitCode: null,
    };
  }
}

async function pollBrevRuntimeHealth(
  cliPath: string,
  instanceName: string,
  remoteLogPath: string,
): Promise<CommandResult> {
  const startedAt = Date.now();
  let last: CommandResult = { ok: false, stdout: "", stderr: "", exitCode: 1 };
  while (Date.now() - startedAt < 600_000) {
    const result = await runCommand(
      cliPath,
      [
        "exec",
        instanceName,
        [
          "curl -fsS http://127.0.0.1:8000/health >/tmp/clawforge-mem0-health.json",
          "curl -fsS http://127.0.0.1:5173/api/health >/tmp/clawforge-app-health.json",
          "cat /tmp/clawforge-mem0-health.json",
          "printf '\\n---app---\\n'",
          "cat /tmp/clawforge-app-health.json",
        ].join(" && "),
      ],
      20_000,
    );
    if (result.ok) return result;
    last = result;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 5_000));
  }

  const logs = await runCommand(
    cliPath,
    ["exec", instanceName, `tail -120 ${shellQuote(remoteLogPath)} 2>/dev/null || true`],
    20_000,
  );
  return {
    ok: false,
    stdout: logs.stdout,
    stderr: logs.stderr || last.stderr || "Timed out waiting for Brev runtime health.",
    exitCode: 1,
  };
}

async function checkBrevRuntimeHealth(
  cliPath: string,
  instanceName: string,
): Promise<CommandResult> {
  const healthCommand = [
    "curl -fsS http://127.0.0.1:8000/health >/tmp/clawforge-mem0-health.json",
    "curl -fsS http://127.0.0.1:5173/api/health >/tmp/clawforge-app-health.json",
    "cat /tmp/clawforge-mem0-health.json",
    "printf '\\n---app---\\n'",
    "cat /tmp/clawforge-app-health.json",
  ].join(" && ");
  return runBrevExecShell(cliPath, instanceName, healthCommand, 30_000);
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
    if (
      parsed &&
      typeof parsed === "object" &&
      Array.isArray((parsed as { workspaces?: unknown }).workspaces)
    ) {
      return (parsed as { workspaces: Array<Record<string, unknown>> }).workspaces;
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

export async function getBrevStatus(instanceName?: string | null): Promise<BrevStatus> {
  const targetInstanceName = normalizeInstanceName(instanceName) ?? configuredBrevInstanceName();
  const cliPath = await resolveBrevCli();

  if (!cliPath) {
    return {
      ok: false,
      status: "not_installed",
      cliPath: null,
      instances: [],
      targetInstanceName,
      targetInstance: null,
      runningNemoClawInstance: null,
      auth: authState(false, null, "Brev CLI was not available in this runtime."),
      message: "Brev CLI is not installed on this machine.",
      installCommand: INSTALL_COMMAND,
    };
  }

  let list = await runCommand(cliPath, ["ls", "--json"], 10_000);
  let auth = authState();

  if (!list.ok) {
    const message = redactBrevOutput([list.stderr, list.stdout].filter(Boolean).join("\n")).trim();
    const needsAuth = /login|auth|token|forbidden|logged out/i.test(message);
    const token = readEnv("BREV_TOKEN");
    if (needsAuth && token) {
      const login = await runCommand(cliPath, ["login", "--token", token], 30_000);
      if (login.ok) {
        list = await runCommand(cliPath, ["ls", "--json"], 10_000);
        auth = authState(
          true,
          list.ok,
          list.ok
            ? "Authenticated with Railway BREV_TOKEN."
            : "BREV_TOKEN login succeeded, but Brev instance listing still failed.",
        );
      } else {
        return {
          ok: false,
          status: "not_authenticated",
          cliPath,
          instances: [],
          targetInstanceName,
          targetInstance: null,
          runningNemoClawInstance: null,
          auth: authState(true, false, "Brev rejected the configured BREV_TOKEN."),
          message:
            "BREV_TOKEN is configured, but Brev login failed. Recreate the Railway secret and redeploy.",
          installCommand: INSTALL_COMMAND,
        };
      }
    }
  }

  if (!list.ok) {
    const message = redactBrevOutput([list.stderr, list.stdout].filter(Boolean).join("\n")).trim();
    const needsAuth = /login|auth|token|forbidden|logged out/i.test(message);
    return {
      ok: false,
      status: needsAuth ? "not_authenticated" : "error",
      cliPath,
      instances: [],
      targetInstanceName,
      targetInstance: null,
      runningNemoClawInstance: null,
      auth,
      message: needsAuth
        ? auth.tokenConfigured
          ? "Brev CLI is installed and BREV_TOKEN is configured, but authentication is not usable yet."
          : "Brev CLI is installed but needs a login before it can create a NemoClaw instance. Set Railway BREV_TOKEN or run brev login."
        : message || "Brev CLI is installed but could not list instances.",
      installCommand: INSTALL_COMMAND,
    };
  }

  const instances = parseBrevInstances(list.stdout);
  const { targetInstance, runningNemoClawInstance } = selectBrevInstances(
    instances,
    targetInstanceName,
  );
  const detectedRunning = targetInstance?.running ? targetInstance : runningNemoClawInstance;

  return {
    ok: true,
    status: "ready",
    cliPath,
    instances,
    targetInstanceName,
    targetInstance,
    runningNemoClawInstance,
    auth,
    message: detectedRunning?.name
      ? `Brev CLI is authenticated. Running NemoClaw instance "${detectedRunning.name}" is discoverable.`
      : "Brev CLI is authenticated and reachable. No running NemoClaw instance was detected yet.",
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
  instanceName?: string | null,
  options: BrevIntegrationOptions = {},
): Promise<BrevLaunchPlan> {
  const requestedName = normalizeInstanceName(instanceName);
  const status = await getBrevStatus(requestedName);
  const runningInstance = existingRunningInstance(status);
  const resolvedName =
    requestedName ??
    runningInstance?.name ??
    status.targetInstanceName ??
    configuredBrevInstanceName();
  const integrationManifest = await buildIntegrationManifest(resolvedName, options);
  const startupScript = await writeStartupScript(resolvedName, integrationManifest);
  const command = `brev create ${resolvedName} --type massedcompute_L40S --startup-script ${
    startupScript.inline ? "<inline-clawforge-startup>" : startupScript.arg
  }`;
  const openHands = openHandsConnection();
  const events = [
    runtimeEvent("agent.started", "Prepared Brev NemoClaw launch plan.", "success", {
      instance_name: resolvedName,
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
        ? runningInstance?.name
          ? `Brev found running NemoClaw instance "${runningInstance.name}". Deploy will attach instead of creating a duplicate.`
          : "Brev CLI is reachable. Launch is held in dry-run mode until a human confirms cloud creation."
        : status.message,
      status.ok ? "info" : "warning",
      { brev_status: status.status, running_instance: runningInstance?.name ?? null },
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
    instanceName: resolvedName,
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
  instanceName?: string | null,
  instanceType = "massedcompute_L40S",
  confirmed = false,
  options: BrevIntegrationOptions = {},
): Promise<BrevLaunchPlan> {
  const normalizedInstanceType =
    instanceType === "l40s-48gb.1x" || instanceType === "verda_L40S"
      ? "massedcompute_L40S"
      : instanceType;
  const requestedName = normalizeInstanceName(instanceName);
  const status = await getBrevStatus(requestedName);
  const runningInstance = existingRunningInstance(status);
  const resolvedName =
    requestedName ??
    runningInstance?.name ??
    status.targetInstanceName ??
    configuredBrevInstanceName();
  const integrationManifest = await buildIntegrationManifest(resolvedName, options);
  const startupScript = await writeStartupScript(resolvedName, integrationManifest);
  const command = `brev create ${resolvedName} --type ${normalizedInstanceType} --startup-script ${
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
        instance_type: normalizedInstanceType,
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
      instanceName: resolvedName,
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
      instanceName: resolvedName,
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

  if (runningInstance?.name) {
    events.push(
      runtimeEvent(
        "agent.started",
        "Attached to the existing running Brev NemoClaw runtime.",
        "success",
        {
          instance_name: runningInstance.name,
          state: runningInstance.state,
          health_check: "running-instance-detected",
        },
      ),
    );
    return {
      ok: true,
      mode: "already_running",
      instanceName: runningInstance.name,
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
    [
      "create",
      resolvedName,
      "--type",
      normalizedInstanceType,
      "--startup-script",
      startupScript.arg,
    ],
    180_000,
  );

  if (!result.ok) {
    events.push(
      runtimeEvent("agent.error", "Brev instance creation failed.", "error", {
        stderr: redactBrevOutput(result.stderr).slice(0, 600),
        exit_code: result.exitCode,
      }),
    );
    return {
      ok: false,
      mode: "create_failed",
      instanceName: resolvedName,
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
      stdout: redactBrevOutput(result.stdout).slice(0, 800),
      instance_name: resolvedName,
      instance_type: normalizedInstanceType,
    }),
  );

  return {
    ok: true,
    mode: "created",
    instanceName: resolvedName,
    command,
    status: await getBrevStatus(resolvedName),
    events,
    openHands,
    integrationManifest,
    startupScript: {
      path: startupScript.path,
      inline: startupScript.inline,
    },
  };
}

export async function chatWithNemoClawAgent(
  message: string,
  env: Record<string, string | undefined> = {},
  provider: ProviderMode = "auto",
): Promise<OpenHandsChatResponse> {
  const openHands = openHandsConnection(env);
  const normalized = message.trim() || "Inspect the NemoClaw sandbox.";
  const context = parseChatContext(env);
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
  const intent = detectNemoClawChatIntent(normalized);
  const registry = createProviderRegistry(env);
  const activeProvider = registry.getProvider(provider);
  const fallbackChain = registry.getConfig().fallback_chain.join(" -> ");
  const providerReply =
    provider === "mock"
      ? ""
      : await registry
          .summarize(
            {
              prompt: `You are ${context.agentName}, a deployed NemoClaw agent. Reply as this specific agent, not as a product demo. Stay grounded in this goal: ${context.goal ?? "help the user safely"}. If the user only greets you, greet them and say what this agent can do next. Keep it concise and do not mention SSH, incident response, failed logins, or brute force unless the user asked about security logs. User request: ${normalized}`,
              context: {
                runtime_mode: openHands.mode,
                fallback_chain: fallbackChain,
                instance_name: env.CLAWFORGE_INSTANCE_NAME,
                blueprint_id: env.CLAWFORGE_BLUEPRINT_ID,
                agent_name: context.agentName,
                template_id: context.templateId,
                tools: context.tools,
                integrations: context.integrations,
                intent,
              },
            },
            provider,
          )
          .catch(() => "");
  const reply = composeNemoClawChatReply(normalized, intent, providerReply, openHands.mode, context);
  const events: RuntimeEvent[] = [
    runtimeEvent("agent.thinking", `NemoClaw received: ${normalized}`, "info", {
      runtime_mode: openHands.mode,
      conversation_id: openHands.conversationId,
      provider: activeProvider.mode,
      model: activeProvider.model,
      fallback_chain: fallbackChain,
    }),
    runtimeEvent(
      "tool.called",
      openHands.mode === "simulated"
        ? "NemoClaw preview runtime checked the plan locally."
        : "NemoClaw remote runtime connection prepared.",
      "success",
      {
        workspace_url: openHands.workspaceUrl,
        runtime_api_url: openHands.runtimeApiUrl,
      },
    ),
  ];
  events.push(...eventsForNemoClawChatIntent(intent));

  return {
    ok: true,
    reply,
    events,
    openHands,
  };
}

export const chatWithOpenHands = chatWithNemoClawAgent;

type NemoClawChatIntent =
  | "greeting"
  | "email"
  | "calendar"
  | "phone"
  | "docs"
  | "github"
  | "security"
  | "integrations"
  | "status"
  | "general";

function detectNemoClawChatIntent(message: string): NemoClawChatIntent {
  if (/^(hi|hello|hey|yo|sup|gm|good morning|good afternoon|good evening)[!. ]*$/i.test(message.trim()))
    return "greeting";
  if (/\b(email|gmail|inbox|reply|repl(?:y|ies)|send mail|draft)\b/i.test(message)) return "email";
  if (/\b(calendar|calendly|schedule|meeting|appointment|booking)\b/i.test(message))
    return "calendar";
  if (/\b(phone|call|calls|sms|text|receptionist|voice)\b/i.test(message)) return "phone";
  if (/\b(doc|docs|sheet|spreadsheet|slide|drive|file)\b/i.test(message)) return "docs";
  if (/\b(github|issue|pull request|pr|repo|jira|linear|ticket)\b/i.test(message)) return "github";
  if (/\b(log|logs|incident|ssh|brute|failed login|suspicious|attack|security)\b/i.test(message))
    return "security";
  if (/\b(integration|connect|tool|tools|access)\b/i.test(message)) return "integrations";
  if (/\b(status|deployed|runtime|health|check|test)\b/i.test(message)) return "status";
  return "general";
}

function composeNemoClawChatReply(
  message: string,
  intent: NemoClawChatIntent,
  providerReply: string,
  runtimeMode: OpenHandsConnection["mode"],
  context: NemoClawChatContext,
): string {
  const cleanedProviderReply =
    intent !== "security" &&
    /ssh|brute[- ]force|failed login|185\.92|product demo|two[- ]sentence/i.test(providerReply)
      ? ""
      : providerReply.trim();

  if (intent === "greeting") {
    const capability =
      context.templateId === "phone_receptionist"
        ? "I can answer calls, take messages, check availability, and ask before booking or texting."
        : context.templateId === "github_triage"
          ? "I can inspect issues, draft triage decisions, and ask before posting changes."
          : context.templateId === "inbox_approval"
            ? "I can summarize inbox items, draft replies, and ask before sending anything."
            : context.templateId === "research_sandbox"
              ? "I can gather sources, prepare a brief, and keep publishing approval-gated."
              : context.templateId === "incident_response"
                ? "I can inspect logs, write incident reports, and stop before risky commands run."
                : "Tell me what you want this agent to do next and I’ll keep tools, memory, and approvals inside NemoClaw policy.";
    return `Hi, I’m ${context.agentName}. ${capability}`;
  }
  if (intent === "email") {
    return [
      `${context.agentName} can do that once Email is connected for this agent.`,
      "I’ll request inbox access, read the relevant messages, draft replies, and pause for your approval before anything is sent.",
    ].join(" ");
  }
  if (intent === "calendar") {
    return [
      `${context.agentName} can help schedule that through the Calendar integration.`,
      "I’ll check availability, propose times, and ask before creating or changing any event.",
    ].join(" ");
  }
  if (intent === "phone") {
    return [
      `${context.agentName} can handle phone or SMS work for this workflow.`,
      "I’ll attach the phone/voice channel, keep customer actions inside policy, and require approval for external follow-ups.",
    ].join(" ");
  }
  if (intent === "docs") {
    return [
      "I can work with documents, sheets, slides, and Drive once those integrations are connected.",
      "I’ll inspect only the files you authorize and keep exports or sharing changes approval-gated.",
    ].join(" ");
  }
  if (cleanedProviderReply) {
    return cleanedProviderReply;
  }
  if (intent === "github") {
    return [
      "I can connect this agent to GitHub, Jira, or Linear for issue and project work.",
      "I’ll read the relevant items, draft changes, and ask before posting comments, labels, or tickets.",
    ].join(" ");
  }
  if (intent === "security") {
    return (
      cleanedProviderReply ||
      "I can run the security workflow: inspect logs, classify suspicious behavior, write the report, and stop before any risky command runs."
    );
  }
  if (intent === "integrations") {
    return [
      "Tell me which job this agent should handle and I’ll choose the integrations it needs.",
      "If an account is required, I’ll show a connect step inside the chat before the agent can use that tool.",
    ].join(" ");
  }
  if (intent === "status") {
    return runtimeMode === "remote"
      ? `${context.agentName} is attached to a live runtime. I can run checks, inspect policies, and report live tool activity from here.`
      : `${context.agentName} is attached to the Brev-backed NemoClaw workspace. I can inspect the policy pack, memory plan, and integration manifest here.`;
  }
  return (
    `${context.agentName} can help with that inside its NemoClaw safety boundary. I’ll use the connected tools where available, ask before external actions, and save useful decisions to memory.`
  );
}

function eventsForNemoClawChatIntent(intent: NemoClawChatIntent): RuntimeEvent[] {
  if (intent === "email") {
    return [
      runtimeEvent(
        "tool.called",
        "Email integration requested for inbox reading and drafting.",
        "info",
        {
          tool: "gmail",
          effect: "connect_required",
        },
      ),
      runtimeEvent("policy.checked", "Sending replies requires human approval.", "warning", {
        action: "email.send",
        effect: "require_approval",
      }),
    ];
  }
  if (intent === "calendar") {
    return [
      runtimeEvent(
        "tool.called",
        "Calendar integration requested for availability checks.",
        "info",
        {
          tool: "googlecalendar",
          effect: "connect_required",
        },
      ),
      runtimeEvent("policy.checked", "Creating or changing events requires approval.", "warning", {
        action: "calendar.write",
        effect: "require_approval",
      }),
    ];
  }
  if (intent === "phone") {
    return [
      runtimeEvent("tool.called", "Phone and voice channel requested for this agent.", "info", {
        tool: "voice_phone",
        effect: "connect_required",
      }),
      runtimeEvent(
        "policy.checked",
        "External calls and texts require policy approval.",
        "warning",
        {
          action: "phone.contact",
          effect: "require_approval",
        },
      ),
    ];
  }
  if (intent === "docs") {
    return [
      runtimeEvent("tool.called", "Workspace document integrations requested.", "info", {
        tool: "google_workspace",
        effect: "connect_required",
      }),
      runtimeEvent("policy.checked", "Sharing or exporting files requires approval.", "warning", {
        action: "files.share",
        effect: "require_approval",
      }),
    ];
  }
  if (intent === "github") {
    return [
      runtimeEvent("tool.called", "Project tracker integration requested.", "info", {
        tool: "github_jira_linear",
        effect: "connect_required",
      }),
      runtimeEvent(
        "policy.checked",
        "Posting comments, labels, or tickets requires approval.",
        "warning",
        {
          action: "tracker.write",
          effect: "require_approval",
        },
      ),
    ];
  }
  if (intent === "security") {
    return [
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
  }
  return [
    runtimeEvent(
      "policy.checked",
      "NemoClaw will require approval before external writes.",
      "warning",
      {
        action: "external.write",
        effect: "require_approval",
      },
    ),
  ];
}
