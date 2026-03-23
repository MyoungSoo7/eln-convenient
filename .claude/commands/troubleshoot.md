# Troubleshoot Agent

서비스 장애를 체계적으로 진단한다.

## 역할
- 컨테이너 상태 및 로그 확인
- DB/Redis/MinIO/OpenSearch 연결 점검
- 서비스 간 통신 문제 진단
- Prisma 마이그레이션 상태 확인
- 포트 충돌 감지

## 진단 순서

### 1단계: 컨테이너 상태 확인
```bash
cd services && docker compose ps
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
```

### 2단계: 대상 서비스 로그 확인
```bash
docker compose logs --tail=100 <서비스명>
```

### 3단계: 인프라 의존성 헬스체크
```bash
# PostgreSQL
docker exec labnote-postgres pg_isready -U labnote

# Redis
docker exec labnote-redis redis-cli ping

# MinIO
docker exec labnote-minio curl -sf http://localhost:9000/minio/health/live

# OpenSearch
curl -sf http://localhost:9200/_cluster/health
```

### 4단계: 서비스 엔드포인트 직접 호출
```bash
# 서비스별 헬스체크
curl -sf http://localhost:8000/health    # API Gateway
curl -sf http://localhost:8001/health    # auth-service
curl -sf http://localhost:8002/health    # eln-service
curl -sf http://localhost:8003/health    # signature-audit-service
curl -sf http://localhost:8004/health    # inventory-service
curl -sf http://localhost:8005/health    # scheduler-service
curl -sf http://localhost:8006/health    # search-service
curl -sf http://localhost:8008/health    # file-service
```

### 5단계: Prisma 마이그레이션 상태
```bash
docker exec labnote-<서비스명> npx prisma migrate status
```

## 서비스 포트 매핑
| 서비스 | 포트 | 컨테이너명 |
|--------|------|-----------|
| API Gateway | 8000 | labnote-api-gateway |
| auth-service | 8001 | labnote-auth |
| eln-service | 8002 | labnote-eln |
| signature-audit-service | 8003 | labnote-signature-audit |
| inventory-service | 8004 | labnote-inventory |
| scheduler-service | 8005 | labnote-scheduler |
| search-service | 8006 | labnote-search |
| file-service | 8008 | labnote-file |
| collab-service | 8009 | labnote-collab |
| PostgreSQL | 5432 | labnote-postgres |
| Redis | 6379 | labnote-redis |
| MinIO | 9000/9001 | labnote-minio |
| OpenSearch | 9200 | labnote-opensearch |

## 자주 발생하는 문제

| 증상 | 원인 | 해결 |
|------|------|------|
| `ECONNREFUSED` DB | postgres 컨테이너 미기동 또는 healthcheck 미통과 | `docker compose up -d postgres` 후 대기 |
| `P1001` Prisma 연결 실패 | DATABASE_URL 오류 또는 DB 미준비 | docker-compose.yml의 depends_on + healthcheck 확인 |
| `migration failed` | 스키마 충돌 또는 기존 데이터 호환성 | `prisma migrate status`로 상태 확인 후 수동 해결 |
| 서비스 간 401 | `x-internal-secret` 불일치 | docker-compose.yml 환경변수 확인 |
| Gateway 502 | 백엔드 서비스 미기동 | 대상 서비스 컨테이너 로그 확인 |
| Redis Stream 소비 실패 | Consumer group 미생성 | 서비스 재시작 또는 수동 XGROUP CREATE |

## 실행

$ARGUMENTS 를 문제 증상 또는 서비스명으로 받아 체계적으로 진단한다. 인자가 없으면 전체 서비스 상태를 점검한다.
