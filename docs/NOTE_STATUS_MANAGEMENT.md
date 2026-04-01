# ELN 플랫폼 — 노트 상태 관리 기능 정합성 문서

> **작성일**: 2026-03-03
> **최종 수정일**: 2026-03-20
> **버전**: 1.2.0
> **범위**: 프론트엔드 ↔ API 클라이언트 ↔ 백엔드(ELN + Signature) ↔ Redis Stream ↔ 데이터베이스

---

## 1. 개요

연구노트의 생명주기를 4단계 상태로 관리하며, 상태 전환 규칙과 관리자 잠금 해제 기능을 프론트엔드부터 데이터베이스까지 일관되게 구현합니다. 서명 전환은 서명 서비스(signature-audit-service)에서 Redis Stream 이벤트를 발행하고, ELN 서비스의 이벤트 컨슈머가 이를 소비하여 상태를 변경하는 이벤트 기반 아키텍처를 사용합니다.

## 2. 상태 정의

| 상태 코드 | 한글명 | 설명 |
|-----------|--------|------|
| `draft` | 초안 | 최초 생성 상태. 자유롭게 편집 가능 |
| `in_progress` | 진행 중 | 실험 수행 중. 편집 가능 |
| `signed` | 서명 완료 | 전자서명 완료. 상태 변경 불가 |
| `locked` | 잠김 | 편집 잠금. 관리자만 해제 가능 |

## 3. 상태 전환 규칙

```
┌─────────┐    ┌──────────────┐    ┌────────┐
│  draft  │◄──►│ in_progress  │───►│ locked │
│  (초안)  │    │   (진행 중)    │    │ (잠김)  │
└─────────┘    └──────┬───────┘    └────┬───┘
                      │                 │
                 서명 서비스            관리자 잠금 해제
               (Redis Stream          (POST /admin-unlock)
                이벤트 발행)                │
                      │            ┌────▼───┐
                 ┌────▼───┐       │ draft  │
                 │ signed │       │ (초안)  │
                 │(서명완료)│       └────────┘
                 └────────┘
```

### 허용 전환 매트릭스

| 현재 상태 → 변경 가능 상태 | Researcher | Reviewer | Admin | 서명 서비스 (system) |
|---------------------------|:-----------:|:--------:|:-----:|:-------------------:|
| draft → in_progress | ✅ | ✅ | ✅ | - |
| in_progress → draft | ✅ | ✅ | ✅ | - |
| in_progress → locked | ❌ | ✅ | ✅ | - |
| in_progress → signed | ❌ | ❌ | ❌ | ✅ (이벤트 기반) |
| locked → draft | ❌ | ❌ | ✅ (잠금 해제) | - |
| signed → (모든 상태) | ❌ | ❌ | ❌ | ❌ |

> **잠금(locked)**: Reviewer 또는 Admin만 수행 가능. 검토 완료 후 편집을 차단하는 행위이므로 작성자(Researcher)가 아닌 검토자가 수행합니다. 백엔드(`note.controller.ts`)에서 `x-user-role`이 `reviewer` 또는 `admin`이 아닌 경우 403을 반환합니다.
>
> **서명(signed)**: 서명 서비스(`POST /api/signatures/sign/:noteId`)를 통해서만 전환됩니다. 서명 서비스가 Redis Stream(`labnote:events`)에 `NOTE_SIGNED` 이벤트를 발행하고, ELN 서비스의 이벤트 컨슈머(`eventConsumer.ts`)가 이를 소비하여 `in_progress → signed` 전환을 수행합니다. Redis 장애 시 HTTP 폴백으로 `x-user-role: system` 헤더를 사용하여 `PATCH /api/notes/:id/status`를 직접 호출합니다. `note:sign` 권한은 Reviewer와 Admin만 보유합니다.
>
> **삭제**: locked, signed 상태의 노트는 삭제할 수 없습니다.

### 앱 레벨 전환 맵 (코드)

