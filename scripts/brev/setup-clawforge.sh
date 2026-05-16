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

install_node_20() {
  if [[ "${INSTALL_NODE_20:-auto}" == "0" ]]; then
    fail "Node.js 20+ is required. Set INSTALL_NODE_20=auto or install Node 20+ before rerunning."
  fi

  have curl || fail "curl is required to install Node.js 20 on this Brev VM."
  have sudo || fail "sudo is required to install Node.js 20 on this Brev VM."

  log "Installing Node.js 20 from NodeSource"
  curl -fsSL https://deb.nodesource.com/setup_20.x -o /tmp/clawforge-nodesource-setup.sh
  sudo -E bash /tmp/clawforge-nodesource-setup.sh
  sudo apt-get install -y nodejs
  rm -f /tmp/clawforge-nodesource-setup.sh
}

log "Preparing ClawForge in ${REPO_ROOT}"

have git || fail "git is required on the Brev instance."

if ! have node || [[ "$(node_major)" -lt 20 ]]; then
  install_node_20
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

cat <<'NEXT'

[clawforge-brev] Setup complete.

Run ClawForge on Brev:
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
