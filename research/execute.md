# LabNote ELN - 실행 가이드

## 1. 전체 구조 한눈에 보기

```
[브라우저]
    ↓ http://localhost:8080
[프론트엔드 - Vite Dev Server :8080]  ← npm run dev (루트에서)
    ↓ http://localhost:8000/api/*
[API Gateway - Docker :8000]
    ↓ 내부 Docker 네트워크
[각 백엔드 서비스 :8001~8009] ← docker compose로 실행
    ↓
[인프라: postgres, redis, minio, opensearch, qdrant]
```

> 프론트엔드는 로컬에서 실행, 백엔드 전체는 Docker Compose로 실행

---

## 2. 사전 준비

### 필수 설치
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Docker + Docker Compose 포함)
- Node.js 20+
- npm 또는 bun

### .env 파일 준비
```bash
cd services
cp .env.example .env
```

`.env` 기본값으로도 로컬 개발 가능. OpenAI 기능 쓰려면 아래 항목 수정:
```env
OPENAI_API_KEY=sk-...          # AI 어시스턴트 기능 필요 시
OPENAI_CHAT_MODEL=gpt-4o-mini
```

---

## 3. 백엔드 실행 (Docker Compose)

### 3-1. 전체 실행 (최초 or 코드 변경 후)
```bash
cd services
docker compose up --build
```
- `--build`: 서비스 이미지 새로 빌드
- 처음 실행은 이미지 빌드 때문에 5~10분 소요

### 3-2. 이미 빌드된 상태에서 재시작
```bash
docker compose up -d
```
- `-d`: 백그라운드(detach) 실행

### 3-3. 특정 서비스만 재빌드
```bash
docker compose up -d --build eln-service
docker compose up -d --build auth-service api-gateway
```

### 3-4. 중지
```bash
docker compose down          # 컨테이너만 중지 (볼륨 유지)
docker compose down -v       # 컨테이너 + 볼륨 모두 삭제 (DB 초기화)
```

### 3-5. 상태 확인
```bash
docker compose ps            # 실행 중인 서비스 목록
docker compose ps --all      # 종료된 것 포함 전체 목록
docker logs labnote-eln      # 특정 서비스 로그
docker logs -f labnote-eln   # 실시간 로그 follow
```

### 컨테이너 기동 순서 (의존성)
```
postgres, redis, minio, opensearch, qdrant  ← 인프라 먼저
    ↓
auth, eln, inventory, scheduler, search, ai, file, collab  ← 서비스
    ↓
api-gateway  ← 마지막 (모든 서비스 healthy 확인 후 기동)
```

> api-gateway는 모든 서비스가 healthy 상태여야 뜸.
> opensearch는 JVM 때문에 30~50초 걸릴 수 있음.

---

## 4. 프론트엔드 실행

### 4-1. 의존성 설치 (최초 1회)
```bash
# 루트 디렉토리에서
npm install
```

### 4-2. 개발 서버 시작
```bash
npm run dev
```
- 실행 주소: `http://localhost:8080`
- vite.config.ts에 port 8080으로 설정됨

### 4-3. API 연결 확인
프론트엔드는 `http://localhost:8000/api/*` 로 요청을 보냄.
백엔드 Docker Compose가 먼저 실행 중이어야 함.

- 인증 토큰: localStorage의 `labnote_jwt` 키에 저장
- 유저 정보: localStorage의 `labnote_user` 키에 저장

---

## 5. 접속 주소 정리

| 서비스 | 주소 | 비고 |
|---|---|---|
| 프론트엔드 | http://localhost:8080 | `npm run dev` |
| API Gateway | http://localhost:8000 | 모든 API 진입점 |
| Auth Swagger | http://localhost:8001/docs | |
| ELN Swagger | http://localhost:8002/docs | |
| Signature Swagger | http://localhost:8003/docs | |
| Inventory Swagger | http://localhost:8004/docs | |
| Scheduler Swagger | http://localhost:8005/docs | |
| Search Swagger | http://localhost:8006/docs | |
| AI Swagger | http://localhost:8007/docs | |
| File Swagger | http://localhost:8008/docs | |
| MinIO Console | http://localhost:9001 | minioadmin / minioadmin123 |
| Keycloak Admin | http://localhost:8080 | admin / admin (SSO 쓸 때) |
| Qdrant Dashboard | http://localhost:6333/dashboard | 벡터 DB 모니터링 |
| OpenSearch | http://localhost:9200 | 직접 쿼리용 |

---

## 6. 프론트↔백엔드 연결 흐름

### 일반 API 요청
```
프론트 (React, :8080)
  → fetch/axios: GET http://localhost:8000/api/notes
  → API Gateway (:8000): JWT 검증 후 → ELN Service (:8002)
  → 응답 반환
```

### 실시간 협업 (WebSocket)
```
프론트 (NoteEditor)
  → WebSocket: ws://localhost:8009/collab/notes/:noteId?token=JWT
  → Collab Service (:8009): Redis pub/sub으로 브로드캐스트
```

### 인증 흐름
```
1. POST http://localhost:8000/api/auth/login
   { email, password }

2. 응답: { token, user }

3. localStorage.setItem('labnote_jwt', token)

4. 이후 모든 요청 헤더: Authorization: Bearer {token}
```

---

## 7. 자주 쓰는 명령어 모음

```bash
# 전체 재시작 (코드 변경 반영)
cd services && docker compose up --build -d

# 특정 서비스 로그 실시간 보기
docker logs -f labnote-gateway
docker logs -f labnote-eln
docker logs -f labnote-auth

# 컨테이너 상태 확인
docker compose ps

# 프론트엔드 실행
cd .. && npm run dev

# DB 초기화 (볼륨까지 삭제)
docker compose down -v && docker compose up --build -d

# eln-service만 재빌드 (Dockerfile 수정 후)
docker compose up -d --build eln-service
```

---

## 8. 현재 알려진 이슈

### labnote-qdrant — unhealthy
- 실제로는 정상 작동 중 (6333 포트 리스닝)
- healthcheck 경로(`/healthz`) 문제
- ai-assistant-service가 qdrant healthy 조건에 막혀 못 뜸
- **임시 해결**: docker-compose.yml의 ai-assistant-service `depends_on` 조건을 `service_started`로 변경

### labnote-eln — Error (Prisma + OpenSSL)
- `node:20-alpine`에 OpenSSL 미설치 → Prisma schema engine 실패
- **해결**: [services/eln-service/Dockerfile](../services/eln-service/Dockerfile) 에 `apk add openssl` 추가 완료
- **재빌드 필요**: `docker compose up -d --build eln-service`
