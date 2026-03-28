# 노트 상태 전환 시퀀스 다이어그램

## 1. 상태 머신 전체 흐름

```mermaid
stateDiagram-v2
    [*] --> draft: 노트 생성

    draft --> in_progress: 작업 시작<br/>(모든 역할)
    in_progress --> draft: 작업 중단<br/>(모든 역할)

    in_progress --> locked: 잠금<br/>(Reviewer/Admin만)
    in_progress --> signed: 서명 완료<br/>(system만, Redis Stream)

    locked --> draft: 잠금 해제<br/>(Admin만, 비밀번호 검증)

    signed --> [*]: 불변 (변경 불가)

    note right of signed
        signed/locked 상태:
        수정/삭제 불가
    end note

    note right of locked
        Admin만 잠금 해제 가능
        requireRole(ADMIN)
        + 비밀번호 검증
    end note
```

## 2. 일반 상태 전환 (PATCH /api/notes/:id/status)

```mermaid
sequenceDiagram
    actor User
    participant FE as Frontend
    participant GW as API Gateway
    participant ELN as ELN Service :8002
    participant DB as PostgreSQL

    User->>FE: 상태 변경 버튼 클릭
    FE->>GW: PATCH /api/notes/{id}/status<br/>{status: "in_progress"}
    GW->>ELN: 프록시 + 헤더 주입

    ELN->>ELN: requireAuth
    ELN->>ELN: requirePermission(NOTE_STATUS)
    ELN->>ELN: validate({body: StatusSchema})

    ELN->>DB: SELECT note WHERE id AND orgId
    DB-->>ELN: {status: "draft", authorId: "..."}

    ELN->>ELN: ALLOWED_STATUS_TRANSITIONS 확인
    Note over ELN: draft → [in_progress] ✓

    alt locked 전환 요청
        ELN->>ELN: x-user-role 확인
        Note over ELN: Researcher → 403 차단<br/>Reviewer/Admin → 허용
    end

    alt signed 전환 요청
        ELN-->>GW: 400 "직접 signed 전환 불가"
        Note over ELN: ALLOWED_STATUS_TRANSITIONS에<br/>signed 경로 없음
    end

    ELN->>DB: UPDATE note SET status = "in_progress"
    Note over DB: DB 트리거<br/>check_note_status_transition()<br/>유효성 최종 검증

    ELN->>DB: INSERT NoteStatusHistory<br/>{noteId, fromStatus, toStatus, changedBy}
    ELN->>ELN: callAuditLog() (fire-and-forget)

    ELN-->>GW: 200 {ok: true, data: {note}}
    GW-->>FE: 응답 전달
    FE-->>User: UI 상태 업데이트
```

## 3. Admin 잠금 해제 (POST /api/notes/:id/admin-unlock)

```mermaid
sequenceDiagram
    actor Admin
    participant FE as Frontend
    participant GW as API Gateway
    participant ELN as ELN Service :8002
    participant Auth as Auth Service :8001
    participant DB as PostgreSQL

    Admin->>FE: 잠금 해제 + 비밀번호 입력
    FE->>GW: POST /api/notes/{id}/admin-unlock<br/>{password, reason}
    GW->>ELN: 프록시 + 헤더 주입

    %% 3중 권한 검증
    ELN->>ELN: requireRole(ADMIN)
    ELN->>ELN: requirePermission(NOTE_UNLOCK)
    ELN->>ELN: validate({body: AdminUnlockSchema})

    %% 비밀번호 재검증
    ELN->>Auth: POST /api/auth/internal/verify-password<br/>{userId, password}<br/>x-internal-secret
    Auth-->>ELN: {verified: true/false}

    alt 비밀번호 불일치
        ELN-->>GW: 401 "비밀번호가 일치하지 않습니다"
    end

    ELN->>DB: SELECT note WHERE id AND status = "locked"
    ELN->>DB: UPDATE note SET status = "draft"
    Note over DB: DB 트리거 검증

    ELN->>DB: INSERT NoteStatusHistory<br/>{fromStatus: locked, toStatus: draft, reason}
    ELN->>ELN: callAuditLog("NOTE_ADMIN_UNLOCK")
    ELN->>ELN: callNotification() (잠금 해제 알림)

    ELN-->>GW: 200 {ok: true, data: {note}}
    GW-->>FE: 응답 전달
    FE-->>Admin: "잠금이 해제되었습니다"
```

## 4. 역할별 전환 권한 매트릭스

```mermaid
graph LR
    subgraph "Researcher"
        R1[draft → in_progress ✅]
        R2[in_progress → draft ✅]
        R3[in_progress → locked ❌]
        R4[서명 요청 ❌]
    end

    subgraph "Reviewer"
        RV1[draft → in_progress ✅]
        RV2[in_progress → draft ✅]
        RV3[in_progress → locked ✅]
        RV4[서명 요청 ✅]
    end

    subgraph "Admin"
        A1[모든 일반 전환 ✅]
        A2[in_progress → locked ✅]
        A3[locked → draft ✅ 잠금해제]
        A4[서명 요청 ✅]
    end

    subgraph "System (자동)"
        S1[in_progress → signed ✅]
        S2[Redis Stream 이벤트만]
    end
```

## 5. 보호 레이어 다이어그램

```mermaid
graph TB
    Request[상태 전환 요청] --> L1

    subgraph "Layer 1: 미들웨어"
        L1[requireAuth] --> L2[requirePermission]
        L2 --> L3[requireRole - locked/unlock만]
    end

    L3 --> L4

    subgraph "Layer 2: 컨트롤러"
        L4[ALLOWED_STATUS_TRANSITIONS 확인]
        L4 --> L5[역할별 추가 검증]
        L5 --> L6[비밀번호 검증 - unlock만]
    end

    L6 --> L7

    subgraph "Layer 3: DB 트리거"
        L7[check_note_status_transition]
        L7 --> L8[최종 안전장치 - 잘못된 전환 차단]
    end

    L8 --> L9[NoteStatusHistory 기록]
    L9 --> L10[AuditLog 기록]

    style L7 fill:#ff6b6b,color:#fff
    style L8 fill:#ff6b6b,color:#fff
```

## 핵심 제약 요약

| 제약 | 검증 위치 | 실패 시 |
|------|----------|---------|
| signed/locked 노트 수정 불가 | 컨트롤러 (UPDATE/DELETE 전) | 400 에러 |
| signed 직접 전환 불가 | ALLOWED_STATUS_TRANSITIONS | 400 에러 |
| locked 전환은 Reviewer/Admin만 | 컨트롤러 x-user-role 검증 | 403 에러 |
| unlock은 Admin만 | requireRole(ADMIN) | 403 에러 |
| 잘못된 전환 경로 | DB 트리거 | DB 에러 (최종 안전장치) |
| 모든 전환 기록 | NoteStatusHistory + AuditLog | 이중 기록 |
