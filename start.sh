#!/bin/bash
# LabNote ELN - 전체 서비스 시작 스크립트
# 백엔드(Docker Compose) + 프론트엔드(Vite dev server) 동시 실행

cd "$(dirname "$0")/services" && docker compose up -d
cd "$(dirname "$0")" && npm run dev
