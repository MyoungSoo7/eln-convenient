#!/bin/sh
set -e

# 환경에 따라 Prisma 마이그레이션 전략 분기
# NODE_ENV=production → prisma migrate deploy (안전한 마이그레이션)
# NODE_ENV=development 또는 미설정 → prisma db push (빠른 개발용)

if [ "$NODE_ENV" = "production" ]; then
  echo "[entrypoint] Production 환경 — prisma migrate deploy 실행"
  npx prisma migrate deploy
else
  echo "[entrypoint] Development 환경 — prisma db push 실행"
  npx prisma db push --accept-data-loss || npx prisma db push --force-reset
fi

# schema.sql이 존재하면 실행 (DB 트리거, 커스텀 함수 등 Prisma가 관리하지 않는 스키마)
if [ -f "schema.sql" ] && [ -n "$DATABASE_URL" ]; then
  echo "[entrypoint] schema.sql 적용 (트리거/함수)"
  npx prisma db execute --file schema.sql --schema prisma/schema.prisma 2>/dev/null || \
    echo "[entrypoint] schema.sql 적용 실패 (무시하고 계속 진행)"
fi

# auth-service seed (SEED_ON_START=true 일 때만)
if [ "$SEED_ON_START" = "true" ]; then
  echo "[entrypoint] Seed 데이터 적용"
  npx prisma db seed || true
fi

echo "[entrypoint] 서버 시작"
exec npm start
