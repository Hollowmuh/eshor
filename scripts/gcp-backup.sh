#!/usr/bin/env bash
# Nightly backup for the GCP deploy (docs/2026-07-19/gcloud_backend_deployment_0122.md).
# Dumps the deployed compose Postgres and uploads to GCS. Run via cron on
# the VM (default deploy user is NOT root -- e.g. the GCP OS Login user):
# 0 2 * * * ESHOR_BACKUP_BUCKET=<bucket> /home/<user>/eshor/scripts/gcp-backup.sh >> /var/log/eshor-backup.log 2>&1
set -euo pipefail

COMPOSE_PROJECT_DIR="${COMPOSE_PROJECT_DIR:-$HOME/eshor}"
BUCKET="${ESHOR_BACKUP_BUCKET:?ESHOR_BACKUP_BUCKET must be set}"
DB=eshor
USER=eshor
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
DUMP_FILE="/tmp/eshor-backup-${TIMESTAMP}.sql.gz"

cd "$COMPOSE_PROJECT_DIR"

echo "== dumping =="
# --no-owner, deliberately NOT --no-privileges: --no-privileges once
# silently stripped the GRANT statements that give the limited eshor_app
# role its ledger-immutability-enforcing access, only caught because a
# later integration test failed (see scripts/restore-drill.sh's own
# comment on this exact incident). Keep GRANTs in every dump, always.
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U "$USER" -d "$DB" --no-owner | gzip > "$DUMP_FILE"

DUMP_SIZE=$(wc -c < "$DUMP_FILE")
echo "dump written: $DUMP_FILE ($DUMP_SIZE bytes)"
if [ "$DUMP_SIZE" -lt 5000 ]; then
  echo "FAIL: dump suspiciously small -- refusing to upload a likely-broken backup"
  exit 1
fi

echo "== uploading =="
gcloud storage cp "$DUMP_FILE" "gs://${BUCKET}/eshor-backup-${TIMESTAMP}.sql.gz"

rm -f "$DUMP_FILE"
echo "BACKUP-OK: gs://${BUCKET}/eshor-backup-${TIMESTAMP}.sql.gz ($DUMP_SIZE bytes)"
