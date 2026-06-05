# ClawForge Persistent Agent Runtime — Deployment Guide

This document covers deploying the ClawForge 24/7 agent runtime on a Brev GPU VM using Docker.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Brev account | Sign up at [brev.dev](https://brev.dev) |
| Brev GPU VM | Recommended: L40S or A10G instance (Ubuntu 22.04) |
| Docker installed on VM | `sudo apt-get install docker.io` |
| NVIDIA driver + nvidia-docker2 | For GPU passthrough to containers |
| Brev CLI (`brev`) | `curl -fsSL https://raw.githubusercontent.com/brevdev/brev-cli/main/bin/install-latest.sh \| bash` |
| `docker compose` v2 | `apt-get install docker-compose-v2` or use `docker compose` (built-in) |
| Required secrets (see below) | Set as Brev secrets or in a `.env` file |

---

## Required Environment Secrets

Set these as Brev secrets or export them in your shell before running `docker compose`.

| Secret | Description |
|---|---|
| `NVIDIA_API_KEY` | NVIDIA NGC API key for routed model access |
| `MINIMAX_API_KEY` | MinMax API key |
| `MINIMAX_PLAN_KEY` | MinMax plan key |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous (public) key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `BREV_TOKEN` | Brev auth token (to use `brev` CLI inside the container) |

### Optional Secrets

| Secret | Description |
|---|---|
| `COMPOSIO_API_KEY` | Composio API for tool integrations |
| `MEM0_API_URL` | Mem0 self-hosted API URL |
| `MEM0_API_KEY` | Mem0 API key |
| `AGENTMAIL_API_KEY` | AgentMail for email inbox |
| `VAPI_API_KEY` | VAPI for voice/phone |
| `REDIS_URL` | Redis URL (defaults to `redis://clawforge-redis:6379/0` when using the compose stack) |

---

## Repository Setup on the VM

SSH into your Brev VM and clone the repository:

```bash
# SSH into your Brev GPU VM
brev ssh <your-instance-name>

# Clone (or pull latest) ClawForge
REPO_URL="${CLAWFORGE_REPO_URL:-https://github.com/animvsh/clawforge.git}"
REPO_ROOT="${CLAWFORGE_ROOT:-/app/clawforge}"
git clone "$REPO_URL" "$REPO_ROOT" || git -C "$REPO_ROOT" pull --ff-only
cd "$REPO_ROOT"
```

---

## Build the Docker Image

```bash
cd /app/clawforge

# Build the persistent runtime image
docker build \
  --build-arg NODE_ENV=production \
  -f Dockerfile.persistent \
  -t clawforge:latest \
  .
```

To build for a specific architecture (e.g., if your VM is ARM64):

```bash
docker build --build-arg NODE_ENV=production -f Dockerfile.persistent -t clawforge:latest . --platform linux/amd64
```

---

## Configuration

### Option A: `.env` file (easiest for local testing)

Create a `.env` file in the repo root on the VM:

```bash
# Required
NVIDIA_API_KEY=nv-...
MINIMAX_API_KEY=...
MINIMAX_PLAN_KEY=...
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
BREV_TOKEN=brev_...

# Optional
COMPOSIO_API_KEY=...
MEM0_API_URL=http://localhost:8000
MEM0_API_KEY=...
AGENTMAIL_API_KEY=...
VAPI_API_KEY=...
REDIS_URL=redis://localhost:6379/0
IMAGE_TAG=latest
CLAWFORGE_EXTERNAL_PORT=8080
```

### Option B: Brev Secrets

Set secrets in the Brev dashboard or via `brev` CLI. They will be injected as environment variables on the VM.

---

## Startup Commands

### Start the full stack (API + Agent + optional Redis)

```bash
cd /app/clawforge

# Start everything in detached mode
docker compose up -d

# Verify all services are running
docker compose ps

# View live logs
docker compose logs -f
```

### Start API server only

```bash
SERVICE_MODE=api docker compose up -d clawforge-api
```

### Start agent runtime only

```bash
SERVICE_MODE=agent docker compose up -d clawforge-agent
```

### Enable Redis (uncomment the `clawforge-redis` section in `docker-compose.yml` first)

```bash
docker compose up -d clawforge-redis
```

---

## Health Check URLs

| Service | URL | Expected |
|---|---|---|
| `clawforge-api` | `http://localhost:8080/api/health` | `{"ok":true,...}` |
| `clawforge-agent` | `http://localhost:8081/health` | `{"status":"ok",...}` |

### Verify health

```bash
# API
curl -sf http://localhost:8080/api/health | jq .

# Agent (if exposed)
curl -sf http://localhost:8081/health | jq .
```

---

## Log Access

All container logs are written to stdout/stderr and captured by Docker's logging driver. Access them via:

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f clawforge-api
docker compose logs -f clawforge-agent

# Last 200 lines
docker compose logs --tail 200 clawforge-api

# Since a timestamp
docker compose logs --since "2026-05-16T00:00:00" clawforge-agent
```

For persistent logs beyond Docker's log rotation (5 files x 50 MB each), pipe to an external syslog or cloud log aggregator.

---

## Restart Policy

`docker-compose.yml` uses `restart: unless-stopped` for all services. This means:

- The container restarts automatically after a VM reboot.
- The container restarts automatically after a Docker daemon restart.
- The container does **not** restart if you explicitly run `docker compose down`.
- On crash, the container is restarted up to the Docker restart policy limit.

### Manual restart

```bash
docker compose restart clawforge-api
docker compose restart clawforge-agent
```

### Rolling update (no downtime)

```bash
# Rebuild and restart with the latest code
docker build -f Dockerfile.persistent -t clawforge:latest .
docker compose up -d --no-deps clawforge-api
docker compose up -d --no-deps clawforge-agent
```

---

## NVIDIA GPU Access

Ensure `nvidia-docker2` is installed and the Docker runtime is configured for NVIDIA:

```bash
# Verify GPU is visible inside a container
docker run --rm --runtime=nvidia --gpus all ubuntu nvidia-smi
```

If GPU access fails, add the following to `/etc/docker/daemon.json` on the VM and restart Docker:

```json
{
  "runtimes": {
    "nvidia": {
      "path": "nvidia-container-runtime",
      "runtimeArgs": []
    }
  },
  "default-runtime": "nvidia"
}
```

Then: `sudo systemctl restart docker`

---

## Auto-Restart on VM Reboot

The `restart: unless-stopped` policy in `docker-compose.yml` handles container restarts after a VM reboot. Ensure the Docker daemon is set to start on boot:

```bash
sudo systemctl enable docker
sudo systemctl enable containerd
```

---

## Persistent Storage

The `clawforge-runtime` Docker volume mounts at `/app/.runtime/` inside containers and persists:

- `.runtime/reports/` — agent execution reports
- `.runtime/memory/` — mem0 workspace memory
- `.runtime/audit/` — audit logs
- `.runtime/integrations/` — integration manifest
- `.runtime/nemoclaw/` — NemoClaw instance manifest

To inspect the volume:

```bash
docker volume inspect clawforge_clawforge-runtime
```

To reset state (nuke all persisted data):

```bash
docker compose down -v
docker volume rm clawforge_clawforge-runtime 2>/dev/null || true
```

---

## Agent Service Python Scripts (Required)

The `clawforge-agent` container requires two Python entrypoints that do not yet exist in the repository. Create them before building:

### `scripts/agent/agent_service.py`

The main agent loop. Example minimal structure:

```python
#!/usr/bin/env python3
"""ClawForge persistent agent service."""
import http.server, json, os, signal, sys, time

PORT = int(os.environ.get("AGENT_HEALTH_PORT", "8081"))
HOST = "0.0.0.0"

class HealthHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok", "service": "agent"}).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        pass  # suppress request logs — stdout is captured by Docker

def main():
    server = http.server.HTTPServer((HOST, PORT), HealthHandler)
    print(f"[agent_service] Health server listening on {HOST}:{PORT}", flush=True)

    def shutdown(sig, frame):
        print("[agent_service] SIGTERM received, shutting down.", flush=True)
        sys.exit(0)
    signal.signal(signal.SIGTERM, shutdown)

    while True:
        # ── INSERT YOUR AGENT LOOP HERE ─────────────────────────────────
        # Example: poll task queue, run agent tasks, emit events, etc.
        # ─────────────────────────────────────────────────────────────────
        time.sleep(30)

if __name__ == "__main__":
    main()
```

### `scripts/agent/task_queue.py`

Background job queue worker. Example minimal structure:

```python
#!/usr/bin/env python3
"""ClawForge background task queue worker."""
import os, signal, sys, time

def main():
    print("[task_queue] Task queue worker starting...", flush=True)

    def shutdown(sig, frame):
        print("[task_queue] SIGTERM received, shutting down.", flush=True)
        sys.exit(0)
    signal.signal(signal.SIGTERM, shutdown)

    while True:
        # ── INSERT YOUR TASK QUEUE LOOP HERE ───────────────────────────
        # Example: poll Redis/BullMQ, process enqueued agent tasks.
        # ─────────────────────────────────────────────────────────────────
        time.sleep(10)

if __name__ == "__main__":
    main()
```

After creating both files, make them executable:

```bash
chmod +x scripts/agent/agent_service.py
chmod +x scripts/agent/task_queue.py
```

---

## Troubleshooting

### `docker compose up -d` fails with "network not found"

```bash
docker network create clawforge-net 2>/dev/null || true
docker compose up -d
```

### API container exits immediately with code 0

Likely `SERVICE_MODE=api` is set but `serve-clawforge.mjs` is failing silently. Run interactively to debug:

```bash
docker run --rm -it --env-file .env clawforge:latest \
  node /app/scripts/railway/serve-clawforge.mjs
```

### Agent container crashes on startup

Check logs:

```bash
docker compose logs clawforge-agent
```

Common causes:
- Missing `NVIDIA_API_KEY` — agent fails to initialise the model client.
- Missing `scripts/agent/agent_service.py` — file not found.
- Port 8081 already in use — change `AGENT_HEALTH_PORT`.

### Health check always fails

Verify the health endpoint is responding:

```bash
curl -v http://localhost:8080/api/health
docker exec clawforge-api curl -sf http://localhost:8080/api/health
```

The health check uses `curl` — ensure curl is installed inside the container (it is, via `python:3.11-slim`).

### GPU not available inside container

```bash
# On the VM, verify nvidia-smi works
nvidia-smi

# Test GPU inside a Docker container
docker run --rm --runtime=nvidia --gpus all nvidia/cuda:12.4-base nvidia-smi
```

If nvidia-smi works on the host but not in the container, ensure `nvidia-container-toolkit` is installed and Docker is configured to use the NVIDIA runtime.

### Brev CLI not authenticated inside container

The container needs `BREV_TOKEN` set to authenticate the Brev CLI. Without it, the Brev CLI calls in `serve-clawforge.mjs` will fail gracefully, but the API will still serve the web UI.

### Volumes not persisting across restarts

```bash
# Check the volume exists and is mounted
docker inspect clawforge-api | jq '.[0].Mounts'

# Check volume contents
docker run --rm -v clawforge_clawforge-runtime:/data alpine ls /data
```

---

## Quick-Reference Cheatsheet

```bash
# Start everything
docker compose up -d

# Watch logs
docker compose logs -f clawforge-api clawforge-agent

# Restart a service
docker compose restart clawforge-api

# Rebuild and redeploy (no cache)
docker build --no-cache -f Dockerfile.persistent -t clawforge:latest .
docker compose up -d --no-deps clawforge-api

# Stop everything (preserves volumes)
docker compose down

# Stop and wipe volumes (full reset)
docker compose down -v

# Check health
curl -sf http://localhost:8080/api/health | jq .

# Shell into running container
docker exec -it clawforge-api bash

# View resource usage
docker stats --no-stream
```