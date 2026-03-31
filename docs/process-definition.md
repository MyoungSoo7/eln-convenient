# 프로세스 정의서 — LabNote ELN

## 목차

| # | 프로세스명 | 설명 |
|---|-----------|------|
| 1 | 노트 생명주기 | Draft → InProgress → Locked → Signed (불변) |
| 2 | 전자서명 프로세스 | 서명 요청 → 검증 → 해시체인 → 상태 변경 |
| 3 | 실시간 협업 프로세스 | WebSocket 연결 → 동기화 → 방 관리 |
| 4 | 인벤토리 프로세스 | 등록 → 수량 조정 → 이력 → 알림 |

---

## 1. 노트 생명주기

### 상태 전이도

```mermaid
stateDiagram-v2
    [*] --> Draft: 노트 생성

    Draft --> InProgress: 작성 시작\n(첫 번째 저장)
    InProgress --> InProgress: 편집/저장\n(리비전 생성)
    InProgress --> Locked: 잠금 요청\n(Reviewer 승인)
    Locked --> Signed: 전자서명\n(SHA-256 해시체인)

    Locked --> InProgress: 잠금 해제\n(Reviewer 권한)

    note right of Signed: 불변 상태\n수정/삭제 불가\n감사 로그 영구 보관
```

### 프로세스 흐름도

```mermaid
flowchart TD
    START((시작)) --> CREATE[노트 생성\nPOST /api/notes]
    CREATE --> DRAFT["상태: Draft\n빈 노트 생성"]

    DRAFT --> EDIT[내용 작성/편집]
    EDIT --> FIRST_SAVE{첫 번째\n저장?}
    FIRST_SAVE -->|예| TO_PROGRESS["상태: InProgress"]
    FIRST_SAVE -->|아니오| DRAFT

    TO_PROGRESS --> EDIT_LOOP[편집 계속\n리비전 자동 생성]
    EDIT_LOOP --> SAVE[저장\n리비전 번호 +1]
    SAVE --> EDIT_LOOP

    EDIT_LOOP --> REQUEST_LOCK[잠금 요청]
    REQUEST_LOCK --> REVIEWER_CHECK{Reviewer\n확인}
    REVIEWER_CHECK -->|반려| EDIT_LOOP
    REVIEWER_CHECK -->|승인| LOCKED["상태: Locked\n편집 비활성화"]

    LOCKED --> UNLOCK_CHECK{잠금 해제\n요청?}
    UNLOCK_CHECK -->|예| UNLOCK["상태: InProgress\n편집 재활성화"]
    UNLOCK --> EDIT_LOOP

    UNLOCK_CHECK -->|아니오| REQUEST_SIGN[서명 요청]
    REQUEST_SIGN --> SIGN_PROCESS["전자서명 프로세스\n(프로세스 2 참조)"]
    SIGN_PROCESS --> SIGNED["상태: Signed\n불변 ─ 수정/삭제 불가"]
    SIGNED --> END_NODE((종료))
```

### 프로세스 상세

| 단계 | 행위자 | 상태 전이 | 처리 | 비고 |
|------|--------|----------|------|------|
| 1. 노트 생성 | 작성자 | [*] → Draft | 빈 노트 엔티티 생성 | 제목 필수 |
| 2. 작성 시작 | 작성자 | Draft → InProgress | 첫 번째 내용 저장 | 리비전 1 생성 |
| 3. 편집/저장 | 작성자/편집자 | InProgress → InProgress | 매 저장 시 리비전 증가 | 자동저장 30초 |
| 4. 잠금 요청 | 작성자 | InProgress → Locked | Reviewer 승인 필요 | 편집 비활성화 |
| 5. 잠금 해제 | Reviewer | Locked → InProgress | 재편집 허용 | 사유 기록 |
| 6. 전자서명 | 서명자 | Locked → Signed | SHA-256 해시체인 생성 | 불변 상태 진입 |

### 리비전 관리

```mermaid
flowchart LR
    REV1["리비전 1\n(최초 저장)"]
    REV2["리비전 2\n(수정)"]
    REV3["리비전 3\n(수정)"]
    REVN["리비전 N\n(잠금 직전)"]

    REV1 --> REV2 --> REV3 -->|...| REVN
    REVN -->|잠금 → 서명| FINAL["최종 리비전\n(불변)"]
```

