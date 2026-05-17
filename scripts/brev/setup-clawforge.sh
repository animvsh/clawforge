#!/usr/bin/env bash
set -euo pipefail
set +x

umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${CLAWFORGE_ROOT:-$(cd "${SCRIPT_DIR}/../.." && pwd)}"
cd "${REPO_ROOT}"

log() {
  printf '\n[clawforge-brev] %s\n' "$*"
}

warn() {
  printf '\n[clawforge-brev:warn] %s\n' "$*" >&2
}

fail() {
  printf '\n[clawforge-brev:error] %s\n' "$*" >&2
  exit 1
}

have() {
  command -v "$1" >/dev/null 2>&1
}

node_major() {
  node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || printf '0'
}

install_node_22() {
  if [[ "${INSTALL_NODE_22:-auto}" == "0" ]]; then
    fail "Node.js 22+ is required. Set INSTALL_NODE_22=auto or install Node 22+ before rerunning."
  fi

  have curl || fail "curl is required to install Node.js 22 on this Brev VM."
  have sudo || fail "sudo is required to install Node.js 22 on this Brev VM."

  log "Installing Node.js 22 from NodeSource"
  curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/clawforge-nodesource-setup.sh
  sudo -E bash /tmp/clawforge-nodesource-setup.sh
  sudo apt-get install -y nodejs
  rm -f /tmp/clawforge-nodesource-setup.sh
}

log "Preparing ClawForge in ${REPO_ROOT}"

have git || fail "git is required on the Brev instance."

if ! have node || [[ "$(node_major)" -lt 22 ]]; then
  install_node_22
fi

have npm || fail "npm is required after Node.js installation."

log "Using Node $(node --version) and npm $(npm --version)"

log "Installing JavaScript dependencies"
if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi

log "Creating runtime directories and a secret-free .env if needed"
mkdir -p .runtime/reports .runtime/memory .runtime/audit .runtime/integrations
if [[ ! -f .env ]]; then
  cp .env.example .env
  chmod 600 .env
  log "Created .env from .env.example with placeholder values only."
else
  chmod 600 .env || true
  log "Existing .env left unchanged."
fi

if [[ -n "${CLAWFORGE_INTEGRATION_MANIFEST_B64:-}" ]]; then
  log "Installing custom NemoClaw integration manifest"
  if base64 --help 2>&1 | grep -q -- '--decode'; then
    printf '%s' "${CLAWFORGE_INTEGRATION_MANIFEST_B64}" | base64 --decode > .runtime/integrations/active.json
  else
    printf '%s' "${CLAWFORGE_INTEGRATION_MANIFEST_B64}" | base64 -d > .runtime/integrations/active.json
  fi
  chmod 600 .runtime/integrations/active.json
  export CLAWFORGE_INTEGRATION_MANIFEST_PATH="${REPO_ROOT}/.runtime/integrations/active.json"
  node - <<'NODE' || true
const fs = require("node:fs");
const manifest = JSON.parse(fs.readFileSync(".runtime/integrations/active.json", "utf8"));
console.log(`  agent: ${manifest.agent?.name || "ClawForge Agent"}`);
console.log(`  blueprint: ${manifest.agent?.blueprint_id || "none"}`);
console.log(`  model: ${manifest.agent?.model || process.env.CLAWFORGE_MODEL || "auto"}`);
console.log(`  memory: ${manifest.memory?.engine || "mem0"} on ${manifest.memory?.hosted_on || "brev"}`);
console.log(`  inbox: ${manifest.inbox?.email || "not created"}`);
for (const integration of manifest.integrations || []) {
  if (integration.required || integration.connected_account_id || integration.auth_config_id) {
    console.log(`  ${integration.label}: ${integration.status}`);
  }
}
NODE
else
  log "No custom integration manifest supplied."
fi

log "Configuring workspace memory"
cat > .runtime/memory/mem0-runtime.json <<EOF
{
  "engine": "mem0",
  "hosted_on": "brev",
  "scope": "workspace",
  "reasoning_model": "${CLAWFORGE_MODEL:-nvidia/llama-3.1-nemotron-nano-8b-v1}",
  "embedding_model": "nvidia/nv-embedqa-e5-v5",
  "storage_path": ".runtime/memory"
}
EOF
chmod 600 .runtime/memory/mem0-runtime.json