```typescript
// 일반 사용자 전환 (dtos/note.dto.ts)
export const ALLOWED_STATUS_TRANSITIONS: Record<NoteStatus, NoteStatus[]> = {
  draft:       ['in_progress'],
  in_progress: ['draft', 'locked'],
  signed:      [],
  locked:      [],
};

// 시스템 역할(서명 서비스 내부 호출) 전환
export const SYSTEM_STATUS_TRANSITIONS: Record<NoteStatus, NoteStatus[]> = {
  draft:       ['in_progress'],
  in_progress: ['draft', 'signed', 'locked'],
  signed:      [],
  locked:      [],
};
```

## 4. 계층별 구현 상세

### 4.1 프론트엔드 (React)

**관련 파일**:
- `src/pages/NotesPage.tsx` — 노트 목록, 상태 필터, 상태 변경 드롭다운, 관리자 잠금 해제 모달
- `src/pages/NoteEditor.tsx` — 노트 편집기, 상태 표시, 서명/진행 시작 버튼
- `src/pages/SignaturesPage.tsx` — 서명 현황 대시보드
- `src/pages/Dashboard.tsx` — 대시보드 상태별 통계

| 기능 | 구현 방식 |
|------|----------|
| 상태 표시 | `Badge` 컴포넌트 + 색상 토큰 (`statusColors`) |
| 상태 변경 | `DropdownMenu` → `handleStatusChange()` (NotesPage) |
| 서명 | `handleSign()` → `signNote()` API 호출 (NoteEditor) |
| 관리자 잠금 해제 | `Dialog` 모달 → 비밀번호 입력 → `handleAdminUnlock()` |
| 필터링 | 상태별 `Button` 필터 (전체/초안/진행 중/서명 완료/잠김) |
| 피드백 | `sonner` 토스트 알림 |
| 편집 잠금 | `isLocked = noteStatus === "signed" \|\| noteStatus === "locked"` |
| 삭제 가능 여부 | `isDeletable = status === "draft" \|\| status === "in_progress"` |

**상태 전환 맵** (프론트엔드 — 역할 기반):
```typescript
function getStatusTransitions(status: string, role: string): string[] {
  const isReviewerOrAdmin = role === "reviewer" || role === "admin";
  switch (status) {
    case "draft": return ["in_progress"];
    case "in_progress": return isReviewerOrAdmin ? ["draft", "locked"] : ["draft"];
    case "signed": return [];
    case "locked": return [];  // 관리자 해제는 별도 모달
    default: return [];
  }
}
```

> `in_progress → locked` 옵션은 Reviewer/Admin에게만 드롭다운에 노출됩니다. 관리자 잠금 해제 버튼도 `userRole === "admin"` 조건으로 Admin에게만 표시됩니다. 사용자 역할은 `getStoredUser()` (`src/lib/authToken.ts`)에서 가져옵니다.

### 4.2 API 클라이언트 (프론트엔드 → 백엔드)

**파일**: `src/api/notes.ts`, `src/api/signatures.ts`, `src/api/client.ts`

| 함수 | HTTP 메서드 | 경로 | 설명 |
|------|-----------|------|------|
| `changeNoteStatus()` | `PATCH` | `/api/notes/:id/status` | 일반 상태 전환 |
| `adminUnlockNote()` | `POST` | `/api/notes/:id/admin-unlock` | 관리자 잠금 해제 |
| `signNote()` | `POST` | `/api/signatures/sign/:noteId` | 전자서명 (서명 서비스) |
| `verifySignature()` | `GET` | `/api/signatures/verify/:noteId` | 서명 무결성 검증 |
| `listNotes()` | `GET` | `/api/notes?status=&tag=` | 노트 목록 (필터) |
| `createNote()` | `POST` | `/api/notes` | 노트 생성 (초안) |
| `updateNote()` | `PUT` | `/api/notes/:id` | 노트 수정 |
| `deleteNote()` | `DELETE` | `/api/notes/:id` | 노트 삭제 |

