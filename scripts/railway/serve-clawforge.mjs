import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const root = process.cwd();
const clientDir = resolve(root, "dist/client");
const serverEntry = resolve(root, "dist/server/index.js");
const port = Number(process.env.PORT || process.env.CLAWFORGE_PORT || 8080);
const host = process.env.HOST || "0.0.0.0";
const execFileAsync = promisify(execFile);

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webp", "image/webp"],
]);

function isSafeFilePath(pathname) {
  const decoded = decodeURIComponent(pathname);
  if (decoded.includes("\0")) return false;
  const normalized = normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, "");
  const absolute = resolve(clientDir, `.${sep}${normalized}`);
  return absolute === clientDir || absolute.startsWith(`${clientDir}${sep}`);
}

function filePathForUrl(pathname) {
  const decoded = decodeURIComponent(pathname);
  const normalized = normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, "");
  return resolve(clientDir, `.${sep}${normalized}`);
}

async function serveStatic(request, response, url) {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  if (url.pathname === "/" || !isSafeFilePath(url.pathname)) return false;

  const filePath = filePathForUrl(url.pathname);
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) return false;

    const contentType = mimeTypes.get(extname(filePath)) || "application/octet-stream";
    response.writeHead(200, {
      "content-length": fileStat.size,
      "content-type": contentType,
      "cache-control": url.pathname.startsWith("/assets/")
        ? "public, max-age=31536000, immutable"
        : "public, max-age=60",
    });
    if (request.method === "HEAD") {
      response.end();
      return true;
    }
    response.end(await readFile(filePath));
    return true;
  } catch {
    return false;
  }
}

function requestUrl(request) {
  const forwardedProto = request.headers["x-forwarded-proto"];
  const proto = Array.isArray(forwardedProto)
    ? forwardedProto[0]
    : forwardedProto || (process.env.RAILWAY_PUBLIC_DOMAIN ? "https" : "http");
  const hostHeader = request.headers.host || `127.0.0.1:${port}`;
  return `${proto}://${hostHeader}${request.url || "/"}`;
}

function requestHeaders(request) {
  const headers = new Headers();
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    const key = request.rawHeaders[index];
    const value = request.rawHeaders[index + 1];
    if (key && value) headers.append(key, value);
  }
  return headers;
}

function requestBody(request) {
  if (request.method === "GET" || request.method === "HEAD") return undefined;
  return Readable.toWeb(request);
}

function writeResponse(nodeResponse, webResponse) {
  const headers = {};
  webResponse.headers.forEach((value, key) => {
    headers[key] = value;
  });
  nodeResponse.writeHead(webResponse.status, headers);
  if (webResponse.body) {
    return Readable.fromWeb(webResponse.body).pipe(nodeResponse);
  }
  nodeResponse.end();
}

function writeJson(response, status, data) {
  const body = JSON.stringify(data);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  response.end(body);
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function run(command, args, timeout = 10_000) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      timeout,
      env: {
        ...process.env,
        PATH: [
          "/root/.local/bin",
          "/home/node/.local/bin",
          "/opt/homebrew/bin",
          "/usr/local/bin",
          "/usr/bin",
          "/bin",
          "/usr/sbin",
          "/sbin",
          process.env.PATH || "",
        ].join(":"),
      },
    });
    return { ok: true, stdout, stderr, exitCode: 0 };
  } catch (error) {
    return {
      ok: false,
      stdout: String(error?.stdout || ""),
      stderr: String(error?.stderr || error?.message || ""),
      exitCode: typeof error?.code === "number" ? error.code : 1,
    };
  }
}

async function resolveBrevCli() {
  const candidates = [
    process.env.BREV_CLI_PATH,
    "/root/.local/bin/brev",
    "/home/node/.local/bin/brev",
    "/opt/homebrew/bin/brev",
    "/usr/local/bin/brev",
    "brev",
  ].filter(Boolean);
  for (const candidate of candidates) {
    const result = await run(candidate, ["--version"], 3_000);
    if (result.ok) return candidate;
  }
  return null;
}

