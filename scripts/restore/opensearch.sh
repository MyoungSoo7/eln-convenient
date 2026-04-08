#!/usr/bin/env bash
# OpenSearch 스냅샷 복구
# 사용: bash scripts/restore/opensearch.sh snapshot-2026-04-08-021500
set -euo pipefail

SNAPSHOT="${1:?복구할 스냅샷 이름을 지정하세요}"
OS_URL="${OPENSEARCH_URL:-http://localhost:9200}"
REPO="${OS_SNAPSHOT_REPO:-labnote_repo}"

read -r -p "정말로 OpenSearch 인덱스를 덮어쓰시겠습니까? (yes/no): " confirm
[ "$confirm" = "yes" ] || { echo "취소됨"; exit 1; }

echo "[opensearch-restore] $(date) closing indices"
curl -fsS -X POST "$OS_URL/_all/_close" || true

echo "[opensearch-restore] $(date) restoring $SNAPSHOT"
curl -fsS -X POST "$OS_URL/_snapshot/$REPO/$SNAPSHOT/_restore?wait_for_completion=true" \
  -H 'Content-Type: application/json' \
  -d '{"indices":"*","ignore_unavailable":true,"include_global_state":false}'

echo "[opensearch-restore] $(date) done"
