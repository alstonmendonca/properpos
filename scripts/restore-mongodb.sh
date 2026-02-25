#!/bin/bash
# MongoDB Restore Script for ProperPOS
# Restores a compressed backup created by backup-mongodb.sh.
#
# Usage:
#   ./restore-mongodb.sh <backup_file>
#   ./restore-mongodb.sh /backups/properpos_backup_20260219_020000.tar.gz
#
# Environment variables:
#   MONGO_HOST        - MongoDB hostname (default: mongodb)
#   MONGO_PORT        - MongoDB port (default: 27017)
#   MONGO_ROOT_USER   - MongoDB root username (default: admin)
#   MONGO_ROOT_PASSWORD - MongoDB root password (required)
#   DROP_EXISTING     - Drop existing databases before restore (default: false)

set -euo pipefail

# Configuration
MONGO_HOST="${MONGO_HOST:-mongodb}"
MONGO_PORT="${MONGO_PORT:-27017}"
MONGO_ROOT_USER="${MONGO_ROOT_USER:-admin}"
MONGO_ROOT_PASSWORD="${MONGO_ROOT_PASSWORD:?MONGO_ROOT_PASSWORD is required}"
DROP_EXISTING="${DROP_EXISTING:-false}"

# Logging helper
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Validate arguments
if [ $# -lt 1 ]; then
  echo "Usage: $0 <backup_file.tar.gz>"
  echo ""
  echo "Available backups:"
  ls -lh /backups/properpos_backup_*.tar.gz 2>/dev/null || echo "  (none found)"
  exit 1
fi

BACKUP_FILE="$1"

# Validate backup file exists
if [ ! -f "${BACKUP_FILE}" ]; then
  log "ERROR: Backup file not found: ${BACKUP_FILE}"
  exit 1
fi

log "Starting MongoDB restore..."
log "Host: ${MONGO_HOST}:${MONGO_PORT}"
log "Backup file: ${BACKUP_FILE}"
log "Drop existing: ${DROP_EXISTING}"

# Create temporary directory for extraction
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "${TEMP_DIR}"' EXIT

# Extract the backup archive
log "Extracting backup archive..."
tar -xzf "${BACKUP_FILE}" -C "${TEMP_DIR}"

# Find the extracted dump directory (should be a single directory)
DUMP_DIR=$(find "${TEMP_DIR}" -mindepth 1 -maxdepth 1 -type d | head -1)

if [ -z "${DUMP_DIR}" ] || [ ! -d "${DUMP_DIR}" ]; then
  log "ERROR: Could not find dump directory in backup archive"
  exit 1
fi

log "Extracted to: ${DUMP_DIR}"

# Build mongorestore command
RESTORE_CMD=(
  mongorestore
  --host="${MONGO_HOST}"
  --port="${MONGO_PORT}"
  --username="${MONGO_ROOT_USER}"
  --password="${MONGO_ROOT_PASSWORD}"
  --authenticationDatabase=admin
  --gzip
)

if [ "${DROP_EXISTING}" = "true" ]; then
  log "WARNING: Existing databases will be dropped before restore!"
  RESTORE_CMD+=(--drop)
fi

RESTORE_CMD+=("${DUMP_DIR}")

# Run mongorestore
log "Running mongorestore..."
"${RESTORE_CMD[@]}"

log "Restore completed successfully from: ${BACKUP_FILE}"
