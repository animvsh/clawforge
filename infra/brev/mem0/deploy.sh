#!/bin/bash
set -e

echo "=== Mem0 Deployment Script ==="
echo ""

# Check if Docker is available
echo "Checking Docker..."
if ! command -v docker &> /dev/null; then
    echo "ERROR: Docker is not installed or not in PATH"
    exit 1
fi

if ! docker info &> /dev/null; then
    echo "ERROR: Docker daemon is not running"
    exit 1
fi
echo "Docker is available"

# Check if docker-compose is available
echo "Checking docker-compose..."
if ! command -v docker-compose &> /dev/null; then
    echo "ERROR: docker-compose is not installed or not in PATH"
    exit 1
fi
echo "docker-compose is available"

# Create workspace directory
echo "Creating workspace directory..."
mkdir -p /home/ubuntu/workspace/mem0-data
mkdir -p /home/ubuntu/workspace/backups

# Change to script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Copy .env.example to .env if .env doesn't exist
if [ ! -f ".env" ]; then
    echo "Creating .env from .env.example..."
    cp .env.example .env
    echo "WARNING: Please edit .env with your actual API keys before continuing"
    exit 1
fi

# Build Mem0 from local source
echo "Building Mem0 from local source at $MEM0_SOURCE_DIR..."
docker-compose build mem0

# Start services
echo "Starting Mem0 services..."
docker-compose up -d

# Wait for services to be ready
echo "Waiting for services to start..."
sleep 5

# Run health check
echo "Running health check..."
if ./healthcheck.sh; then
    echo ""
    echo "=== Deployment Successful ==="
    echo "Mem0 is running on port 8000"
    echo "PostgreSQL is running on port 5432"
    echo ""
    echo "To access Mem0 locally, run:"
    echo "  brev tunnel 8000"
    echo ""
    docker-compose ps
else
    echo ""
    echo "=== Deployment Failed ==="
    echo "Health check did not pass. Check logs:"
    echo "  docker-compose logs mem0"
    echo "  docker-compose logs postgres"
    exit 1
fi