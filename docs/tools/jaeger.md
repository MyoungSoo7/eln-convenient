# Jaeger — 분산 트레이싱

## 접속 정보

| 항목 | 값 |
|------|-----|
| Jaeger UI | http://localhost:16686 |
| OTLP 수신 엔드포인트 | http://localhost:4318 (HTTP) |

## Jaeger가 하는 일

MSA에서 하나의 API 요청이 **여러 서비스를 거치면서 어디서 얼마나 걸렸는지** 시각적으로 추적한다.

예: "노트 생성" 요청의 트레이스

```
[POST /api/notes] ────────────────────────── 총 230ms
  ├─ api-gateway (JWT 검증) ──────── 5ms
  ├─ eln-service (비즈니스 로직) ──── 180ms
  │    ├─ Prisma: INSERT Note ──── 12ms
  │    ├─ Prisma: INSERT Revision ── 8ms
  │    └─ HTTP: search-service 인덱싱 ── 45ms
  │         └─ OpenSearch bulk ── 30ms
  └─ Redis Stream 발행 ──────────── 3ms
```

## 아키텍처

```
각 서비스 (OpenTelemetry SDK)
  │ OTLP/HTTP (4318 포트)
  ▼
Jaeger (all-in-one)
  │
  ▼
Jaeger UI (16686 포트) → 트레이스 검색/시각화
```

### OpenTelemetry SDK 설정 (`services/shared/src/tracing.ts`)

- 서비스 시작 시 가장 먼저 import (`import '@lab/shared/dist/tracing'`)
- `OTEL_EXPORTER_OTLP_ENDPOINT` 환경변수로 Jaeger 주소 지정
- `OTEL_SERVICE_NAME` 환경변수로 서비스 이름 지정

### Auto-Instrumentation (자동 수집)

별도 코드 없이 자동으로 수집되는 것들:

| 계측 대상 | 수집 내용 |
|-----------|----------|
| HTTP 요청/응답 | URL, 메서드, 상태코드, 응답시간 |
| Prisma/PostgreSQL | 쿼리 내용, 실행시간 |
| Redis | 명령어, 키 |
| 서비스 간 HTTP 호출 | trace context 전파 (연결된 트레이스) |

> `fs`, `dns` 계측은 노이즈가 많아 비활성화됨

## 트레이싱 적용 서비스

| 서비스 | OTEL_SERVICE_NAME | 적용 여부 |
|--------|-------------------|-----------|
| api-gateway | `api-gateway` | O |
| auth-service | `auth-service` | O |
| eln-service | `eln-service` | O |
| signature-audit-service | `signature-audit-service` | O |
| inventory-service | `inventory-service` | O |
| scheduler-service | `scheduler-service` | O |
| search-service | `search-service` | O |
| file-service | `file-service` | O |
| collab-service | `collab-service` | O |

## UI 사용법

### 1. 트레이스 검색
- 좌측 **Search** 메뉴
- **Service** 드롭다운에서 서비스 선택 (예: `eln-service`)
- **Operation** 선택 (예: `POST /api/notes`)
- **Find Traces** 클릭 → 최근 트레이스 목록

### 2. 트레이스 상세
- 트레이스 클릭 → 타임라인 뷰
- 각 스팬(span)의 시작/종료 시간, 태그(HTTP 상태코드 등) 확인
- **빨간색 스팬**: 에러 발생 위치

### 3. 서비스 의존성 그래프
- 상단 **System Architecture** (또는 **Dependencies**) 탭
- 서비스 간 호출 관계를 그래프로 시각화

### 4. 비교
- 두 트레이스를 선택하여 성능 비교 가능 (성능 개선 전/후 비교)

## 가장 중요하게 봐야 할 점

1. **느린 요청 추적**: Search에서 `Min Duration`을 `1s`로 설정하면 1초 이상 걸린 요청만 필터링. 병목 구간 즉시 파악 가능
2. **에러 추적**: `Tags`에 `error=true` 추가하면 에러가 발생한 트레이스만 검색. 어느 서비스, 어느 쿼리에서 터졌는지 한눈에 파악
3. **서비스 간 호출 지연**: 트레이스에서 서비스 간 HTTP 호출이 전체 시간의 대부분을 차지하면 → 네트워크 또는 대상 서비스 성능 문제
4. **DB 쿼리 시간**: Prisma 스팬에서 개별 쿼리 실행시간 확인. N+1 쿼리 문제를 시각적으로 발견 가능 (같은 쿼리가 반복 호출되는 패턴)
5. **OTEL 미설정 시**: `OTEL_EXPORTER_OTLP_ENDPOINT`가 없으면 트레이싱이 비활성화되고 콘솔에 경고만 출력됨. 서비스 동작에 영향 없음
