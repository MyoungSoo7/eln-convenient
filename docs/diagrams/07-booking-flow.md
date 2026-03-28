# 장비/회의실 예약 흐름 시퀀스 다이어그램

## 1. 예약 상태 머신

```mermaid
stateDiagram-v2
    [*] --> PENDING: 예약 신청

    PENDING --> APPROVED: 승인 (승인자)
    PENDING --> REJECTED: 거절 (승인자)
    PENDING --> CANCELLED: 취소 (신청자)

    APPROVED --> COMPLETED: 완료
    APPROVED --> CANCELLED: 취소 (신청자/Admin)

    REJECTED --> [*]
    CANCELLED --> [*]
    COMPLETED --> [*]

    note right of PENDING
        충돌 검사: APPROVED 건만 대상
        PENDING끼리는 충돌 안 함
    end note

    note right of APPROVED
        승인 시 비관적 락으로
        동시 승인 방지
    end note
```

## 2. 예약 생성 흐름

```mermaid
sequenceDiagram
    actor User
    participant FE as Frontend
    participant GW as API Gateway :8000
    participant Sched as Scheduler Service :8005
    participant DB as PostgreSQL

    User->>FE: 장비 선택 + 시간 설정
    FE->>GW: GET /api/scheduler/resources
    GW->>Sched: 프록시 전달
    Sched->>DB: SELECT * FROM Resource<br/>WHERE orgId AND isActive = true
    Sched-->>FE: 사용 가능한 장비/회의실 목록

    User->>FE: 시간대 선택 후 충돌 확인
    FE->>GW: GET /api/scheduler/conflicts<br/>?resourceId={id}&startAt={start}&endAt={end}
    GW->>Sched: 프록시 전달

    Sched->>DB: SELECT * FROM Booking<br/>WHERE resourceId = {id}<br/>AND status = 'APPROVED'<br/>AND startAt < {end}<br/>AND endAt > {start}
    Note over DB: APPROVED 건만 충돌 대상<br/>PENDING끼리는 허용

    alt 충돌 있음
        Sched-->>FE: {conflicts: [{booking1}, ...]}
        FE-->>User: "해당 시간에 이미 승인된 예약이 있습니다"
    else 충돌 없음
        Sched-->>FE: {conflicts: []}

        User->>FE: 예약 신청 확인
        FE->>GW: POST /api/scheduler/bookings<br/>{resourceId, startAt, endAt, purpose}
        GW->>Sched: 프록시 전달

        Sched->>Sched: requireAuth + requirePermission
        Sched->>Sched: validate(BookingSchema)
        Sched->>DB: INSERT Booking<br/>{status: PENDING, userId, resourceId, ...}
        Sched->>Sched: callNotification() → 승인자에게 알림

        Sched-->>GW: 201 {ok: true, data: {booking}}
        GW-->>FE: 응답 전달
        FE-->>User: "예약 신청이 완료되었습니다"
    end
```

## 3. 예약 승인 (비관적 락)

```mermaid
sequenceDiagram
    actor Approver as 승인자
    participant FE as Frontend
    participant GW as API Gateway
    participant Sched as Scheduler Service :8005
    participant DB as PostgreSQL

    Approver->>FE: 승인 버튼 클릭
    FE->>GW: PATCH /api/scheduler/bookings/{id}/approve
    GW->>Sched: 프록시 전달

    Sched->>Sched: requireAuth + requirePermission

    rect rgb(255, 240, 240)
        Note over Sched,DB: 트랜잭션 (timeout: 5초)

        Sched->>DB: SELECT 1 FROM bookings<br/>WHERE id = {id} FOR UPDATE
        Note over DB: 비관적 락 — 다른 승인 요청 대기

        Sched->>DB: SELECT * FROM Booking WHERE id = {id}
        DB-->>Sched: {status: PENDING, resourceId, startAt, endAt}

        alt 이미 PENDING이 아님
            Sched-->>GW: 400 "이미 처리된 예약입니다"
        end

        %% 승인 시점에 충돌 재확인
        Sched->>DB: SELECT * FROM Booking<br/>WHERE resourceId = {resourceId}<br/>AND status = 'APPROVED'<br/>AND startAt < {endAt}<br/>AND endAt > {startAt}<br/>AND id != {id}

        alt 승인 시점 충돌 발견
            Sched-->>GW: 409 "승인 시점에 충돌이 발생했습니다"
            Note over Sched: PENDING 중 다른 건이 먼저 승인됨
        else 충돌 없음
            Sched->>DB: UPDATE Booking<br/>SET status = 'APPROVED',<br/>approvedBy = {approverId},<br/>approvedAt = NOW()
        end
    end

    Sched->>Sched: callNotification() → 신청자에게 승인 알림

    Sched-->>GW: 200 {ok: true, data: {booking}}
    GW-->>FE: 응답 전달
    FE-->>Approver: "승인 완료"
```

