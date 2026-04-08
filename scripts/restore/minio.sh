#!/usr/bin/env bash
# MinIO 복구 — 백업 alias에서 운영으로 미러
set -euo pipefail

SRC_ALIAS="${MINIO_DST_ALIAS:-backup}"
DST_ALIAS="${MINIO_SRC_ALIAS:-local}"
BUCKETS="${MINIO_BUCKETS:-attachments exports}"

read -r -p "정말로 $DST_ALIAS 의 버킷을 덮어쓰시겠습니까? (yes/no): " confirm
[ "$confirm" = "yes" ] || { echo "취소됨"; exit 1; }

for bucket in $BUCKETS; do
  echo "[minio-restore] $(date) restore $SRC_ALIAS/$bucket → $DST_ALIAS/$bucket"
  mc mirror --overwrite --preserve "$SRC_ALIAS/$bucket" "$DST_ALIAS/$bucket"
done
echo "[minio-restore] $(date) done"
