# 파일/내보내기 트러블슈팅

## 증상 1: Export 작업이 "queued" 상태에서 진행 안 됨

### 원인
BullMQ Worker가 죽었거나 Redis 연결 끊김.

### 진단
```bash
# 1. signature-audit-service 로그에서 Worker 상태 확인
docker compose logs -f signature-audit-service 2>&1 | grep -E "Worker|export|BullMQ"

# 2. Redis에서 BullMQ 큐 상태 확인
docker compose exec redis redis-cli KEYS "bull:labnote-export:*"
docker compose exec redis redis-cli LLEN "bull:labnote-export:wait"    # 대기 중
docker compose exec redis redis-cli LLEN "bull:labnote-export:active"  # 처리 중
docker compose exec redis redis-cli LLEN "bull:labnote-export:failed"  # 실패

# 3. ExportJob DB 상태 확인
docker compose exec postgres psql -U labnote -d labnote -c \
  "SELECT id, status, format, error, created_at FROM export_jobs ORDER BY created_at DESC LIMIT 10;"
```

### 해결
```bash
# Worker 재시작
docker compose restart signature-audit-service

# stuck 된 작업 수동 정리 (Redis에서)
docker compose exec redis redis-cli DEL "bull:labnote-export:active"

# ExportJob 상태 수동 업데이트 (필요 시)
docker compose exec postgres psql -U labnote -d labnote -c \
  "UPDATE export_jobs SET status = 'failed', error = 'Manual cleanup' WHERE status = 'processing' AND created_at < NOW() - INTERVAL '1 hour';"
```

---

## 증상 2: PDF 생성 실패 (Puppeteer 에러)

### 원인
Puppeteer 메모리 부족, Chrome 크래시, 또는 한글 폰트 누락.

### 진단
```bash
# Worker 에러 로그
docker compose logs signature-audit-service 2>&1 | grep -E "Puppeteer|Chrome|PDF|Error"

# 컨테이너 메모리 사용량
docker stats --no-stream signature-audit-service
```

### 해결
| 에러 | 원인 | 해결 |
|------|------|------|
| "Failed to launch browser" | Chrome 바이너리 누락 | Dockerfile에 Chromium 설치 확인 |
| "Page crashed" | 메모리 부족 | Docker 메모리 제한 증가 |
| "Navigation timeout" | 렌더링 시간 초과 | `--timeout` 옵션 증가 |
| 한글 깨짐 | 폰트 미설치 | Dockerfile에 `fonts-nanum` 추가 |

```bash
# 메모리 제한 확인 (docker-compose.yml)
# deploy:
#   resources:
#     limits:
#       memory: 2G  ← Puppeteer는 최소 1G 권장
```

---

## 증상 3: 파일 업로드 실패

### 원인
MinIO 버킷 없음, 용량 초과, 또는 접근 키 불일치.

### 진단
```bash
# file-service 로그
docker compose logs file-service 2>&1 | grep -E "upload|MinIO|S3|Error"

# MinIO 상태 확인
curl -s http://localhost:9000/minio/health/live
# 정상: HTTP 200

# MinIO 콘솔에서 버킷 확인
# http://localhost:9001
```

### 해결
```bash
# 버킷 생성
docker compose exec minio mc alias set local http://localhost:9000 $MINIO_ACCESS_KEY $MINIO_SECRET_KEY
docker compose exec minio mc mb local/labnote-files --ignore-existing
docker compose exec minio mc mb local/labnote-exports --ignore-existing

# 접근 키 확인
docker compose exec file-service env | grep MINIO
```

---

## 증상 4: Presigned URL 만료 (다운로드 실패)

### 원인
Presigned URL의 유효기간 초과.

### 진단
```bash
# URL의 X-Amz-Expires 파라미터 확인
# 업로드용: 900초 (15분)
# 다운로드용: 3600초 (1시간)
# Export용: 86400초 (24시간)
```

### 해결
- 프론트엔드에서 다운로드 링크 클릭 시 새 presigned URL 요청
- `GET /api/files/{fileId}/download` → 매번 새 URL 생성

---

## 증상 5: 내보내기 완료 알림이 안 옴 (SSE 실패)

### 원인
SSE 연결 끊김 또는 Redis Pub/Sub 실패.

### 진단
```bash
# 1. SSE 연결 테스트
curl -N -H "Authorization: Bearer <token>" \
  http://localhost:8000/api/events/exports
# 30초마다 heartbeat가 오면 정상

# 2. Redis Pub/Sub 테스트
docker compose exec redis redis-cli SUBSCRIBE export-status
# 다른 터미널에서 export 실행 → 메시지 수신 확인

# 3. Gateway SSE 로그
docker compose logs api-gateway 2>&1 | grep -E "SSE|export-status"
```

### 해결
| 원인 | 해결 |
|------|------|
| Redis 다운 | `docker compose restart redis` |
| SSE 연결 끊김 (프록시 타임아웃) | 프록시/로드밸런서의 timeout 설정 증가 |
| Gateway 재시작 | SSE 연결 자동 재연결 (프론트엔드) 확인 |

---

## 증상 6: Export된 파일이 비어있거나 깨짐

### 원인
Handlebars 템플릿 렌더링 실패 또는 노트 데이터 조회 실패.

### 진단
```bash
# Worker 로그에서 렌더링 과정 확인
docker compose logs signature-audit-service 2>&1 | grep -E "template|render|Handlebars"

# 노트 데이터 조회 가능한지 확인
curl -H "x-internal-secret: <시크릿>" \
  http://localhost:8002/api/notes/<noteId>
```

### 해결
- 노트 content가 null/빈 문자열인지 확인
- Handlebars 템플릿 파일 존재 여부 확인
- HTML → PDF 변환 시 CSS 경로 확인

---

## 빠른 진단 체크리스트

```bash
# 1. BullMQ 큐 상태
docker compose exec redis redis-cli KEYS "bull:labnote-export:*" | sort

# 2. ExportJob 최근 상태
docker compose exec postgres psql -U labnote -d labnote -c \
  "SELECT id, status, format, error, created_at FROM export_jobs ORDER BY created_at DESC LIMIT 5;"

# 3. MinIO 버킷 목록
docker compose exec minio mc ls local/

# 4. Worker 프로세스 확인
docker compose exec signature-audit-service ps aux | grep -E "node|worker"
```