### 4.3 백엔드 (Fastify)

상태 관리 로직은 **두 서비스**에 걸쳐 구현되어 있습니다.

#### ELN 서비스 (`services/eln-service/`)

**파일 구조**:
```
services/eln-service/src/
├── controllers/note.controller.ts  ← 상태 변경/잠금 해제 핸들러
├── dtos/note.dto.ts               ← ChangeStatusDto, AdminUnlockDto, 전환 맵
├── routes/note.routes.ts          ← PATCH/POST 라우트 + 미들웨어
├── lib/eventConsumer.ts           ← Redis Stream 이벤트 소비 (NOTE_SIGNED)
└── openapi/eln.openapi.ts         ← OpenAPI 3.0 스펙
```

#### Signature-Audit 서비스 (`services/signature-audit-service/`)

**파일 구조**:
```
services/signature-audit-service/src/
├── controllers/signature.controller.ts  ← 서명 생성, 상태 변경 이벤트 발행
├── routes/signature.routes.ts           ← POST /sign, GET /verify 라우트
└── lib/queue.ts                         ← Redis Stream 이벤트 발행
```

#### 엔드포인트 상세

**① `PATCH /api/notes/:id/status` — 상태 변경** (ELN 서비스)

미들웨어: `requireAuth` → `requirePermission(Permission.NOTE_STATUS)` → `validate(ChangeStatusSchema)`

요청:
```json
{
  "status": "in_progress"
}
```

성공 응답 (200):
```json
{
  "ok": true,
  "data": { "id": "note-001", "status": "in_progress", "updatedAt": "..." },
  "message": "상태가 \"in_progress\"(으)로 변경되었습니다."
}
```

에러 응답 (400):
```json
{
  "ok": false,
  "error": "상태 전환 불가: \"locked\" → \"in_progress\". 허용: []"
}
```

검증 규칙:
- `x-user-role` 헤더로 일반/시스템 전환 맵 분기 (`system` → `SYSTEM_STATUS_TRANSITIONS`, 그 외 → `ALLOWED_STATUS_TRANSITIONS`)
- `locked` 전환 시 `x-user-role`이 `reviewer` 또는 `admin`이 아니면 → 403

**② `POST /api/notes/:id/admin-unlock` — 관리자 잠금 해제** (ELN 서비스)

미들웨어: `requireAuth` → `requireRole(RoleName.ADMIN)` → `requirePermission(Permission.NOTE_UNLOCK)` → `validate(AdminUnlockSchema)`

요청:
```json
{
  "adminPassword": "admin-secret",
  "reason": "실험 데이터 수정 필요"
}
```

성공 응답 (200):
```json
{
  "ok": true,
  "data": { "id": "note-001", "status": "draft", "updatedAt": "..." },
  "auditLog": {
    "action": "admin_unlock",
    "noteId": "note-001",
    "adminId": "user-admin-001",
    "reason": "실험 데이터 수정 필요",
    "timestamp": "..."
  },
  "message": "관리자 권한으로 노트 잠금이 해제되었습니다."
}
```

검증 규칙:
- 라우트 미들웨어에서 `requireRole(RoleName.ADMIN)` + `requirePermission(Permission.NOTE_UNLOCK)` 2단계 게이트
- `adminPassword`가 비어있으면 → 400 (Zod 스키마 검증)
- 비밀번호 검증은 auth-service의 `POST /api/auth/internal/verify-password`에 위임 (내부 시크릿 헤더 사용)
- 노트 상태가 `locked`가 아니면 → 400

**③ `POST /api/signatures/sign/:noteId` — 전자서명** (Signature-Audit 서비스)

미들웨어: `requireAuth` → `requirePermission(Permission.NOTE_SIGN)` → `validate(SignNoteParamsSchema, SignNoteBodySchema)`

