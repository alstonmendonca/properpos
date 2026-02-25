#!/bin/bash
# MongoDB Backup Script for ProperPOS
# Creates compressed backups using mongodump and removes backups older than 30 days.
#
# Environment variables:
#   MONGO_HOST        - MongoDB hostname (default: mongodb)
#   MONGO_PORT        - MongoDB port (default: 27017)
#   MONGO_ROOT_USER   - MongoDB root username (default: admin)
#   MONGO_ROOT_PASSWORD - MongoDB root password (required)
#   BACKUP_DIR        - Backup destination directory (default: /backups)
#   RETENTION_DAYS    - Days to keep old backups (default: 30)

set -euo pipefail

# Configuration
MONGO_HOST="${MONGO_HOST:-mongodb}"
MONGO_PORT="${MONGO_PORT:-27017}"
MONGO_ROOT_USER="${MONGO_ROOT_USER:-admin}"
MONGO_ROOT_PASSWORD="${MONGO_ROOT_PASSWORD:?MONGO_ROOT_PASSWORD is required}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

# Generate timestamp for backup naming
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="properpos_backup_${TIMESTAMP}"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_NAME}"

# Logging helper
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log "Starting MongoDB backup..."
log "Host: ${MONGO_HOST}:${MONGO_PORT}"
log "Backup directory: ${BACKUP_DIR}"

# Ensure backup directory exists
mkdir -p "${BACKUP_DIR}"

# Run mongodump
log "Running mongodump..."
mongodump \
  --host="${MONGO_HOST}" \
  --port="${MONGO_PORT}" \
  --username="${MONGO_ROOT_USER}" \
  --password="${MONGO_ROOT_PASSWORD}" \
  --authenticationDatabase=admin \
  --out="${BACKUP_PATH}" \
  --gzip

# Verify the dump directory was created and is not empty
if [ ! -d "${BACKUP_PATH}" ] || [ -z "$(ls -A "${BACKUP_PATH}")" ]; then
  log "ERROR: Backup directory is empty or was not created"
  exit 1
fi

# Compress the backup into a single archive
log "Compressing backup..."
tar -czf "${BACKUP_PATH}.tar.gz" -C "${BACKUP_DIR}" "${BACKUP_NAME}"

# Remove the uncompressed dump directory
rm -rf "${BACKUP_PATH}"

# Calculate and log backup size
BACKUP_SIZE=$(du -sh "${BACKUP_PATH}.tar.gz" | cut -f1)
log "Backup created: ${BACKUP_PATH}.tar.gz (${BACKUP_SIZE})"

# Remove old backups
log "Removing backups older than ${RETENTION_DAYS} days..."
DELETED_COUNT=$(find "${BACKUP_DIR}" -name "properpos_backup_*.tar.gz" -type f -mtime +"${RETENTION_DAYS}" -print -delete | wc -l)
log "Removed ${DELETED_COUNT} old backup(s)"

# List current backups
log "Current backups:"
ls -lh "${BACKUP_DIR}"/properpos_backup_*.tar.gz 2>/dev/null || log "  (none found)"

log "Backup completed successfully"
