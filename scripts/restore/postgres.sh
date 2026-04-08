#!/usr/bin/env bash
# PostgreSQL 전체 복구 (pg_restore)
# 사용: bash scripts/restore/postgres.sh /backup/postgres/labnote_2026-04-08.dump
# 주의: 기존 DB의 모든 데이터가 덮어써집니다.
set -euo pipefail

DUMP_FILE="${1:?복구할 dump 파일 경로를 지정하세요}"
CONTAINER="${POSTGRES_CONTAINER:-labnote-postgres}"
DB="${POSTGRES_DB:-labnote}"
USER="${POSTGRES_USER:-postgres}"

if [ ! -f "$DUMP_FILE" ]; then
  echo "ERROR: $DUMP_FILE not found" >&2
  exit 1
fi

echo "[postgres-restore] $(date) restore $DUMP_FILE → $CONTAINER:$DB"
read -r -p "정말로 $DB DB를 덮어쓰시겠습니까? (yes/no): " confirm
[ "$confirm" = "yes" ] || { echo "취소됨"; exit 1; }

# dump 파일을 컨테이너로 복사
docker cp "$DUMP_FILE" "$CONTAINER:/tmp/restore.dump"

# 기존 연결 강제 종료 후 DB 재생성
docker exec "$CONTAINER" psql -U "$USER" -d postgres -c "
  SELECT pg_terminate_backend(pid) FROM pg_stat_activity
  WHERE datname='$DB' AND pid <> pg_backend_pid();
"
docker exec "$CONTAINER" psql -U "$USER" -d postgres -c "DROP DATABASE IF EXISTS $DB;"
docker exec "$CONTAINER" psql -U "$USER" -d postgres -c "CREATE DATABASE $DB;"

# 복구
docker exec "$CONTAINER" pg_restore \
  -U "$USER" \
  -d "$DB" \
  --jobs=4 \
  --no-owner \
  /tmp/restore.dump

docker exec "$CONTAINER" rm -f /tmp/restore.dump
echo "[postgres-restore] $(date) done"
