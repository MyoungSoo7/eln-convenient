#!/bin/bash
# STATUS.md 자동 갱신 — 프로젝트의 현재 상태를 스냅샷으로 생성
# 트리거: docker-compose.yml, services/ 디렉토리, package.json 변경 시
# 또는 수동 실행: bash .claude/hooks/update-status.sh

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_ROOT"

STATUS_FILE="$PROJECT_ROOT/STATUS.md"
COMPOSE_FILE="$PROJECT_ROOT/services/docker-compose.yml"

# 트리거 조건: 환경변수 CLAUDE_TOOL_FILE_PATHS에 관련 파일이 있을 때만 실행
# (수동 실행 시에는 항상 동작)
if [ -n "${CLAUDE_TOOL_FILE_PATHS:-}" ]; then
  if ! echo "$CLAUDE_TOOL_FILE_PATHS" | grep -qE "(docker-compose\.yml|services/[^/]+/package\.json|services/[^/]+/prisma/schema\.prisma|\.claude/hooks/update-status\.sh)"; then
    exit 0
  fi
fi

NOW=$(date '+%Y-%m-%d %H:%M:%S')

# ── 서비스 목록 (services/ 하위 디렉토리) ──
SERVICES=$(ls -1 services/ 2>/dev/null | grep -v -E '^(docker-compose|\.env|shared|keycloak)' | grep -v '\.' | sort)
SERVICE_COUNT=$(echo "$SERVICES" | grep -c . || echo 0)

# ── Docker 컨테이너 상태 ──
CONTAINER_STATUS=""
if command -v docker &> /dev/null; then
  CONTAINER_STATUS=$(docker compose -f "$COMPOSE_FILE" ps --format "table {{.Name}}\t{{.Status}}" 2>/dev/null | tail -n +2 || echo "Docker 미실행")
fi

# ── 포트 맵 추출 (docker-compose.yml에서 PORT= 환경변수 스캔) ──
PORT_MAP=""
if [ -f "$COMPOSE_FILE" ]; then
  PORT_MAP=$(grep -E "^\s+-\s+PORT=" "$COMPOSE_FILE" | sed -E 's/.*PORT=([0-9]+).*/\1/' | sort -u | tr '\n' ' ')
fi

# ── 최근 커밋 5개 ──
RECENT_COMMITS=$(git log --oneline -5 2>/dev/null || echo "git log 실패")

# ── 브랜치 ──
BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")

# ── Prisma 스키마 존재 서비스 ──
PRISMA_SERVICES=$(find services -maxdepth 3 -name "schema.prisma" 2>/dev/null | sed 's|services/||;s|/prisma/schema.prisma||' | sort | tr '\n' ' ')

# ── i18n 언어 개수 ──
I18N_LOCALES=$(ls -1 src/i18n/locales/ 2>/dev/null | tr '\n' ' ' || echo "없음")
I18N_KO_COUNT=$(ls -1 src/i18n/locales/ko/*.json 2>/dev/null | wc -l)
I18N_EN_COUNT=$(ls -1 src/i18n/locales/en/*.json 2>/dev/null | wc -l)

# ── .claude 에이전트/룰/훅 개수 ──
AGENT_COUNT=$(ls -1 .claude/agents/*.md 2>/dev/null | wc -l)
RULE_COUNT=$(ls -1 .claude/rules/*.md 2>/dev/null | wc -l)
HOOK_COUNT=$(ls -1 .claude/hooks/*.sh 2>/dev/null | wc -l)
COMMAND_COUNT=$(ls -1 .claude/commands/*.md 2>/dev/null | wc -l)

# ── STATUS.md 생성 ──
{
  echo "# 프로젝트 현황 (STATUS.md)"
  echo ""
  echo "> 이 파일은 \`.claude/hooks/update-status.sh\`에 의해 자동 생성됩니다."
  echo "> 수동 갱신: \`bash .claude/hooks/update-status.sh\`"
  echo ""
  echo "- **마지막 갱신**: $NOW"
  echo "- **현재 브랜치**: \`$BRANCH\`"
  echo "- **백엔드 서비스 수**: $SERVICE_COUNT"
  echo ""
  echo "## 서비스 목록"
  echo ""
  echo '```'
  echo "$SERVICES"
  echo '```'
  echo ""
  echo "## 사용 포트 (docker-compose.yml)"
  echo ""
  echo "\`$PORT_MAP\`"
  echo ""
  echo "## Prisma 스키마 보유 서비스"
  echo ""
  echo "\`$PRISMA_SERVICES\`"
  echo ""
  echo "## Docker 컨테이너 상태"
  echo ""
  echo '```'
  echo "$CONTAINER_STATUS"
  echo '```'
  echo ""
  echo "## 프론트엔드 i18n"
  echo ""
  echo "- 언어: \`$I18N_LOCALES\`"
  echo "- ko/ 파일 수: $I18N_KO_COUNT"
  echo "- en/ 파일 수: $I18N_EN_COUNT"
  echo ""
  echo "## Claude Code 자동화 구성 (.claude/)"
  echo ""
  echo "| 항목 | 개수 |"
  echo "|------|------|"
  echo "| agents/ | $AGENT_COUNT |"
  echo "| rules/ | $RULE_COUNT |"
  echo "| hooks/ | $HOOK_COUNT |"
  echo "| commands/ | $COMMAND_COUNT |"
  echo ""
  echo "## 최근 커밋"
  echo ""
  echo '```'
  echo "$RECENT_COMMITS"
  echo '```'
} > "$STATUS_FILE"

echo "[update-status] STATUS.md 갱신됨 ($NOW)"
