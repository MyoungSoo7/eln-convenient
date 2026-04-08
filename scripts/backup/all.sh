#!/usr/bin/env bash
# 전체 백업 오케스트레이터 — 야간 실행용
# cron 예: 0 2 * * * bash scripts/backup/all.sh
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"

bash "$DIR/postgres.sh" || echo "[ALL] postgres failed"
bash "$DIR/minio.sh" || echo "[ALL] minio failed"
bash "$DIR/opensearch.sh" || echo "[ALL] opensearch failed"
bash "$DIR/qdrant.sh" || echo "[ALL] qdrant failed"

echo "[ALL] $(date) backup cycle done"
