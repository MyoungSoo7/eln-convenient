#!/bin/bash
# ============================================================
#  MSA 자동 재빌드 스크립트
#  Usage:
#    ./rebuild.sh              # git diff 기반 변경 서비스 자동 감지
#    ./rebuild.sh eln-service  # 지정 서비스만 재빌드
#    ./rebuild.sh all          # 전체 재빌드
#    ./rebuild.sh --status     # 전체 서비스 상태 확인
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 색상
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# 전체 서비스 목록
ALL_SERVICES=(
  auth-service
  eln-service
  signature-audit-service
  inventory-service
  scheduler-service
  search-service
  file-service
  collab-service
  api-gateway
  inventory-frontend
)

# shared 폴더 의존 서비스 (Dockerfile에서 COPY shared/ 사용)
SHARED_DEPENDENT=(
  auth-service
  eln-service
  signature-audit-service
  inventory-service
  scheduler-service
  search-service
  file-service
)

log()  { echo -e "${BLUE}[rebuild]${NC} $*"; }
ok()   { echo -e "${GREEN}[  OK  ]${NC} $*"; }
warn() { echo -e "${YELLOW}[ WARN ]${NC} $*"; }
err()  { echo -e "${RED}[ERROR ]${NC} $*"; }

# ── 서비스 상태 확인 ──
show_status() {
  echo ""
  log "서비스 상태 확인"
  echo "─────────────────────────────────────────"
  printf "%-28s %-12s %s\n" "SERVICE" "STATUS" "HEALTH"
  echo "─────────────────────────────────────────"
  for svc in "${ALL_SERVICES[@]}"; do
    local container
    case "$svc" in
      auth-service)             container="labnote-auth" ;;
      eln-service)              container="labnote-eln" ;;
      signature-audit-service)  container="labnote-signature" ;;
      inventory-service)        container="labnote-inventory" ;;
      scheduler-service)        container="labnote-scheduler" ;;
      search-service)           container="labnote-search" ;;
      file-service)             container="labnote-file" ;;
      collab-service)           container="labnote-collab" ;;
      api-gateway)              container="labnote-gateway" ;;
      inventory-frontend)       container="labnote-inventory-frontend" ;;
    esac
    local status health
    status=$(docker inspect -f '{{.State.Status}}' "$container" 2>/dev/null || echo "not found")
    health=$(docker inspect -f '{{.State.Health.Status}}' "$container" 2>/dev/null || echo "-")
    local color="$RED"
    [[ "$status" == "running" ]] && color="$GREEN"
    [[ "$health" == "healthy" ]] && color="$GREEN"
    [[ "$health" == "unhealthy" ]] && color="$RED"
    printf "${color}%-28s %-12s %s${NC}\n" "$svc" "$status" "$health"
  done
  echo "─────────────────────────────────────────"
  echo ""
}

# ── 유효한 서비스인지 확인 ──
is_valid_service() {
  local name="$1"
  for svc in "${ALL_SERVICES[@]}"; do
    [[ "$svc" == "$name" ]] && return 0
  done
  return 1
}

# ── git diff 기반 변경 서비스 감지 ──
detect_changed_services() {
  local changed=()
  local shared_changed=false

  # staged + unstaged + untracked 변경 파일 목록
  local files
  files=$(git -C "$SCRIPT_DIR/.." diff --name-only HEAD 2>/dev/null || true)
  files+=$'\n'
  files+=$(git -C "$SCRIPT_DIR/.." diff --name-only --cached 2>/dev/null || true)
  files+=$'\n'
  files+=$(git -C "$SCRIPT_DIR/.." ls-files --others --exclude-standard 2>/dev/null || true)

  # services/ 경로 기준으로 필터링
  while IFS= read -r file; do
    [[ -z "$file" ]] && continue

    # shared 변경 감지
    if [[ "$file" == services/shared/* ]]; then
      shared_changed=true
      continue
    fi

    # 서비스 디렉토리 추출
    if [[ "$file" == services/* ]]; then
      local svc_name
      svc_name=$(echo "$file" | cut -d'/' -f2)
      if is_valid_service "$svc_name"; then
        # 중복 제거
        local already=false
        for c in "${changed[@]+"${changed[@]}"}"; do
          [[ "$c" == "$svc_name" ]] && already=true && break
        done
        $already || changed+=("$svc_name")
      fi
    fi
  done <<< "$files"

  # shared 변경 시 의존 서비스 전체 추가
  if $shared_changed; then
    warn "shared/ 폴더 변경 감지 → 의존 서비스 전체 재빌드"
    for dep in "${SHARED_DEPENDENT[@]}"; do
      local already=false
      for c in "${changed[@]+"${changed[@]}"}"; do
        [[ "$c" == "$dep" ]] && already=true && break
      done
      $already || changed+=("$dep")
    done
  fi

  echo "${changed[@]+"${changed[@]}"}"
}

# ── 서비스 재빌드 ──
rebuild_services() {
  local services=("$@")

  if [[ ${#services[@]} -eq 0 ]]; then
    warn "재빌드할 서비스가 없습니다."
    return 0
  fi

  echo ""
  log "재빌드 대상: ${CYAN}${services[*]}${NC}"
  echo ""

  local failed=()
  local succeeded=()
  local start_all=$SECONDS

  for svc in "${services[@]}"; do
    log "────── ${CYAN}${svc}${NC} 빌드 시작 ──────"
    local start=$SECONDS

    if docker compose build --no-cache "$svc" 2>&1; then
      ok "$svc 빌드 완료 ($((SECONDS - start))초)"
    else
      err "$svc 빌드 실패!"
      failed+=("$svc")
      continue
    fi

    log "$svc 컨테이너 재시작..."
    if docker compose up -d --no-deps "$svc" 2>&1; then
      ok "$svc 재시작 완료"
      succeeded+=("$svc")
    else
      err "$svc 재시작 실패!"
      failed+=("$svc")
    fi
    echo ""
  done

  # 결과 요약
  echo ""
  echo "═══════════════════════════════════════"
  log "재빌드 결과 (총 $((SECONDS - start_all))초)"
  echo "═══════════════════════════════════════"
  if [[ ${#succeeded[@]} -gt 0 ]]; then
    ok "성공: ${succeeded[*]}"
  fi
  if [[ ${#failed[@]} -gt 0 ]]; then
    err "실패: ${failed[*]}"
    return 1
  fi
  echo ""
}

# ── 메인 ──
main() {
  # 인자 없음: 자동 감지
  if [[ $# -eq 0 ]]; then
    log "변경된 서비스 자동 감지 중..."
    local detected
    detected=$(detect_changed_services)
    if [[ -z "$detected" ]]; then
      ok "변경된 서비스가 없습니다."
      exit 0
    fi
    read -ra services <<< "$detected"
    rebuild_services "${services[@]}"
    exit $?
  fi

  # --status
  if [[ "$1" == "--status" ]]; then
    show_status
    exit 0
  fi

  # all: 전체 재빌드
  if [[ "$1" == "all" ]]; then
    log "전체 서비스 재빌드"
    rebuild_services "${ALL_SERVICES[@]}"
    exit $?
  fi

  # 지정 서비스
  local targets=()
  for arg in "$@"; do
    if is_valid_service "$arg"; then
      targets+=("$arg")
    else
      err "알 수 없는 서비스: $arg"
      echo "  사용 가능: ${ALL_SERVICES[*]}"
      exit 1
    fi
  done
  rebuild_services "${targets[@]}"
}

main "$@"
