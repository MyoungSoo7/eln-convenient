#!/bin/bash
# Prisma 스키마 변경 시 마이그레이션 리마인더
# PostToolUse: Edit|Write — schema.prisma 수정 시 실행

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if ! echo "$FILE_PATH" | grep -q "schema.prisma"; then
  exit 0
fi

service=$(echo "$FILE_PATH" | grep -oP 'services/([^/]+)/' | head -1 | sed 's|services/||;s|/||')

echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PostToolUse\",\"additionalContext\":\"[Prisma] ${service} 스키마 변경됨. 마이그레이션: docker exec labnote-${service} npx prisma migrate dev --name <설명> 또는 빌드: cd services && docker compose up -d --build ${service}\"}}"
