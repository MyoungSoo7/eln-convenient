---
description: 노트 상태 전환 로직 수정 시 반드시 따라야 할 규칙
globs: services/eln-service/src/**/*.ts, services/signature-audit-service/src/**/*.ts
---

# 노트 상태 전환 규칙

## 상태 흐름
```
draft ↔ in_progress → locked (Reviewer/Admin만)
                    → signed (system만, 서명 서비스 이벤트)
locked → draft (Admin 잠금해제만)
signed → 변경 불가
```

## 핵심 제약

1. **signed/locked 노트는 수정/삭제 불가** — 컨트롤러에서 반드시 체크
2. **signed 전환은 서명 프로세스만 가능** — `POST /signatures/sign/:noteId` (Reviewer/Admin, `note:sign` 권한) → system이 이벤트로 상태 전환. `PATCH /status`로 직접 signed 불가
3. **Researcher는 서명 불가** — `note:sign` 권한 없음
4. **in_progress → locked는 Reviewer/Admin만** — `x-user-role` 검증 필수
5. **locked → draft는 Admin만** — `requireRole(ADMIN)` + `requirePermission(NOTE_UNLOCK)`
6. **DB 트리거 `check_note_status_transition()`이 최종 안전장치** — 트리거 수정 금지
7. **모든 상태 변경은 이중 기록**: `NoteStatusHistory` + `AuditLog`

## 전환 맵 (코드)
```typescript
// services/eln-service/src/dtos/note.dto.ts
ALLOWED_STATUS_TRANSITIONS = {
  draft: ['in_progress'],
  in_progress: ['draft', 'locked'],
  signed: [],
  locked: [],
};
SYSTEM_STATUS_TRANSITIONS = {
  draft: ['in_progress'],
  in_progress: ['draft', 'signed', 'locked'],
  signed: [],
  locked: [],
};
```

## 관련 이벤트
- `note.signed`: signature-audit → eln-service (Redis Stream)
- `note.locked`: eln-service → signature-audit (잠금 알림)
