# 노트 서명 흐름 시퀀스 다이어그램

> 이 시스템의 **가장 핵심적인 크로스서비스 흐름**. Redis Stream + HTTP 폴백 이중 경로.

## 1. 전자서명 전체 흐름

```mermaid
sequenceDiagram
    actor Reviewer
    participant FE as Frontend
    participant GW as API Gateway :8000
    participant Sig as Signature-Audit :8003
    participant Auth as Auth Service :8001
    participant Redis as Redis Stream
    participant ELN as ELN Service :8002

    Reviewer->>FE: 서명 버튼 클릭 + 비밀번호 입력
    FE->>GW: POST /api/signatures/sign/{noteId}<br/>{password, comment}
    GW->>GW: JWT 검증 + 헤더 주입
    GW->>Sig: 프록시 전달

    %% 권한 검증
    Sig->>Sig: requireAuth → requirePermission(note:sign)
    Note over Sig: Researcher는 note:sign 없음 → 403

    %% 비밀번호 재검증
    Sig->>Auth: POST /api/auth/internal/verify-password<br/>{userId, password}<br/>x-internal-secret
    Auth->>Auth: bcrypt.compare()

    alt 비밀번호 불일치
        Auth-->>Sig: {verified: false}
        Sig-->>GW: 401 "비밀번호가 일치하지 않습니다"
        GW-->>FE: 에러 표시
    end

    Auth-->>Sig: {verified: true}

    %% 노트 상태 확인
    Sig->>ELN: GET /api/notes/{noteId}<br/>x-internal-secret
    ELN-->>Sig: {status: "in_progress", ...}

    alt 상태가 in_progress가 아님
        Sig-->>GW: 400 "서명 가능한 상태가 아닙니다"
        GW-->>FE: 에러 표시
    end

    %% 해시체인 서명 생성
    Sig->>Sig: 이전 서명 조회 (prevHash)
    Sig->>Sig: SHA-256 해시 생성<br/>hash(noteId:signerId:timestamp:prevHash:comment)
    Sig->>Sig: DB 저장 (Signature 레코드)
    Sig->>Sig: AuditLog 기록

    %% Redis Stream 이벤트 발행
    Sig->>Redis: XADD labnote:events<br/>{type: NOTE_SIGNED, noteId, userId, timestamp}

    Sig-->>GW: 200 {ok: true, data: {signature}}
    GW-->>FE: 서명 완료 응답
    FE-->>Reviewer: "서명이 완료되었습니다"

    %% 비동기 상태 전환
    Note over Redis,ELN: --- 비동기 처리 ---

    ELN->>Redis: XREADGROUP GROUP eln-service<br/>eln-worker '>' COUNT 10 BLOCK 5000
    Redis-->>ELN: {type: NOTE_SIGNED, noteId}

    ELN->>ELN: note.status = "signed"
    ELN->>ELN: NoteStatusHistory 기록
    ELN->>ELN: AuditLog 기록

    ELN->>Redis: XACK labnote:events (소비 완료)
```

## 2. Redis 실패 시 HTTP 폴백

```mermaid
sequenceDiagram
    participant Sig as Signature-Audit :8003
    participant Redis as Redis Stream
    participant ELN as ELN Service :8002

    Sig->>Redis: XADD labnote:events<br/>{type: NOTE_SIGNED, noteId}

    alt Redis 정상
        Redis-->>Sig: OK
        Note over Sig: 이벤트 발행 성공 → 종료
    else Redis 실패
        Redis-->>Sig: ERROR (연결 끊김 등)
        Note over Sig: HTTP 폴백 시작

        Sig->>ELN: PATCH /api/notes/{noteId}/status<br/>{status: "signed"}<br/>x-user-role: system<br/>x-internal-secret
        ELN->>ELN: SYSTEM_STATUS_TRANSITIONS 확인<br/>in_progress → signed ✓
        ELN->>ELN: note.status = "signed"
        ELN-->>Sig: 200 OK

        alt HTTP 폴백도 실패
            ELN-->>Sig: ERROR
            Sig->>Sig: logger.error("상태 전환 실패")<br/>서명은 이미 완료됨<br/>수동 복구 필요
        end
    end
```

## 3. Redis Stream 소비자 복구 메커니즘

```mermaid
sequenceDiagram
    participant ELN as ELN eventConsumer
    participant Redis as Redis Stream

    loop 메인 루프 (5초 블로킹)
        ELN->>Redis: XREADGROUP GROUP eln-service<br/>eln-worker '>' COUNT 10 BLOCK 5000

        alt 새 메시지 있음
            Redis-->>ELN: [{type: NOTE_SIGNED, noteId}]
            ELN->>ELN: handleNoteSigned(noteId)

            alt 처리 성공
                ELN->>Redis: XACK (소비 완료)
            else 처리 실패
                Note over ELN: ACK 안 함 → pending 상태 유지
            end
        else 새 메시지 없음
            Redis-->>ELN: (empty)
            Note over ELN: 다음 루프 대기
        end
    end

    loop 클레임 루프 (60초 간격)
        ELN->>Redis: XPENDING labnote:events eln-service
        Redis-->>ELN: [{id, idle: 35000, deliveryCount: 3}]

        alt idle > 30초 (오래된 미처리 메시지)
            ELN->>Redis: XCLAIM (메시지 소유권 재획득)
            ELN->>ELN: 재처리 시도

            alt deliveryCount > 5 (Dead Letter)
                ELN->>ELN: logger.error("Dead letter 처리")
                ELN->>Redis: XACK (포기, 수동 복구 필요)
            end
        end
    end
```

## 핵심 포인트

| 항목 | 설명 |
|------|------|
| **서명 권한** | Reviewer, Admin만 가능 (`note:sign` 퍼미션) |
| **Researcher 차단** | `note:sign` 권한 없음 → 403 |
| **비밀번호 이중 검증** | 로그인 JWT + 서명 시 비밀번호 재확인 |
| **해시체인** | `SHA-256(noteId:signerId:timestamp:prevHash:comment)` |
| **이벤트 전달** | Redis Stream → 실패 시 HTTP 폴백 |
| **상태 전환** | `system` 역할만 가능 (SYSTEM_STATUS_TRANSITIONS) |
| **PATCH /status 직접 signed 불가** | 일반 사용자는 ALLOWED_STATUS_TRANSITIONS에 signed 없음 |
| **Dead Letter** | 5회 초과 재전달 → ACK 처리 + 수동 복구 알림 |
| **signed는 불변** | 어떤 역할도 signed → 다른 상태 전환 불가 |
