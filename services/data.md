# LabNote ELN — 데이터 & 흐름 분석서

## 목차

1. [데이터 모델 (서비스별 스키마)](#1-데이터-모델)
2. [서비스 간 통신 맵](#2-서비스-간-통신-맵)
3. [이벤트 흐름 (Redis Stream / Pub·Sub / BullMQ)](#3-이벤트-흐름)
4. [API 엔드포인트 전체 맵](#4-api-엔드포인트-전체-맵)
5. [핵심 비즈니스 흐름](#5-핵심-비즈니스-흐름)
6. [데이터 참조 관계 (Cross-Service)](#6-데이터-참조-관계)

---

## 1. 데이터 모델

하나의 PostgreSQL 인스턴스, 서비스별 Prisma 스키마 분리. 모든 주요 테이블에 `orgId`(멀티테넌시) 필드 존재.

### 1.1 auth-service

```
Organization ─┬─ 1:N ─ User
               ├─ 1:N ─ Team
               └─ 1:N ─ Role

Role ── 1:N ── User
Team ── M:N ── User (via TeamMember)
```

| 모델 | 주요 필드 | 비고 |
|------|-----------|------|
| **Organization** | id, name, slug(unique), createdAt | 조직(테넌트) 단위 |
| **Role** | id, orgId, name(enum: admin/researcher/reviewer/viewer), permissions[] | 역할별 권한 배열 |
| **User** | id, orgId, email(unique), name, passwordHash, roleId?, status(active/inactive/suspended) | 사용자 |
| **Team** | id, orgId, name | 팀 |
| **TeamMember** | userId+teamId(복합PK), teamRole(leader/member), joinedAt | 팀-사용자 연결 |

### 1.2 eln-service

```
Note ─┬─ 1:N ─ NoteRevision     (버전 이력)
      ├─ 1:N ─ NoteLink          (외부 연결: inventory, equipment, template, note)
      ├─ 1:N ─ Attachment         (파일 첨부)
      └─ 1:N ─ NoteStatusHistory  (상태 변경 이력)

Template (독립 — Note와 templateId로 느슨한 연결)
Code     (독립 — 참조 데이터: 템플릿 카테고리 등)
```

| 모델 | 주요 필드 | 비고 |
|------|-----------|------|
| **Note** | id, type(note/template), title, content, sections(JSON), status(draft/in_progress/locked/signed), authorId, orgId, teamId?, templateId?, tags[], deletedAt? | 소프트 삭제 지원 |
| **NoteRevision** | id, noteId, revision(Int), content, sections, changedBy, changeSummary | 수정할 때마다 리비전 생성 |
| **NoteLink** | id, noteId, targetType, targetId, label?, createdBy | 노트↔인벤토리/장비/템플릿/노트 연결 |
| **Attachment** | id, noteId, fileId, fileName, mimeType?, sizeBytes?, uploadedBy | file-service의 File과 fileId로 연결 |
| **NoteStatusHistory** | id, noteId, fromStatus, toStatus, changedBy, reason?, isAdminAction | 모든 상태 전환 기록 |
| **Template** | id, title, description, content, category, sections(JSON), tags[], createdBy, orgId, isPublic, useCount, copyCount, copiedFromId? | 노트 생성 시 useCount++, 복사 시 copyCount++ |
| **Code** | id, group, value, label?, sortOrder, isActive, orgId | 참조 코드(TEMPLATE_CATEGORY 등), orgId+group+value unique |

### 1.3 signature-audit-service

```
Signature    (독립 — noteId로 eln-service Note 참조)
AuditLog     (독립 — 범용 감사 로그)
ExportJob    (독립 — PDF/ZIP 내보내기 작업)
Notification (독립 — 사용자별 알림)
```

| 모델 | 주요 필드 | 비고 |
|------|-----------|------|
| **Signature** | id, noteId, signerId, orgId, signatureHash, prevHash?, chainIndex, timestamp, status(valid/revoked) | SHA-256 해시체인. noteId+chainIndex unique |
| **AuditLog** | id, entityType, entityId, action, actorId, orgId, details(JSON), ipAddress?, createdAt | 모든 서비스가 HTTP로 기록 요청 |
| **ExportJob** | id, noteId, noteIds[], format(pdf/zip/report), status(pending/processing/completed/failed), requestedBy, orgId, fileUrl?, fileId?, errorMsg? | BullMQ 비동기 처리 |
| **Notification** | id, recipientId, orgId, type(NOTE_LOCKED/NOTE_SIGNED/NOTE_UNLOCKED/BOOKING_APPROVED), entityType, entityId, title, message, actorId, actorName, isRead | Redis Pub/Sub로 실시간 전달 |

### 1.4 inventory-service

```
InventoryItem ── 1:N ── InventoryHistory (수량/상태 변경 이력)
Category      (독립 — orgId+name unique)
```

| 모델 | 주요 필드 | 비고 |
|------|-----------|------|
| **InventoryItem** | id, name, orgId, type, status(available/in_use/depleted/expired/disposed/maintenance), category?, location?, barcode?(unique), quantity?, unit?, minQuantity?, expiryDate?, expiryWarningDays, metadata(JSON), tags[] | 시약/샘플/장비 통합 |
| **InventoryHistory** | id, itemId, changeType(in/out/adjust/status_change), quantityBefore/After/Delta?, statusBefore/After?, reason?, performedBy | 모든 변경 추적 |
| **Category** | id, name, orgId | orgId+name unique |

### 1.5 scheduler-service

```
Resource ── 1:N ── Booking
```

| 모델 | 주요 필드 | 비고 |
|------|-----------|------|
| **Resource** | id, name, orgId, type(EQUIPMENT/ROOM), location?, description?, capacity?, ownerId?, isActive | ownerId = 승인 담당자 |
| **Booking** | id, resourceId, orgId, userId, title, description?, startAt, endAt, status(PENDING/APPROVED/REJECTED/CANCELLED/COMPLETED), approvedBy?, rejectedReason? | 시간 충돌 검증 포함 |

### 1.6 search-service

| 모델 | 주요 필드 | 비고 |
|------|-----------|------|
| **SearchHistory** | id, userId, orgId, query, createdAt | 검색 이력 |
| **Favorite** | id, userId, orgId, docType(notes/templates/inventory), docId, title | 문서 즐겨찾기. userId+docType+docId unique |
| **SearchKeywordFavorite** | id, userId, orgId, keyword | 검색어 즐겨찾기. userId+keyword unique |

+ **OpenSearch 인덱스**: `labnote_notes` — domainType(NOTE/PROTOCOL/TEMPLATE/INVENTORY) 구분, 한국어 nori 분석기 적용

### 1.7 file-service

```
File ── 1:1 ── ExportJob (resultFileId)
```

| 모델 | 주요 필드 | 비고 |
|------|-----------|------|
| **File** | id, bucket, objectKey(unique), originalName, mimeType?, sizeBytes?, checksumSha256?, uploaderId, orgId, refType?, refId?, isDeleted | MinIO 오브젝트 메타데이터 |
| **ExportJob** | id, type, status(PENDING/PROCESSING/COMPLETED/FAILED), requestedBy, orgId, params(JSON), resultFileId?, retryCount, expiresAt? | file-service 자체 내보내기 관리 |

---

## 2. 서비스 간 통신 맵

### 2.1 동기 HTTP 호출

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        api-gateway (:8000)                              │
│  JWT 검증 → 헤더 주입 → 프록시 / 대시보드 집계 / SSE                       │
└──┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┬────┘
   │          │          │          │          │          │          │
   ▼          ▼          ▼          ▼          ▼          ▼          ▼
 auth       eln     sig-audit   inventory  scheduler  search     file
 :8001     :8002      :8003      :8004      :8005     :8006     :8008
```

#### 내부 서비스 간 직접 호출 (x-internal-secret 인증)

| 호출자 | 대상 | 엔드포인트 | 용도 |
|--------|------|-----------|------|
| **sig-audit** → auth | POST `/api/auth/internal/verify-password` | 서명 전 비밀번호 검증 |
| **sig-audit** → eln | GET `/api/notes/:id` | 서명 시 노트 내용 조회 (해시 계산) |
| **sig-audit** → eln | PATCH `/api/notes/:id/status` | Redis 실패 시 HTTP 폴백 (signed 전환) |
| **sig-audit** → file | POST `/api/exports/internal/upload` | PDF/ZIP 결과물 MinIO 업로드 |
| **sig-audit** → file | GET `/api/exports/internal/presigned/:fileId` | 다운로드 URL 재발급 |
| **eln** → auth | POST `/api/auth/internal/verify-password` | 관리자 잠금 해제 시 비밀번호 확인 |
| **eln** → sig-audit | POST `/api/audit/internal` | 감사 로그 기록 |
| **eln** → sig-audit | POST `/api/notifications/internal` | 잠금/해제 알림 발송 |
| **eln** → search | POST `/api/search/index` | 노트/템플릿 검색 인덱스 갱신 |
| **eln** → search | DELETE `/api/search/index/:id` | 인덱스 삭제 |
| **auth** → sig-audit | POST `/api/audit/internal` | 로그인/사용자 CRUD 감사 로그 |
| **inventory** → search | POST `/api/search/index` | 인벤토리 아이템 인덱스 갱신 |
| **scheduler** → sig-audit | POST `/api/notifications/internal` | 예약 승인 알림 |

#### 대시보드 집계 (api-gateway → 다수 서비스)

| 대시보드 | 호출 대상 |
|----------|-----------|
| `/api/dashboard/personal` | eln(stats, notes), scheduler(bookings), sig-audit(unread-count, audit) |
| `/api/dashboard/team/:id` | eln(stats, notes), scheduler(bookings) |
| `/api/dashboard/org` | eln(stats, notes), sig-audit(compliance, audit), inventory(items, alerts), scheduler(bookings) |

모두 `Promise.allSettled` 병렬 호출, Redis 캐시(TTL 120~300s).

### 2.2 Rate Limit (api-gateway)

| 프리픽스 | 제한 |
|----------|------|
| `/api/export` | 10 req/60s |
| `/api/search` | 60 req/60s |
| `/api/auth` | 20 req/60s |
| `/api/files` | 30 req/60s |
| 기본값 | 200 req/60s |

Redis sliding window 방식, 키: `rl:<prefix>:<userId>`

---

## 3. 이벤트 흐름

### 3.1 Redis Stream (비동기 이벤트)

```
signature-audit-service                    eln-service
       │                                       │
       │  XADD labnote:events                  │
       │  { type: NOTE_SIGNED,                 │
       │    noteId, status, userId }            │
       │ ─────────────────────────────────────► │
       │                                       │ XREADGROUP eln-service
       │                                       │ → note.status = 'signed'
       │                                       │ → NoteStatusHistory 생성
       │   [Redis 실패 시]                       │
       │   HTTP PATCH /api/notes/:id/status ──►│
```

- **스트림**: `labnote:events` (MAXLEN ~1000)
- **소비자 그룹**: `eln-service`, 컨슈머: `eln-<pid>`
- **배치**: 10건씩, 블록 5초
- **재시도**: XCLAIM (idle > 30s마다 복구), 5회 실패 시 ACK 후 드랍
- **멱등성**: 이미 `signed` 상태면 스킵

### 3.2 Redis Pub/Sub (실시간 알림)

| 채널 | 발행자 | 구독자 | 데이터 |
|------|--------|--------|--------|
| `export-status` | sig-audit (BullMQ worker) | api-gateway SSE `/api/events/exports` | `{ jobId, status, fileUrl, format, noteId, requestedBy }` |
| `notifications:{userId}` | sig-audit (notification.controller) | api-gateway SSE `/api/events/notifications` | `{ id, type, entityType, entityId, title, message, actorName }` |
| `labnote:collab` | collab-service | collab-service (다중 인스턴스 팬아웃) | `{ noteId, payload, sourceUserId }` |

### 3.3 BullMQ (백그라운드 작업 큐)

```
[클라이언트]
    │
    ▼  POST /api/export/pdf/:noteId  (또는 /zip, /report)
[sig-audit controller]
    │  exportQueue.add('pdf', payload)
    ▼
[Redis Queue: labnote-export]
    │
    ▼  (concurrency: 2, retry: 3, backoff: 5s exponential)
[export.worker.ts]
    ├─ GET eln-service → 노트 내용 조회
    ├─ Puppeteer → PDF 렌더링
    ├─ POST file-service → MinIO 업로드
    ├─ DB ExportJob 상태 갱신
    └─ PUBLISH export-status → SSE로 클라이언트 전달
```

### 3.4 WebSocket (실시간 협업)

```
[브라우저] ──ws://.../collab/notes/:noteId?token=JWT──► [collab-service :8009]
                                                            │
                                                     ┌──────┴──────┐
                                                     │  Room Map   │
                                                     │  (in-memory)│
                                                     └──────┬──────┘
                                                            │
                                                     Redis Pub/Sub
                                                     labnote:collab
                                                     (다중 인스턴스 동기화)
```

**메시지 타입:**

| 방향 | 타입 | 데이터 |
|------|------|--------|
| Server → Client | `joined` | 현재 방 사용자 목록 |
| Server → Clients | `user-joined` | 새 사용자 정보 |
| Client → Server | `content-update` | `{ content }` |
| Server → Clients | `content-update` | `{ userId, userName, colorIdx, content }` |
| Client → Server | `awareness` | `{ cursorLine }` |
| Server → Clients | `awareness` | `{ userId, userName, colorIdx, cursorLine }` |
| Server → Clients | `user-left` | `{ userId, userName }` |

---

## 4. API 엔드포인트 전체 맵

### 4.1 api-gateway (:8000) — 직접 처리

| Method | Path | 인증 | 설명 |
|--------|------|------|------|
| POST | `/api/auth/session` | Public | refreshToken → httpOnly 쿠키 설정 |
| POST | `/api/auth/session/refresh` | Cookie | 토큰 갱신 |
| DELETE | `/api/auth/session` | — | 쿠키 삭제 |
| GET | `/api/dashboard/personal` | JWT | 개인 대시보드 |
| GET | `/api/dashboard/team/:teamId` | JWT | 팀 대시보드 |
| GET | `/api/dashboard/org` | JWT | 조직 대시보드 |
| GET | `/api/events/exports` | x-user-id | SSE: 내보내기 상태 |
| GET | `/api/events/notifications` | x-user-id | SSE: 실시간 알림 |

### 4.2 auth-service (:8001)

| Method | Path | 권한 | 설명 |
|--------|------|------|------|
| POST | `/api/auth/login` | Public | 로그인 → JWT + refreshToken 발급 |
| POST | `/api/auth/register` | Public | 회원가입 |
| POST | `/api/auth/refresh` | — | 토큰 갱신 |
| POST | `/api/auth/logout` | JWT | 로그아웃 (토큰 블랙리스트) |
| GET | `/api/auth/me` | JWT | 내 정보 |
| POST | `/api/auth/internal/verify-password` | x-internal-secret | 비밀번호 검증 (내부 전용) |
| GET | `/api/auth/internal/role-permissions` | x-internal-secret | 역할-권한 맵 (내부 전용) |
| CRUD | `/api/auth/orgs` | ADMIN | 조직 관리 |
| CRUD | `/api/auth/teams` | ADMIN | 팀 관리 |
| CRUD | `/api/auth/teams/:id/members` | ADMIN | 팀원 관리 |
| CRUD | `/api/auth/users` | ADMIN | 사용자 관리 |
| CRUD | `/api/auth/roles` | ADMIN | 역할/권한 관리 |

**JWT payload**: `{ sub: userId, email, role, permissions[], orgId, teams: [{ id, role }] }`

### 4.3 eln-service (:8002)

| Method | Path | 권한 | 설명 |
|--------|------|------|------|
| GET | `/api/notes` | NOTE_READ | 노트 목록 (필터: status, tag, search, type, authorId, teamId) |
| POST | `/api/notes` | NOTE_WRITE | 노트 생성 |
| GET | `/api/notes/stats` | NOTE_READ | 상태별 통계 |
| POST | `/api/notes/batch` | NOTE_READ | 일괄 조회 (max 500) |
| GET | `/api/notes/:id` | NOTE_READ | 노트 상세 (attachments, links 포함) |
| PUT | `/api/notes/:id` | NOTE_WRITE | 노트 수정 (locked/signed 차단, 소유자/관리자만) |
| DELETE | `/api/notes/:id` | NOTE_DELETE | 소프트 삭제 (locked/signed 차단) |
| PATCH | `/api/notes/:id/status` | NOTE_STATUS | 상태 전환 |
| POST | `/api/notes/:id/admin-unlock` | ADMIN + NOTE_UNLOCK | locked → draft (비밀번호 필요) |
| GET | `/api/notes/:id/revisions` | NOTE_READ | 리비전 목록 |
| CRUD | `/api/notes/:id/attachments` | FILE_READ/UPLOAD/DELETE | 첨부파일 관리 |
| CRUD | `/api/notes/:id/links` | NOTE_READ/WRITE | 외부 링크 관리 |
| GET | `/api/tags` | NOTE_READ | 태그 목록 |
| CRUD | `/api/templates` | TEMPLATE_READ/WRITE | 템플릿 CRUD |
| POST | `/api/templates/recommend` | TEMPLATE_READ | 추천 템플릿 (useCount 기준 top-5) |
| POST | `/api/templates/:id/copy` | TEMPLATE_WRITE | 템플릿 복사 |
| CRUD | `/api/codes` | JWT / ADMIN | 참조 코드 관리 |

### 4.4 signature-audit-service (:8003)

| Method | Path | 권한 | 설명 |
|--------|------|------|------|
| POST | `/api/signatures/sign/:noteId` | NOTE_SIGN | 전자서명 (비밀번호 검증 → 해시체인 → NOTE_SIGNED 이벤트) |
| GET | `/api/signatures/verify/:noteId` | NOTE_READ | 서명 검증 (해시체인 무결성) |
| POST | `/api/signatures/revoke/:signatureId` | ADMIN | 서명 철회 |
| GET | `/api/signatures/:noteId` | NOTE_READ | 노트의 서명 목록 |
| GET | `/api/signatures/compliance/stats` | NOTE_READ | 규정 준수 통계 |
| GET | `/api/signatures/compliance/list` | NOTE_READ | 규정 준수 목록 |
| GET | `/api/signatures/editable/:noteId` | NOTE_READ | 편집 가능 여부 확인 |
| POST | `/api/audit/internal` | x-internal-secret | 감사 로그 기록 (내부 전용) |
| GET | `/api/audit` | AUDIT_READ | 감사 로그 조회 |
| GET | `/api/audit/actions` | AUDIT_READ | 액션 유형 목록 |
| POST | `/api/export/pdf/:noteId` | EXPORT_PDF | PDF 내보내기 (비동기) |
| POST | `/api/export/zip` | EXPORT_PDF | ZIP 내보내기 (비동기) |
| POST | `/api/export/report` | EXPORT_PDF | 보고서 내보내기 (비동기) |
| GET | `/api/export/status/:jobId` | EXPORT_PDF | 내보내기 상태 확인 |
| GET | `/api/export/list` | EXPORT_PDF | 내보내기 작업 목록 |
| POST | `/api/notifications/internal` | x-internal-secret | 알림 생성 (내부 전용) |
| GET | `/api/notifications` | JWT | 알림 목록 |
| GET | `/api/notifications/unread-count` | JWT | 읽지 않은 알림 수 |
| PATCH | `/api/notifications/:id/read` | JWT | 읽음 처리 |
| PATCH | `/api/notifications/read-all` | JWT | 전체 읽음 처리 |

### 4.5 inventory-service (:8004)

| Method | Path | 권한 | 설명 |
|--------|------|------|------|
| GET | `/api/inventory/items` | INVENTORY_READ | 아이템 목록 (필터: type, status, category, tag, barcode) |
| POST | `/api/inventory/items` | INVENTORY_WRITE | 아이템 생성 |
| GET | `/api/inventory/items/:id` | INVENTORY_READ | 아이템 상세 |
| GET | `/api/inventory/items/barcode/:barcode` | INVENTORY_READ | 바코드 조회 |
| PUT | `/api/inventory/items/:id` | INVENTORY_WRITE | 아이템 수정 (소유자/관리자) |
| DELETE | `/api/inventory/items/:id` | INVENTORY_DELETE | 아이템 삭제 (소유자/관리자) |
| POST | `/api/inventory/items/:id/quantity` | INVENTORY_WRITE | 수량 조정 (in/out/adjust) |
| GET | `/api/inventory/items/:id/history` | INVENTORY_READ | 변경 이력 |
| GET | `/api/inventory/alerts/expiring` | INVENTORY_READ | 만료 임박 아이템 |
| GET | `/api/inventory/alerts/low-stock` | INVENTORY_READ | 재고 부족 아이템 |
| CRUD | `/api/inventory/categories` | INVENTORY_READ / ADMIN | 카테고리 관리 |

### 4.6 scheduler-service (:8005)

| Method | Path | 권한 | 설명 |
|--------|------|------|------|
| GET | `/api/scheduler/resources` | SCHEDULER_READ | 자원 목록 |
| POST | `/api/scheduler/resources` | ADMIN | 자원 등록 |
| PUT | `/api/scheduler/resources/:id` | ADMIN | 자원 수정 |
| DELETE | `/api/scheduler/resources/:id` | ADMIN | 자원 비활성화 (예약 있으면 차단) |
| GET | `/api/scheduler/bookings` | SCHEDULER_READ | 예약 목록 |
| GET | `/api/scheduler/calendar` | SCHEDULER_READ | 캘린더 뷰 (from/to 필수) |
| POST | `/api/scheduler/bookings` | SCHEDULER_WRITE | 예약 생성 (충돌 검증) |
| PUT | `/api/scheduler/bookings/:id` | SCHEDULER_WRITE | 예약 수정 (PENDING만, 소유자/관리자) |
| POST | `/api/scheduler/bookings/:id/approve` | Admin or ownerId | 승인 (비관적 락 + 재충돌 검증) |
| POST | `/api/scheduler/bookings/:id/reject` | Admin or ownerId | 반려 |
| POST | `/api/scheduler/bookings/:id/cancel` | SCHEDULER_WRITE | 취소 |
| POST | `/api/scheduler/bookings/:id/complete` | SCHEDULER_WRITE | 완료 |

**예약 상태 머신**: `PENDING → APPROVED|REJECTED`, `APPROVED → CANCELLED|COMPLETED`, `PENDING → CANCELLED`

### 4.7 search-service (:8006)

| Method | Path | 권한 | 설명 |
|--------|------|------|------|
| GET | `/api/search` | NOTE_READ | 통합 검색 (OpenSearch, 한국어 nori) |
| GET | `/api/search/suggest` | NOTE_READ | 자동완성 |
| CRUD | `/api/search/history` | JWT | 검색 이력 관리 |
| CRUD | `/api/search/favorites` | JWT | 문서 즐겨찾기 |
| CRUD | `/api/search/keyword-favorites` | JWT | 검색어 즐겨찾기 |
| POST | `/api/search/index` | x-internal-secret | 인덱스 갱신 (내부 전용) |
| POST | `/api/search/index/bulk` | x-internal-secret | 일괄 인덱스 (내부 전용) |
| DELETE | `/api/search/index/:id` | x-internal-secret | 인덱스 삭제 (내부 전용) |

### 4.8 file-service (:8008)

| Method | Path | 권한 | 설명 |
|--------|------|------|------|
| POST | `/api/files` | FILE_UPLOAD | 파일 업로드 (multipart) |
| GET | `/api/files/presigned-upload` | FILE_UPLOAD | Presigned PUT URL 발급 |
| GET | `/api/files/:id` | FILE_READ | 파일 다운로드 |
| GET | `/api/files/:id/url` | FILE_READ | Presigned GET URL |
| GET | `/api/files/:id/stream` | FILE_READ | 스트림 다운로드 |
| GET | `/api/files/:id/meta` | FILE_READ | 파일 메타데이터 |
| DELETE | `/api/files/:id` | FILE_DELETE | 소프트 삭제 + MinIO 삭제 |
| POST | `/api/exports/internal/upload` | x-internal-secret | 내보내기 결과 업로드 (내부 전용) |
| GET | `/api/exports/internal/presigned/:fileId` | x-internal-secret | Presigned URL (내부 전용) |
| CRUD | `/api/exports` | JWT | 내보내기 작업 관리 |

**차단 MIME 타입**: `x-msdownload`, `x-executable`, `x-sh`, `text/x-sh`, `x-bat`

---

## 5. 핵심 비즈니스 흐름

### 5.1 노트 생명주기

```
[사용자]                        [eln-service]           [search-service]     [sig-audit]
   │                                │                        │                   │
   │  POST /api/notes               │                        │                   │
   │ ──────────────────────────────► │                        │                   │
   │                                │  POST /api/search/index│                   │
   │                                │ ──────────────────────► │                   │
   │                                │  POST /api/audit/internal                  │
   │                                │ ─────────────────────────────────────────► │
   │  ◄──────── Note (draft) ────── │                        │                   │
   │                                │                        │                   │
   │  PUT /api/notes/:id            │  (수정 시마다)            │                   │
   │ ──────────────────────────────► │  NoteRevision 생성      │                   │
   │                                │  search index 갱신      │                   │
   │                                │  audit log 기록         │                   │
   │                                │                        │                   │
   │  PATCH /api/notes/:id/status   │                        │                   │
   │  { status: 'in_progress' }     │                        │                   │
   │ ──────────────────────────────► │                        │                   │
   │                                │  NoteStatusHistory 생성  │                   │
```

### 5.2 전자서명 흐름

```
[Reviewer/Admin]          [sig-audit]           [auth]          [eln]
      │                       │                    │               │
      │ POST /sign/:noteId    │                    │               │
      │ { password }          │                    │               │
      │ ─────────────────────►│                    │               │
      │                       │ verify-password    │               │
      │                       │ ──────────────────►│               │
      │                       │ ◄── { verified } ──│               │
      │                       │                    │               │
      │                       │ GET /notes/:noteId │               │
      │                       │ ───────────────────────────────── ►│
      │                       │ ◄── Note content ──────────────── │
      │                       │                    │               │
      │                       │ SHA-256 해시 계산    │               │
      │                       │ Signature 저장      │               │
      │                       │ (prevHash 체이닝)    │               │
      │                       │                    │               │
      │                       │ XADD labnote:events (NOTE_SIGNED) │
      │                       │ ───────────────────────────────── ►│
      │                       │                    │               │ XREADGROUP
      │                       │                    │               │ note.status = signed
      │                       │                    │               │ NoteStatusHistory 생성
      │ ◄── Signature ────── │                    │               │
```

### 5.3 관리자 잠금 해제 흐름

```
[Admin]                  [eln]                  [auth]           [sig-audit]
   │                       │                      │                   │
   │ POST /admin-unlock    │                      │                   │
   │ { adminPassword }     │                      │                   │
   │ ─────────────────────►│                      │                   │
   │                       │ verify-password       │                   │
   │                       │ ────────────────────►│                   │
   │                       │ ◄── { verified } ────│                   │
   │                       │                      │                   │
   │                       │ note.status = draft   │                   │
   │                       │ NoteStatusHistory     │                   │
   │                       │                      │                   │
   │                       │ audit log + notification                 │
   │                       │ ────────────────────────────────────────►│
   │ ◄── Updated Note ─── │                      │                   │
```

### 5.4 PDF 내보내기 흐름

```
[사용자]        [sig-audit]      [BullMQ Worker]    [eln]       [file-svc]    [api-gw SSE]
   │                │                 │               │             │              │
   │ POST /export/  │                 │               │             │              │
   │ pdf/:noteId    │                 │               │             │              │
   │ ──────────────►│                 │               │             │              │
   │ ◄── { jobId }  │                 │               │             │              │
   │                │ queue.add(pdf)  │               │             │              │
   │                │ ───────────────►│               │             │              │
   │                │                 │ GET /notes/:id│             │              │
   │                │                 │ ─────────────►│             │              │
   │                │                 │ ◄── content ──│             │              │
   │                │                 │               │             │              │
   │                │                 │ Puppeteer PDF  │             │              │
   │                │                 │               │             │              │
   │                │                 │ POST /internal/upload       │              │
   │                │                 │ ───────────────────────────►│              │
   │                │                 │               │             │              │
   │                │                 │ PUBLISH export-status       │              │
   │                │                 │ ────────────────────────────────────────── ►│
   │                │                 │               │             │              │
   │ ◄── SSE: export-status (completed, downloadUrl) ─────────────────────────── │
```

### 5.5 예약 승인 흐름

```
[사용자]           [scheduler]          [sig-audit]        [api-gw SSE]
   │                    │                    │                   │
   │ POST /bookings     │                    │                   │
   │ ──────────────────►│                    │                   │
   │ ◄── PENDING ────── │                    │                   │
   │                    │                    │                   │
[Admin/Owner]           │                    │                   │
   │ POST /approve      │                    │                   │
   │ ──────────────────►│                    │                   │
   │                    │ DB FOR UPDATE LOCK  │                   │
   │                    │ 충돌 재검증           │                   │
   │                    │ status = APPROVED   │                   │
   │                    │                    │                   │
   │                    │ POST /notifications/internal            │
   │                    │ ──────────────────►│                   │
   │                    │                    │ PUBLISH            │
   │                    │                    │ notifications:uid  │
   │                    │                    │ ─────────────────►│
   │ ◄── APPROVED ───── │                    │                   │
   │                    │                    │                   │
[예약자] ◄── SSE: notification (BOOKING_APPROVED) ──────────── │
```

### 5.6 실시간 협업 흐름

```
[사용자A]                [collab-service]              [사용자B]
   │                          │                           │
   │ ws://collab/notes/:id    │                           │
   │ ────────────────────────►│                           │
   │ ◄── { type: joined }    │                           │
   │                          │   ws://collab/notes/:id   │
   │                          │◄──────────────────────── │
   │ ◄── { user-joined, B }  │── { joined, [A] } ──────►│
   │                          │                           │
   │ content-update ─────────►│── content-update ────────►│
   │                          │ PUBLISH labnote:collab    │
   │                          │ (다중 인스턴스 팬아웃)       │
   │                          │                           │
   │ awareness ──────────────►│── awareness ─────────────►│
   │                          │                           │
   │          [disconnect]    │                           │
   │ ─── close ──────────────►│── { user-left, A } ─────►│
```

---

## 6. 데이터 참조 관계

### 6.1 Cross-Service ID 참조

```
auth-service                eln-service              signature-audit-service
┌──────────┐               ┌──────────┐              ┌──────────────┐
│  User.id │◄──────────────│Note.authorId │          │Signature.signerId │
│          │◄──────────────│NoteRevision.changedBy│   │AuditLog.actorId   │
│          │◄──────────────│Attachment.uploadedBy│    │Notification.recipientId│
│          │               │NoteLink.createdBy   │   │ExportJob.requestedBy│
│          │               └──────────┘              └──────────────┘
│          │                    │                          │
│          │               Note.id ─────────────► Signature.noteId
│          │                    │                   AuditLog.entityId
│          │                    │                   ExportJob.noteId
│          │                    │
│ Org.id   │──► 모든 서비스의 orgId 필드
└──────────┘

file-service                inventory-service         scheduler-service
┌──────────┐               ┌──────────────┐          ┌──────────┐
│  File.id │◄──────────────│              │          │          │
│          │  Attachment.   │InventoryItem │          │ Booking  │
│          │  fileId        │    .id       │          │  .userId │──► User.id
└──────────┘               └──────┬───────┘          │  .resourceId│──► Resource.id
                                  │                   └──────────┘
                           NoteLink.targetId
                           (targetType='inventory')
```

### 6.2 데이터 흐름 요약

| 원본 데이터 | 생성 서비스 | 참조하는 서비스 | 참조 방식 |
|-------------|------------|----------------|-----------|
| User (id, orgId) | auth | 전 서비스 | JWT → x-user-id/x-user-org-id 헤더 |
| User password | auth | eln, sig-audit | HTTP 내부 호출 (verify-password) |
| Note (id, content, status) | eln | sig-audit, search, file | HTTP 내부 호출 / Redis Stream |
| Signature | sig-audit | eln | Redis Stream NOTE_SIGNED |
| AuditLog | sig-audit | auth, eln, scheduler | HTTP 내부 호출 (fire-and-forget) |
| Notification | sig-audit | eln, scheduler | HTTP 내부 호출 → Redis Pub/Sub → SSE |
| File (id, objectKey) | file | eln(Attachment), sig-audit(ExportJob) | fileId 참조 |
| InventoryItem (id) | inventory | eln(NoteLink) | targetType='inventory', targetId |
| SearchIndex | search | eln, inventory | HTTP 내부 호출 (index/delete) |
| Booking | scheduler | sig-audit(Notification) | 승인 시 알림 |

### 6.3 Redis 키 패턴 요약

| 키 패턴 | 서비스 | TTL | 용도 |
|---------|--------|-----|------|
| `blacklist:{token}` | auth | JWT 남은 만료시간 | 로그아웃 토큰 무효화 |
| `blacklist:user:{userId}` | auth | JWT 남은 만료시간 | 사용자 전체 토큰 무효화 |
| `refresh:{userId}:{jti}` | auth | refreshToken TTL | 리프레시 토큰 추적 |
| `rl:<prefix>:<userId>` | api-gateway | 60s | Rate limit 슬라이딩 윈도우 |
| `cache:dashboard:*` | api-gateway | 120~300s | 대시보드 캐시 |
| `unread-count:{orgId}:{userId}` | sig-audit | 300s | 미읽은 알림 수 캐시 |
| `labnote:events` (Stream) | sig-audit → eln | — | NOTE_SIGNED 이벤트 |
| `labnote-export` (BullMQ) | sig-audit | — | 내보내기 작업 큐 |
| `export-status` (Pub/Sub) | sig-audit → api-gw | — | 내보내기 상태 알림 |
| `notifications:{userId}` (Pub/Sub) | sig-audit → api-gw | — | 실시간 알림 |
| `labnote:collab` (Pub/Sub) | collab | — | 협업 편집 팬아웃 |
