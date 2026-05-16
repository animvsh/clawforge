# Brev Mem0 Deployment Guide

This guide covers how to deploy and manage a Mem0 server on a Brev.dev VM, suitable for development and small-scale production workloads.

## Overview

Mem0 can be self-hosted on a Brev-managed virtual machine. Brev handles VM provisioning, Docker runtime, and SSH access, while Mem0 runs as a Docker container with a REST API.

**Typical stack:**

```
Brev CLI
  └── brev deploy
        └── VM (Docker pre-installed)
              └── Mem0 container (:8000)
                    └── persistent volume (data)
```

## Prerequisites

- **Brev CLI** — Install via `brew install brev` (macOS/Linux) or see [brev.dev/cli](https://brev.dev).
- **Docker** — Installed automatically on Brev-provisioned VMs.
- **Mem0 GitHub repo** — `git clone https://github.com/mem0ai/mem0.git` on the VM (or use a pre-built image).
- **API key** — Any static string used to authenticate ClawForge to Mem0.

## Environment Variables

Define these before deploying:

| Variable | Description | Example |
|---|---|---|
| `MEM0_API_URL` | Base URL for the Mem0 API server. | `http://localhost:8000` (local) or `http://<vm-ip>:8000` (remote) |
| `MEM0_API_KEY` | Static bearer token. ClawForge sends this as `Authorization: Bearer <token>`. | `mk_live_abc123...` |
| `MEM0_VOLUME` | Path for persistent storage (inside the container). | `/mem0/data` |
| `LOG_LEVEL` | Mem0 log verbosity. | `INFO`, `DEBUG` |

> **Security note:** `MEM0_API_KEY` grants full read/write access to all memories. Treat it like a password — never commit it to source control. Use Brev's secrets management or a `.env` file that is excluded from version control.

## Deployment Steps

### 1. Provision the VM with Brev

```bash
# Create a new Brev environment
brev env create mem0-server

# Provision a VM (example: using Ubuntu 22.04, 2 vCPU, 8 GB RAM)
brev VM create mem0-server --size medium -- distro ubuntu22.04
```

> **TODO:** Add Brev configuration file (`brev.yaml`) example for reproducible provisioning.

### 2. SSH into the VM

```bash
brev ssh mem0-server
```

### 3. Install Mem0

```bash
# Option A: Clone and run with Docker Compose (recommended)
git clone https://github.com/mem0ai/mem0.git
cd mem0/deploy
docker compose up -d

# Option B: Pull pre-built image and run manually
docker pull mem0ai/mem0:latest
docker run -d \
  --name mem0 \
  -p 8000:8000 \
  -v mem0-data:/mem0/data \
  -e MEM0_API_KEY=your-secret-key \
  -e LOG_LEVEL=INFO \
  mem0ai/mem0:latest
```

### 4. Verify the Server

```bash
# Check container is running
docker ps | grep mem0

# Health check
curl http://localhost:8000/health
```

Expected response:
```json
{
  "status": "ok",
  "version": "1.0.0"
}
```

### 5. Configure ClawForge

On the machine running ClawForge, set the environment variables:

```bash
export MEM0_API_URL="http://<vm-ip>:8000"
export MEM0_API_KEY="your-secret-key"
```

Or add them to the ClawForge `.env` file:

```env
MEM0_API_URL=http://<vm-ip>:8000
MEM0_API_KEY=mk_live_abc123...
```

### 6. Test Connectivity

```bash
curl -X POST http://<vm-ip>:8000/api/memories \
  -H "Authorization: Bearer your-secret-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "test memory", "memory_type": "context", "metadata": {"user_id": "u1", "project_id": "p1"}}'
```

## Configuration Options

### Docker Compose Override

To customize Mem0's behavior, create a `docker-compose.override.yml`:

```yaml
services:
  mem0:
    environment:
      # Authentication
      - MEM0_API_KEY=${MEM0_API_KEY}
      # Logging
      - LOG_LEVEL=DEBUG
      # Storage
      - MEM0_STORE_TYPE=sqlite  # or "postgres", "qdrant"
      - MEM0_PERSISTENCE_DIR=/mem0/data
    volumes:
      - mem0-data:/mem0/data
    ports:
      - "8000:8000"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
```

Apply with:

```bash
docker compose -f deploy/docker-compose.yml -f docker-compose.override.yml up -d
```

### Database Backends

By default, Mem0 uses SQLite for storage. For production workloads:

**PostgreSQL:**
```yaml
- MEM0_STORE_TYPE=postgres
- POSTGRES_HOST=your-db-host
- POSTGRES_PORT=5432
- POSTGRES_DB=mem0
- POSTGRES_USER=mem0
- POSTGRES_PASSWORD=***
```

**Qdrant (vector search):**
```yaml
- MEM0_STORE_TYPE=qdrant
- QDRANT_HOST=your-qdrant-host
- QDRANT_PORT=6333
- QDRANT_COLLECTION=mem0_memories
```

## Health Check Setup

The Mem0 container should be configured with a Docker healthcheck. Apply the health check from the override above, then verify:

```bash
# View container health status
docker inspect mem0 --format='{{.State.Health.Status}}'

# Manual health probe
curl -f http://localhost:8000/health || echo "Unhealthy"
```

To set up external monitoring (e.g., UptimeRobot, Grafana):

```bash
# Expose port 8000 via a reverse proxy with TLS (recommended for production)
# Then monitor: curl https://your-domain.com/health
```

## Backup Procedures

### Container Volume Backup

```bash
# Create a tar archive of the Mem0 volume
docker run --rm \
  -v mem0-data:/mem0/data \
  -v $(pwd):/backup \
  alpine \
  tar czf /backup/mem0-backup-$(date +%Y%m%d).tar.gz -C /mem0 data
```

### Automated Backup (Cron)

```bash
# Add to crontab (edit with: crontab -e)
# Run daily at 3 AM
0 3 * * * docker run --rm -v mem0-data:/mem0/data -v /opt/backup:/backup alpine tar czf /backup/mem0-$(date +\%Y\%m\%d).tar.gz -C /mem0 data && find /opt/backup -name "mem0-*.tar.gz" -mtime +7 -delete
```

### Restore from Backup

```bash
# Stop the container
docker compose down

# Extract backup into the volume
docker run --rm \
  -v mem0-data:/mem0/restore \
  -v $(pwd):/backup \
  alpine \
  tar xzf /backup/mem0-backup-YYYYMMDD.tar.gz -C /mem0

# Restart
docker compose up -d
```

> **TODO:** Integrate a managed backup solution (e.g., Restic, AWS S3) for production deployments. The current cron-based volume backup is suitable for single-VM setups only.

## Port-Forward / Tunnel for Admin Access

For temporary admin access without exposing Mem0 publicly:

### Option A: Brev's built-in tunnel

```bash
brev proxy mem0-server 8000
# Returns a public URL like https://mem0-xxxx.brev.dev
```

### Option B: SSH local port forward

From your local machine:

```bash
ssh -L 8000:localhost:8000 brev-user@<vm-ip>
# Then access Mem0 at http://localhost:8000
```

### Option C: WireGuard tunnel (persistent)

Brev supports WireGuard for persistent VPN access. Configure in `brev.yaml`:

```yaml
wireguard:
  enabled: true
  peers:
    - public_key: "<your-public-key>"
      allowed_ips:
        - "10.0.0.0/24"
```

With WireGuard active, access Mem0 at `http://10.0.0.x:8000` from anywhere.

## Troubleshooting

### Container fails to start

```bash
# Check logs
docker logs mem0

# Common causes:
# - Port 8000 already in use: change ports mapping to "8001:8000"
# - Volume permissions: run `sudo chown -R 1000:1000 /var/lib/docker/volumes/mem0-data`
```

### 401 Unauthorized

- Verify `MEM0_API_KEY` matches between ClawForge and the container.
- Check that ClawForge is sending the header correctly: `Authorization: Bearer <key>`.

### Mem0 is slow or hangs

```bash
# Check container resource usage
docker stats

# If memory is maxed, increase VM size:
brev VM resize mem0-server --size large
```

### Data loss on container restart

- Mem0 data is stored in the `mem0-data` Docker volume. If the container was run **without** a named volume, data lives in the container's writable layer and is lost on restart.
- **Fix:** Always use a named volume (`-v mem0-data:/mem0/data`).

### Cannot reach VM from ClawForge

```bash
# From ClawForge host, test:
curl http://<vm-ip>:8000/health

# If connection refused:
# - Check VM firewall: `sudo ufw allow 8000`
# - Check Brev security group / access rules at dashboard.brev.dev
```

### Upgrade Mem0

```bash
# Pull latest image
docker pull mem0ai/mem0:latest

# Restart container with new image
docker compose -f deploy/docker-compose.yml down
docker compose -f deploy/docker-compose.yml up -d

# Verify version
curl http://localhost:8000/health
```

> **TODO:** Add zero-downtime upgrade procedure using Docker rolling updates for production.