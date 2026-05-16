#!/bin/bash
set -e

BACKUP_DIR="/home/ubuntu/workspace/backups"
DATA_DIR="/home/ubuntu/workspace/mem0-data"
MAX_BACKUPS=7

echo "=== Mem0 Backup Script ==="
echo ""

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Generate timestamp
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/mem0-backup-$TIMESTAMP.tar.gz"

echo "Starting backup..."
echo "Source: $DATA_DIR"
echo "Destination: $BACKUP_FILE"

# Check if data directory exists and has content
if [ ! -d "$DATA_DIR" ]; then
    echo "WARNING: Data directory does not exist. Creating empty backup."
    touch "$BACKUP_FILE"
elif [ -z "$(ls -A "$DATA_DIR" 2>/dev/null)" ]; then
    echo "WARNING: Data directory is empty."
fi

# Create backup
tar -czf "$BACKUP_FILE" -C "$(dirname "$DATA_DIR")" "$(basename "$DATA_DIR")" 2>/dev/null || true

if [ -f "$BACKUP_FILE" ]; then
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo "Backup created successfully: $BACKUP_FILE ($BACKUP_SIZE)"

    # Remove old backups, keeping only the last $MAX_BACKUPS
    echo "Cleaning up old backups (keeping last $MAX_BACKUPS)..."
    cd "$BACKUP_DIR"
    ls -t mem0-backup-*.tar.gz 2>/dev/null | tail -n +$((MAX_BACKUPS + 1)) | xargs -r rm -f

    echo ""
    echo "Backup completed successfully"
    exit 0
else
    echo "ERROR: Backup failed"
    exit 1
fi