---

## 2. 전자서명 프로세스

### 프로세스 흐름도

```mermaid
flowchart TD
    START((시작)) --> REQUEST_SIGN[서명 요청\n노트 상세에서 버튼 클릭]

    REQUEST_SIGN --> CHECK_STATUS{노트 상태\nLocked?}
    CHECK_STATUS -->|아니오| ERROR_STATUS["오류: Locked 상태에서만\n서명 가능합니다"]
    ERROR_STATUS --> END_FAIL((종료))

    CHECK_STATUS -->|예| INPUT_PW[비밀번호 입력\n(서명자 본인 확인)]
    INPUT_PW --> VERIFY_PW{비밀번호\n검증}
    VERIFY_PW -->|실패| ERROR_PW["오류: 비밀번호가\n올바르지 않습니다"]
    ERROR_PW --> RETRY{재시도?\n(3회 제한)}
    RETRY -->|예| INPUT_PW
    RETRY -->|3회 초과| LOCK_ACCOUNT["계정 임시 잠금\n관리자 알림"]
    LOCK_ACCOUNT --> END_FAIL

    VERIFY_PW -->|성공| GENERATE_HASH[SHA-256 해시 생성]

    subgraph 해시체인_생성["해시체인 생성"]
        GENERATE_HASH --> COLLECT_DATA["데이터 수집\n노트 내용 + 메타데이터\n+ 서명자 정보 + 타임스탬프"]
        COLLECT_DATA --> CALC_HASH["SHA-256 해시 계산\nhash = SHA256(content + prev_hash\n+ signer + timestamp)"]
        CALC_HASH --> CHAIN_LINK["해시체인 연결\n이전 서명의 해시 포함"]
    end

    CHAIN_LINK --> PUBLISH_EVENT["Redis Stream 이벤트 발행\n'note.signed' 이벤트"]

    PUBLISH_EVENT --> UPDATE_STATUS["eln-service 상태 변경\nLocked → Signed"]
    UPDATE_STATUS --> SAVE_SIGNATURE["서명 데이터 저장\n서명자, 시각, 해시값"]
    SAVE_SIGNATURE --> AUDIT_LOG["감사 로그 기록\n서명 이벤트 불변 기록"]
    AUDIT_LOG --> NOTIFY["알림 발송\n관련자에게 서명 완료 통보"]
    NOTIFY --> END_SUCCESS((종료))
```

### 해시체인 구조

```mermaid
flowchart LR
    subgraph 서명1["서명 #1"]
        H1_DATA["노트 내용 v1\n+ 서명자 A\n+ timestamp"]
        H1_HASH["hash_1 = SHA256\n(content + '0' + signerA + ts1)"]
    end

    subgraph 서명2["서명 #2 (공동서명)"]
        H2_DATA["노트 내용 v1\n+ 서명자 B\n+ timestamp"]
        H2_HASH["hash_2 = SHA256\n(content + hash_1 + signerB + ts2)"]
    end

    H1_HASH -->|prev_hash| H2_HASH
```

### 프로세스 상세

| 단계 | 행위자 | 입력 | 처리 | 출력 |
|------|--------|------|------|------|
| 1. 서명 요청 | 서명자 | 버튼 클릭 | 노트 상태 확인 (Locked) | 비밀번호 모달 |
| 2. 본인 확인 | 서명자 | 비밀번호 | bcrypt 비교 (3회 제한) | 인증 결과 |
| 3. 해시 생성 | 시스템 | 노트 + 메타 | SHA-256(content + prev + signer + ts) | 해시값 |
| 4. 이벤트 발행 | 시스템 | 서명 데이터 | Redis Stream `note.signed` | 이벤트 ID |
| 5. 상태 변경 | eln-service | 이벤트 | Locked → Signed | 상태 업데이트 |
| 6. 감사 로그 | 시스템 | 서명 전체 | 불변 로그 기록 | 감사 레코드 |

---

## 3. 실시간 협업 프로세스

### 프로세스 흐름도

