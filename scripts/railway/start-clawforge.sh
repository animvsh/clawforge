#!/usr/bin/env bash
set -euo pipefail
set +x

if command -v brev >/dev/null 2>&1 && [[ -n "${BREV_TOKEN:-}" ]]; then
  echo "[clawforge-railway] Logging into Brev with BREV_TOKEN."
  brev login --token "${BREV_TOKEN}" >/tmp/clawforge-brev-login.log 2>&1 || {
    echo "[clawforge-railway] Brev login failed. Deploy will still run, and /api/clawforge/brev/status will report the auth state."
    rm -f /tmp/clawforge-brev-login.log
    exec node scripts/railway/serve-clawforge.mjs
  }
  rm -f /tmp/clawforge-brev-login.log
  if brev ls --json >/tmp/clawforge-brev-ls.json 2>/tmp/clawforge-brev-ls.err; then
    echo "[clawforge-railway] Brev auth verified; instance list is reachable."
  else
    echo "[clawforge-railway] Brev login completed, but instance listing failed. The API status endpoint will expose the non-secret state."
  fi
  rm -f /tmp/clawforge-brev-ls.json /tmp/clawforge-brev-ls.err
elif command -v brev >/dev/null 2>&1; then
  echo "[clawforge-railway] Brev CLI is installed, but BREV_TOKEN is not configured. Real instance creation will stay unavailable."
fi

exec node scripts/railway/serve-clawforge.mjs
