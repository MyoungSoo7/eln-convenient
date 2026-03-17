# LabNote ELN - 프로젝트 전체 구조

## 1. 개요

**엔터프라이즈급 전자실험노트(ELN) 시스템**

- **아키텍처**: 마이크로서비스 (10개 백엔드 서비스 + API Gateway)
- **프론트엔드**: Vite + React 18 + TypeScript + TailwindCSS + shadcn/ui
- **실행 환경**: Docker Compose

---

## 2. 인프라 구성

| 컨테이너 | 이미지 | 포트 | 역할 |
|---|---|---|---|
| labnote-postgres | postgres:15-alpine | 5432 | 공용 DB (스키마 분리) |
| labnote-redis | redis:7-alpine | 6379 | 캐시 / 세션 / Pub-Sub |
| labnote-minio | minio/minio:latest | 9000, 9001 | 파일 스토리지 (S3 호환) |
| labnote-opensearch | opensearchproject/opensearch:2 | 9200 | 전체 검색 (ES 호환) |
| labnote-qdrant | qdrant/qdrant:latest | 6333 | 벡터 DB (AI 임베딩) |
| keycloak | quay.io/keycloak/keycloak:24.0 | 8080 | SSO / OAuth2 |

---

## 3. 백엔드 서비스

### 3.1 API Gateway — 포트 8000
- **기술**: Fastify + `@fastify/http-proxy` + jose
- **역할**: 모든 요청 라우팅, JWT 검증, CORS, Rate Limit (1000 req/15min)
- **프록시 테이블**:
  ```
  /api/auth         → auth-service:8001
  /api/notes        → eln-service:8002
  /api/templates    → eln-service:8002
  /api/signatures   → signature-audit-service:8003
  /api/audit        → signature-audit-service:8003
  /api/export       → signature-audit-service:8003
  /api/inventory    → inventory-service:8004
  /api/scheduler    → scheduler-service:8005
  /api/search       → search-service:8006
  /api/ai           → ai-assistant-service:8007
  /api/files        → file-service:8008
  ```

### 3.2 Auth Service — 포트 8001
- **기술**: Express + Prisma + bcryptjs + JWT + Redis
- **역할**: 사용자 인증, 조직/팀 관리, RBAC, Keycloak SSO 통합
- **주요 엔드포인트**:
  - `POST /api/auth/login` — 로그인 (JWT 발급)
  - `POST /api/auth/register` — 회원가입
  - `POST /api/auth/sso-hook` — Keycloak 콜백
  - `GET  /api/auth/me` — 현재 사용자
  - `GET/POST /api/auth/orgs` — 조직 관리
  - `GET/POST /api/auth/teams` — 팀 관리
  - `GET/POST /api/auth/users` — 사용자 관리 (admin)
  - `GET/POST /api/auth/roles` — 역할 관리 (admin)
- **DB 스키마**: Organization, User, Role, Team, TeamMember
- **의존**: postgres, redis

### 3.3 ELN Service — 포트 8002
- **기술**: Express + Prisma
- **역할**: 연구노트 / 프로토콜 / 템플릿 CRUD, 버전 관리, 교차 참조, 첨부파일
- **주요 엔드포인트**:
  - `GET/POST /api/notes` — 노트 목록/생성
  - `GET/PUT/DELETE /api/notes/:id` — 노트 상세/수정/삭제
  - `PATCH /api/notes/:id/status` — 상태 변경
  - `GET /api/notes/:id/revisions` — 버전 이력
  - `POST/DELETE /api/notes/:id/attachments` — 첨부파일
  - `GET/POST /api/protocols` — 프로토콜 (note type=protocol)
  - `GET/POST /api/templates` — 템플릿 CRUD
  - `POST /api/templates/recommend` — AI 템플릿 추천
- **DB 스키마**: Note, NoteRevision, NoteLink, Attachment, Template
- **Enums**: NoteType(note|protocol), NoteStatus(draft|in_progress|locked|signed)
- **의존**: postgres