```mermaid
flowchart TD
    START((시작)) --> OPEN_EDITOR[노트 편집 페이지\n접속]

    OPEN_EDITOR --> WS_CONNECT["WebSocket 연결 요청\nws://server/ws/notes/{id}"]
    WS_CONNECT --> JWT_AUTH{JWT 토큰\n인증}

    JWT_AUTH -->|실패| AUTH_ERROR["인증 실패\n읽기 전용 모드"]
    AUTH_ERROR --> END_READONLY((읽기 전용))

    JWT_AUTH -->|성공| JOIN_ROOM["방 입장\nroom: note_{id}"]
    JOIN_ROOM --> NOTIFY_JOIN["입장 알림 브로드캐스트\n'{사용자}님이 접속했습니다'"]
    NOTIFY_JOIN --> SYNC_STATE["현재 상태 동기화\n최신 문서 + 접속자 목록"]

    SYNC_STATE --> EDIT_LOOP["편집 대기"]

    subgraph 편집_동기화["편집 동기화 루프"]
        EDIT_LOOP --> LOCAL_EDIT[로컬 편집\n사용자 입력]
        LOCAL_EDIT --> SEND_DELTA["편집 델타 전송\nWebSocket → 서버"]
        SEND_DELTA --> REDIS_PUB["Redis Pub/Sub\n채널: note_{id}"]
        REDIS_PUB --> BROADCAST["다른 접속자에게\n브로드캐스트"]
        BROADCAST --> APPLY_REMOTE["원격 변경 적용\n(충돌 해결)"]
        APPLY_REMOTE --> EDIT_LOOP
    end

    EDIT_LOOP --> CLOSE_EDITOR[편집 페이지 이탈]
    CLOSE_EDITOR --> LEAVE_ROOM["방 퇴장"]
    LEAVE_ROOM --> NOTIFY_LEAVE["퇴장 알림 브로드캐스트\n'{사용자}님이 나갔습니다'"]
    NOTIFY_LEAVE --> WS_CLOSE["WebSocket 연결 종료"]
    WS_CLOSE --> END_NODE((종료))
```

### 연결 상태 관리

```mermaid
flowchart TD
    CONNECTED["연결됨\n(정상 편집)"]
    RECONNECTING["재연결 중\n(자동 재시도)"]
    DISCONNECTED["연결 끊김\n(오프라인 모드)"]

    CONNECTED -->|네트워크 끊김| RECONNECTING
    RECONNECTING -->|재연결 성공| CONNECTED
    RECONNECTING -->|3회 실패| DISCONNECTED
    DISCONNECTED -->|네트워크 복구| RECONNECTING

    CONNECTED -->|정상 종료| END_NODE((종료))
```

### 프로세스 상세

| 단계 | 행위자 | 입력 | 처리 | 출력 |
|------|--------|------|------|------|
| 1. WS 연결 | 클라이언트 | 노트 ID | WebSocket 핸드셰이크 | 연결 수립 |
| 2. JWT 인증 | 서버 | JWT 토큰 | 토큰 검증 + 권한 확인 | 인증 결과 |
| 3. 방 입장 | 서버 | 노트 ID | 방 목록에 사용자 추가 | 접속자 목록 |
| 4. 상태 동기화 | 서버 | - | 최신 문서 상태 전송 | 현재 문서 |
| 5. 편집 동기화 | 클라이언트↔서버 | 편집 델타 | Redis Pub/Sub 브로드캐스트 | 동기화된 문서 |
| 6. 방 퇴장 | 서버 | 연결 종료 | 방 목록에서 제거 | 갱신된 접속자 |

### Redis Pub/Sub 메시지 구조

| 메시지 유형 | 채널 | 페이로드 |
|------------|------|---------|
| edit | `note_{id}` | `{userId, delta, revision}` |
| cursor | `note_{id}` | `{userId, position, selection}` |
| join | `note_{id}` | `{userId, userName, avatarUrl}` |
| leave | `note_{id}` | `{userId}` |

---

## 4. 인벤토리 프로세스

### 전체 프로세스 흐름도

