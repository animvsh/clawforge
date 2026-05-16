# Brev.dev Mem0 Deployment

This directory contains the deployment configuration for Mem0 (persistent memory layer) on Brev.dev.

## Overview

Mem0 provides a self-hosted memory layer for AI applications. This setup deploys:
- **Mem0 API** - The memory service API
- **PostgreSQL** - Persistent storage for Mem0

Data is persisted to `/home/ubuntu/workspace/mem0-data` on the Brev instance.

## Prerequisites

- Docker installed on the Brev instance
- Brev CLI access (`brev` command)
- SSH access to the Brev instance

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Required variables:
- `MEM0_API_KEY` - API key for Mem0 authentication
- `OPENAI_API_KEY` - OpenAI API key for embeddings
- `JWT_SECRET` - Secret for JWT token signing
- `POSTGRES_PASSWORD` - PostgreSQL database password

Optional:
- `MEM0_API_URL` - Defaults to `http://localhost:8000`

## Deployment Steps

### 1. Deploy to Brev

```bash
# From the infra/brev/mem0 directory
./deploy.sh
```

This script will:
- Verify Docker is available
- Create the workspace directory
- Pull the latest Mem0 image
- Start services with docker-compose
- Run a health check
- Report deployment status

### 2. Verify Deployment

```bash
./healthcheck.sh
```

## Port-Forward for Local Development

To access Mem0 running on Brev from your local machine:

```bash
# In a separate terminal
brev tunnel 8000
```

This creates a tunnel to port 8000 on the Brev instance.

Alternatively, SSH tunnel:
```bash
ssh -L 8000:localhost:8000 ubuntu@your-brev-instance
```

## Health Check

Run the health check script:
```bash
./healthcheck.sh
```

Or manually:
```bash
curl -f http://localhost:8000/health
```

Expected response:
```json
{"status": "healthy"}
```

## Backup and Restore

### Backup

```bash
./backup.sh
```

Backups are stored in `/home/ubuntu/workspace/backups/` with timestamps.
Last 7 backups are retained.

### Restore

To restore from a backup:

```bash
# Stop services
cd /home/ubuntu/workspace/brev-mem0
docker-compose down

# Restore data
BACKUP_FILE="/home/ubuntu/workspace/backups/mem0-backup-YYYYMMDD-HHMMSS.tar.gz"
sudo tar -xzf "$BACKUP_FILE" -C /home/ubuntu/workspace/mem0-data

# Restart services
docker-compose up -d
```

## Common Issues

### Health check fails

1. Verify containers are running:
   ```bash
   docker-compose ps
   ```

2. Check container logs:
   ```bash
   docker-compose logs mem0
   docker-compose logs postgres
   ```

3. Restart services:
   ```bash
   docker-compose restart
   ```

### Out of disk space

Mem0 data grows over time. Monitor usage:
```bash
du -sh /home/ubuntu/workspace/mem0-data
```

Consider implementing more frequent backups or cleanup policies.

### Database connection issues

1. Check PostgreSQL is running:
   ```bash
   docker-compose ps postgres
   ```

2. View PostgreSQL logs:
   ```bash
   docker-compose logs postgres
   ```

3. Verify `POSTGRES_PASSWORD` matches in both `.env` and `docker-compose.yml`

## File Structure

```
infra/brev/mem0/
├── README.md           # This file
├── .env.example        # Environment template
├── docker-compose.yml  # Service definitions
├── deploy.sh           # Deployment script
├── healthcheck.sh      # Health check script
└── backup.sh           # Backup script
```