## 4. 예약 거절 / 취소

```mermaid
sequenceDiagram
    actor Actor as 승인자 / 신청자

    alt 거절 (승인자)
        Actor->>Sched: PATCH /bookings/{id}/reject<br/>{reason: "장비 점검 중"}
        Sched->>Sched: 상태 확인: PENDING → REJECTED ✓
        Sched->>DB: UPDATE status = 'REJECTED'
        Sched->>Sched: callNotification() → 신청자에게 거절 알림
    end

    alt 취소 (신청자)
        Actor->>Sched: PATCH /bookings/{id}/cancel
        Sched->>Sched: 본인 예약 확인 (userId 매칭)
        Sched->>Sched: 상태 확인: PENDING/APPROVED → CANCELLED ✓
        Sched->>DB: UPDATE status = 'CANCELLED'
    end

    alt 완료
        Actor->>Sched: PATCH /bookings/{id}/complete
        Sched->>Sched: 상태 확인: APPROVED → COMPLETED ✓
        Sched->>DB: UPDATE status = 'COMPLETED'
    end

    participant Sched as Scheduler Service
    participant DB as PostgreSQL
```

## 5. 동시 승인 시나리오 (Race Condition 방지)

```mermaid
sequenceDiagram
    participant A as 승인자 A
    participant B as 승인자 B
    participant Sched as Scheduler Service
    participant DB as PostgreSQL

    Note over A,B: 같은 시간대에 2개 PENDING 예약 존재<br/>예약1 (10:00~11:00), 예약2 (10:30~11:30)

    par 동시 승인 요청
        A->>Sched: APPROVE 예약1
        B->>Sched: APPROVE 예약2
    end

    Sched->>DB: BEGIN TX1 — SELECT FOR UPDATE 예약1
    Note over DB: 예약1 락 획득

    Sched->>DB: BEGIN TX2 — SELECT FOR UPDATE 예약2
    Note over DB: 예약2 락 획득 (다른 row라 블로킹 안 됨)

    Sched->>DB: TX1: 충돌 확인 — APPROVED 건 검색
    DB-->>Sched: 충돌 없음 (아직 둘 다 PENDING)
    Sched->>DB: TX1: UPDATE 예약1 → APPROVED
    Sched->>DB: TX1: COMMIT

    Sched->>DB: TX2: 충돌 확인 — APPROVED 건 검색
    DB-->>Sched: 충돌 발견! (예약1이 APPROVED, 시간 겹침)
    Sched-->>B: 409 "승인 시점에 충돌이 발생했습니다"
    Sched->>DB: TX2: ROLLBACK
```

## 핵심 포인트

| 항목 | 설명 |
|------|------|
| **충돌 기준** | APPROVED 건만 충돌 대상, PENDING끼리는 허용 |
| **비관적 락** | `SELECT ... FOR UPDATE` — 동시 승인 방지 |
| **충돌 재확인** | 승인 시점에 반드시 재검사 (신청~승인 사이 변경 가능) |
| **트랜잭션 타임아웃** | 5초 (락 대기 시간 제한) |
| **취소 권한** | 신청자 본인 또는 Admin |
| **상태 전환** | state-machine.ts에서 허용된 전환만 가능 |
