# 검색 인덱싱 & 조회 시퀀스 다이어그램

## 1. 검색 인덱싱 (노트 생성/수정 시)

```mermaid
sequenceDiagram
    participant ELN as ELN Service :8002
    participant Search as Search Service :8006
    participant OS as OpenSearch
    participant Redis as Redis Cache

    Note over ELN: 노트 생성 또는 수정 완료 후

    ELN->>Search: POST /api/search/index<br/>x-internal-secret<br/>{id, title, content, type,<br/>docStatus, authorId, orgId, tags, ...}
    Note over ELN: Fire-and-forget<br/>.catch(() => {}) — 실패해도 무시

    Search->>Search: requireInternalSecretFastify 검증
    Search->>OS: PUT /labnote-notes/_doc/{id}<br/>{title, content, docStatus,<br/>createdAt, orgId, visibility, ...}

    OS-->>Search: 201 Created / 200 Updated
    Search->>Redis: DEL cache:search:* (캐시 무효화)
    Search-->>ELN: 200 OK (이미 무시됨)
```

## 2. 검색 인덱스 삭제 (노트 삭제 시)

```mermaid
sequenceDiagram
    participant ELN as ELN Service :8002
    participant Search as Search Service :8006
    participant OS as OpenSearch

    Note over ELN: 노트 소프트 삭제 후

    ELN->>Search: DELETE /api/search/index/{noteId}<br/>x-internal-secret
    Note over ELN: Fire-and-forget

    Search->>OS: DELETE /labnote-notes/_doc/{noteId}
    OS-->>Search: 200 OK
```

## 3. 사용자 검색 요청

```mermaid
sequenceDiagram
    actor User
    participant FE as Frontend
    participant GW as API Gateway :8000
    participant Search as Search Service :8006
    participant Redis as Redis Cache
    participant OS as OpenSearch

    User->>FE: 검색어 입력 + 필터 설정
    FE->>GW: GET /api/search?q=실험결과<br/>&domainTypes=NOTE,PROTOCOL<br/>&status=signed&page=1&limit=20
    Note over GW: Rate Limit: 60 req/60s
    GW->>Search: 프록시 + 헤더 주입

    Search->>Search: requireAuth
    Search->>Search: 캐시 키 생성<br/>cache:search:{hash(query+filters+userId)}

    Search->>Redis: GET cache:search:{key}

    alt 캐시 히트
        Redis-->>Search: 캐시된 결과
        Search-->>GW: 200 {ok: true, data: {results, total}}
    else 캐시 미스
        Search->>Search: 권한 필터 빌드

        Note over Search: OpenSearch 쿼리 구성:<br/>must: {multi_match: "실험결과"}<br/>filter: [<br/>  {term: orgId},<br/>  {terms: domainTypes},<br/>  {term: status},<br/>  {bool: should: [<br/>    {term: authorId: userId},<br/>    {term: visibility: "public"},<br/>    {terms: teamId: userTeamIds}<br/>  ]}<br/>]

        Search->>OS: POST /labnote-notes/_search<br/>{query, highlight, from, size}

        OS-->>Search: {hits: [{_source, highlight}, ...], total}

        Search->>Search: 결과 가공 (하이라이트 포함)
        Search->>Redis: SET cache:search:{key}<br/>TTL: 180초 (3분)

        Search-->>GW: 200 {ok: true, data: {<br/>results: [{id, title, highlight, ...}],<br/>total, page, limit}}
    end

    GW-->>FE: 응답 전달
    FE-->>User: 검색 결과 + 하이라이트 표시
```

## 4. 자동완성 (Autocomplete)

```mermaid
sequenceDiagram
    actor User
    participant FE as Frontend
    participant GW as API Gateway
    participant Search as Search Service :8006
    participant DB as PostgreSQL

    User->>FE: 검색창에 타이핑 "실험"
    FE->>FE: 디바운스 (300ms)
    FE->>GW: GET /api/search/autocomplete?q=실험
    GW->>Search: 프록시 전달

    Search->>DB: SELECT keyword, COUNT(*)<br/>FROM SearchHistory<br/>WHERE keyword LIKE '실험%'<br/>AND orgId = {orgId}<br/>GROUP BY keyword<br/>ORDER BY count DESC<br/>LIMIT 10
    DB-->>Search: [{keyword: "실험결과", count: 15}, ...]

    Search->>DB: SELECT keyword<br/>FROM SearchKeywordFavorite<br/>WHERE keyword LIKE '실험%'<br/>AND userId = {userId}
    DB-->>Search: [{keyword: "실험프로토콜"}]

    Search->>Search: 빈도순 정렬 + 즐겨찾기 우선

    Search-->>GW: 200 {ok: true, data: {<br/>suggestions: ["실험결과", "실험프로토콜", ...]}}
    GW-->>FE: 응답 전달
    FE-->>User: 자동완성 드롭다운 표시
```

## 5. 검색 히스토리 & 즐겨찾기

```mermaid
sequenceDiagram
    actor User
    participant FE as Frontend
    participant Search as Search Service :8006
    participant DB as PostgreSQL

    %% 검색 실행 시 히스토리 저장
    User->>FE: 검색 실행
    FE->>Search: GET /api/search?q=실험결과
    Search->>DB: UPSERT SearchHistory<br/>{userId, keyword: "실험결과", orgId}<br/>ON CONFLICT → count++

    %% 즐겨찾기 추가
    User->>FE: 검색어 즐겨찾기 ⭐
    FE->>Search: POST /api/search/favorites<br/>{keyword: "실험결과"}
    Search->>DB: INSERT SearchKeywordFavorite<br/>{userId, keyword, orgId}

    %% 즐겨찾기 목록
    User->>FE: 검색창 포커스
    FE->>Search: GET /api/search/favorites
    Search->>DB: SELECT * FROM SearchKeywordFavorite<br/>WHERE userId AND orgId
    Search-->>FE: [{keyword: "실험결과"}, ...]
    FE-->>User: 즐겨찾기 검색어 표시
```

## 핵심 포인트

| 항목 | 설명 |
|------|------|
| **인덱싱 방식** | Fire-and-forget (실패해도 메인 작업 영향 없음) |
| **검색 엔진** | OpenSearch 2 (Korean 형태소 분석기) |
| **캐시** | Redis, 3분 TTL, 인덱싱 시 무효화 |
| **권한 필터** | orgId + (authorId OR public OR teamId) |
| **하이라이트** | OpenSearch highlight 기능 활용 |
| **자동완성** | SearchHistory 빈도 기반 + 즐겨찾기 우선 |
| **Rate Limit** | 60 req/60s (검색 엔드포인트) |
