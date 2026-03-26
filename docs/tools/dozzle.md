# Dozzle — 실시간 로그 뷰어

## 접속 정보

| 항목 | 값 |
|------|-----|
| UI URL | http://localhost:9999 |
| 로그인 | 없음 (인증 미설정) |

## Dozzle이 하는 일

Docker 컨테이너의 로그를 **웹 브라우저에서 실시간으로** 볼 수 있는 경량 뷰어.
`docker logs -f` 명령을 하나하나 치는 대신, 모든 컨테이너 로그를 한 화면에서 확인한다.

## 아키텍처

```
Docker Engine ←── docker.sock (읽기 전용) ──→ Dozzle
                                              ↓
                                         브라우저 (localhost:9999)
```

- `/var/run/docker.sock`을 읽기 전용(`:ro`)으로 마운트
- 컨테이너 로그를 실시간 스트리밍 (WebSocket)
- 로그를 저장하지 않음 — 순수 뷰어

## 로깅 시스템

### Pino 구조화 로깅 (`@lab/shared`)

모든 백엔드 서비스는 `createLogger(serviceName)`으로 Pino 로거를 사용한다.

```typescript
// 사용법
const logger = createLogger('eln-service');
logger.info({ noteId, userId }, '노트 생성 완료');
logger.error({ err, noteId }, '노트 생성 실패');
```

### 로그 포맷

**개발 환경** (`NODE_ENV !== 'production'`):
```
[13:45:02.123] INFO (eln-service): 노트 생성 완료
    noteId: "abc-123"
    userId: "user-456"
```
`pino-pretty`로 색상 + 포맷팅 적용. 사람이 읽기 쉬운 형태.

**프로덕션 환경**:
```json
{"level":30,"time":1711180502123,"name":"eln-service","msg":"노트 생성 완료","noteId":"abc-123","userId":"user-456"}
```
JSON 구조화 로그. 로그 수집 시스템(ELK, Loki 등)에서 파싱 가능.

### HTTP 요청 로깅

`createHttpLogger(serviceName)` 사용 시 모든 HTTP 요청/응답이 자동 로깅된다.

| 상태코드 | 로그 레벨 |
|----------|----------|
| 200~399 | `info` |
| 400~499 | `warn` |
| 500+ | `error` |

`/health` 엔드포인트는 노이즈 방지를 위해 자동 로깅에서 제외된다.

## UI 사용법

### 1. 컨테이너 목록
- 좌측 사이드바에 모든 Docker 컨테이너 표시
- 컨테이너 클릭 → 해당 컨테이너 로그 실시간 스트리밍

### 2. 멀티 컨테이너 뷰
- 여러 컨테이너를 동시에 선택하여 로그를 통합 표시
- 서비스 간 요청 흐름을 시간순으로 추적할 때 유용

### 3. 검색/필터
- 상단 검색바에서 키워드 필터링 (예: `error`, `noteId`)
- 정규식 지원

### 4. 컨테이너 상태
- 각 컨테이너의 실행 상태, 리소스 사용량 확인 가능

## 모니터링 대상 컨테이너

| 컨테이너 | 서비스 | 주요 로그 내용 |
|----------|--------|---------------|
| labnote-gateway | API Gateway | JWT 검증, 프록시 라우팅, Rate Limit |
| labnote-auth | auth-service | 로그인/로그아웃, 사용자 CRUD, SSO |
| labnote-eln | eln-service | 노트 CRUD, 상태 전환, 이벤트 소비 |
| labnote-signature | signature-audit | 전자서명, 감사로그, PDF 생성 |
| labnote-inventory | inventory-service | 시약/장비 CRUD |
| labnote-search | search-service | 검색 쿼리, 인덱싱 |
| labnote-file | file-service | 파일 업/다운로드, MinIO 연동 |
| labnote-collab | collab-service | WebSocket 연결/해제 |
| labnote-scheduler | scheduler-service | 예약 CRUD |
| labnote-postgres | PostgreSQL | 쿼리 로그 (설정 시) |
| labnote-redis | Redis | 명령어 로그 |
| labnote-opensearch | OpenSearch | 인덱싱, 쿼리 로그 |

## 가장 중요하게 봐야 할 점

1. **에러 로그 실시간 모니터링**: 장애 발생 시 Dozzle에서 해당 서비스 로그를 열어 에러 메시지 즉시 확인. `error` 키워드로 필터링
2. **서비스 기동 실패 추적**: 컨테이너가 계속 재시작되면 Dozzle에서 시작 로그 확인. DB 연결 실패, 환경변수 누락 등 원인 파악
3. **서비스 간 요청 추적**: gateway + eln + search 세 컨테이너를 동시에 열면 요청이 어떻게 흘러가는지 시간순으로 추적 가능
4. **인증 없음 주의**: Dozzle에 인증이 설정되어 있지 않다. 프로덕션에서는 네트워크 접근 제한 또는 Dozzle 인증 설정 필요
5. **로그 미저장**: Dozzle은 뷰어일 뿐 로그를 저장하지 않는다. 영구 보관이 필요하면 별도 로그 수집 시스템(ELK, Loki) 도입 필요
