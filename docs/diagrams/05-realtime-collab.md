# 실시간 협업 편집 시퀀스 다이어그램

## 1. WebSocket 연결 및 방 입장

```mermaid
sequenceDiagram
    actor UserA as 사용자 A
    actor UserB as 사용자 B (기존 참여자)
    participant FE_A as Frontend A
    participant Collab as Collab Service :8009
    participant Redis as Redis Pub/Sub

    UserA->>FE_A: 노트 편집 페이지 진입
    FE_A->>Collab: WS /collab/notes/{noteId}?token={jwt}

    Collab->>Collab: JWT 검증<br/>userId, userName 추출
    Collab->>Collab: 방(Room) 조회/생성<br/>Map<noteId, Map<userId, CollabUser>>
    Collab->>Collab: 색상 할당 (0~7 자동 배정)

    %% 기존 참여자 목록 전달
    Collab-->>FE_A: {type: "joined",<br/>users: [{id: B, name: "김리뷰어", colorIdx: 0}]}

    %% 기존 참여자에게 알림
    Collab-->>UserB: {type: "user-joined",<br/>userId: A, userName: "박연구", colorIdx: 1}

    Note over Collab: 방 상태:<br/>noteId → {A: {colorIdx:1}, B: {colorIdx:0}}
```

## 2. 콘텐츠 편집 동기화

```mermaid
sequenceDiagram
    actor UserA as 사용자 A
    participant FE_A as Frontend A
    participant Collab as Collab Service :8009
    participant Redis as Redis Pub/Sub
    participant Collab2 as Collab Instance 2
    participant FE_B as Frontend B
    actor UserB as 사용자 B

    UserA->>FE_A: 텍스트 입력
    FE_A->>Collab: {type: "content-update",<br/>content: "실험 결과..."}

    %% 같은 인스턴스의 다른 사용자
    Collab->>Collab: 같은 방(Room)의 다른 사용자에게 브로드캐스트
    Collab-->>FE_B: {type: "content-update",<br/>userId: A, userName: "박연구",<br/>colorIdx: 1, content: "실험 결과..."}

    %% 멀티 인스턴스 (Redis Pub/Sub)
    Collab->>Redis: PUBLISH labnote:collab<br/>{noteId, type, userId, content}

    Redis-->>Collab2: SUBSCRIBE 메시지 수신
    Collab2->>Collab2: noteId로 로컬 방 조회
    Collab2->>Collab2: 해당 방의 사용자들에게 브로드캐스트
    Note over Collab2: 원래 발신자 제외

    FE_B-->>UserB: 에디터 내용 업데이트
```

## 3. 커서 위치 공유 (Awareness)

```mermaid
sequenceDiagram
    actor UserA as 사용자 A
    participant FE_A as Frontend A
    participant Collab as Collab Service
    participant FE_B as Frontend B
    actor UserB as 사용자 B

    UserA->>FE_A: 커서 이동 (라인 42)
    FE_A->>Collab: {type: "awareness",<br/>cursorLine: 42}

    Collab-->>FE_B: {type: "awareness",<br/>userId: A, userName: "박연구",<br/>colorIdx: 1, cursorLine: 42}

    FE_B-->>UserB: 사용자 A 커서 위치 표시<br/>(색상으로 구분)
```

## 4. 연결 해제 및 정리

```mermaid
sequenceDiagram
    actor UserA as 사용자 A
    participant FE_A as Frontend A
    participant Collab as Collab Service
    participant FE_B as Frontend B
    actor UserB as 사용자 B

    UserA->>FE_A: 페이지 이탈 / 브라우저 닫기
    FE_A->>Collab: WebSocket close

    Collab->>Collab: 방에서 사용자 A 제거
    Collab-->>FE_B: {type: "user-left",<br/>userId: A, userName: "박연구"}

    FE_B-->>UserB: 사용자 A 커서/색상 제거

    alt 방에 사용자 없음
        Collab->>Collab: 방(Room) 삭제<br/>Map에서 noteId 키 제거
    end
```

## 5. Redis 장애 시 Graceful Degradation

```mermaid
sequenceDiagram
    participant Collab as Collab Instance 1
    participant Redis as Redis Pub/Sub
    participant Collab2 as Collab Instance 2

    Collab->>Redis: PUBLISH labnote:collab

    alt Redis 정상
        Redis-->>Collab2: 메시지 전달
        Note over Collab,Collab2: 멀티 인스턴스 동기화 ✅
    else Redis 다운
        Collab->>Collab: logger.warn("Redis 연결 실패")
        Note over Collab: 단일 인스턴스 모드로 전환
        Note over Collab: 로컬 방 내 사용자만 동기화
        Note over Collab2: Instance 2 사용자는<br/>Instance 1 변경 못 받음
    end
```

## 6. 전체 아키텍처 (멀티 인스턴스)

```mermaid
graph TB
    subgraph "Instance 1"
        C1[Collab Service]
        R1[Room: note-123]
        U1[User A - WS]
        U2[User B - WS]
        U1 --> R1
        U2 --> R1
        R1 --> C1
    end

    subgraph "Redis"
        PS[Pub/Sub: labnote:collab]
    end

    subgraph "Instance 2"
        C2[Collab Service]
        R2[Room: note-123]
        U3[User C - WS]
        U3 --> R2
        R2 --> C2
    end

    C1 <-->|PUBLISH/SUBSCRIBE| PS
    C2 <-->|PUBLISH/SUBSCRIBE| PS
```

## 핵심 포인트

| 항목 | 설명 |
|------|------|
| **프로토콜** | Raw WebSocket (ws 라이브러리), Fastify 아님 |
| **인증** | 쿼리 파라미터 `?token={jwt}` → 인메모리 검증 |
| **방 관리** | 인메모리 Map (서버 재시작 시 초기화) |
| **색상** | 0~7 자동 배정 (최대 8명 동시 편집 구분) |
| **멀티 인스턴스** | Redis Pub/Sub (장애 시 단일 인스턴스 폴백) |
| **영속성 없음** | 편집 내용은 별도 API로 저장 (WS는 실시간 동기화만) |
| **포트** | :8009 (API Gateway 프록시 아님, 직접 연결) |
