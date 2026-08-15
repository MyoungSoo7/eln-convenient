#!/usr/bin/env bash
# Qdrant 컬렉션 스냅샷
# cron 예: 45 2 * * * bash scripts/backup/qdrant.sh >> /var/log/labnote-backup.log 2>&1
set -euo pipefail

QDRANT_URL="${QDRANT_URL:-http://localhost:6333}"
COLLECTIONS="${QDRANT_COLLECTIONS:-labnote_documents}"

for col in $COLLECTIONS; do
  echo "[qdrant-backup] $(date) snapshot $col"
  curl -fsS -X POST "$QDRANT_URL/collections/$col/snapshots" \
    -H 'Content-Type: application/json' \
    | tee /dev/stderr | grep -q '"status":"ok"'
done

echo "[qdrant-backup] $(date) done"