동작:
1. 서명자 비밀번호를 auth-service에서 검증
2. SHA-256 해시 체인으로 서명 레코드 생성
3. `patchNoteStatus()` 호출 → Redis Stream `NOTE_SIGNED` 이벤트 발행 (실패 시 HTTP 폴백)
4. 감사로그 기록 + 노트 작성자에게 알림
5. 서명 결과 반환 (201)

### 4.4 이벤트 기반 상태 전환 (Redis Stream)

서명 완료 시 상태 전환은 이벤트 기반으로 동작합니다:

```
Signature-Audit 서비스                    Redis Stream                     ELN 서비스
                                      (labnote:events)
signNote() ─── publishEvent() ──────►  NOTE_SIGNED  ──────► eventConsumer
                                       {noteId,              handleNoteSigned()
                                        status,                ├─ 멱등성 체크 (이미 signed면 스킵)
                                        userId,                ├─ 전환 검증 (in_progress만 허용)
                                        timestamp}             ├─ note.status → signed 업데이트
                                                               └─ NoteStatusHistory 기록

※ Redis 장애 시 HTTP 폴백:
signNote() ─── PATCH /api/notes/:id/status ──► changeNoteStatus()
               (x-user-role: system)            (SYSTEM_STATUS_TRANSITIONS 사용)
```

이벤트 컨슈머 설정:
- Consumer Group: `eln-service`
- Consumer Name: `eln-{pid}`
- 블록 타임아웃: 5초
- 배치 크기: 10
- Pending 메시지 복구: 60초 주기, 30초 이상 미처리 메시지 XCLAIM

### 4.5 데이터베이스 (PostgreSQL)

**파일**: `services/eln-service/schema.sql`, `services/eln-service/prisma/schema.prisma`

#### 핵심 테이블

| 테이블 | 설명 |
|--------|------|
| `users` | 사용자 정보 (역할: admin/researcher/reviewer/viewer) |
| `notes` | 연구노트 (상태: note_status ENUM) |
| `note_status_history` | 상태 전환 이력 (감사 추적) |
| `note_revisions` | 노트 버전 관리 (내용 해시 포함) |
| `note_sections` | 노트 섹션 (목적/재료/방법/결과/고찰) |
| `note_links` | 교차 참조 링크 |
| `note_attachments` | 첨부파일 메타데이터 |
| `templates` | 노트 템플릿 |
| `signatures` | 전자서명 기록 (해시 기반 무결성) |
| `audit_logs` | 전체 감사로그 |

#### 상태 전환 트리거

`check_note_status_transition()` 함수가 `notes.status` 변경 시 자동 실행되어 비즈니스 룰을 DB 레벨에서 강제합니다.

현재 트리거가 허용하는 전환:
| 현재 상태 | 허용 대상 상태 |
|-----------|--------------|
| `draft` | `in_progress` |
| `in_progress` | `draft`, `signed`, `locked` |
| `signed` | (변경 불가) |
| `locked` | `draft` |

## 5. 알림 (Notification)

상태 변경 시 노트 작성자에게 자동 알림이 발송됩니다 (작성자 본인이 수행한 경우 제외).

| 이벤트 | 알림 타입 | 발생 위치 | 수신자 |
|--------|----------|----------|--------|
| 노트 잠금 | `NOTE_LOCKED` | `note.controller.ts` (callNotification) | 노트 작성자 |
| 잠금 해제 | `NOTE_UNLOCKED` | `note.controller.ts` (callNotification) | 노트 작성자 |
| 전자서명 | `NOTE_SIGNED` | `signature.controller.ts` (prisma.notification.create) | 노트 작성자 |

## 6. 감사 추적 (Audit Trail)

모든 상태 변경은 두 곳에 기록됩니다:

1. **`note_status_history`**: 노트 전용 상태 전환 이력 (from/to 상태, 관리자 여부)
2. **`audit_logs`**: 시스템 전체 감사로그 (IP 주소, 상세 JSONB 포함)

