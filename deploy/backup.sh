#!/usr/bin/env bash
# Nightly encrypted database backup.  crontab:  0 2 * * * /opt/qatar-hms/deploy/backup.sh
# Needs: BACKUP_PASSPHRASE (env or /etc/hms-backup.pass), docker compose project name "qatar-hms".
set -euo pipefail
DIR="${BACKUP_DIR:-/var/backups/hms}"; KEEP_DAYS="${KEEP_DAYS:-30}"
PASS_FILE="${BACKUP_PASS_FILE:-/etc/hms-backup.pass}"
mkdir -p "$DIR"; umask 077
OUT="$DIR/hms-$(date +%F-%H%M).sql.gz.enc"
docker compose -p qatar-hms exec -T db pg_dump -U "${PGUSER:-hms}" "${PGDATABASE:-qatar_hms}" | gzip -9 \
  | openssl enc -aes-256-cbc -pbkdf2 -salt -pass "file:$PASS_FILE" > "$OUT"
find "$DIR" -name 'hms-*.enc' -mtime +"$KEEP_DAYS" -delete
echo "backup ok: $OUT ($(du -h "$OUT" | cut -f1))"
# restore:  openssl enc -d -aes-256-cbc -pbkdf2 -pass file:/etc/hms-backup.pass -in FILE | gunzip | docker compose -p qatar-hms exec -T db psql -U hms hms
# TIP: copy $DIR off the server (rclone / another region) and test a restore every month.
