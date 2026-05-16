#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${CLAWFORGE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
cd "$ROOT_DIR"

log() {
  printf "\n==> %s\n" "$1"
}

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf "Missing required command: %s\n" "$1" >&2
    return 1
  fi
}

log "ClawForge Brev setup"
printf "Repo: %s\n" "$ROOT_DIR"

log "Checking required tools"
need_cmd npm
need_cmd node

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
if [ "$NODE_MAJOR" -lt 20 ]; then
  printf "Node.js 20+ is required. Found: %s\n" "$(node --version)" >&2
  exit 1
fi

if command -v nvidia-smi >/dev/null 2>&1; then
  log "NVIDIA GPU status"
  nvidia-smi || true
else
  log "NVIDIA GPU status"
  printf "nvidia-smi not found. This is expected on non-GPU/local machines, but Brev GPU instances should provide it.\n"
fi

if command -v docker >/dev/null 2>&1; then
  log "Docker status"
  docker --version
else
  log "Docker status"
  printf "docker not found. NemoClaw/OpenShell integration will need Docker on the Brev instance.\n"
fi

log "Installing Node dependencies"
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

log "Preparing runtime directories"
mkdir -p .runtime/reports .runtime/memory .runtime/audit

log "Building ClawForge"
npm run build

if [ -n "${NEMOCLAW_INSTALL_URL:-}" ]; then
  log "Installing NemoClaw from NEMOCLAW_INSTALL_URL"
  curl -fsSL "$NEMOCLAW_INSTALL_URL" | bash
else
  log "NemoClaw install"
  printf "NEMOCLAW_INSTALL_URL is not set, so this script did not install NemoClaw.\n"
  printf "Set it to the official pinned installer URL/path once confirmed, then rerun this script.\n"
fi

log "Secret readiness"
for key in \
  NVIDIA_API_KEY \
  NGC_CLI_API_KEY \
  MINIMAX_API_KEY \
  MINIMAX_PLAN_KEY \
  VITE_SUPABASE_URL \
  VITE_SUPABASE_ANON_KEY \
  SUPABASE_SERVICE_ROLE_KEY \
  COMPOSIO_API_KEY
do
  if [ -n "${!key:-}" ]; then
    printf "✓ %s configured\n" "$key"
  else
    printf "- %s not configured\n" "$key"
  fi
done

cat <<'NEXT'

Next commands on Brev:

  npm run dev -- --host 0.0.0.0

Then expose the app port through Brev:

  brev port-forward <instance-name> --port 5173:5173

For NemoClaw, keep provider/gateway tokens private and expose only the ClawForge app unless the dashboard is intentionally needed for judging.
NEXT