function parseBrevInstances(stdout) {
  try {
    const parsed = JSON.parse(stdout);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.workspaces)) return parsed.workspaces;
    if (Array.isArray(parsed?.instances)) return parsed.instances;
  } catch {
    return [];
  }
  return [];
}

async function nativeBrevStatus() {
  const cliPath = await resolveBrevCli();
  if (!cliPath) {
    return {
      ok: false,
      status: "not_installed",
      cliPath: null,
      instances: [],
      message: "Brev CLI is not installed in the Railway runtime.",
      installCommand:
        'bash -c "$(curl -fsSL https://raw.githubusercontent.com/brevdev/brev-cli/main/bin/install-latest.sh)"',
    };
  }
  const list = await run(cliPath, ["ls", "--json"], 15_000);
  if (!list.ok) {
    const message = `${list.stderr}\n${list.stdout}`.trim();
    const needsAuth = /login|auth|token|forbidden|logged out|oauth/i.test(message);
    return {
      ok: false,
      status: needsAuth ? "not_authenticated" : "error",
      cliPath,
      instances: [],
      message: needsAuth
        ? "Brev CLI is installed but needs a fresh login token."
        : message || "Brev CLI could not list instances.",
      installCommand:
        'bash -c "$(curl -fsSL https://raw.githubusercontent.com/brevdev/brev-cli/main/bin/install-latest.sh)"',
    };
  }
  return {
    ok: true,
    status: "ready",
    cliPath,
    instances: parseBrevInstances(list.stdout),
    message: "Brev CLI is installed and authenticated.",
    installCommand:
      'bash -c "$(curl -fsSL https://raw.githubusercontent.com/brevdev/brev-cli/main/bin/install-latest.sh)"',
  };
}

function requiredIds(blueprint) {
  return new Set(
    (blueprint?.integration_requirements || [])
      .filter((integration) => integration.status === "required")
      .map((integration) => integration.id),
  );
}

function nativeManifest(instanceName, blueprint) {
  const required = requiredIds(blueprint);
  const integrations = [
    ["phone_sms", "AgentPhone", "vapi"],
    ["voice_agent", "Voice agent", "vapi"],
    ["agent_email", "Agent inbox", "agentmail"],
    ["calendar", "Calendar", "googlecalendar"],
    ["email", "Email", "gmail"],
    ["google_docs", "Docs", "googledocs"],
    ["google_sheets", "Sheets", "googlesheets"],
    ["google_drive", "Drive", "googledrive"],
    ["crm", "CRM", "hubspot"],
    ["github", "GitHub", "github"],
    ["linear", "Linear", "linear"],
    ["slack", "Slack", "slack"],
  ].map(([id, label, toolkit]) => ({
    id,
    label,
    toolkit,
    purpose: `${label} access for the generated NemoClaw agent.`,
    status: process.env.COMPOSIO_API_KEY ? "ready_to_connect" : "needs_api_key",
    auth_config_id: null,
    connected_account_id: null,
    required: required.has(id),
    connectable: !["phone_sms", "voice_agent", "agent_email"].includes(id),
  }));
  const pipedreamConnections = (blueprint?.integration_requirements || [])
    .filter((integration) =>
      [
        "calendar",
        "email",
        "google_docs",
        "google_drive",
        "google_sheets",
        "github",
        "linear",
        "slack",
      ].includes(integration.id),
    )
    .map((integration) => ({
      id: integration.id,
      label: integration.label,
      app: integration.id === "email" ? "gmail" : integration.id,
      required: integration.status === "required",
      status: process.env.PIPEDREAM_ACCESS_TOKEN ? "ready_to_connect" : "needs_api_key",
    }));
  return {
    version: 1,
    instance_name: instanceName,
    generated_at: new Date().toISOString(),
    agent: {
      id: blueprint?.blueprint_id
        ? `agent_${blueprint.template_id}_${blueprint.blueprint_id.slice(-8)}`
        : "agent_clawforge",
      name: blueprint?.agent_name || "ClawForge Agent",
      blueprint_id: blueprint?.blueprint_id || null,
      template_id: blueprint?.template_id || null,
      goal: blueprint?.goal || null,
      model: blueprint?.model || null,
      provider: blueprint?.provider || null,
    },
    memory: {
      engine: "mem0",
      hosted_on: "brev",
      embedding_model: "nvidia/nv-embedqa-e5-v5",
      reasoning_model: blueprint?.model || null,
      scope: "workspace",
      status: "configured",
    },
    integrations,
    pipedream: {
      configured: Boolean(process.env.PIPEDREAM_PROJECT_ID && process.env.PIPEDREAM_ACCESS_TOKEN),
      project_id: process.env.PIPEDREAM_PROJECT_ID || null,
      environment: process.env.PIPEDREAM_ENVIRONMENT || "production",
      connections: pipedreamConnections,
    },
    inbox: { email: null, status: "not_created" },
    capabilities: {
      agentphone: required.has("phone_sms"),
      voice_agent: required.has("phone_sms"),
      agent_inbox: required.has("email"),
      calendar: required.has("calendar"),
      gmail: required.has("email"),
      google_docs: required.has("google_docs"),
      google_drive: required.has("google_drive"),
      google_sheets: required.has("google_sheets"),
    },
    secret_names: [
      "NVIDIA_API_KEY",
      "MINIMAX_PLAN_KEY",
      "COMPOSIO_API_KEY",
      "AGENTMAIL_API_KEY",
      "VAPI_API_KEY",
    ],
  };
}

