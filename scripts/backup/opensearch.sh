#!/usr/bin/env bash
# OpenSearch 스냅샷 (Snapshot API)
# 사전 작업: snapshot repository 등록
#   curl -X PUT http://localhost:9200/_snapshot/labnote_repo \
#     -H 'Content-Type: application/json' \
#     -d '{"type":"fs","settings":{"location":"/usr/share/opensearch/snapshots"}}'
# cron 예: 30 2 * * * bash scripts/backup/opensearch.sh >> /var/log/labnote-backup.log 2>&1
set -euo pipefail

OS_URL="${OPENSEARCH_URL:-http://localhost:9200}"
REPO="${OS_SNAPSHOT_REPO:-labnote_repo}"
TS=$(date +%Y-%m-%d-%H%M%S)
SNAPSHOT="snapshot-${TS}"

echo "[opensearch-backup] $(date) creating $SNAPSHOT"
curl -fsS -X PUT "$OS_URL/_snapshot/$REPO/$SNAPSHOT?wait_for_completion=true" \
  -H 'Content-Type: application/json' \
  -d '{"indices":"*","ignore_unavailable":true,"include_global_state":false}' \
  | tee /dev/stderr | grep -q '"state":"SUCCESS"'

echo "[opensearch-backup] $(date) done"
