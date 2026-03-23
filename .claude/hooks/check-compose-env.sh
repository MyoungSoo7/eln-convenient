#!/bin/bash
# docker-compose.yml 수정 시 필수 환경변수 + 포트 충돌 검증
# PostToolUse: Edit|Write — docker-compose.yml 수정 시 실행

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if ! echo "$FILE_PATH" | grep -q "docker-compose"; then
  exit 0
fi

COMPOSE="services/docker-compose.yml"
ENV_FILE="services/.env"
warnings=""

# 필수 환경변수 체크
if [ -f "$COMPOSE" ] && [ -f "$ENV_FILE" ]; then
  required=$(grep -oP '\$\{(\w+):[?!]' "$COMPOSE" | sed 's/\${//;s/:[?!]//' | sort -u)
  for var in $required; do
    if ! grep -q "^${var}=" "$ENV_FILE" 2>/dev/null; then
      warnings+="[ENV] ${var} 누락. "
    fi
  done
fi

# 포트 충돌 체크
if [ -f "$COMPOSE" ]; then
  ports=$(grep -oP '"\d+:\d+"' "$COMPOSE" 2>/dev/null | sed 's/"//g' | cut -d: -f1 | sort)
  dupes=$(echo "$ports" | uniq -d)
  if [ -n "$dupes" ]; then
    warnings+="[PORT] 충돌: $(echo $dupes | tr '\n' ', '). "
  fi
fi

if [ -n "$warnings" ]; then
  echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PostToolUse\",\"additionalContext\":\"$warnings\"}}"
fi
