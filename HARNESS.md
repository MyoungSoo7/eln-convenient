# HARNESS — LabNote ELN

> Claude Code 개발 하네스 구성 — MSA 8 서비스 + hooks/rules 풀 세팅

**Last updated:** 2026-04-09

## 목적
LabNote ELN은 **8개 마이크로서비스**가 Docker Compose로 엮인 온프레미스 시스템이다.
서비스 간 계약·환경 드리프트·국제화·DB 마이그레이션처럼 **반복적 체크리스트**가 많아, Claude Code 하네스를 hooks 기반으로 자동화한다.

## 디렉토리 구조
```
.claude/
├── agents/                    # 20+ 도메인·리뷰어 에이전트
│   ├── accessibility-checker.md
│   ├── api-client-generator.md
│   ├── api-reviewer.md
│   ├── changelog-generator.md
│   ├── circuit-breaker-reviewer.md
│   ├── config-drift-detector.md
│   ├── data-flow-tracker.md
│   ├── db-migration.md
│   ├── dead-code-detector.md
│   ├── dependency-checker.md
│   ├── docker-checker.md
│   ├── env-validator.md
│   ├── error-handler-reviewer.md
│   ├── event-flow-analyzer.md
│   ├── health-checker.md
│   ├── i18n-checker.md
│   ├── log-analyzer.md
│   ├── middleware-auditor.md
│   ├── openapi-generator.md
│   └── performance-reviewer.md
├── commands/
│   ├── add-endpoint.md
│   ├── add-event.md
│   ├── add-i18n.md
│   ├── ai-dev-team.md
│   ├── prisma-migrate.md
│   ├── rebuild.md
│   ├── review.md
│   ├── search-index.md
│   ├── service-status.md
│   └── troubleshoot.md
├── hooks/
│   ├── check-compose-env.sh          # docker-compose 환경변수 드리프트 검출
│   ├── check-i18n-sync.sh            # 다국어 키 누락 검출
│   ├── prisma-migration-reminder.sh  # 스키마 변경 시 마이그레이션 리마인더
│   └── rebuild-reminder.sh           # 핵심 파일 변경 시 rebuild 권고
├── rules/                      # 코드/리뷰 규칙 모음
├── settings.json               # 팀 공용 설정
└── settings.local.json         # 개인 로컬 설정
```

## 핵심 워크플로우
### 🟢 새 엔드포인트 추가
```
/add-endpoint → api-reviewer 리뷰 → openapi-generator 스펙 동기화
```

### 🟢 새 이벤트 추가
```
/add-event → event-flow-analyzer 경로 추적 → circuit-breaker-reviewer 장애 격리 검증
```

### 🟢 다국어 추가
```
/add-i18n → check-i18n-sync.sh (누락 감지)
```

### 🟢 DB 스키마 변경
```
prisma-migration-reminder.sh 자동 알림 → db-migration 에이전트로 마이그레이션 작성
```

### 🟢 docker-compose 변경
```
check-compose-env.sh 자동 검출 → config-drift-detector + env-validator 로 검증
```

### 🟢 리뷰/릴리즈 전
```
/review → middleware-auditor + error-handler-reviewer + performance-reviewer + api-reviewer
```

## 확장 가이드
- **새 서비스 추가** → `.claude/agents/` 에 전담 에이전트 추가, `/service-status` 커맨드에 엔드포인트 등록
- **hooks 추가** → 스크립트는 멱등(idempotent) + 빠르게(1s 내) 실행 가능해야 함
- **rules 수정** → PR 리뷰 때 자동 로드되도록 파일명 컨벤션 준수

## 관련 문서
- `CLAUDE.md` — 에이전트 운용 규칙
- `STATUS.md` — 현재 진행 상황
- `README.md` — MSA 설계 문서
