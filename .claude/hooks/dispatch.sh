#!/bin/bash
# PostToolUse 훅 디스패처
# - Write|Edit 한 번에 모든 훅이 발화하는 대신, file_path에 해당하는 훅만 실행
# - 해당 훅이 2개 이상이면 병렬 실행 (& + wait)
# - STATUS.md 자체 편집은 무시해 재귀 방지

set -u

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

# file_path 없으면 바로 종료 (bash 1개만 소비)
[ -z "$FILE_PATH" ] && exit 0

# 재귀 방지: STATUS.md / dispatch 스스로 / .claude/hooks/ 내부 수정은 무시
case "$FILE_PATH" in
  *STATUS.md|*/.claude/hooks/*)
    exit 0
    ;;
esac

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 각 훅 스크립트는 stdin에서 JSON을 읽으므로, INPUT을 heredoc으로 전달
run_hook() {
  local script="$1"
  bash "$HOOK_DIR/$script" <<< "$INPUT"
}

pids=()

# i18n 동기화 — src/i18n/locales/ 내부 수정 시
case "$FILE_PATH" in
  */src/i18n/locales/*|src/i18n/locales/*)
    run_hook check-i18n-sync.sh &
    pids+=($!)
    ;;
esac

# 백엔드 서비스 재빌드 리마인더 — services/*-service/src/ 수정 시
case "$FILE_PATH" in
  */services/*-service/src/*|services/*-service/src/*)
    run_hook rebuild-reminder.sh &
    pids+=($!)
    ;;
esac

# Prisma 마이그레이션 리마인더 — schema.prisma 수정 시
case "$FILE_PATH" in
  *schema.prisma)
    run_hook prisma-migration-reminder.sh &
    pids+=($!)
    ;;
esac

# Docker Compose 검증 — docker-compose.yml / .yaml 수정 시
case "$FILE_PATH" in
  *docker-compose.yml|*docker-compose.yaml)
    run_hook check-compose-env.sh &
    pids+=($!)
    ;;
esac

# STATUS.md 자동 갱신 — 트리거 파일 변경 시 (CLAUDE_TOOL_FILE_PATHS로 전달)
case "$FILE_PATH" in
  *docker-compose.yml|*docker-compose.yaml|*package.json|*schema.prisma)
    CLAUDE_TOOL_FILE_PATHS="$FILE_PATH" bash "$HOOK_DIR/update-status.sh" >/dev/null 2>&1 &
    pids+=($!)
    ;;
esac

# 모든 병렬 훅 완료 대기
for pid in "${pids[@]}"; do
  wait "$pid" 2>/dev/null || true
done

exit 0
