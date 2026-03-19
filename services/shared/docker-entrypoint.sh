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

# auth-service seed (SEED_ON_START=true 일 때만)
if [ "$SEED_ON_START" = "true" ]; then
  echo "[entrypoint] Seed 데이터 적용"
  npx prisma db seed || true
fi

echo "[entrypoint] 서버 시작"
exec npm start
