# CLAUDE.md — LabNote ELN 프로젝트 지시서

## 프로젝트 개요

사내 구축형 전자연구노트(ELN) 협업 플랫폼. 온프레미스 Docker Compose 배포 기반 MSA 아키텍처.

```
┌──────────────────────────────────────────────────┐
│              api-gateway (Fastify :8000)          │
└──┬──────┬──────┬──────┬──────┬──────┬──────┬─────┘
   │      │      │      │      │      │      │
 auth   eln   sig/aud  inv   sched  search  file  collab
 :8001  :8002  :8003   :8004  :8005  :8006  :8008  :8009(ws)
```

## 기술 스택

- **프론트엔드**: React + Vite + TypeScript, shadcn/ui, TanStack Query, react-i18next (ko/en)
- **백엔드**: Fastify (전 서비스 통일), Prisma ORM, TypeScript
- **인프라**: PostgreSQL 15, Redis 7, MinIO (S3 호환), OpenSearch 2, Keycloak 24 (선택)
- **공용 패키지**: `@lab/shared` (services/shared/) — 에러, 로거(Pino), 권한, Zod 검증, 미들웨어
- **모니터링**: Jaeger (OpenTelemetry 트레이싱), Dozzle (로그 뷰어)

## 프로젝트 구조

```
src/                          # React 메인 프론트엔드 (포트 5173)
├── api/                      # API 클라이언트 (JWT 자동 주입, client.ts)
├── components/               # 공용 컴포넌트 + shadcn/ui
├── pages/                    # 페이지 컴포넌트
├── hooks/                    # 커스텀 React 훅
├── lib/                      # 유틸리티
└── i18n/locales/{ko,en}/     # 다국어 JSON

services/
├── shared/                   # @lab/shared 공용 패키지
├── api-gateway/              # Fastify — JWT 검증, 프록시, 대시보드 집계, SSE, Rate Limit
├── auth-service/             # Fastify — 조직/팀/사용자 CRUD, RBAC, JWT 발급, SSO 훅
├── eln-service/              # Fastify — 연구노트/프로토콜/템플릿 CRUD, 버전관리, 상태 흐름
├── signature-audit-service/  # Fastify — 전자서명(해시체인), 감사로그, PDF/ZIP 변환(Puppeteer+BullMQ), 알림
├── inventory-service/        # Fastify — 시약/샘플/장비 CRUD, 바코드, 수량관리, 알림
├── scheduler-service/        # Fastify — 장비/회의실 예약, 승인/거절/취소/완료
├── search-service/           # Fastify — 통합검색(OpenSearch), 자동완성, 히스토리, 즐겨찾기
├── file-service/             # Fastify — 파일 업/다운로드(MinIO), presigned URL, 내보내기
├── collab-service/           # ws — WebSocket 실시간 협업 편집, Redis pub/sub
├── inventory-frontend/       # React SPA (인벤토리/프로토콜 전용, Nginx :80 → localhost:3000)
├── keycloak/                 # Keycloak realm 설정 (realm-labnote.json)
└── docker-compose.yml
```

## 커맨드

```bash
# Docker Compose (services/ 디렉토리에서)
docker compose up -d              # 전체 서비스 기동
docker compose up -d --build      # 전체 빌드 후 기동
docker compose up -d --build <서비스명>  # 특정 서비스만 빌드 (의존 서비스도 재생성됨)
docker compose logs -f <컨테이너명>      # 로그 확인

# 프론트엔드 (루트 디렉토리에서)
npm run dev                       # Vite 개발 서버 (localhost:5173)

# Prisma (각 서비스 컨테이너 내부)
docker exec <컨테이너명> npx prisma migrate deploy   # 마이그레이션
docker exec <컨테이너명> npx prisma db seed           # 시드 데이터
docker exec <컨테이너명> npx prisma studio             # DB GUI (포트 포워딩 필요)
```

## 서비스 URL

| 서비스 | URL |
|--------|-----|
| 메인 프론트엔드 (개발) | http://localhost:5173 |
| 인벤토리 프론트엔드 | http://localhost:3000 |
| API Gateway | http://localhost:8000 |
| Jaeger UI | http://localhost:16686 |
| Dozzle (로그) | http://localhost:9999 |
| MinIO 콘솔 | http://localhost:9001 |
| Keycloak 관리 | http://localhost:8080 |
| OpenSearch | http://localhost:9200 |