| 액션 | audit action | 기록 위치 |
|------|-------------|----------|
| 상태 변경 | `note.status_changed` | ELN 서비스 컨트롤러 |
| 관리자 잠금 해제 | `note.admin_unlocked` | ELN 서비스 컨트롤러 |
| 전자서명 | `signed` | Signature-Audit 서비스 컨트롤러 |

관리자 잠금 해제 시 추가 기록 항목:
- `is_admin_action = true`
- `reason` (해제 사유)
- `actor_id` (관리자 ID)

> 이벤트 컨슈머를 통한 `signed` 전환은 `NoteStatusHistory`만 기록하고, `audit_logs`는 Signature-Audit 서비스에서 별도 기록합니다.

## 7. 보안 고려사항

| 항목 | 구현 |
|------|------|
| 인증 | `requireAuth` 미들웨어 — 모든 라우트에 적용 |
| 관리자 잠금 해제 인증 | `requireRole(ADMIN)` + `requirePermission(NOTE_UNLOCK)` 2단계 미들웨어 게이트 |
| 비밀번호 검증 | auth-service의 `POST /api/auth/internal/verify-password`에 위임 (내부 시크릿 헤더) |
| 잠금 역할 검증 | 컨트롤러에서 `x-user-role`이 `reviewer`/`admin`인지 확인 |
| 서명 권한 | `requirePermission(NOTE_SIGN)` — Reviewer, Admin만 보유 |
| 잠긴 노트 보호 | `updateNote()` 및 `deleteNote()`에서 locked/signed 상태 시 차단 |
| DB 레벨 보호 | 트리거 함수로 잘못된 상태 전환 차단 |
| 감사 불변성 | `audit_logs` 테이블은 INSERT ONLY (UPDATE/DELETE 미허용 권장) |
| 서비스 간 통신 | `x-internal-secret` 헤더로 내부 서비스 인증 |

## 8. 파일 구조 요약

| 파일 경로 | 역할 |
|-----------|------|
| `src/pages/NotesPage.tsx` | 프론트엔드 노트 목록 — 상태 필터, 상태 변경, 관리자 잠금 해제 UI |
| `src/pages/NoteEditor.tsx` | 프론트엔드 노트 편집기 — 상태 표시, 진행 시작/서명 버튼 |
| `src/pages/SignaturesPage.tsx` | 프론트엔드 서명 현황 대시보드 |
| `src/api/client.ts` | API 클라이언트 — `patch()` 메서드 포함 |
| `src/api/notes.ts` | `changeNoteStatus()`, `adminUnlockNote()` API 함수 |
| `src/api/signatures.ts` | `signNote()`, `verifySignature()` API 함수 |
| `services/eln-service/src/dtos/note.dto.ts` | DTO, 상태 타입, 전환 맵 정의 |
| `services/eln-service/src/controllers/note.controller.ts` | 상태 변경/잠금 해제 핸들러 |
| `services/eln-service/src/routes/note.routes.ts` | PATCH/POST 라우트 + 미들웨어 체인 |
| `services/eln-service/src/lib/eventConsumer.ts` | Redis Stream 이벤트 컨슈머 (NOTE_SIGNED 처리) |
| `services/eln-service/src/openapi/eln.openapi.ts` | OpenAPI 3.0 스펙 |
| `services/eln-service/schema.sql` | PostgreSQL 스키마 (전체 테이블 + 상태 전환 트리거) |
| `services/eln-service/prisma/schema.prisma` | Prisma 스키마 (Note, NoteStatusHistory 모델) |
| `services/signature-audit-service/src/controllers/signature.controller.ts` | 서명 생성 + 상태 변경 이벤트 발행 |
| `services/signature-audit-service/src/routes/signature.routes.ts` | 서명 라우트 |
| `services/signature-audit-service/src/lib/queue.ts` | Redis Stream 이벤트 발행 유틸 |

---

*이 문서는 ELN 플랫폼 연구노트 상태 관리 기능의 전체 정합성을 보장하기 위해 작성되었습니다.*
