#!/bin/bash
# 백엔드 서비스 코드 수정 시 docker rebuild 리마인더
# PostToolUse: Edit|Write — services/*/src/ 파일 수정 시 실행

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if ! echo "$FILE_PATH" | grep -qP "services/[a-z-]+-service/src/"; then
  exit 0
fi

service=$(echo "$FILE_PATH" | grep -oP '[a-z-]+-service' | head -1)

if [ -n "$service" ]; then
  echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PostToolUse\",\"additionalContext\":\"[Build] ${service} 코드가 변경됨. 반영: cd services && docker compose up -d --build ${service}\"}}"
fi
