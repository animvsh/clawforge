import { DEMO_AGENT_ID } from "../fixtures";
import { createProviderRegistry } from "../providers";
import type { ProviderMode, RuntimeEvent } from "../types";

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

async function runCommand(
  command: string,
  args: string[],
  timeoutMs = 8_000,
): Promise<CommandResult> {
  if (import.meta.env.SSR !== true) {
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

export function openHandsConnection(): OpenHandsConnection {
  const workspaceUrl = readEnv("OPENHANDS_WORKSPACE_URL") || readEnv("NEMOCLAW_OPENHANDS_URL");
  const runtimeApiUrl = readEnv("OPENHANDS_RUNTIME_API_URL") || readEnv("RUNTIME_API_URL");
  return {
    mode: workspaceUrl ? "remote" : runtimeApiUrl ? "remote" : "simulated",
    workspaceUrl: workspaceUrl || null,
    runtimeApiUrl: runtimeApiUrl || null,
    serverImage: readEnv("OPENHANDS_SERVER_IMAGE") || DEFAULT_SERVER_IMAGE,
    conversationId: `clawforge_${DEMO_AGENT_ID}`,
  };
}

export async function createBrevLaunchPlan(
  instanceName = "clawforge-nemoclaw",
): Promise<BrevLaunchPlan> {
  const status = await getBrevStatus();
  const command = `brev create ${instanceName} --gpu-name L40S --startup-script @scripts/brev/setup-clawforge.sh`;
  const openHands = openHandsConnection();
  const events = [
    runtimeEvent("agent.started", "Prepared Brev NemoClaw launch plan.", "success", {
      instance_name: instanceName,
      command,
    }),
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
  };
}

export async function createBrevInstance(
  instanceName = "clawforge-nemoclaw",
  instanceType = "verda_L40S",
  confirmed = false,
): Promise<BrevLaunchPlan> {
  const status = await getBrevStatus();
  const command = `brev create ${instanceName} --type ${instanceType} --startup-script @scripts/brev/setup-clawforge.sh`;
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
        estimated_cost: "about $1.63/hr for the current cheapest L40S option",
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
    };
  }

  const result = await runCommand(
    status.cliPath,
    [
      "create",
      instanceName,
      "--type",
      instanceType,
      "--startup-script",
      "@scripts/brev/setup-clawforge.sh",
    ],
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
  };
}

export async function chatWithOpenHands(
  message: string,
  env: Record<string, string | undefined> = {},
  provider: ProviderMode = "auto",
): Promise<OpenHandsChatResponse> {
  const openHands = openHandsConnection();
  const normalized = message.trim() || "Inspect the NemoClaw sandbox.";
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