## 인증/권한 흐름

1. api-gateway가 JWT 검증 (jose JWKS + 로컬 JWT 듀얼 모드)
2. 검증 후 내부 서비스로 헤더 주입: `x-user-id`, `x-user-role`, `x-user-permissions`, `x-user-org-id`
3. 각 서비스는 `requireAuth` → `requirePermission(Permission.*)` 미들웨어로 접근 제어
4. 모든 데이터 쿼리는 `getOrgId(req)`로 조직 스코프 필터링 (멀티테넌시)
5. 내부 서비스 간 통신: `x-internal-secret` 헤더 인증

## DB 스키마 분리

하나의 PostgreSQL 인스턴스, 서비스별 Prisma 스키마 분리:
- `auth` — Organization, Role, User, Team, TeamMember
- `eln` — Note(type: note|protocol), NoteRevision, NoteLink, Attachment, Template, NoteStatusHistory
- `signature` — Signature(해시체인), AuditLog, ExportJob, Notification
- `inventory` — InventoryItem, InventoryHistory, Category
- `scheduler` — Resource(EQUIPMENT|ROOM), Booking(PENDING→APPROVED/REJECTED→COMPLETED)
- `search` — SearchHistory, Favorite, SearchKeywordFavorite
- `file` — File, ExportJob

## 노트 상태 흐름

> 상세: `docs/NOTE_STATUS_MANAGEMENT.md`

```
┌─────────┐    ┌──────────────┐    ┌────────┐
│  draft  │◄──►│ in_progress  │───►│ locked │
│  (초안)  │    │   (진행 중)    │    │ (잠김)  │
└─────────┘    └──────┬───────┘    └────┬───┘
                      │                 │
                 서명 서비스            관리자 잠금 해제
               (Redis Stream)        (POST /admin-unlock)
                      │                 │
                 ┌────▼───┐       ┌────▼───┐
                 │ signed │       │ draft  │
                 │(서명완료)│       └────────┘
                 └────────┘
```

### 역할별 전환 권한

#### 1) 직접 상태 전환 (`PATCH /api/notes/:id/status`)

| 현재 → 변경 | Researcher | Reviewer | Admin |
|-------------|:----------:|:--------:|:-----:|
| draft → in_progress | O | O | O |
| in_progress → draft | O | O | O |
| in_progress → locked | X | O | O |
| locked → draft | X | X | O (잠금 해제) |

#### 2) 서명을 통한 전환 (`POST /api/signatures/sign/:noteId`)

| 단계 | 수행자 | 설명 |
|------|--------|------|
| 서명 요청 | Reviewer, Admin (`note:sign` 권한) | 비밀번호 검증 → 해시체인 서명 생성 |
| 상태 전환 (in_progress → signed) | system (자동) | Redis Stream `NOTE_SIGNED` 이벤트 → eln-service가 소비하여 전환 |

> Researcher는 `note:sign` 권한이 없으므로 서명 요청 자체가 불가.
> 누구도 `PATCH /status`로 직접 `signed`로 바꿀 수 없음 — 반드시 서명 프로세스를 거쳐야 한다.
> `signed` 상태는 불변 — 어떤 역할도 다른 상태로 되돌릴 수 없다.

### 핵심 엔드포인트

- **상태 변경**: `PATCH /api/notes/:id/status` — `requirePermission(NOTE_STATUS)`
- **전자서명**: `POST /api/signatures/sign/:noteId` — Redis Stream `NOTE_SIGNED` 이벤트 발행 → ELN eventConsumer가 소비 (HTTP 폴백)
- **관리자 잠금 해제**: `POST /api/notes/:id/admin-unlock` — `requireRole(ADMIN)` + `requirePermission(NOTE_UNLOCK)` + auth-service 비밀번호 검증

### 상태 전환 맵 (코드)