async function writeStartupScript(instanceName, manifest) {
  const dir = resolve(root, ".runtime/brev");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const manifestB64 = Buffer.from(JSON.stringify(manifest, null, 2), "utf8").toString("base64");
  const filePath = join(dir, `${instanceName.replace(/[^a-z0-9-]+/gi, "-")}-startup.sh`);
  const script = `#!/usr/bin/env bash
set -euo pipefail
set +x
export CLAWFORGE_REPO_URL="\${CLAWFORGE_REPO_URL:-https://github.com/animvsh/clawforge.git}"
export CLAWFORGE_ROOT="\${CLAWFORGE_ROOT:-/home/shadeform/clawforge}"
export CLAWFORGE_INTEGRATION_MANIFEST_B64='${manifestB64}'
export CLAWFORGE_AGENT_NAME='${String(manifest.agent.name).replaceAll("'", "'\"'\"'")}'
export CLAWFORGE_BLUEPRINT_ID='${manifest.agent.blueprint_id || ""}'
export CLAWFORGE_MODEL='${manifest.agent.model || ""}'
export CLAWFORGE_PROVIDER='${manifest.agent.provider || ""}'
if ! command -v git >/dev/null 2>&1; then sudo apt-get update && sudo apt-get install -y git; fi
mkdir -p "$(dirname "\${CLAWFORGE_ROOT}")"
if [[ ! -d "\${CLAWFORGE_ROOT}/.git" ]]; then git clone "\${CLAWFORGE_REPO_URL}" "\${CLAWFORGE_ROOT}"; else git -C "\${CLAWFORGE_ROOT}" pull --ff-only || true; fi
cd "\${CLAWFORGE_ROOT}"
./scripts/brev/setup-clawforge.sh
`;
  await writeFile(filePath, script, { mode: 0o700 });
  return filePath;
}

