#!/usr/bin/env bash
# Logical PostgreSQL backup (custom format, compressed) with retention.
# Usage: DATABASE_URL=postgresql://... BACKUP_DIR=/var/backups/mam RETENTION_DAYS=14 ./backup.sh
# Schedule daily (cron/systemd timer). Copy backups off-host (e.g. S3 with object lock).
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$BACKUP_DIR/mam-$STAMP.dump"

# Strip Prisma-only query params (pg_dump does not understand them).
PG_URL="$(echo "$DATABASE_URL" | sed -E 's/[?&](schema|connection_limit)=[^&]*//g')"
pg_dump --format=custom --compress=9 --no-owner --no-privileges --file="$FILE" "$PG_URL"
pg_restore --list "$FILE" > /dev/null   # verify the archive is readable
sha256sum "$FILE" > "$FILE.sha256"
find "$BACKUP_DIR" -name 'mam-*.dump*' -mtime +"$RETENTION_DAYS" -delete
echo "Backup written: $FILE ($(du -h "$FILE" | cut -f1))"
