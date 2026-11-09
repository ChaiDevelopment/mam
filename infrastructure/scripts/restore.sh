#!/usr/bin/env bash
# Restore a backup into a database. DESTRUCTIVE for the target database.
# Usage: DATABASE_URL=postgresql://.../mam_restore ./restore.sh backups/mam-20261107T010000Z.dump
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
FILE="${1:?backup file required}"
[ -f "$FILE.sha256" ] && sha256sum -c "$FILE.sha256"
PG_URL="$(echo "$DATABASE_URL" | sed -E 's/[?&](schema|connection_limit)=[^&]*//g')"
read -r -p "Restore $FILE into $(echo "$PG_URL" | sed -E 's#//[^@]*@#//***@#')? Type RESTORE to continue: " ok
[ "$ok" = "RESTORE" ] || { echo "Aborted."; exit 1; }
psql "$PG_URL" -c 'CREATE EXTENSION IF NOT EXISTS postgis; CREATE EXTENSION IF NOT EXISTS citext; CREATE EXTENSION IF NOT EXISTS pgcrypto;'
pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$PG_URL" "$FILE"
echo "Restore complete. Run: npx prisma migrate status (apps/api) to confirm schema version."
