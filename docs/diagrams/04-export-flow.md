# 파일 내보내기(Export) 흐름 시퀀스 다이어그램

> BullMQ → Puppeteer → MinIO → SSE 4단계 파이프라인

## 1. 내보내기 요청 → 완료 전체 흐름

```mermaid
sequenceDiagram
    actor User
    participant FE as Frontend
    participant GW as API Gateway :8000
    participant Sig as Signature-Audit :8003
    participant Queue as BullMQ Queue
    participant Worker as Export Worker
    participant ELN as ELN Service :8002
    participant File as File Service :8008
    participant Redis as Redis Pub/Sub
    participant SSE as Gateway SSE

    %% 1단계: 내보내기 요청
    User->>FE: PDF 내보내기 버튼 클릭
    FE->>GW: POST /api/export<br/>{noteId, format: "pdf"}
    Note over GW: Rate Limit: 10 req/60s
    GW->>Sig: 프록시 전달

    Sig->>Sig: requireAuth + requirePermission(EXPORT_PDF)
    Sig->>Sig: DB에 ExportJob 생성<br/>{status: "queued"}

    %% 2단계: BullMQ 큐잉
    Sig->>Queue: add("labnote-export", {<br/>  jobId, noteId, format: "pdf",<br/>  requestedBy, orgId<br/>})
    Note over Queue: attempts: 3<br/>backoff: exponential 5s

    Sig-->>GW: 202 {ok: true, data: {jobId, status: "queued"}}
    GW-->>FE: 응답 전달
    FE->>FE: SSE 연결 시작<br/>GET /api/events/exports

    %% 3단계: Worker 처리
    Note over Queue,Worker: --- 비동기 처리 ---

    Worker->>Queue: 작업 수신 (concurrency: 2)
    Worker->>Sig: ExportJob status → "processing"

    Worker->>ELN: GET /api/notes/{noteId}<br/>x-internal-secret
    ELN-->>Worker: {title, content, author, status, ...}

    Worker->>Worker: Handlebars 템플릿 렌더링
    Worker->>Worker: Puppeteer → PDF 생성
    Worker->>Worker: job.updateProgress(50%)

    %% 4단계: 파일 업로드
    Worker->>File: POST /api/exports/internal/upload<br/>multipart/form-data (PDF 바이너리)<br/>x-internal-secret
    File->>File: MinIO exports 버킷에 저장
    File-->>Worker: {fileId, fileName}

    Worker->>File: GET /api/exports/internal/presigned/{fileId}
    File-->>Worker: {presignedUrl} (24시간 유효)

    Worker->>Sig: ExportJob 업데이트<br/>{status: "completed", fileUrl, fileId}

    %% 5단계: 실시간 알림
    Worker->>Redis: PUBLISH export-status<br/>{jobId, status: "completed",<br/>fileUrl, noteId, requestedBy}

    Redis-->>SSE: 메시지 수신
    SSE->>SSE: requestedBy === userId 필터
    SSE-->>FE: event: export-status<br/>data: {jobId, status, fileUrl}

    FE-->>User: "PDF 생성 완료" + 다운로드 링크
```

## 2. 내보내기 실패 & 재시도

```mermaid
sequenceDiagram
    participant Worker as Export Worker
    participant Queue as BullMQ
    participant Redis as Redis Pub/Sub
    participant SSE as Gateway SSE
    participant FE as Frontend

    Worker->>Worker: PDF 생성 시도

    alt 처리 실패 (1~2차)
        Worker->>Worker: 에러 발생 (메모리, 타임아웃 등)
        Worker->>Queue: throw Error → 자동 재시도
        Note over Queue: 재시도 간격:<br/>1차: 5초<br/>2차: 10초<br/>3차: 20초 (지수 백오프)
        Queue->>Worker: 재시도 실행
    end

    alt 3차까지 모두 실패
        Worker->>Worker: ExportJob status → "failed"
        Worker->>Redis: PUBLISH export-status<br/>{status: "failed", error: "..."}
        Redis-->>SSE: 메시지 수신
        SSE-->>FE: event: export-status<br/>{status: "failed"}
        FE-->>FE: "내보내기 실패" 알림 표시
    end
```

## 3. SSE (Server-Sent Events) 연결 상세

```mermaid
sequenceDiagram
    participant FE as Frontend
    participant GW as API Gateway :8000
    participant Redis as Redis Pub/Sub

    FE->>GW: GET /api/events/exports<br/>Accept: text/event-stream<br/>Authorization: Bearer {jwt}

    GW->>GW: JWT 검증 → userId 추출
    GW->>GW: Fastify reply hijack (스트리밍 모드)
    GW->>GW: HTTP 헤더 전송<br/>Content-Type: text/event-stream<br/>Cache-Control: no-cache

    GW->>Redis: SUBSCRIBE export-status
    Note over GW: 전용 Redis 커넥션 생성

    loop 연결 유지
        alt 내보내기 이벤트 수신
            Redis-->>GW: {jobId, status, requestedBy, ...}
            GW->>GW: requestedBy === userId 필터
            GW-->>FE: event: export-status\ndata: {...}
        else 30초 경과 (heartbeat)
            GW-->>FE: : heartbeat\n\n
        end
    end

    Note over FE: 연결 종료 시
    FE->>GW: connection close
    GW->>Redis: UNSUBSCRIBE + DISCONNECT
    Note over GW: Redis 커넥션 정리
```

## 4. ZIP/리포트 내보내기 (다중 노트)

```mermaid
sequenceDiagram
    participant Worker as Export Worker
    participant ELN as ELN Service
    participant File as File Service

    Note over Worker: format: "zip" 또는 "report"

    Worker->>ELN: GET /api/notes?status=signed&limit=1000<br/>x-internal-secret
    ELN-->>Worker: [{note1}, {note2}, ...]

    loop 각 노트별
        Worker->>Worker: Handlebars 렌더링
        Worker->>Worker: Puppeteer → PDF 생성
        Worker->>Worker: archiver에 PDF 추가
    end

    Worker->>Worker: ZIP 아카이브 생성
    Worker->>File: POST /api/exports/internal/upload<br/>(ZIP 바이너리)
    File-->>Worker: {fileId}
```

## 핵심 포인트

| 항목 | 설명 |
|------|------|
| **비동기 처리** | 요청 즉시 202 반환, BullMQ Worker가 백그라운드 처리 |
| **Rate Limit** | `/api/export` — 10 req/60s (Redis 슬라이딩 윈도우) |
| **재시도** | 3회, 지수 백오프 (5s → 10s → 20s) |
| **Worker 동시성** | 2개 (Puppeteer 메모리 고려) |
| **파일 보관** | exports 버킷, presigned URL 24시간 유효 |
| **실시간 알림** | Redis Pub/Sub → SSE (per-user 필터링) |
| **작업 정리** | 완료: 최대 100개 보관, 실패: 최대 50개 보관 |