setup_self_hosted_mem0() {
  log "Setting up self-hosted mem0-compatible memory service"
  have python3 || fail "python3 is required for the Brev-hosted memory service."

  python3 -m venv .runtime/mem0-venv
  .runtime/mem0-venv/bin/python -m pip install --upgrade pip wheel
  .runtime/mem0-venv/bin/pip install -r services/mem0/requirements.txt

  export MEM0_DATA_DIR="${MEM0_DATA_DIR:-${REPO_ROOT}/.runtime/mem0}"
  export MEM0_API_URL="${MEM0_API_URL:-http://127.0.0.1:${MEM0_PORT:-8000}}"
  export NEMOTRON_EMBEDDING_MODEL="${NEMOTRON_EMBEDDING_MODEL:-nvidia/nv-embedqa-e5-v5}"
  mkdir -p "${MEM0_DATA_DIR}"

  cat > .runtime/memory/mem0-runtime.json <<EOF
{
  "engine": "self_hosted_mem0",
  "hosted_on": "brev",
  "scope": "workspace",
  "api_url": "${MEM0_API_URL}",
  "reasoning_model": "${CLAWFORGE_MODEL:-nvidia/llama-3.1-nemotron-nano-8b-v1}",
  "embedding_model": "${NEMOTRON_EMBEDDING_MODEL}",
  "storage_path": "${MEM0_DATA_DIR}"
}
EOF
  chmod 600 .runtime/memory/mem0-runtime.json

  if [[ -f .runtime/mem0.pid ]]; then
    old_mem0_pid="$(cat .runtime/mem0.pid || true)"
    if [[ -n "${old_mem0_pid}" ]] && kill -0 "${old_mem0_pid}" >/dev/null 2>&1; then
      log "Self-hosted mem0 service already running with pid ${old_mem0_pid}."
    else
      rm -f .runtime/mem0.pid
    fi
  fi

  if [[ ! -f .runtime/mem0.pid ]]; then
    log "Starting self-hosted mem0-compatible API on ${MEM0_API_URL}"
    nohup env \
      MEM0_DATA_DIR="${MEM0_DATA_DIR}" \
      MEM0_API_KEY="${MEM0_API_KEY:-}" \
      NVIDIA_NEMOTRON_MODEL="${CLAWFORGE_MODEL:-nvidia/llama-3.1-nemotron-nano-8b-v1}" \
      NEMOTRON_EMBEDDING_MODEL="${NEMOTRON_EMBEDDING_MODEL}" \
      .runtime/mem0-venv/bin/uvicorn services.mem0.server:app --host 127.0.0.1 --port "${MEM0_PORT:-8000}" \
      > .runtime/mem0.log 2>&1 &
    echo "$!" > .runtime/mem0.pid
    sleep 3
  fi

  if curl -fsS "${MEM0_API_URL}/health" >/tmp/clawforge-mem0-health.json; then
    log "Self-hosted mem0 memory service is healthy."
    cat /tmp/clawforge-mem0-health.json
    rm -f /tmp/clawforge-mem0-health.json
  else
    warn "Self-hosted mem0 memory service did not pass health check yet. Inspect .runtime/mem0.log on the Brev VM."
  fi
}

if [[ "${START_MEM0:-1}" == "1" ]]; then
  setup_self_hosted_mem0
else
  log "Skipping self-hosted mem0 because START_MEM0=0."
fi

log "Checking required Brev secret names. Values are intentionally hidden."
required_secret_names=(
  NVIDIA_API_KEY
  NGC_CLI_API_KEY
  MINIMAX_API_KEY
  MINIMAX_PLAN_KEY
  VITE_SUPABASE_URL
  VITE_SUPABASE_ANON_KEY
)
optional_secret_names=(
  SUPABASE_SERVICE_ROLE_KEY
  COMPOSIO_API_KEY
  MEM0_API_URL
  MEM0_API_KEY
  NEMOCLAW_INSTALL_URL
  AGENTMAIL_API_KEY
  VAPI_API_KEY
)

if [[ -n "${CLAWFORGE_REQUIRED_SECRET_NAMES:-}" ]]; then
  IFS=',' read -r -a custom_secret_names <<< "${CLAWFORGE_REQUIRED_SECRET_NAMES}"
  for name in "${custom_secret_names[@]}"; do
    [[ -z "${name}" ]] && continue
    if [[ " ${required_secret_names[*]} ${optional_secret_names[*]} " != *" ${name} "* ]]; then
      optional_secret_names+=("${name}")
    fi
  done
fi

for name in "${required_secret_names[@]}"; do
  if [[ -n "${!name:-}" ]]; then
    printf '  %s: set\n' "${name}"
  else
    printf '  %s: missing\n' "${name}"
  fi
done

for name in "${optional_secret_names[@]}"; do
  if [[ -n "${!name:-}" ]]; then
    printf '  %s: set (optional)\n' "${name}"
  else
    printf '  %s: missing (optional)\n' "${name}"
  fi
done

log "Checking GPU and container availability"
if have nvidia-smi; then
  nvidia-smi || true
else
  warn "nvidia-smi was not found. Use a Brev GPU VM for the canonical demo."
fi

