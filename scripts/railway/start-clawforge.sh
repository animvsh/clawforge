#!/usr/bin/env bash
set -euo pipefail
set +x

if command -v brev >/dev/null 2>&1 && [[ -n "${BREV_TOKEN:-}" ]]; then
  echo "[clawforge-railway] Logging into Brev with BREV_TOKEN."
  brev login --token "${BREV_TOKEN}" >/tmp/clawforge-brev-login.log 2>&1 || {
    echo "[clawforge-railway] Brev login failed. Deploy will still run, but instance creation will report the auth failure."
    tail -20 /tmp/clawforge-brev-login.log || true
  }
fi

exec node scripts/railway/serve-clawforge.mjs
