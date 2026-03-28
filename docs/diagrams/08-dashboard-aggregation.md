# 대시보드 집계 시퀀스 다이어그램

## 1. 개인 대시보드 조회

```mermaid
sequenceDiagram
    actor User
    participant FE as Frontend
    participant GW as API Gateway :8000
    participant ELN as ELN Service :8002
    participant Sched as Scheduler :8005
    participant Sig as Signature-Audit :8003

    User->>FE: 대시보드 페이지 진입
    FE->>GW: GET /api/dashboard/personal<br/>Authorization: Bearer {jwt}

    GW->>GW: JWT 검증 + userId, orgId 추출

    par Promise.allSettled (병렬 요청)
        GW->>ELN: GET /api/notes/stats<br/>?type=note&authorId={userId}<br/>x-internal-secret
    and
        GW->>ELN: GET /api/notes<br/>?type=note&authorId={userId}&limit=5<br/>x-internal-secret
    and
        GW->>Sched: GET /api/scheduler/bookings<br/>?userId={userId}&limit=5<br/>x-internal-secret
    and
        GW->>Sig: GET /api/notifications<br/>?userId={userId}&unread=true<br/>x-internal-secret
    and
        GW->>Sig: GET /api/audit<br/>?userId={userId}&limit=5<br/>x-internal-secret
    end

    Note over GW: Promise.allSettled 사용<br/>→ 일부 서비스 실패해도 나머지 정상 응답

    alt 모든 서비스 정상
        ELN-->>GW: {stats: {draft: 3, in_progress: 5, signed: 12}}
        ELN-->>GW: {recentNotes: [{...}, ...]}
        Sched-->>GW: {bookings: [{...}, ...]}
        Sig-->>GW: {unreadCount: 7}
        Sig-->>GW: {recentActions: [{...}, ...]}

        GW->>GW: 결과 병합
        GW-->>FE: 200 {ok: true, data: {<br/>  stats, recentNotes,<br/>  bookings, unreadCount,<br/>  recentActions<br/>}}
    else 일부 서비스 다운
        ELN-->>GW: 200 (정상)
        Sched-->>GW: TIMEOUT / 500 (실패)
        Sig-->>GW: 200 (정상)

        GW->>GW: allSettled → 실패 항목은 기본값 처리
        Note over GW: bookings: [] (빈 배열)<br/>나머지는 정상 데이터

        GW-->>FE: 200 {ok: true, data: {<br/>  stats: {...},<br/>  recentNotes: [...],<br/>  bookings: [],<br/>  unreadCount: 7,<br/>  recentActions: [...]<br/>}}
    end

    FE-->>User: 대시보드 렌더링<br/>(실패 항목은 "불러오기 실패" 표시)
```

## 2. 관리자 대시보드

```mermaid
sequenceDiagram
    actor Admin
    participant FE as Frontend
    participant GW as API Gateway :8000
    participant Auth as Auth Service :8001
    participant ELN as ELN Service :8002
    participant Sig as Signature-Audit :8003

    Admin->>FE: 관리자 대시보드 진입
    FE->>GW: GET /api/dashboard/admin

    GW->>GW: requireRole(ADMIN) 확인

    par 병렬 집계
        GW->>Auth: GET /api/auth/stats<br/>(사용자 수, 팀 수, 조직 정보)
    and
        GW->>ELN: GET /api/notes/stats<br/>(전체 노트 통계 — orgId 스코프)
    and
        GW->>Sig: GET /api/audit/stats<br/>(최근 감사 로그 요약)
    end

    Auth-->>GW: {userCount, teamCount, ...}
    ELN-->>GW: {totalNotes, byStatus, byType, ...}
    Sig-->>GW: {todayActions, signatureCount, ...}

    GW->>GW: 집계 결과 병합
    GW-->>FE: 200 {ok: true, data: {users, notes, audit}}
    FE-->>Admin: 관리자 대시보드 렌더링
```

## 3. 캐싱 전략

```mermaid
sequenceDiagram
    participant GW as API Gateway
    participant Redis as Redis Cache
    participant Services as 내부 서비스들

    GW->>Redis: GET cache:dashboard:{userId}:{hash}

    alt 캐시 히트 (TTL 내)
        Redis-->>GW: 캐시된 대시보드 데이터
        GW-->>FE: 즉시 응답 (빠른 로딩)
        participant FE as Frontend
    else 캐시 미스
        GW->>Services: 5개 서비스 병렬 호출
        Services-->>GW: 집계 결과
        GW->>Redis: SET cache:dashboard:{userId}:{hash}<br/>TTL: 적절한 시간
        GW-->>FE: 응답 전달
    end
```

## 핵심 포인트

| 항목 | 설명 |
|------|------|
| **병렬 요청** | `Promise.allSettled` — 하나 실패해도 전체 실패 안 함 |
| **Partial Response** | 실패 항목은 빈 배열/기본값으로 대체 |
| **내부 인증** | 모든 요청에 `x-internal-secret` 헤더 |
| **멀티테넌시** | orgId 스코프 자동 필터 |
| **관리자 대시보드** | `requireRole(ADMIN)` 게이트 |
| **캐싱** | Redis TTL 기반, 서비스별 적절한 만료 시간 |