if have docker; then
  if docker info >/dev/null 2>&1; then
    log "Docker is available."
    if [[ "${VERIFY_DOCKER_GPU:-0}" == "1" ]]; then
      docker run --rm --runtime=nvidia --gpus all ubuntu nvidia-smi || warn "Docker GPU verification failed."
    else
      log "Skip Docker GPU container probe. Run with VERIFY_DOCKER_GPU=1 to test it."
    fi
  else
    warn "Docker is installed but this shell cannot access the Docker daemon."
  fi
else
  warn "Docker was not found. NemoClaw/OpenShell integration may install or require it."
fi

if [[ "${INSTALL_NEMOCLAW:-0}" == "1" ]]; then
  have curl || fail "curl is required to install NemoClaw."
  log "Installing NemoClaw. The installer may prompt for host setup."
  if [[ -n "${NEMOCLAW_INSTALL_URL:-}" ]]; then
    curl -fsSL "${NEMOCLAW_INSTALL_URL}" | bash
  elif [[ "${NEMOCLAW_NON_INTERACTIVE:-0}" == "1" ]]; then
    curl -fsSL https://www.nvidia.com/nemoclaw.sh | NEMOCLAW_NON_INTERACTIVE=1 NEMOCLAW_ACCEPT_THIRD_PARTY_SOFTWARE="${NEMOCLAW_ACCEPT_THIRD_PARTY_SOFTWARE:-1}" bash
  else
    curl -fsSL https://www.nvidia.com/nemoclaw.sh | bash
  fi
else
  log "Skipping NemoClaw install. Set INSTALL_NEMOCLAW=1 when the Brev instance is ready to onboard."
fi

log "Building ClawForge"
npm run build

log "Writing NemoClaw instance runtime manifest"
mkdir -p .runtime/nemoclaw
cat > .runtime/nemoclaw/instance.json <<JSON
{
  "ok": true,
  "agent_name": "${CLAWFORGE_AGENT_NAME:-ClawForge Agent}",
  "blueprint_id": "${CLAWFORGE_BLUEPRINT_ID:-}",
  "runtime": "NemoClaw",
  "policy_mode": "enforced",
  "chat_web_ui": "http://0.0.0.0:${CLAWFORGE_WEB_PORT:-5173}",
  "health_url": "http://127.0.0.1:${CLAWFORGE_WEB_PORT:-5173}/api/health",
  "integration_manifest": "${CLAWFORGE_INTEGRATION_MANIFEST_PATH:-}",
  "created_at": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
JSON
chmod 600 .runtime/nemoclaw/instance.json

if [[ "${START_CLAWFORGE_WEB:-1}" == "1" ]]; then
  port="${CLAWFORGE_WEB_PORT:-5173}"
  log "Starting ClawForge chat web UI on 0.0.0.0:${port}"
  if [[ -f .runtime/clawforge-web.pid ]]; then
    old_pid="$(cat .runtime/clawforge-web.pid || true)"
    if [[ -n "${old_pid}" ]] && kill -0 "${old_pid}" >/dev/null 2>&1; then
      log "ClawForge web UI already running with pid ${old_pid}."
    else
      rm -f .runtime/clawforge-web.pid
    fi
  fi

  if [[ ! -f .runtime/clawforge-web.pid ]]; then
    nohup npm run dev -- --host 0.0.0.0 --port "${port}" > .runtime/clawforge-web.log 2>&1 &
    echo "$!" > .runtime/clawforge-web.pid
    sleep 5
  fi

  if curl -fsS "http://127.0.0.1:${port}/api/health" >/tmp/clawforge-health.json; then
    log "ClawForge chat web UI is healthy."
    cat /tmp/clawforge-health.json
    rm -f /tmp/clawforge-health.json
  else
    warn "ClawForge web UI did not pass health check yet. Inspect .runtime/clawforge-web.log on the Brev VM."
  fi
else
  log "Skipping web UI start because START_CLAWFORGE_WEB=0."
fi

cat <<'NEXT'

[clawforge-brev] Setup complete.

If the setup did not auto-start it, run ClawForge on Brev:
  npm run dev -- --host 0.0.0.0 --port 5173

Preview the production build on Brev:
  npm run start

From your local machine, forward the app and NemoClaw dashboard:
  brev port-forward clawforge-nemoclaw --port 5173:5173 --port 4173:4173 --port 18789:18789

Onboard NemoClaw with the routed model path after NVIDIA_API_KEY is set as a Brev secret:
  INSTALL_NEMOCLAW=1 ./scripts/brev/setup-clawforge.sh
  NEMOCLAW_PROVIDER=routed nemoclaw onboard --non-interactive

Keep host-side router, gateway, and NIM ports private unless the demo explicitly needs them.
NEXT