```mermaid
flowchart TD
    START((시작)) --> REGISTER[항목 등록\nPOST /api/inventory]

    REGISTER --> INIT["초기 등록\n품목명, 바코드, 수량, 단위, 만료일"]
    INIT --> SAVE_ITEM["항목 저장\n이력 기록: 'REGISTER'"]

    SAVE_ITEM --> LIFECYCLE["인벤토리 운영"]

    subgraph 수량_조정["수량 조정 프로세스"]
        LIFECYCLE --> ADJUST_TYPE{조정 유형}

        ADJUST_TYPE -->|입고 IN| STOCK_IN["수량 증가\ncurrent += amount"]
        ADJUST_TYPE -->|출고 OUT| CHECK_STOCK{재고 충분?}
        ADJUST_TYPE -->|조정 ADJUST| STOCK_ADJUST["수량 직접 설정\ncurrent = amount"]

        CHECK_STOCK -->|부족| ERROR_STOCK["오류: 재고 부족"]
        ERROR_STOCK --> LIFECYCLE
        CHECK_STOCK -->|충분| STOCK_OUT["수량 감소\ncurrent -= amount"]

        STOCK_IN --> LOG_HISTORY["이력 기록\n유형, 수량, 사유, 시각, 담당자"]
        STOCK_OUT --> LOG_HISTORY
        STOCK_ADJUST --> LOG_HISTORY
    end

    LOG_HISTORY --> CHECK_THRESHOLD{재고 부족\n임계값 확인}
    CHECK_THRESHOLD -->|정상| LIFECYCLE
    CHECK_THRESHOLD -->|부족| ALERT_LOW["부족 알림 발송\n담당자에게 알림"]
    ALERT_LOW --> LIFECYCLE

    subgraph 만료_관리["만료 관리 (배치)"]
        BATCH_TRIGGER["일일 배치 실행\n매일 09:00"]
        BATCH_TRIGGER --> CHECK_EXPIRY["만료일 확인\n(7일 이내)"]
        CHECK_EXPIRY --> EXPIRY_ALERT{만료 임박\n항목 있음?}
        EXPIRY_ALERT -->|있음| SEND_ALERT["만료 임박 알림\n담당자에게 발송"]
        EXPIRY_ALERT -->|없음| BATCH_END["배치 종료"]

        SEND_ALERT --> CHECK_EXPIRED["만료된 항목 확인"]
        CHECK_EXPIRED --> EXPIRED{만료된\n항목?}
        EXPIRED -->|있음| MARK_EXPIRED["상태 변경: EXPIRED\n사용 차단"]
        EXPIRED -->|없음| BATCH_END
        MARK_EXPIRED --> BATCH_END
    end
```

### 수량 조정 이력

```mermaid
flowchart LR
    subgraph 이력_예시["수량 변동 이력"]
        R["등록\n+100"]
        O1["출고\n-20"]
        I1["입고\n+50"]
        O2["출고\n-30"]
        A1["조정\n=90"]
    end

    R -->|"잔량: 100"| O1 -->|"잔량: 80"| I1 -->|"잔량: 130"| O2 -->|"잔량: 100"| A1 -->|"잔량: 90"| CURRENT["현재 수량: 90"]
```

### 프로세스 상세

| 단계 | 행위자 | 입력 | 처리 | 출력 |
|------|--------|------|------|------|
| 1. 항목 등록 | 사용자 | 품목 정보 | Inventory 엔티티 생성 | 항목 ID |
| 2. 입고 (IN) | 사용자 | 수량, 사유 | current += amount | 갱신된 수량 |
| 3. 출고 (OUT) | 사용자 | 수량, 사유 | 재고 확인 → current -= amount | 갱신된 수량 |
| 4. 조정 (ADJUST) | 관리자 | 수량, 사유 | current = amount (강제) | 갱신된 수량 |
| 5. 이력 기록 | 시스템 | 변동 정보 | InventoryHistory 생성 | 이력 레코드 |
| 6. 부족 알림 | 시스템 | 현재 수량 | 임계값 비교 → 알림 | 알림 발송 |
| 7. 만료 확인 | 배치 | 만료일 | 7일 이내 → 알림, 초과 → 차단 | 상태 변경 |

### 알림 규칙

| 알림 유형 | 조건 | 수신자 | 채널 |
|----------|------|--------|------|
| 재고 부족 | 현재 수량 < 최소 임계값 | 항목 담당자 | 앱 내 알림 |
| 만료 임박 (7일) | 만료일 - 오늘 ≤ 7일 | 항목 담당자 | 앱 내 알림 |
| 만료 임박 (1일) | 만료일 - 오늘 ≤ 1일 | 항목 담당자 + 관리자 | 앱 내 알림 |
| 만료됨 | 만료일 < 오늘 | 관리자 | 앱 내 알림 |