```typescript
// 일반 사용자 (dtos/note.dto.ts)
ALLOWED_STATUS_TRANSITIONS = {
  draft: ['in_progress'], in_progress: ['draft', 'locked'], signed: [], locked: []
};
// 시스템 (서명 서비스 내부 호출, x-user-role: system)
SYSTEM_STATUS_TRANSITIONS = {
  draft: ['in_progress'], in_progress: ['draft', 'signed', 'locked'], signed: [], locked: []
};
```

### 제약사항

- `locked`/`signed` 노트는 수정/삭제 불가
- `locked` 전환은 Reviewer/Admin만 가능 (컨트롤러에서 x-user-role 검증)
- 서명은 Reviewer/Admin만 가능 (`note:sign` 권한)
- DB 트리거 `check_note_status_transition()`이 잘못된 전환을 DB 레벨에서 차단
- 모든 상태 변경은 `NoteStatusHistory` + `AuditLog` 이중 기록

## 서비스 간 이벤트

| 이벤트 | 발행자 | 구독자 | 설명 |
|--------|--------|--------|------|
| note.created/updated | eln-service | search-service | 검색 인덱스 갱신 |
| note.signed | signature-audit | eln-service | 노트 status → signed |
| note.locked | eln-service | signature-audit | 잠금 알림 발송 |
| inventory.updated | inventory-service | search-service | 인덱스 갱신 |
| export.completed | signature-audit | (알림) | PDF/ZIP 생성 완료 |

이벤트는 Redis Stream 기반 비동기 처리 (HTTP 콜백 폴백).

## Claude Code 자동화 (.claude/)

프로젝트에 Claude Code 설정이 포함되어 있다. 팀원이 Claude Code를 사용하면 자동으로 적용된다.

```
.claude/
├── settings.json          # 팀 공유 설정 (deny 룰, hooks) — 커밋 대상
├── settings.local.json    # 개인 설정 (allow 권한) — gitignore 대상
├── rules/                 # 파일별 자동 로드 규칙 (globs 기반)
│   ├── 01-backend-service-pattern.md   # 서비스 구조, 에러처리, 미들웨어
│   ├── 02-route-definition.md          # 라우트 정의 패턴
│   ├── 03-dto-validation.md            # Zod 스키마 컨벤션
│   ├── 04-frontend-i18n.md             # 다국어 규칙
│   ├── 05-api-response.md              # API 응답 형식
│   ├── 06-note-status.md               # 노트 상태 전환 제약
│   ├── 07-docker-compose.md            # 인프라 설정 규칙
│   ├── 08-shared-package.md            # @lab/shared 수정 규칙
│   ├── 09-prisma-schema.md             # Prisma 스키마 규칙
│   └── 10-security.md                  # 보안 체크리스트
├── hooks/                 # PostToolUse 자동 실행 스크립트
│   ├── check-i18n-sync.sh             # ko/en 키 누락 감지
│   ├── rebuild-reminder.sh            # 백엔드 수정 시 빌드 리마인더
│   ├── prisma-migration-reminder.sh   # 스키마 변경 시 마이그레이션 안내
│   └── check-compose-env.sh           # docker-compose 환경변수/포트 검증
├── agents/                # 특화 에이전트 (25개)
└── commands/              # 슬래시 커맨드 (/review, /rebuild 등)
```

### 팀 공유 deny 룰 (settings.json)
- `rm -rf` 명령 차단
- GitHub push 차단 (GitLab만 허용)
- `DROP TABLE/DATABASE` 차단

## 작업 규칙

- **Git push는 GitLab origin만 허용** — GitHub에 push 금지
- 백엔드 서비스 코드 수정 후에는 `docker compose up -d --build <서비스명>`으로 반영
- 프론트엔드 코드는 Vite HMR로 자동 반영 (빌드 불필요)
- 다국어: 텍스트 추가 시 `src/i18n/locales/ko/`, `en/` 두 곳 모두 반영
- API 응답 형식: `{ ok: boolean, data: T, error?: string }` 통일
- 에러 처리: `@lab/shared`의 `AppError` + `ErrorCode` 사용
- 검증: Zod 스키마 + `validate()` 미들웨어
- 로깅: `@lab/shared`의 `createHttpLogger()` (Pino 기반)
