#!/usr/bin/env bash
# PostgreSQL 전체 논리 백업 (pg_dump custom format, 병렬 4)
# 사용: bash scripts/backup/postgres.sh [백업디렉토리]
# cron 예: 0 2 * * * cd /opt/labnote && bash scripts/backup/postgres.sh /backup/postgres >> /var/log/labnote-backup.log 2>&1
set -euo pipefail

BACKUP_DIR="${1:-/backup/postgres}"
CONTAINER="${POSTGRES_CONTAINER:-labnote-postgres}"
DB="${POSTGRES_DB:-labnote}"
USER="${POSTGRES_USER:-postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

mkdir -p "$BACKUP_DIR"
TS=$(date +%Y-%m-%d_%H%M%S)
OUT="$BACKUP_DIR/${DB}_${TS}.dump"

echo "[postgres-backup] $(date) start → $OUT"
docker exec "$CONTAINER" pg_dump \
  -U "$USER" \
  -d "$DB" \
  --format=custom \
  --jobs=4 \
  --file="/tmp/backup.dump"
docker cp "$CONTAINER:/tmp/backup.dump" "$OUT"
docker exec "$CONTAINER" rm -f /tmp/backup.dump

# 무결성 검증
docker exec "$CONTAINER" pg_restore --list "/tmp/backup.dump" >/dev/null 2>&1 || {
  # 컨테이너 안 파일은 이미 지웠으므로 복사본으로 검증
  pg_restore --list "$OUT" >/dev/null
}

# 보관 정책: N일 이상 된 파일 삭제
find "$BACKUP_DIR" -name "${DB}_*.dump" -type f -mtime +"$RETENTION_DAYS" -delete

echo "[postgres-backup] $(date) done ($(du -h "$OUT" | cut -f1))"
