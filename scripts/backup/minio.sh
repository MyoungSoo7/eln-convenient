#!/usr/bin/env bash
# MinIO 증분 미러링 (mc mirror)
# 사용: bash scripts/backup/minio.sh
# 사전 작업: mc alias set local http://labnote-minio:9000 KEY SECRET
#            mc alias set backup http://backup-host:9000 KEY SECRET
# cron 예: 0 * * * * bash scripts/backup/minio.sh >> /var/log/labnote-backup.log 2>&1
set -euo pipefail

SRC_ALIAS="${MINIO_SRC_ALIAS:-local}"
DST_ALIAS="${MINIO_DST_ALIAS:-backup}"
BUCKETS="${MINIO_BUCKETS:-attachments exports}"

for bucket in $BUCKETS; do
  echo "[minio-backup] $(date) mirror $SRC_ALIAS/$bucket → $DST_ALIAS/$bucket"
  mc mirror \
    --overwrite \
    --remove \
    --preserve \
    "$SRC_ALIAS/$bucket" \
    "$DST_ALIAS/$bucket"
done

echo "[minio-backup] $(date) done"