### 3.4 Signature-Audit Service — 포트 8003
- **기술**: Express + Prisma + BullMQ + Puppeteer + Handlebars + AWS S3
- **역할**: 전자서명(해시 체인), 감사로그, PDF/ZIP 내보내기
- **주요 엔드포인트**:
  - `POST /api/signatures/sign/:noteId` — 서명
  - `GET  /api/signatures/verify/:noteId` — 검증
  - `POST /api/signatures/revoke/:id` — 무효화 (admin)
  - `GET  /api/audit` — 감사로그 조회
  - `POST /api/export/pdf/:noteId` — PDF 내보내기
  - `POST /api/export/zip` — ZIP 내보내기 (복수)
  - `GET  /api/export/status/:jobId` — 작업 상태
- **DB 스키마**: Signature, AuditLog, ExportJob
- **의존**: postgres, redis, minio, eln-service

### 3.5 Inventory Service — 포트 8004
- **기술**: Express + Prisma
- **역할**: 시약 / 샘플 / 자산 관리, 바코드, 수량 추적
- **주요 엔드포인트**:
  - `GET/POST /api/inventory/items` — 아이템 목록/생성
  - `GET/PUT/DELETE /api/inventory/items/:id` — 상세/수정/삭제
  - `GET /api/inventory/categories` — 카테고리
- **DB 스키마**: InventoryItem, Category
- **의존**: postgres

### 3.6 Scheduler Service — 포트 8005
- **기술**: Express + Prisma
- **역할**: 장비/자원 예약, 충돌 방지, 승인/거절 워크플로
- **주요 엔드포인트**:
  - `GET /api/scheduler/resources` — 자원 목록
  - `GET/POST /api/scheduler/bookings` — 예약 조회/생성
  - `PUT /api/scheduler/bookings/:id/approve` — 승인
  - `PUT /api/scheduler/bookings/:id/reject` — 거절
- **DB 스키마**: Resource, Booking
- **Enums**: BookingStatus(pending|approved|rejected|cancelled)
- **의존**: postgres

### 3.7 Search Service — 포트 8006
- **기술**: Express + `@opensearch-project/opensearch`
- **역할**: 노트/프로토콜/템플릿 통합 검색, 자동완성
- **주요 엔드포인트**:
  - `GET /api/search?q=` — 키워드 검색
  - `GET /api/search/suggest` — 자동완성
  - `POST /api/search/index` — 문서 인덱싱 (내부)
  - `DELETE /api/search/index/:type/:id` — 인덱스 제거
- **의존**: opensearch

### 3.8 AI Assistant Service — 포트 8007
- **기술**: Express + OpenAI + Qdrant + BullMQ + Redis
- **역할**: 템플릿 추천, 노트 초안 생성, RAG 기반 질답, 벡터 임베딩
- **주요 엔드포인트**:
  - `POST /api/ai/recommend-template` — 템플릿 추천
  - `POST /api/ai/draft` — 초안 생성
  - `POST /api/ai/ask` — RAG 질답
  - `POST /api/ai/index` — 문서 벡터 인덱싱 (내부)
  - `GET  /api/ai/index/status` — 인덱싱 상태
- **내부 모듈**: embedding.service, qdrant.service, rag.service, index.worker
- **의존**: qdrant, redis

### 3.9 File Service — 포트 8008
- **기술**: Express + Multer + AWS SDK (MinIO)
- **역할**: 파일 업로드/다운로드 (최대 50MB), 스트리밍, 메타데이터
- **주요 엔드포인트**:
  - `POST /api/files` — 업로드
  - `GET  /api/files/:id` — 다운로드
  - `GET  /api/files/:id/stream` — 스트리밍 다운로드
  - `DELETE /api/files/:id` — 삭제
  - `GET  /api/files/:id/meta` — 메타데이터
- **의존**: minio

### 3.10 Collab Service — 포트 8009
- **기술**: Node.js HTTP + WebSocket (`ws`) + Redis Pub/Sub + JWT
- **역할**: 실시간 협업 편집, 커서 추적, 색상 자동 할당, 멀티 인스턴스 동기화
- **WebSocket**: `ws://localhost:8009/collab/notes/:noteId?token=JWT`
- **메시지 타입**: joined, user-joined, content-update, awareness, user-left
- **의존**: redis

---

## 4. 프론트엔드 구조

**경로**: `/src`
**기술**: Vite + React 18 + TypeScript + TailwindCSS + shadcn/ui

### 4.1 페이지

