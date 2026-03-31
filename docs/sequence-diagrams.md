# LabNote ELN - 시퀀스 다이어그램

> 전자연구노트(ELN) 협업 플랫폼의 핵심 흐름 8가지를 시퀀스 다이어그램으로 정리한 문서입니다.

---

## 목차

1. [로그인 / 토큰 갱신 / 로그아웃](#1-로그인--토큰-갱신--로그아웃)
2. [연구노트 작성 및 저장](#2-연구노트-작성-및-저장)
3. [실시간 협업 편집](#3-실시간-협업-편집)
4. [전자서명 → 상태 전환](#4-전자서명--상태-전환)
5. [관리자 잠금 해제](#5-관리자-잠금-해제)
6. [PDF/ZIP 내보내기](#6-pdfzip-내보내기)
7. [통합 검색](#7-통합-검색)
8. [인벤토리 수량 변경 및 재고 경고](#8-인벤토리-수량-변경-및-재고-경고)

---

## 1. 로그인 / 토큰 갱신 / 로그아웃

### 1-1. 로그인

```mermaid
sequenceDiagram
    actor User as 사용자
    participant FE as Frontend<br/>(React)
    participant GW as API Gateway<br/>(:8000)
    participant Auth as Auth Service<br/>(:8001)
    participant DB as PostgreSQL<br/>(auth schema)
    participant Redis as Redis

    User->>FE: 이메일/비밀번호 입력 후 로그인 클릭
    FE->>GW: POST /api/auth/login<br/>{email, password}
    Note over GW: 공개 경로 — JWT 검증 생략
    GW->>Auth: 프록시 전달

    Auth->>DB: SELECT user WHERE email<br/>(+ role, teams 조인)
    DB-->>Auth: 사용자 정보
    Auth->>Auth: bcrypt.compare(password, hash)
    alt 비밀번호 불일치 또는 비활성 계정
        Auth-->>FE: 401 {ok:false, error:"이메일 또는 비밀번호가 올바르지 않습니다"}
    end
    Auth->>Auth: Access Token 생성 (15분)<br/>payload: sub, email, role, permissions, orgId, teams
    Auth->>Auth: Refresh Token 생성 (8시간)<br/>payload: sub, type:'refresh'
    Auth-->>GW: {ok:true, data:{token, refreshToken, user}}
    GW-->>FE: 응답 전달

    FE->>FE: Access Token → 메모리 저장
    FE->>GW: POST /api/auth/session<br/>{refreshToken}
    GW->>GW: Set-Cookie: labnote_rt={refreshToken}<br/>HttpOnly; Secure; SameSite=Strict; Path=/api/auth/session; Max-Age=28800
    GW-->>FE: 200 OK
    FE->>User: 대시보드로 이동
```

### 1-2. 토큰 갱신 (자동)

```mermaid
sequenceDiagram
    participant FE as Frontend<br/>(React)
    participant GW as API Gateway<br/>(:8000)
    participant Auth as Auth Service<br/>(:8001)
    participant Redis as Redis

    Note over FE: Access Token 만료 감지 (15분)
    FE->>GW: POST /api/auth/session/refresh<br/>Cookie: labnote_rt={refreshToken}
    GW->>GW: 쿠키에서 Refresh Token 추출
    GW->>Auth: POST /api/auth/refresh<br/>x-user-id 헤더 주입

    Auth->>Auth: Refresh Token 서명 검증<br/>type='refresh' 확인
    Auth->>Redis: GET blacklist:user:{userId}
    alt 사용자 무효화 존재 & token.iat < 무효화 시각
        Auth-->>FE: 401 "권한이 변경되었습니다" → 로그인 페이지 이동
    end
    Auth->>Auth: 새 Access Token (15분) 발급
    Auth->>Auth: 새 Refresh Token (8시간) 발급
    Auth-->>GW: {token, refreshToken}

    GW->>GW: Set-Cookie: labnote_rt={newRefreshToken}<br/>기존 쿠키 교체
    GW-->>FE: {ok:true, data:{token}}
    FE->>FE: 새 Access Token → 메모리 교체
```

### 1-3. 로그아웃

```mermaid
sequenceDiagram
    actor User as 사용자
    participant FE as Frontend<br/>(React)
    participant GW as API Gateway<br/>(:8000)
    participant Auth as Auth Service<br/>(:8001)
    participant Redis as Redis

    User->>FE: 로그아웃 클릭
    FE->>GW: POST /api/auth/logout<br/>Authorization: Bearer {accessToken}
    GW->>Auth: 프록시 전달
    Auth->>Auth: 토큰에서 만료시각(exp) 추출
    Auth->>Redis: SET blacklist:{token} "1"<br/>TTL = 남은 만료 시간
    Auth-->>GW: {ok:true}

    FE->>GW: DELETE /api/auth/session
    GW->>GW: Set-Cookie: labnote_rt=;<br/>Max-Age=0 (쿠키 삭제)
    GW-->>FE: 200 OK
    FE->>FE: 메모리의 Access Token 삭제
    FE->>User: 로그인 페이지로 이동
```

### 1-4. API 요청 시 Gateway JWT 검증

```mermaid
sequenceDiagram
    participant FE as Frontend
    participant GW as API Gateway<br/>(:8000)
    participant Redis as Redis
    participant Svc as 내부 서비스

    FE->>GW: API 요청<br/>Authorization: Bearer {token}

    GW->>GW: ① 내부 헤더 제거<br/>(x-user-id, x-user-role 등 스푸핑 방지)
    GW->>GW: ② 공개 경로 확인 (/health, /login 등)
    GW->>GW: ③ /internal 경로 차단 (404)
    GW->>Redis: ④ GET blacklist:{token}
    alt 블랙리스트 존재
        GW-->>FE: 401 "만료된 세션"
    end
    GW->>GW: ⑤ JWT 서명 검증 (JWT_SECRET)
    GW->>Redis: ⑥ GET blacklist:user:{userId}
    alt 사용자 무효화 & iat < 무효화 시각
        GW-->>FE: 401 "권한이 변경되었습니다"
    end
    GW->>GW: ⑦ 내부 헤더 주입<br/>x-user-id, x-user-role, x-user-email,<br/>x-user-permissions, x-user-org-id,<br/>x-user-team-ids, x-user-team-roles
    GW->>Svc: ⑧ 프록시 전달 (+ 주입된 헤더)
    Svc-->>GW: 응답
    GW-->>FE: 응답 전달
```

---

## 2. 연구노트 작성 및 저장

### 2-1. 노트 생성

```mermaid
sequenceDiagram
    actor Researcher as 연구자
    participant FE as Frontend
    participant GW as API Gateway<br/>(:8000)
    participant ELN as ELN Service<br/>(:8002)
    participant DB as PostgreSQL<br/>(eln schema)
    participant Search as Search Service<br/>(:8006)
    participant Audit as Signature-Audit<br/>(:8003)

    Researcher->>FE: 새 연구노트 작성 클릭
    FE->>GW: POST /api/notes<br/>{title, content, type:'note', tags, templateId?}
    GW->>GW: JWT 검증 + 헤더 주입
    GW->>ELN: 프록시 전달

    ELN->>DB: INSERT INTO note<br/>(id, title, content, status:'draft',<br/>authorId, orgId, tags)
    DB-->>ELN: 생성된 노트

    ELN->>DB: INSERT INTO noteRevision<br/>(revision:1, content, changedBy,<br/>changeSummary:'노트 생성')

    opt templateId가 있는 경우
        ELN->>DB: UPDATE template<br/>SET useCount = useCount + 1
    end

    par 비동기 (fire-and-forget)
        ELN-)Search: POST /api/search/index<br/>{id, domainType:'NOTE', title, content,<br/>tags, orgId}<br/>x-internal-secret 인증
    and
        ELN-)Audit: POST (감사로그)<br/>{action:'note.created', entityId, actorId}
    end

    ELN-->>GW: 201 {ok:true, data:note}
    GW-->>FE: 응답 전달
    FE-->>Researcher: 에디터 화면으로 이동
```

### 2-2. 노트 수정 (저장)

```mermaid
sequenceDiagram
    actor Researcher as 연구자
    participant FE as Frontend
    participant GW as API Gateway<br/>(:8000)
    participant ELN as ELN Service<br/>(:8002)
    participant DB as PostgreSQL<br/>(eln schema)
    participant Search as Search Service<br/>(:8006)
    participant Audit as Signature-Audit<br/>(:8003)

    Researcher->>FE: 노트 내용 수정 후 저장
    FE->>GW: PUT /api/notes/:id<br/>{title, content, sections, tags, changeSummary}
    GW->>ELN: 프록시 전달

    ELN->>DB: SELECT note WHERE id AND orgId
    alt 노트 없음
        ELN-->>FE: 404 NOTE_NOT_FOUND
    end
    alt 상태가 locked 또는 signed
        ELN-->>FE: 403 NOTE_LOCKED / NOTE_SIGNED
    end
    ELN->>ELN: 소유자 또는 Admin 확인

    ELN->>DB: UPDATE note SET title, content, sections, tags
    ELN->>DB: SELECT COUNT(*) FROM noteRevision WHERE noteId
    ELN->>DB: INSERT INTO noteRevision<br/>(revision: count+1, content, changedBy,<br/>changeSummary:'노트 수정')

    par 비동기 (fire-and-forget)
        ELN-)Search: POST /api/search/index<br/>(재인덱싱)
    and
        ELN-)Audit: POST (감사로그)<br/>{action:'note.updated', changedFields:[...]}
    end

    ELN-->>GW: 200 {ok:true, data:updatedNote}
    GW-->>FE: 응답 전달
    FE-->>Researcher: 저장 완료 토스트
```

---

## 3. 실시간 협업 편집

```mermaid
sequenceDiagram
    actor Alice as 연구자 A (Alice)
    actor Bob as 연구자 B (Bob)
    participant WS as Collab Service<br/>(:8009 WebSocket)
    participant Redis as Redis<br/>(pub/sub)

    Note over Alice,Redis: Alice가 먼저 노트 편집 화면 진입

    Alice->>WS: WebSocket 연결<br/>ws://.../collab/notes/{noteId}?token={jwt}
    WS->>WS: JWT 검증 + 사용자 정보 추출
    WS->>WS: 방(Room)에 Alice 추가<br/>colorIdx: 0 할당
    WS-->>Alice: {type:'joined', users:[]}

    Note over Bob,Redis: Bob이 같은 노트에 진입

    Bob->>WS: WebSocket 연결
    WS->>WS: 방에 Bob 추가, colorIdx: 1
    WS-->>Bob: {type:'joined', users:[{id:'alice', colorIdx:0}]}
    WS-->>Alice: {type:'user-joined', userId:'bob', colorIdx:1}
    WS->>Redis: PUBLISH labnote:collab<br/>{noteId, payload:'user-joined', sourceUserId:'bob'}

    Note over Alice,Redis: Alice가 내용 편집 (400ms 디바운스 후 전송)

    Alice->>WS: {type:'content-update', content:'실험 결과...'}
    WS-->>Bob: {type:'content-update', userId:'alice',<br/>content:'실험 결과...', colorIdx:0}
    WS->>Redis: PUBLISH labnote:collab<br/>{noteId, payload:'content-update', sourceUserId:'alice'}
    Note over Bob: 1초 이내 자신의 편집이면 무시,<br/>아니면 에디터에 반영 (last-write-wins)

    Note over Alice,Redis: Alice가 커서 이동

    Alice->>WS: {type:'awareness', cursorLine:15}
    WS-->>Bob: {type:'awareness', userId:'alice', cursorLine:15, colorIdx:0}
    WS->>Redis: PUBLISH labnote:collab (다른 인스턴스에도 전파)

    Note over Bob,Redis: Bob이 편집 화면을 떠남

    Bob->>WS: WebSocket 연결 종료
    WS->>WS: 방에서 Bob 제거
    WS-->>Alice: {type:'user-left', userId:'bob'}
    WS->>Redis: PUBLISH labnote:collab<br/>{noteId, payload:'user-left', sourceUserId:'bob'}
```

---

## 4. 전자서명 → 상태 전환

```mermaid
sequenceDiagram
    actor Reviewer as 검토자(Reviewer)
    participant FE as Frontend
    participant GW as API Gateway<br/>(:8000)
    participant SIG as Signature-Audit<br/>(:8003)
    participant Auth as Auth Service<br/>(:8001)
    participant DB_sig as PostgreSQL<br/>(signature schema)
    participant Redis as Redis Stream
    participant ELN as ELN Service<br/>(:8002)
    participant DB_eln as PostgreSQL<br/>(eln schema)

    Reviewer->>FE: 서명 버튼 클릭 + 비밀번호 입력
    FE->>GW: POST /api/signatures/sign/:noteId<br/>{password, comment}
    GW->>GW: JWT 검증 + 헤더 주입
    GW->>SIG: 프록시 전달

    SIG->>Auth: POST /api/auth/internal/verify-password<br/>{userId, password}<br/>x-internal-secret 인증
    Auth->>Auth: bcrypt.compare 검증
    Auth-->>SIG: {verified: true}
    alt 비밀번호 불일치
        SIG-->>FE: 400 SIGNATURE_PASSWORD_INVALID
    end

    SIG->>ELN: GET /api/notes/:noteId (내부 호출)
    ELN-->>SIG: 노트 정보 (authorId, teamId, status)

    SIG->>SIG: 권한 검증<br/>- 자기 서명 차단 (admin 제외)<br/>- reviewer/admin/팀장 확인

    SIG->>DB_sig: SELECT signature WHERE noteId<br/>ORDER BY chainIndex DESC LIMIT 1
    DB_sig-->>SIG: 이전 서명 (prevHash)

    SIG->>SIG: 해시체인 생성<br/>hashInput = noteId:signerId:timestamp:prevHash:comment<br/>signatureHash = sha256(hashInput)

    SIG->>DB_sig: INSERT INTO signature<br/>(noteId, signerId, signatureHash,<br/>prevHash, chainIndex, status:'valid')

    SIG->>DB_sig: INSERT INTO auditLog<br/>(action:'signed', entityId:noteId)

    SIG->>Redis: XADD labnote:events *<br/>type=NOTE_SIGNED noteId={id}<br/>status=signed userId={signerId}
    Note over Redis: Redis Stream 이벤트 발행

    alt Redis 실패 시 HTTP 폴백
        SIG->>ELN: PATCH /api/notes/:id/status<br/>{status:'signed'}<br/>x-user-role: system
    end

    opt 서명자 ≠ 작성자
        SIG->>DB_sig: INSERT INTO notification<br/>(recipientId:authorId, type:'NOTE_SIGNED',<br/>title:'연구노트가 서명되었습니다')
    end

    SIG-->>GW: 201 {ok:true, data:signature}
    GW-->>FE: 응답 전달
    FE-->>Reviewer: 서명 완료 안내

    Note over Redis,ELN: 비동기 이벤트 소비 (Consumer Group: eln-service)

    Redis->>ELN: NOTE_SIGNED 이벤트 수신
    ELN->>DB_eln: UPDATE note SET status='signed'<br/>WHERE id={noteId}
    ELN->>DB_eln: INSERT INTO noteStatusHistory<br/>(fromStatus:'in_progress', toStatus:'signed')
    ELN->>DB_eln: INSERT INTO auditLog (이중 기록)
    ELN->>Redis: XACK labnote:events (처리 완료)
```

---

## 5. 관리자 잠금 해제

```mermaid
sequenceDiagram
    actor Admin as 관리자(Admin)
    participant FE as Frontend
    participant GW as API Gateway<br/>(:8000)
    participant ELN as ELN Service<br/>(:8002)
    participant Auth as Auth Service<br/>(:8001)
    participant DB as PostgreSQL<br/>(eln schema)
    participant Audit as Signature-Audit<br/>(:8003)

    Admin->>FE: 잠금 해제 클릭 + 비밀번호/사유 입력
    FE->>GW: POST /api/notes/:id/admin-unlock<br/>{adminPassword, reason}
    GW->>GW: JWT 검증 + 헤더 주입
    GW->>ELN: 프록시 전달

    ELN->>ELN: requireRole(ADMIN) +<br/>requirePermission(NOTE_UNLOCK) 확인

    ELN->>DB: SELECT note WHERE id AND orgId
    alt 노트 없음
        ELN-->>FE: 404 NOTE_NOT_FOUND
    end
    alt 상태가 locked가 아닌 경우
        ELN-->>FE: 400 "잠긴 상태가 아닙니다"
    end

    ELN->>Auth: POST /api/auth/internal/verify-password<br/>{userId:adminId, password:adminPassword}<br/>x-internal-secret 인증
    Auth->>Auth: bcrypt.compare 검증
    Auth-->>ELN: {verified: true}
    alt 비밀번호 불일치
        ELN-->>FE: 400 NOTE_ADMIN_PASSWORD_INVALID
    end

    ELN->>DB: UPDATE note SET status='draft'<br/>WHERE id={noteId}

    ELN->>DB: INSERT INTO noteStatusHistory<br/>(fromStatus:'locked', toStatus:'draft',<br/>changedBy:adminId, reason, isAdminAction:true)

    par 비동기
        ELN-)Audit: 감사로그 기록<br/>{action:'note.admin_unlocked', reason}
    and
        opt 작성자 ≠ 관리자
            ELN-)Audit: 알림 발송<br/>(recipientId:authorId, type:'NOTE_UNLOCKED',<br/>'노트의 잠금이 관리자에 의해 해제되었습니다')
        end
    end

    ELN-->>GW: 200 {ok:true, data:note, message:'잠금이 해제되었습니다'}
    GW-->>FE: 응답 전달
    FE-->>Admin: 상태 변경 반영 (locked → draft)
```

---

## 6. PDF/ZIP 내보내기

```mermaid
sequenceDiagram
    actor User as 사용자
    participant FE as Frontend
    participant GW as API Gateway<br/>(:8000)
    participant SIG as Signature-Audit<br/>(:8003)
    participant DB_sig as PostgreSQL<br/>(signature schema)
    participant BullMQ as BullMQ<br/>(Redis 큐)
    participant Worker as Export Worker
    participant ELN as ELN Service<br/>(:8002)
    participant Puppet as Puppeteer<br/>(PDF 렌더링)
    participant File as File Service<br/>(:8008)
    participant MinIO as MinIO<br/>(S3 스토리지)
    participant Redis as Redis<br/>(pub/sub)

    User->>FE: PDF 내보내기 클릭
    FE->>GW: POST /api/export/pdf/:noteId
    GW->>SIG: 프록시 전달

    SIG->>DB_sig: INSERT INTO exportJob<br/>(noteId, format:'pdf', status:'pending',<br/>requestedBy, orgId)
    SIG->>BullMQ: exportQueue.add('pdf',<br/>{jobId, noteId, format, requestedBy, orgId})
    SIG->>DB_sig: INSERT INTO auditLog<br/>(action:'export_requested')
    SIG-->>GW: 202 Accepted<br/>{jobId, status:'pending'}
    GW-->>FE: 응답 전달

    FE->>GW: SSE 연결<br/>GET /api/events/exports
    GW->>Redis: SUBSCRIBE export-status
    Note over FE,GW: SSE 연결 유지 (30초 heartbeat)

    Note over BullMQ,Worker: Worker가 큐에서 작업 가져옴 (concurrency: 2)

    BullMQ->>Worker: 작업 수신
    Worker->>DB_sig: UPDATE exportJob<br/>SET status='processing'
    Worker->>Redis: PUBLISH export-status<br/>{jobId, progress:10%}
    Redis-->>GW: export-status 메시지
    GW-->>FE: SSE event: {progress:10%}

    Worker->>ELN: GET /api/notes/:noteId<br/>(내부 호출)
    ELN-->>Worker: 노트 데이터
    Worker->>DB_sig: SELECT signature<br/>WHERE noteId (서명 정보)
    Worker->>Worker: Handlebars 템플릿 컴파일
    Worker->>Puppet: HTML → PDF 변환<br/>(A4, printBackground)
    Puppet-->>Worker: PDF Buffer

    Worker->>Redis: PUBLISH export-status<br/>{jobId, progress:80%}
    Redis-->>GW: export-status 메시지
    GW-->>FE: SSE event: {progress:80%}

    Worker->>File: POST /api/exports/internal/upload<br/>FormData: {file, jobId, format}<br/>x-internal-secret 인증
    File->>MinIO: PutObject<br/>(bucket:'labnote-exports',<br/>key:'pdf/{jobId}/export-{date}.pdf')
    MinIO-->>File: 업로드 완료
    File->>MinIO: PresignedGetObject (24시간 유효)
    MinIO-->>File: presigned URL
    File-->>Worker: {fileId, downloadUrl}

    Worker->>DB_sig: UPDATE exportJob<br/>SET status='completed',<br/>fileUrl, fileId, completedAt
    Worker->>DB_sig: INSERT INTO auditLog<br/>(action:'export_completed')
    Worker->>Redis: PUBLISH export-status<br/>{jobId, status:'completed', fileUrl, progress:100%}
    Redis-->>GW: export-status 메시지
    GW-->>FE: SSE event: {status:'completed', fileUrl}

    FE-->>User: 다운로드 버튼 활성화
    User->>FE: 다운로드 클릭
    FE->>MinIO: GET presigned URL (직접 다운로드)
    MinIO-->>FE: PDF 파일 스트림
```

---

## 7. 통합 검색

```mermaid
sequenceDiagram
    actor User as 사용자
    participant FE as Frontend
    participant GW as API Gateway<br/>(:8000)
    participant Search as Search Service<br/>(:8006)
    participant Redis as Redis<br/>(캐시)
    participant OS as OpenSearch
    participant DB as PostgreSQL<br/>(search schema)

    Note over User,FE: 검색창에 키워드 입력 중

    User->>FE: 검색어 타이핑 (예: "세포 배양")
    FE->>GW: GET /api/search/suggest?q=세포 배양
    GW->>Search: 프록시 전달

    Search->>OS: multi_match 쿼리<br/>fields: title^3, tags^2<br/>type: phrase_prefix<br/>filter: orgId, docStatus='active'
    OS-->>Search: 상위 7건 매칭 결과
    Search-->>FE: [{text, domainType, docId}, ...]
    FE-->>User: 자동완성 드롭다운 표시

    Note over User,FE: Enter 또는 검색 버튼 클릭

    User->>FE: 검색 실행
    FE->>GW: GET /api/search?q=세포 배양<br/>&domainTypes=NOTE,PROTOCOL&page=1&size=20
    GW->>Search: 프록시 전달

    Search->>Search: 캐시 키 생성<br/>SHA256(q + domainTypes + page + userId + orgId)
    Search->>Redis: GET cache:{hash}
    alt 캐시 히트 (3분 TTL)
        Redis-->>Search: 캐시된 결과
        Search-->>FE: 즉시 응답
    end

    Search->>OS: bool 쿼리 실행<br/>must: multi_match (title^4, tags^3,<br/>summary^2, content^1, fuzziness:AUTO)<br/>filter: orgId, docStatus='active',<br/>domainTypes, 권한 필터(소유자+공개범위)
    OS-->>Search: 검색 결과 + 하이라이트 스니펫 +<br/>domainType별 집계(aggregation)

    Search->>Search: 결과 매핑<br/>(docId, title, snippet, score, highlight)

    par 비동기
        Search-)DB: INSERT INTO searchHistory<br/>(userId, query, orgId)
    and
        Search-)Redis: SET cache:{hash} {results}<br/>EX 180 (3분 캐시)
    end

    Search-->>GW: {results[], counts:{NOTE:12, PROTOCOL:3},<br/>pagination, took}
    GW-->>FE: 응답 전달
    FE-->>User: 검색 결과 목록 + 도메인별 탭 카운트 표시
```

---

## 8. 인벤토리 수량 변경 및 재고 경고

### 8-1. 수량 입출고

```mermaid
sequenceDiagram
    actor User as 연구자
    participant FE as Frontend
    participant GW as API Gateway<br/>(:8000)
    participant INV as Inventory Service<br/>(:8004)
    participant DB as PostgreSQL<br/>(inventory schema)
    participant Search as Search Service<br/>(:8006)

    User->>FE: 시약 출고 수량 입력<br/>(예: Ethanol 500ml 출고)
    FE->>GW: POST /api/inventory/items/:id/quantity<br/>{changeType:'out', quantity:500, reason:'실험 사용'}
    GW->>INV: 프록시 전달

    INV->>DB: SELECT inventoryItem WHERE id AND orgId
    INV->>INV: 현재 수량 확인 (예: 2000ml)
    INV->>INV: 계산: before=2000, delta=-500, after=1500

    alt changeType='out' & 재고 부족
        INV-->>FE: 400 ITEM_STOCK_INSUFFICIENT<br/>"재고가 부족합니다"
    end

    INV->>INV: 자동 상태 전환 판단<br/>after=0 → 'depleted'<br/>depleted & after>0 → 'available'

    rect rgb(240, 248, 255)
        Note over INV,DB: 트랜잭션 (Transaction)
        INV->>DB: UPDATE inventoryItem<br/>SET quantity=1500, status='available'
        INV->>DB: INSERT INTO inventoryHistory<br/>(changeType:'out', quantityBefore:2000,<br/>quantityAfter:1500, quantityDelta:-500,<br/>reason:'실험 사용', performedBy:userId)
    end

    INV-)Search: POST /api/search/index (비동기 재인덱싱)

    INV-->>GW: 200 {ok:true, data:{item, before:2000, after:1500, delta:-500}}
    GW-->>FE: 응답 전달
    FE-->>User: 수량 변경 완료 표시
```

### 8-2. 재고 경고 (대시보드)

```mermaid
sequenceDiagram
    actor Admin as 관리자
    participant FE as Frontend
    participant GW as API Gateway<br/>(:8000)
    participant INV as Inventory Service<br/>(:8004)
    participant DB as PostgreSQL<br/>(inventory schema)
    participant Redis as Redis<br/>(캐시)

    Admin->>FE: 대시보드 접근
    FE->>GW: GET /api/dashboard/org
    GW->>Redis: GET cache:dashboard:org:{orgId}

    alt 캐시 미스 (5분 TTL)
        par Gateway가 여러 서비스에 병렬 요청 (Promise.allSettled)
            GW->>INV: GET /api/inventory/alerts/low-stock
            INV->>DB: SELECT items WHERE<br/>(quantity <= minQuantity)<br/>AND status NOT IN ('disposed','depleted')
            INV-->>GW: 재고 부족 항목 목록
        and
            GW->>INV: GET /api/inventory/alerts/expiring?days=30
            INV->>DB: SELECT items WHERE<br/>expiryDate <= NOW() + 30일<br/>AND status NOT IN ('disposed','depleted')
            INV->>INV: 각 항목 daysLeft 계산<br/>isExpired: daysLeft < 0<br/>isWarning: daysLeft <= expiryWarningDays
            INV-->>GW: 만료 임박 항목 목록
        and
            Note over GW: + ELN, Scheduler, Audit 등<br/>다른 서비스 통계도 병렬 수집
        end

        GW->>GW: 응답 집계<br/>(lowStockItems 상위 5건,<br/>expiringItems 상위 5건 포함)
        GW->>Redis: SET cache:dashboard:org:{orgId}<br/>EX 300 (5분 캐시)
    end

    GW-->>FE: 대시보드 데이터
    FE-->>Admin: 재고 부족 경고 카드 표시<br/>만료 임박 경고 카드 표시
```

---

## 부록: 서비스 간 통신 요약

```mermaid
flowchart TB
    subgraph External["외부 접근"]
        FE[Frontend :5173]
    end

    subgraph GW["API Gateway :8000"]
        JWT[JWT 검증]
        Proxy[프록시 / 대시보드 집계]
        SSE[SSE 이벤트]
        RL[Rate Limiter]
    end

    subgraph Services["내부 서비스"]
        Auth[Auth :8001]
        ELN[ELN :8002]
        SIG[Signature-Audit :8003]
        INV[Inventory :8004]
        SCHED[Scheduler :8005]
        SRCH[Search :8006]
        FILE[File :8008]
        COLLAB[Collab :8009 WS]
    end

    subgraph Infra["인프라"]
        PG[(PostgreSQL)]
        Redis[(Redis)]
        OS[(OpenSearch)]
        MinIO[(MinIO)]
    end

    FE -->|HTTP| GW
    FE -->|WebSocket| COLLAB
    GW --> Auth & ELN & SIG & INV & SCHED & SRCH & FILE

    Auth --> PG & Redis
    ELN --> PG & Redis
    SIG --> PG & Redis
    INV --> PG
    SCHED --> PG
    SRCH --> PG & OS & Redis
    FILE --> PG & MinIO
    COLLAB --> Redis

    SIG -.->|Redis Stream<br/>NOTE_SIGNED| ELN
    ELN -.->|HTTP 인덱싱| SRCH
    INV -.->|HTTP 인덱싱| SRCH
    SIG -.->|BullMQ 작업| FILE
    ELN -.->|HTTP 비밀번호 검증| Auth
    SIG -.->|HTTP 비밀번호 검증| Auth

    style GW fill:#2F5496,color:#fff
    style Redis fill:#DC382D,color:#fff
    style PG fill:#336791,color:#fff
    style OS fill:#005EB8,color:#fff
    style MinIO fill:#C72C48,color:#fff
```

---

## 부록: 이벤트 흐름 매핑

| 이벤트 | 방식 | 발행자 | 구독자 | 트리거 |
|--------|------|--------|--------|--------|
| `NOTE_SIGNED` | Redis Stream (`labnote:events`) | Signature-Audit | ELN Service | 전자서명 완료 |
| `note.created/updated` | HTTP POST (내부) | ELN Service | Search Service | 노트 CRUD |
| `inventory.indexed` | HTTP POST (내부) | Inventory Service | Search Service | 인벤토리 CRUD |
| `export-status` | Redis Pub/Sub | Export Worker | API Gateway (SSE) | 내보내기 진행률 |
| `labnote:collab` | Redis Pub/Sub | Collab Service | Collab Service (다른 인스턴스) | 실시간 편집 |
| `NOTE_LOCKED/UNLOCKED` | HTTP POST (내부) | ELN Service | Signature-Audit (알림) | 상태 변경 |

---

> 이 문서는 실제 소스 코드 기반으로 작성되었습니다. 서비스 코드 변경 시 다이어그램도 함께 업데이트해주세요.
