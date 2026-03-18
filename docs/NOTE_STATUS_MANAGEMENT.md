# ELN 플랫폼 — 노트 상태 관리 기능 정합성 문서

> **작성일**: 2026-03-03  
> **버전**: 1.1.0  
> **범위**: 프론트엔드 ↔ API 클라이언트 ↔ 백엔드 ↔ 데이터베이스

---

## 1. 개요

연구노트의 생명주기를 4단계 상태로 관리하며, 상태 전환 규칙과 관리자 잠금 해제 기능을 프론트엔드부터 데이터베이스까지 일관되게 구현합니다.

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
└─────────┘    └──────────────┘    └────┬───┘
                                       │
                                  관리자 잠금 해제
                                  (POST /admin-unlock)
                                       │
                                  ┌────▼───┐
                                  │ draft  │
                                  │ (초안)  │
                                  └────────┘
```

### 허용 전환 매트릭스

| 현재 상태 → 변경 가능 상태 | 일반 사용자 | 관리자 | 서명 서비스 |
|---------------------------|:-----------:|:------:|:-----------:|
| draft → in_progress | ✅ | ✅ | - |
| in_progress → draft | ✅ | ✅ | - |
| in_progress → locked | ✅ | ✅ | - |
| in_progress → signed | ❌ | ❌ | ✅ (내부 호출 전용) |
| locked → draft | ❌ | ✅ (잠금 해제) | - |
| signed → (모든 상태) | ❌ | ❌ | ❌ |

> `in_progress → signed` 전환은 서명 서비스가 `PATCH /api/notes/:id/status`를 내부적으로 호출하여 처리합니다. 일반 UI에서는 노출되지 않습니다.

## 4. 계층별 구현 상세

### 4.1 프론트엔드 (React)

**파일**: `src/pages/NotesPage.tsx`

| 기능 | 구현 방식 |
|------|----------|
| 상태 표시 | `Badge` 컴포넌트 + 색상 토큰 (`statusColors`) |
| 상태 변경 | `DropdownMenu` → `handleStatusChange()` |
| 관리자 잠금 해제 | `Dialog` 모달 → 비밀번호 입력 → `handleAdminUnlock()` |
| 필터링 | 상태별 `Button` 필터 (전체/초안/진행 중/서명 완료/잠김) |
| 피드백 | `sonner` 토스트 알림 |

**상태 전환 맵** (프론트엔드):
```typescript
const statusTransitions: Record<string, string[]> = {
  draft: ["in_progress"],
  in_progress: ["draft", "locked"],
  signed: [],
  locked: [],  // 관리자 해제는 별도 모달
};
```

### 4.2 API 클라이언트 (프론트엔드 → 백엔드)

**파일**: `src/api/notes.ts`, `src/api/client.ts`

| 함수 | HTTP 메서드 | 경로 | 설명 |
|------|-----------|------|------|
| `changeNoteStatus()` | `PATCH` | `/api/notes/:id/status` | 일반 상태 전환 |
| `adminUnlockNote()` | `POST` | `/api/notes/:id/admin-unlock` | 관리자 잠금 해제 |
| `listNotes()` | `GET` | `/api/notes?status=&tag=` | 노트 목록 (필터) |
| `createNote()` | `POST` | `/api/notes` | 노트 생성 (초안) |
| `updateNote()` | `PUT` | `/api/notes/:id` | 노트 수정 |
| `deleteNote()` | `DELETE` | `/api/notes/:id` | 노트 삭제 |

**신규 추가 메서드**: `ApiClient.patch()` — PATCH 요청 지원

### 4.3 백엔드 (Express / ELN 서비스)

**파일 구조**:
```
services/eln-service/src/
├── controllers/note.controller.ts  ← 상태 변경/잠금 해제 핸들러
├── dtos/note.dto.ts               ← ChangeStatusDto, AdminUnlockDto, 전환 맵
├── routes/note.routes.ts          ← PATCH/POST 라우트 추가
└── openapi/eln.openapi.ts         ← OpenAPI 3.0 스펙 업데이트
```

#### 새로 추가된 엔드포인트

**① `PATCH /api/notes/:id/status` — 상태 변경**

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

**② `POST /api/notes/:id/admin-unlock` — 관리자 잠금 해제**

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
- `x-user-role` 헤더가 `admin`이 아닌 경우 → 403
- `adminPassword`가 비어있으면 → 400
- 노트 상태가 `locked`가 아니면 → 400

### 4.4 데이터베이스 (PostgreSQL)

**파일**: `services/eln-service/schema.sql`

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

## 5. 감사 추적 (Audit Trail)

모든 상태 변경은 두 곳에 기록됩니다:

1. **`note_status_history`**: 노트 전용 상태 전환 이력 (from/to 상태, 관리자 여부)
2. **`audit_logs`**: 시스템 전체 감사로그 (IP 주소, 상세 JSONB 포함)

관리자 잠금 해제 시 추가 기록 항목:
- `is_admin_action = true`
- `reason` (해제 사유)
- `actor_id` (관리자 ID)

## 6. 보안 고려사항

| 항목 | 구현 |
|------|------|
| 관리자 인증 | `x-user-role` 헤더 검증 (API Gateway에서 JWT 파싱 후 주입) |
| 비밀번호 검증 | 별도 관리자 비밀번호 검증 (TODO: bcrypt 해시 비교) |
| 잠긴 노트 보호 | `updateNote()` 및 `deleteNote()`에서 locked 상태 시 403 반환 |
| DB 레벨 보호 | 트리거 함수로 잘못된 상태 전환 차단 |
| 감사 불변성 | `audit_logs` 테이블은 INSERT ONLY (UPDATE/DELETE 미허용 권장) |

## 7. 파일 변경 요약

| 파일 경로 | 변경 유형 | 설명 |
|-----------|----------|------|
| `src/pages/NotesPage.tsx` | 기존 유지 | 프론트엔드 상태 관리 UI (이전 구현 완료) |
| `src/api/client.ts` | 수정 | `patch()` 메서드 추가 |
| `src/api/notes.ts` | 수정 | `changeNoteStatus()`, `adminUnlockNote()` API 함수 추가 |
| `services/eln-service/src/dtos/note.dto.ts` | 전면 수정 | DTO, 상태 타입, 전환 맵 정의 |
| `services/eln-service/src/controllers/note.controller.ts` | 전면 수정 | 상태 변경/잠금 해제 핸들러, 응답 규격 통일 |
| `services/eln-service/src/routes/note.routes.ts` | 수정 | PATCH/POST 라우트 추가 |
| `services/eln-service/src/openapi/eln.openapi.ts` | 전면 수정 | 신규 엔드포인트 OpenAPI 스펙 추가 |
| `services/eln-service/schema.sql` | 신규 생성 | PostgreSQL 스키마 (전체 테이블 + 트리거) |
| `services/eln-service/prisma/schema.prisma` | 수정 | `Note.deletedAt`, `NoteStatusHistory` 모델 추가 |
| `services/eln-service/src/__tests__/note.controller.test.ts` | 신규 생성 | 컨트롤러 단위 테스트 (7개) |

---

*이 문서는 ELN 플랫폼 연구노트 상태 관리 기능의 전체 정합성을 보장하기 위해 작성되었습니다.*