| 경로 | 페이지 | 설명 |
|---|---|---|
| /login | LoginPage | 로그인 (SSO 지원) |
| /sso-callback | SsoCallbackPage | Keycloak 콜백 |
| / | Dashboard | 대시보드 |
| /notes | NotesPage | 연구노트 목록 |
| /notes/:id | NoteEditor | 노트 편집기 (실시간 협업) |
| /protocols | ProtocolsPage | 프로토콜 목록 |
| /inventory | InventoryPage | 인벤토리 관리 |
| /scheduler | SchedulerPage | 예약 관리 |
| /search | SearchPage | 통합 검색 |
| /ai-assistant | AIAssistantPage | AI 어시스턴트 |
| /signatures | SignaturesPage | 전자서명 |
| /audit-logs | AuditLogsPage | 감사로그 |
| /exports | ExportsPage | 내보내기 |
| /admin/* | AdminPage | 관리자 (users/roles/settings) |

### 4.2 주요 라이브러리

```json
{
  "react": "18.3.1",
  "react-router-dom": "6.30.1",
  "@tanstack/react-query": "5.83.0",
  "react-hook-form": "7.61.1",
  "zod": "3.25.76",
  "tailwindcss": "3.4.17",
  "recharts": "2.15.4",
  "i18next": "23.11.5"
}
```

---

## 5. 권한 시스템 (RBAC)

### 역할
- **admin** — 전체 권한
- **user** — 기본 읽기/쓰기
- **auditor** — 감사로그 읽기

### 주요 권한 목록
```
note:read, note:write, note:delete, note:sign, note:unlock
file:upload, file:read, file:delete
audit:read, export:pdf
inventory:read, inventory:write, inventory:delete
scheduler:read, scheduler:write
template:read, template:write
```

### 미들웨어
```typescript
requireAuth               // JWT 검증
requireRole('admin')      // 역할 확인
requirePermission('...')  // 세부 권한 확인
```

---

## 6. 데이터 흐름

### 로그인
```
클라이언트 → POST /api/auth/login → API Gateway → Auth Service
→ bcrypt 검증 → JWT 발급 → 클라이언트 저장
```

### 노트 실시간 협업
```
Editor → WebSocket ws://localhost:8009/collab/notes/:id
Collab Service → Redis pub/sub (멀티캐스트)
              → POST /api/notes/:id 저장 → ELN Service
              → POST /api/search/index → Search Service
              → POST /api/ai/index → AI Service (Qdrant 벡터화)
```

### 검색
```
SearchPage → GET /api/search?q=키워드
Search Service → OpenSearch (전문 검색)
              + AI Service → Qdrant (의미적 검색)
→ 노트 + 프로토콜 + 템플릿 결과 반환
```

---

## 7. 환경 변수 주요 항목 (services/.env)

```env
POSTGRES_USER=labnote
POSTGRES_PASSWORD=labnote_secret_2024
JWT_SECRET=dev-jwt-secret-change-in-production
JWT_EXPIRES_IN=24h
CORS_ORIGIN=http://localhost:3000
OPENAI_API_KEY=sk-...
OPENAI_CHAT_MODEL=gpt-4o-mini
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin123
KEYCLOAK_ENABLED=false
```

---

## 8. 실행 방법

```bash
# 전체 실행
cd services
docker compose up --build

# 특정 서비스 재빌드
docker compose up -d --build eln-service

# 로그 확인
docker logs labnote-eln
```

### 접근 주소
| 서비스 | URL |
|---|---|
| 프론트엔드 | http://localhost:3000 |
| API Gateway | http://localhost:8000 |
| 각 서비스 Swagger | http://localhost:{PORT}/docs |
| Keycloak | http://localhost:8080 (admin/admin) |
| MinIO Console | http://localhost:9001 (minioadmin/minioadmin123) |
| Qdrant Dashboard | http://localhost:6333/dashboard |

---

## 9. 현재 알려진 이슈

| 서비스 | 상태 | 원인 | 해결 |
|---|---|---|---|
| labnote-qdrant | unhealthy | healthcheck 설정 문제 (실제로는 정상 동작) | docker-compose healthcheck 조정 필요 |
| labnote-eln | Error | node:20-alpine에 OpenSSL 없음 → Prisma 실패 | Dockerfile에 `apk add openssl` 추가 완료 → `--build` 재빌드 필요 |
