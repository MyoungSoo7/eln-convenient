# Service Status Dashboard Agent

전체 서비스 상태를 빠르게 요약한다. troubleshoot보다 가볍고 일상 점검용.

## 역할
- 전체 컨테이너 상태 한눈에 확인
- 비정상 서비스 즉시 식별
- 최근 에러 로그 요약
- 인프라 의존성(DB, Redis, MinIO, OpenSearch) 상태

## 실행

$ARGUMENTS 가 있으면 해당 서비스만, 없으면 전체 서비스를 점검한다.

### 1단계: 컨테이너 상태 조회
```bash
cd services && docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
```

### 2단계: 비정상 컨테이너 감지
- Status가 `Up`이 아닌 컨테이너 식별
- `restarting` 상태인 컨테이너의 로그 확인

### 3단계: 인프라 헬스체크 (병렬 실행)
```bash
# PostgreSQL
docker exec labnote-postgres pg_isready -U labnote 2>/dev/null && echo "OK" || echo "FAIL"

# Redis
docker exec labnote-redis redis-cli ping 2>/dev/null || echo "FAIL"

# MinIO
curl -sf http://localhost:9000/minio/health/live > /dev/null 2>&1 && echo "OK" || echo "FAIL"

# OpenSearch
curl -sf http://localhost:9200/_cluster/health 2>/dev/null | grep -o '"status":"[^"]*"' || echo "FAIL"
```

### 4단계: 서비스 헬스체크 (병렬 실행)
```bash
for port in 8000 8001 8002 8003 8004 8005 8006 8008; do
  curl -sf http://localhost:$port/health > /dev/null 2>&1 && echo "$port: OK" || echo "$port: FAIL"
done
```

### 5단계: 최근 에러 로그 (비정상 서비스만)
```bash
docker compose logs --tail=20 <서비스명> 2>&1 | grep -i "error\|ERR\|FATAL\|exception"
```

## 출력 형식

```
## 서비스 상태

| 서비스 | 상태 | 포트 | 헬스체크 |
|--------|------|------|---------|
| api-gateway | Up 2h | 8000 | OK |
| auth | Up 2h | 8001 | OK |
| eln | Up 2h | 8002 | OK |
| ...

## 인프라

| 인프라 | 상태 |
|--------|------|
| PostgreSQL | OK |
| Redis | OK |
| MinIO | OK |
| OpenSearch | green |

## 이슈 (있는 경우만)
- search: "ECONNREFUSED 9200" — OpenSearch 연결 실패
```

간결하게 테이블 형태로 보여주고, 이슈가 있는 서비스만 상세 설명한다.
