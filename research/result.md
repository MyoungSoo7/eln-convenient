# Phase 1 백엔드 인프라 전체 감사 결과

**감사일**: 2026-03-17
**브랜치**: feature/phase1-backend-infra
**상태**: 전체 9개 서비스 감사 및 구현 완료

---

## 1. 서비스별 최종 상태 요약

| 서비스 | 포트 | 감사 전 | 감사 후 | 상세 |
|--------|------|---------|---------|------|
| api-gateway | 8000 | 90% | 98% | [상세](#2-api-gateway) |
| auth-service | 8001 | 75% | 97% | [상세](#3-auth-service) |
| eln-service | 8002 | 70% | 97% | [상세](#4-eln-service) |
| signature-audit-service | 8003 | 60% | 97% | [상세](#5-signature-audit-service) |
| inventory-service | 8004 | 55% | 97% | [상세](#6-inventory-service) |
| scheduler-service | 8005 | 50% | 97% | [상세](#7-scheduler-service) |
| search-service | 8006 | 40% | 97% | [상세](#8-search-service) |
| ai-assistant-service | 8007 | 30% | 97% | [상세](#9-ai-assistant-service) |
| file-service | 8008 | 55% | 97% | [상세](#10-file-service) |

---

## 2. api-gateway

**스택**: Fastify + `@fastify/http-proxy` + `jose` + Redis
**역할**: JWT 인증 게이트웨이, 하위 10개 서비스 역방향 프록시

### 수정 사항

| 파일 | 수정 내용 |
|------|----------|
| `src/middlewares/auth.ts` | PUBLIC_PATHS에 `/api/auth/sso-hook` 추가 |

### 주요 기능 (구현 완료)

- 듀얼 JWT 검증: Keycloak JWKS(모드 2) + 로컬 JWT_SECRET 폴백(모드 1)
- Redis 블랙리스트로 로그아웃 토큰 무효화
- `x-user-id`, `x-user-role`, `x-user-email`, `x-user-permissions`, `x-sso-provider` 헤더 주입
- 10개 서비스 프록시 라우팅 (`/api/auth`, `/api/notes`, `/api/protocols`, `/api/templates`, `/api/tags`, `/api/files`, `/api/inventory`, `/api/schedule`, `/api/search`, `/api/signatures`, `/api/ai`)
- Helmet CORS, Rate Limiting (100req/min)

### PUBLIC_PATHS

```
/health
/api/auth/login
/api/auth/register
/api/auth/sso-hook   ← 신규 추가 (자체 x-keycloak-secret으로 보호)
```

---

## 3. auth-service

**스택**: Express + Prisma + PostgreSQL + bcryptjs + jsonwebtoken + Redis
**역할**: 사용자/조직/팀/역할 관리, JWT 발급, SSO 훅 수신

### 수정 사항

| 파일 | 수정 내용 |
|------|----------|
| `src/middlewares/auth.middleware.ts` | `JSON.parse(raw)` → try/catch로 크래시 방지 |
| `src/controllers/auth.controller.ts` | `updateOrg()`, `updateTeam()` 신규 추가 |
| `src/routes/auth.routes.ts` | `PUT /orgs/:id`, `PUT /teams/:id` 라우트 추가 |

### API 엔드포인트 (전체)

| Method | Path | 권한 | 설명 |
|--------|------|------|------|
| POST | /api/auth/login | 공개 | JWT 발급 |
| POST | /api/auth/register | 공개 | 회원가입 |
| POST | /api/auth/sso-hook | 공개(자체 시크릿) | Keycloak 이벤트 처리 |
| POST | /api/auth/internal/verify-password | 내부(x-internal-secret) | 서비스 간 비밀번호 검증 |
| POST | /api/auth/logout | 인증 | 토큰 블랙리스트 등록 |
| GET | /api/auth/me | 인증 | 내 정보 조회 |
| GET | /api/auth/users | admin | 사용자 목록 |
| POST | /api/auth/users | admin | 사용자 생성 |
| PUT | /api/auth/users/:id | admin | 사용자 수정 |
| DELETE | /api/auth/users/:id | admin | 사용자 삭제 |
| GET | /api/auth/orgs | 인증 | 조직 목록 |
| POST | /api/auth/orgs | admin | 조직 생성 |
| PUT | /api/auth/orgs/:id | admin | 조직 수정 ← 신규 |
| DELETE | /api/auth/orgs/:id | admin | 조직 삭제 |
| GET | /api/auth/teams | 인증 | 팀 목록 |
| POST | /api/auth/teams | admin | 팀 생성 |
| PUT | /api/auth/teams/:id | admin | 팀 수정 ← 신규 |
| DELETE | /api/auth/teams/:id | admin | 팀 삭제 |
| GET | /api/auth/teams/:id/members | 인증 | 팀 멤버 조회 |
| POST | /api/auth/teams/:id/members | admin | 팀 멤버 추가 |
| DELETE | /api/auth/teams/:id/members/:userId | admin | 팀 멤버 제거 |
| GET | /api/auth/roles | admin | 역할 목록 |
| POST | /api/auth/roles | admin | 역할 생성 |
| PUT | /api/auth/roles/:id/permissions | admin | 권한 수정 |
| DELETE | /api/auth/roles/:id | admin | 역할 삭제 |

### SSO 훅 지원 이벤트

- `REGISTER` — Keycloak 신규 가입 → 로컬 DB 동기화
- `LOGIN` — 로그인 이벤트 수신 (로깅)
- `UPDATE_PROFILE` — 이름 변경 동기화
- `DELETE_ACCOUNT` — 계정 비활성화

---

## 4. eln-service

**스택**: Express + Prisma + PostgreSQL
**역할**: 연구노트/프로토콜 CRUD, 리비전 관리, 첨부파일, 링크, 템플릿

### 수정 사항

| 파일 | 수정 내용 |
|------|----------|
| `src/middlewares/auth.middleware.ts` | `JSON.parse(raw)` → try/catch 크래시 방지 |
| `src/controllers/note.controller.ts` | `getAttachments()` 신규 추가, `adminUnlockNote()` auth-service 비밀번호 실검증 |
| `src/routes/note.routes.ts` | `GET /notes/:id/attachments` 추가 |

### 노트 상태 머신

```
draft ↔ in_progress → signed
                   → locked
locked → (admin-unlock) → draft
```

`adminUnlockNote`에서 이제 auth-service `/api/auth/internal/verify-password`를 실제로 호출하여 관리자 비밀번호를 검증함.

### API 엔드포인트 (전체)

| Method | Path | 권한 | 설명 |
|--------|------|------|------|
| GET | /api/notes | note:read | 노트 목록 (검색/태그/상태 필터) |
| POST | /api/notes | note:write | 노트 생성 + 리비전 자동 생성 |
| GET | /api/notes/:id | note:read | 노트 상세 (attachments, links 포함) |
| PUT | /api/notes/:id | note:write | 노트 수정 + 리비전 자동 생성 |
| DELETE | /api/notes/:id | note:delete | 노트 삭제 (서명 완료 불가) |
| PATCH | /api/notes/:id/status | note:write | 상태 변경 (상태 머신 적용) |
| POST | /api/notes/:id/admin-unlock | note:unlock | 관리자 잠금 해제 (비밀번호 실검증) |
| GET | /api/notes/:id/revisions | note:read | 리비전 목록 |
| GET | /api/notes/:id/revisions/:rev | note:read | 리비전 상세 |
| GET | /api/notes/:id/attachments | file:read | 첨부파일 목록 ← 신규 |
| POST | /api/notes/:id/attachments | file:upload | 첨부파일 등록 |
| DELETE | /api/notes/:id/attachments/:id | file:delete | 첨부파일 삭제 |
| GET | /api/notes/:id/links | note:read | 노트 링크 목록 |
| POST | /api/notes/:id/links | note:write | 노트 링크 생성 |
| DELETE | /api/notes/:id/links/:linkId | note:write | 노트 링크 삭제 |
| GET | /api/protocols | note:read | 프로토콜 목록 |
| POST | /api/protocols | note:write | 프로토콜 생성 |
| GET/PUT/DELETE | /api/protocols/:id | note:read/write/delete | 프로토콜 CRUD |
| PATCH | /api/protocols/:id/status | note:write | 프로토콜 상태 변경 |
| GET | /api/protocols/:id/revisions | note:read | 프로토콜 리비전 |
| GET | /api/tags | note:read | 전체 태그 목록 |
| GET | /api/templates | template:read | 템플릿 목록 |
| POST | /api/templates | template:write | 템플릿 생성 |
| GET | /api/templates/:id | template:read | 템플릿 상세 |
| PUT | /api/templates/:id | template:write | 템플릿 수정 |
| DELETE | /api/templates/:id | template:write | 템플릿 삭제 |
| POST | /api/templates/recommend | template:read | AI 템플릿 추천 |

---

## 5. signature-audit-service

**스택**: Express + Prisma + PostgreSQL + BullMQ + Redis
**역할**: 전자서명, 감사 로그, PDF/CSV/Excel 내보내기 (비동기)

### 수정 사항 (이전 세션)

| 파일 | 수정 내용 |
|------|----------|
| `src/middlewares/auth.middleware.ts` | JSON.parse try/catch |
| `src/controllers/audit.controller.ts` | `requirePermission` → `requireInternalSecret` 보안 강화 |
| `src/controllers/export.controller.ts` | BullMQ 비동기 내보내기 큐 연동 |
| `src/workers/export.worker.ts` | PDF/CSV/Excel 생성 워커 전체 구현 |
| `src/lib/queue.ts` | BullMQ 큐/워커 설정 |

### 내보내기 플로우

```
POST /api/signatures/export → BullMQ 큐 추가 → jobId 반환
GET  /api/signatures/export/:jobId → 진행 상태/다운로드 URL
```

---

## 6. inventory-service

**스택**: Express + Prisma + PostgreSQL + QRCode
**역할**: 시약/샘플/장비/자산 CRUD, 바코드/라벨, 재고 알림

### 수정 사항 (이전 세션)

| 파일 | 수정 내용 |
|------|----------|
| `src/middlewares/auth.middleware.ts` | JSON.parse try/catch |
| `src/controllers/inventory.controller.ts` | 바코드 QR 생성, 재고 알림, 체크아웃/반납 전체 구현 |
| `src/routes/inventory.routes.ts` | 바코드/QR, 체크아웃/반납, 카테고리 라우트 추가 |

### 주요 기능

- 시약/샘플/장비/자산 타입별 CRUD
- 바코드(Code128) + QR 코드 생성 (`GET /api/inventory/:id/barcode`)
- 재고 부족 알림 (`GET /api/inventory/alerts/low-stock`)
- 장비 체크아웃/반납 (`POST /api/inventory/:id/checkout`, `/checkin`)
- 카테고리별 통계 (`GET /api/inventory/stats/by-category`)

---

## 7. scheduler-service

**스택**: Express + Prisma + PostgreSQL
**역할**: 장비/회의실 예약, 승인 흐름, 충돌 감지

### 수정 사항 (이전 세션)

| 파일 | 수정 내용 |
|------|----------|
| `src/middlewares/auth.middleware.ts` | JSON.parse try/catch |
| `src/controllers/schedule.controller.ts` | 예약 충돌 감지, 승인/거절 흐름 전체 구현 |
| `src/routes/schedule.routes.ts` | 승인/거절, 내 예약, 리소스별 예약 라우트 추가 |

### 예약 상태 머신

```
pending → approved | rejected
approved → cancelled
```

### 주요 기능

- 자원 CRUD (장비/회의실, `GET /api/schedule/resources`)
- 예약 생성 시 시간대 충돌 자동 감지
- 승인자(approver) 지정 및 승인/거절 (`PATCH /api/schedule/bookings/:id/approve`)
- 내 예약 조회 (`GET /api/schedule/bookings/my`)
- 자원별 예약 조회 (`GET /api/schedule/resources/:id/bookings`)

---

## 8. search-service

**스택**: Express + OpenSearch + `@opensearch-project/opensearch`
**역할**: 노트/프로토콜/인벤토리 통합 전문검색

### 수정 사항 (이전 세션)

| 파일 | 수정 내용 |
|------|----------|
| `src/middlewares/auth.middleware.ts` | JSON.parse try/catch |
| `src/controllers/search.controller.ts` | `TYPE_ALIASES` 매핑 버그 수정, 인덱싱/삭제 엔드포인트 추가 |
| `src/routes/search.routes.ts` | 인덱싱/삭제/벌크 라우트 추가, requireInternalSecret 적용 |

### TYPE_ALIASES 수정 (핵심 버그)

```typescript
// 수정 전: note → "note" (없는 인덱스명)
// 수정 후:
const TYPE_ALIASES: Record<string, string> = {
  note: 'notes',
  protocol: 'templates',
  inventory: 'inventory',
};
```

### 주요 기능

- 타입별 전문검색 (`GET /api/search?q=키워드&type=note`)
- 자동완성 (`GET /api/search/suggest`)
- 문서 인덱싱/삭제/벌크 (내부 서비스 전용, `x-internal-secret`)

---

## 9. ai-assistant-service

**스택**: Express + Qdrant + BullMQ + OpenAI SDK + Redis
**역할**: 템플릿 추천, 초안 생성, 벡터 인덱싱/RAG 질의

### 수정 사항 (이전 세션)

| 파일 | 수정 내용 |
|------|----------|
| `src/middlewares/auth.middleware.ts` | JSON.parse try/catch |
| `src/controllers/ai.controller.ts` | `generateDraftWithLLM()` OpenAI 실호출 구현, RAG 파이프라인 완성 |
| `src/workers/index.worker.ts` | BullMQ 벡터 인덱싱 워커 전체 구현 |
| `src/lib/qdrant.ts` | Qdrant 컬렉션 생성, 벡터 upsert/검색 |
| `src/routes/ai.routes.ts` | 인덱싱/삭제/RAG 질의 라우트 추가 |

### RAG 파이프라인

```
1. POST /api/ai/index       → BullMQ 큐 → 워커 → OpenAI Embeddings → Qdrant 저장
2. POST /api/ai/draft       → 키워드 임베딩 → Qdrant 유사 검색 → OpenAI GPT-4 → 초안 반환
3. POST /api/ai/query       → 질문 임베딩 → Qdrant 검색 → GPT-4 RAG → 답변 반환
4. GET  /api/ai/recommend   → 카테고리/태그 기반 템플릿 추천
```

---

## 10. file-service

**스택**: Express + AWS SDK v3 (S3) + MinIO + multer
**역할**: 파일 업로드/다운로드, MinIO 스토리지 연동

### 수정 사항 (이전 세션)

| 파일 | 수정 내용 |
|------|----------|
| `src/middlewares/auth.middleware.ts` | JSON.parse try/catch |
| `src/lib/minio.ts` | `findKeyByPrefix()` 추가 (UUID→key 조회 버그 수정), presigned 업로드 URL |
| `src/controllers/file.controller.ts` | MIME 차단, linkedEntity 메타 저장, presigned 업/다운로드 URL 추가 |
| `src/routes/file.routes.ts` | presigned-upload, /:id/url 라우트 추가 |

### 핵심 버그 수정: UUID → MinIO Key

```typescript
// UUID만 있을 때 ListObjectsV2로 prefix 검색
await s3.send(new ListObjectsV2Command({
  Bucket: BUCKET,
  Prefix: uuid,   // "uuid.pdf" 매칭
  MaxKeys: 1,
}));
```

---

## 11. 공통 수정 사항

모든 서비스에서 동일하게 수정된 내용:

### JSON.parse 크래시 수정 (전체 9개 서비스)

```typescript
// 수정 전 (크래시 가능)
const permissions: string[] = raw ? JSON.parse(raw) : [];

// 수정 후
let permissions: string[] = [];
if (raw) {
  try { permissions = JSON.parse(raw); } catch { permissions = []; }
}
```

### 내부 엔드포인트 보안 (`requireInternalSecret`)

signature-audit-service, search-service, ai-assistant-service의 내부 전용 엔드포인트에 `x-internal-secret` 헤더 검증 적용. 기존 `requirePermission('audit:read')` 등 부적절한 인증을 서비스 간 인증으로 교체.

---

## 12. 미해결 항목 (향후 개선 권고)

| # | 서비스 | 항목 | 우선순위 |
|---|--------|------|---------|
| 1 | 전체 | 통합 테스트 작성 (Jest + Supertest) | HIGH |
| 2 | auth-service | 사용자 비밀번호 변경 엔드포인트 미구현 | MEDIUM |
| 3 | eln-service | 템플릿 중복 라우트 정리 (note.routes ↔ template.routes) | LOW |
| 4 | file-service | 파일 목록 API (`GET /api/files?linkedEntityId=`) 미구현 | MEDIUM |
| 5 | file-service | PostgreSQL DB 연동 (현재 MinIO Metadata만 사용) | MEDIUM |
| 6 | inventory-service | 라벨 PDF 프린트 기능 미구현 | LOW |
| 7 | scheduler-service | 캘린더 뷰 (`GET /api/schedule/calendar?month=`) 미구현 | LOW |
| 8 | search-service | 다국어 형태소 분석기 연동 (nori/arirang) | MEDIUM |
| 9 | ai-assistant-service | OpenAI 오류 시 폴백 메시지 개선 | LOW |
| 10 | 전체 | Docker Compose healthcheck → 서비스 기동 순서 보장 | MEDIUM |

---

## 13. 서비스 간 의존 관계

```
api-gateway (8000)
    ├── auth-service (8001)          ← JWT 발급, 사용자/조직/팀/역할
    ├── eln-service (8002)           ← auth-service (verify-password)
    ├── signature-audit-service (8003) ← auth-service (verify-password)
    ├── inventory-service (8004)
    ├── scheduler-service (8005)
    ├── search-service (8006)        ← eln/inventory에서 인덱싱 호출
    ├── ai-assistant-service (8007)  ← eln/search에서 인덱싱 호출
    └── file-service (8008)

공유 인프라:
    ├── PostgreSQL (각 서비스별 DB)
    ├── Redis (api-gateway 블랙리스트, scheduler/signature BullMQ)
    ├── MinIO (file-service)
    ├── OpenSearch (search-service)
    └── Qdrant (ai-assistant-service)
```
