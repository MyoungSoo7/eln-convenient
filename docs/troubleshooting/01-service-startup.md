# 서비스 기동 실패 트러블슈팅

## 증상 1: 컨테이너가 즉시 종료됨 (Exit Code 1)

### 원인
필수 환경변수 누락. `${VAR:?설명}` 패턴으로 설정된 변수가 없으면 즉시 종료.

### 진단
```bash
docker compose logs <서비스명> | head -20
# "error: VAR: 설명" 메시지 확인
```

### 해결
```bash
# .env 파일에서 누락된 변수 확인
cat services/.env | grep -i <변수명>

# 또는 docker-compose.yml에서 필수 변수 목록 확인
grep -n ':?' services/docker-compose.yml
```

### 주요 필수 환경변수
| 변수 | 서비스 | 설명 |
|------|--------|------|
| `DATABASE_URL` | 전체 | PostgreSQL 연결 문자열 |
| `REDIS_URL` | 전체 | Redis 연결 문자열 |
| `JWT_SECRET` | api-gateway, auth | JWT 서명 키 |
| `INTERNAL_SECRET` | 전체 | 서비스 간 인증 시크릿 |
| `MINIO_ACCESS_KEY` | file-service | MinIO 접근 키 |
| `MINIO_SECRET_KEY` | file-service | MinIO 비밀 키 |

---

## 증상 2: PostgreSQL 연결 실패

### 원인
PostgreSQL 컨테이너가 아직 ready 상태가 아니거나, healthcheck 통과 전에 서비스가 기동 시도.

### 진단
```bash
# PostgreSQL 상태 확인
docker compose ps postgres
docker compose logs postgres | tail -20

# healthcheck 상태
docker inspect labnote-postgres --format='{{.State.Health.Status}}'
```

### 해결
```bash
# 1. PostgreSQL 먼저 기동
docker compose up -d postgres
# healthy 될 때까지 대기
docker compose exec postgres pg_isready -U labnote

# 2. 서비스 재기동
docker compose up -d --build <서비스명>
```

### 근본 원인 확인
- `docker-compose.yml`에서 `depends_on: postgres: condition: service_healthy` 설정 확인
- PostgreSQL healthcheck 간격/타임아웃이 너무 짧지 않은지 확인

---

## 증상 3: Redis 연결 실패

### 원인
Redis 컨테이너 미기동 또는 `REDIS_URL` 오류.

### 진단
```bash
docker compose ps redis
docker compose exec redis redis-cli ping
# 정상: PONG
```

### 해결
```bash
docker compose up -d redis
# Redis가 올라온 후 서비스 재기동
docker compose restart <서비스명>
```

### 영향 범위
| Redis 기능 | 사용 서비스 | Redis 다운 시 |
|-----------|-----------|-------------|
| Event Stream | signature-audit → eln | HTTP 폴백 작동 |
| Pub/Sub (Collab) | collab-service | 단일 인스턴스 모드 |
| 캐시 | search, gateway | 캐시 미스 → DB 직접 조회 |
| Rate Limit | api-gateway | Rate Limit 비활성화 (주의) |
| SSE | api-gateway | 실시간 알림 불가 |
| BullMQ | signature-audit | Export 작업 불가 |

---

## 증상 4: MinIO 연결 실패

### 원인
MinIO 컨테이너 미기동, 버킷 미생성, 접근 키 불일치.

### 진단
```bash
docker compose ps minio
docker compose logs minio | tail -10

# MinIO 콘솔 접근
# http://localhost:9001 (브라우저)
```

### 해결
```bash
# MinIO 기동
docker compose up -d minio

# 버킷 수동 생성 (필요 시)
docker compose exec minio mc alias set local http://localhost:9000 <ACCESS_KEY> <SECRET_KEY>
docker compose exec minio mc mb local/labnote-files
docker compose exec minio mc mb local/labnote-exports
```

---

## 증상 5: OpenSearch 연결 실패

### 원인
OpenSearch 메모리 부족 또는 초기화 시간 초과.

### 진단
```bash
docker compose ps opensearch
docker compose logs opensearch | tail -30

# 클러스터 상태 확인
curl -s http://localhost:9200/_cluster/health | jq .
# status: "green" 또는 "yellow"이면 정상
```

### 해결
```bash
# 메모리 설정 확인 (docker-compose.yml)
# OPENSEARCH_JAVA_OPTS=-Xms512m -Xmx512m

# OpenSearch 재시작
docker compose restart opensearch

# 인덱스 재생성 필요 시
# search-service가 기동 시 자동으로 인덱스 생성
docker compose restart search-service
```

---

## 증상 6: 포트 충돌

### 원인
호스트에서 이미 해당 포트를 사용 중.

### 진단
```bash
# Windows
netstat -ano | findstr :<포트번호>
# 또는
# Linux/Mac
lsof -i :<포트번호>
```

### 해결
1. 충돌하는 프로세스 종료
2. 또는 `docker-compose.yml`에서 호스트 포트 변경: `"8001:8001"` → `"18001:8001"`

### 서비스 포트 맵
| 포트 | 서비스 |
|------|--------|
| 5173 | Frontend (Vite dev) |
| 8000 | API Gateway |
| 8001 | Auth Service |
| 8002 | ELN Service |
| 8003 | Signature-Audit |
| 8004 | Inventory Service |
| 8005 | Scheduler Service |
| 8006 | Search Service |
| 8008 | File Service |
| 8009 | Collab Service (WS) |
| 5432 | PostgreSQL |
| 6379 | Redis |
| 9000/9001 | MinIO (API/Console) |
| 9200 | OpenSearch |
| 16686 | Jaeger UI |
| 9999 | Dozzle |

---

## 증상 7: Prisma 마이그레이션 실패

### 원인
스키마 변경 후 마이그레이션 미적용, 또는 마이그레이션 충돌.

### 진단
```bash
docker exec <컨테이너명> npx prisma migrate status
```

### 해결
```bash
# 마이그레이션 적용
docker exec <컨테이너명> npx prisma migrate deploy

# 시드 데이터 (필요 시)
docker exec <컨테이너명> npx prisma db seed

# 강제 리셋 (개발 환경만! 데이터 삭제됨)
docker exec <컨테이너명> npx prisma migrate reset --force
```

---

## 빠른 진단 체크리스트

```bash
# 1. 전체 서비스 상태 확인
docker compose ps

# 2. 비정상 서비스 로그 확인
docker compose logs --tail=50 <서비스명>

# 3. 인프라 서비스 우선 확인
docker compose exec postgres pg_isready -U labnote
docker compose exec redis redis-cli ping
curl -s http://localhost:9200/_cluster/health | jq .status

# 4. 전체 재기동 (최후 수단)
docker compose down
docker compose up -d
```