async function handleNativeBrev(request, response, url) {
  if (url.pathname === "/api/clawforge/brev/status" && request.method === "GET") {
    writeJson(response, 200, { ok: true, brev: await nativeBrevStatus() });
    return true;
  }
  if (
    (url.pathname === "/api/clawforge/brev/launch-plan" ||
      url.pathname === "/api/clawforge/brev/instances") &&
    request.method === "POST"
  ) {
    const body = await readJson(request);
    const instanceName = String(body.instance_name || "clawforge-nemoclaw").trim();
    const requestedType = String(
      body.instance_type || process.env.BREV_INSTANCE_TYPE || "massedcompute_L40S",
    );
    const instanceType = requestedType === "l40s-48gb.1x" ? "massedcompute_L40S" : requestedType;
    const blueprint =
      body.blueprint && typeof body.blueprint === "object" ? body.blueprint : undefined;
    const manifest = nativeManifest(instanceName, blueprint);
    const startupScript = await writeStartupScript(instanceName, manifest);
    const status = await nativeBrevStatus();
    const command = `brev create ${instanceName} --type ${instanceType} --startup-script @${startupScript}`;
    const openHands = {
      mode: "simulated",
      workspaceUrl: null,
      runtimeApiUrl: null,
      serverImage:
        process.env.OPENHANDS_SERVER_IMAGE || "ghcr.io/openhands/agent-server:main-python",
      conversationId: `clawforge_${manifest.agent.id}`,
    };
    const events = [
      {
        id: `railway_brev_${Date.now()}`,
        agent_id: manifest.agent.id,
        type: "memory.updated",
        message: "Prepared Brev-hosted mem0 memory and integration manifest.",
        timestamp: new Date().toISOString(),
        severity: "success",
      },
    ];
    let mode = "dry_run";
    let ok = status.ok;
    if (url.pathname.endsWith("/instances")) {
      if (!status.ok || !status.cliPath) {
        mode = "create_failed";
        ok = false;
      } else if (body.confirmation !== "CREATE_BREV_INSTANCE") {
        mode = "create_blocked";
        ok = false;
      } else {
        const created = await run(
          status.cliPath,
          ["create", instanceName, "--type", instanceType, "--startup-script", `@${startupScript}`],
          180_000,
        );
        mode = created.ok ? "created" : "create_failed";
        ok = created.ok;
        events.push({
          id: `railway_brev_create_${Date.now()}`,
          agent_id: manifest.agent.id,
          type: created.ok ? "agent.started" : "agent.error",
          message: created.ok
            ? "Brev instance creation started for NemoClaw."
            : "Brev instance creation failed.",
          timestamp: new Date().toISOString(),
          severity: created.ok ? "success" : "error",
          metadata: { stdout: created.stdout.slice(0, 800), stderr: created.stderr.slice(0, 800) },
        });
      }
    }
    writeJson(response, 200, {
      ok: true,
      launch: {
        ok,
        mode,
        instanceName,
        command,
        status: mode === "created" ? await nativeBrevStatus() : status,
        events,
        openHands,
        integrationManifest: manifest,
        startupScript: { path: startupScript, inline: false },
      },
    });
    return true;
  }
  return false;
}

const worker = (await import(pathToFileURL(serverEntry).href)).default;

if (!worker?.fetch) {
  throw new Error(`ClawForge server entry at ${serverEntry} does not export fetch().`);
}

createServer(async (request, response) => {
  try {
    const url = new URL(requestUrl(request));
    if (await serveStatic(request, response, url)) return;
    if (await handleNativeBrev(request, response, url)) return;

    const webRequest = new Request(url, {
      method: request.method,
      headers: requestHeaders(request),
      body: requestBody(request),
      duplex: request.method === "GET" || request.method === "HEAD" ? undefined : "half",
    });

    const webResponse = await worker.fetch(webRequest, process.env, {
      waitUntil() {},
      passThroughOnException() {},
    });
    writeResponse(response, webResponse);
  } catch (error) {
    console.error(error);
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end("ClawForge server failed to handle the request.");
  }
}).listen(port, host, () => {
  console.log(`ClawForge Railway server listening on http://${host}:${port}`);
});
