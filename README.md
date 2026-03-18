# LabNote ELN — MSA 설계 문서

## 1. 시스템 개요

사내 구축형 전자연구노트(ELN) 협업 플랫폼.  
온프레미스 Docker Compose 배포를 전제로 하며, 각 서비스는 독립 컨테이너로 운영한다.

```
┌─────────────────────────────────────────────────────┐
│                    Reverse Proxy                     │
│                  (api-gateway:8000)                   │
└──┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬──┘
   │      │      │      │      │      │      │      │
 auth   eln   sig/aud  inv   sched  search  ai    file
 :8001  :8002  :8003   :8004  :8005  :8006  :8007  :8008
```

---

## 2. 서비스 경계 및 책임

| 서비스 | 포트 | 책임 |
|--------|------|------|
| **api-gateway** | 8000 | 단일 진입점, 라우팅, JWT 검증(TODO), Rate Limit |
| **auth-service** | 8001 | 조직/팀/사용자 CRUD, RBAC, 토큰 발급, SSO 훅 |
| **eln-service** | 8002 | 연구노트/프로토콜 CRUD, 버전관리, 태그, 첨부메타, 링크 |
| **signature-audit-service** | 8003 | 전자서명, 타임스탬프, 감사로그, PDF 변환 요청 |
| **inventory-service** | 8004 | 시약/샘플/장비/자산 CRUD, 바코드/라벨 |
| **scheduler-service** | 8005 | 장비/회의실 예약, 승인 흐름 |
| **search-service** | 8006 | 통합검색(노트/프로토콜/인벤토리), OpenSearch 연동 |
| **ai-assistant-service** | 8007 | 템플릿 추천, 초안 생성, 벡터 인덱싱, RAG 질의 |
| **file-service** | 8008 | 파일 업로드/다운로드, MinIO 스토리지 연동 |

---

## 3. 공용 인프라

| 컴포넌트 | 용도 | 비고 |
|----------|------|------|
| **PostgreSQL 15** | 서비스별 스키마 분리 (하나의 인스턴스) | `auth`, `eln`, `inventory`, `scheduler`, `signature` 스키마 |
| **Redis 7** | 세션, 캐시, 잡큐 | pub/sub 이벤트 브로커로도 활용 가능 |
| **MinIO** | 오브젝트 스토리지 (첨부파일) | S3 호환 |
| **OpenSearch 2** | 전문검색 인덱스 | search-service 전용 |
| **Qdrant** | 벡터DB | ai-assistant-service RAG용 |

---

## 4. API 목록

### 4.1 auth-service

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/auth/login` | 로그인 (JWT 발급) |
| POST | `/api/auth/logout` | 로그아웃 |
| GET | `/api/auth/me` | 현재 사용자 정보 |
| GET/POST | `/api/auth/orgs` | 조직 목록/생성 |
| GET/POST | `/api/auth/teams` | 팀 목록/생성 |
| GET/POST | `/api/auth/users` | 사용자 목록/생성 |
| PUT | `/api/auth/users/:id` | 사용자 수정 |
| GET/POST | `/api/auth/roles` | 역할 목록/생성 |
| PUT | `/api/auth/roles/:id/permissions` | 역할 권한 수정 |

### 4.2 eln-service

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/notes` | 노트 목록 (필터: status, tag, author) |
| POST | `/api/notes` | 노트 생성 |
| GET | `/api/notes/:id` | 노트 상세 |
| PUT | `/api/notes/:id` | 노트 수정 |
| DELETE | `/api/notes/:id` | 노트 삭제 (soft) |
| GET | `/api/notes/:id/revisions` | 리비전 목록 |
| GET | `/api/notes/:id/revisions/:rev` | 특정 리비전 조회 |
| POST | `/api/notes/:id/attachments` | 첨부 메타 등록 |
| GET | `/api/notes/:id/links` | 연결된 인벤토리/장비 |
| POST | `/api/notes/:id/links` | 링크 생성 |
| GET | `/api/templates` | 프로토콜 템플릿 목록 |
| POST | `/api/templates` | 템플릿 생성 |
| GET | `/api/templates/:id` | 템플릿 상세 |

### 4.3 signature-audit-service

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/signatures/sign/:noteId` | 전자서명 요청 |
| GET | `/api/signatures/verify/:noteId` | 서명 검증 |
| GET | `/api/audit` | 감사로그 조회 (`?entityId=&type=`) |
| POST | `/api/export/pdf/:noteId` | PDF 변환 요청 |
| GET | `/api/export/status/:jobId` | 변환 상태 조회 |
| POST | `/api/export/zip` | 다건 ZIP 내보내기 |

### 4.4 inventory-service

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/inventory/items` | 아이템 목록 (필터: type, status, location, tag) |
| POST | `/api/inventory/items` | 아이템 생성 |
| GET | `/api/inventory/items/:id` | 아이템 상세 |
| PUT | `/api/inventory/items/:id` | 아이템 수정 |
| DELETE | `/api/inventory/items/:id` | 아이템 삭제 (soft) |
| GET | `/api/inventory/categories` | 카테고리 목록 |

### 4.5 scheduler-service

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/scheduler/resources` | 예약 가능 자원 목록 |
| GET | `/api/scheduler/bookings` | 예약 목록 (`?resourceId=&from=&to=`) |
| POST | `/api/scheduler/bookings` | 예약 생성 |
| PUT | `/api/scheduler/bookings/:id` | 예약 수정 |
| DELETE | `/api/scheduler/bookings/:id` | 예약 취소 |
| PUT | `/api/scheduler/bookings/:id/approve` | 예약 승인 |
| PUT | `/api/scheduler/bookings/:id/reject` | 예약 거절 |

### 4.6 search-service

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/search` | 통합검색 (`?q=&type=note,protocol,inventory&page=&size=`) |
| GET | `/api/search/suggest` | 자동완성 제안 |

### 4.7 ai-assistant-service

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/ai/recommend-template` | 주제 기반 템플릿 추천 (Top 3) |
| POST | `/api/ai/draft` | 선택 템플릿으로 초안 생성 |
| POST | `/api/ai/index` | 문서 벡터 인덱싱 요청 |
| POST | `/api/ai/ask` | RAG 질의 (연구동향/실험 제안) |
| GET | `/api/ai/index/status` | 인덱싱 상태 조회 |

### 4.8 file-service

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/files` | 파일 업로드 (multipart) |
| GET | `/api/files/:id` | 파일 다운로드 |
| DELETE | `/api/files/:id` | 파일 삭제 |
| GET | `/api/files/:id/meta` | 파일 메타데이터 |

---

## 5. 데이터 모델 (초안)

### 5.1 auth 스키마

> Prisma 스키마 기준 (`services/auth-service/prisma/schema.prisma`)

```prisma
enum UserStatus {
  active
  inactive
  suspended
}

model Organization {
  id        String   @id @default(uuid())
  name      String
  slug      String   @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  users     User[]
  teams     Team[]
  roles     Role[]
}

model Role {
  id          String       @id @default(uuid())
  orgId       String
  name        String       // admin | researcher | reviewer | viewer
  permissions String[]     // ["note:write", "inventory:read", ...]
  org         Organization @relation(fields: [orgId], references: [id])
  users       User[]
}

model User {
  id           String       @id @default(uuid())
  orgId        String
  email        String       @unique
  name         String
  passwordHash String
  roleId       String?
  status       UserStatus   @default(active)
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt
  org          Organization @relation(fields: [orgId], references: [id])
  role         Role?        @relation(fields: [roleId], references: [id])
  teamMembers  TeamMember[]
}

model Team {
  id        String       @id @default(uuid())
  orgId     String
  name      String
  createdAt DateTime     @default(now())
  updatedAt DateTime     @updatedAt
  org       Organization @relation(fields: [orgId], references: [id])
  members   TeamMember[]
}

model TeamMember {
  userId String
  teamId String
  user   User   @relation(fields: [userId], references: [id])
  team   Team   @relation(fields: [teamId], references: [id])

  @@id([userId, teamId])
}
```

### 5.2 eln 스키마

> Prisma 스키마 기준 (`services/eln-service/prisma/schema.prisma`)

```prisma
enum NoteType {
  note
  protocol
}

enum NoteStatus {
  draft
  in_progress
  locked
  signed
}

model Note {
  id            String              @id @default(uuid())
  type          NoteType            @default(note)
  title         String
  content       String              @default("")
  sections      Json                @default("[]")
  status        NoteStatus          @default(draft)
  authorId      String
  templateId    String?
  tags          String[]
  createdAt     DateTime            @default(now())
  updatedAt     DateTime            @updatedAt
  deletedAt     DateTime?           // 소프트 삭제
  revisions     NoteRevision[]
  links         NoteLink[]
  attachments   Attachment[]
  statusHistory NoteStatusHistory[]
}

model NoteStatusHistory {
  id            String     @id @default(uuid())
  noteId        String
  fromStatus    NoteStatus
  toStatus      NoteStatus
  changedBy     String
  reason        String?
  isAdminAction Boolean    @default(false)
  createdAt     DateTime   @default(now())
  note          Note       @relation(fields: [noteId], references: [id], onDelete: Cascade)
}

model NoteRevision {
  id            String   @id @default(uuid())
  noteId        String
  revision      Int
  content       String
  sections      Json     @default("[]")
  changedBy     String
  changeSummary String   @default("")
  createdAt     DateTime @default(now())
  note          Note     @relation(fields: [noteId], references: [id], onDelete: Cascade)
}

model NoteLink {
  id         String   @id @default(uuid())
  noteId     String
  targetType String   // inventory_item | resource | note
  targetId   String
  label      String?
  createdAt  DateTime @default(now())
  note       Note     @relation(fields: [noteId], references: [id], onDelete: Cascade)
}

model Attachment {
  id         String   @id @default(uuid())
  noteId     String
  fileId     String   // FK → file-service
  fileName   String
  mimeType   String?
  sizeBytes  Int?
  uploadedBy String
  createdAt  DateTime @default(now())
  note       Note     @relation(fields: [noteId], references: [id], onDelete: Cascade)
}

model Template {
  id           String   @id @default(uuid())
  title        String
  description  String   @default("")
  content      String   @default("")
  category     String   @default("일반")
  sections     Json     @default("[]")
  tags         String[]
  createdBy    String
  isPublic     Boolean  @default(false)
  useCount     Int      @default(0)  // 이 템플릿으로 노트/프로토콜 생성 횟수
  copyCount    Int      @default(0)  // 복사된 횟수
  copiedFromId String?              // 복사 원본 ID (null이면 원본)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

### 5.3 inventory 스키마

> Prisma 스키마 기준 (`services/inventory-service/prisma/schema.prisma`)

```prisma
model InventoryItem {
  id                String             @id @default(uuid())
  name              String
  type              String             // reagent | sample | equipment | consumable | antibody | plasmid | cell_line
  status            String             @default("available") // available | in_use | depleted | maintenance
  category          String?
  location          String?
  barcode           String?            @unique
  quantity          Float?
  unit              String?
  minQuantity       Float?             // 최소 재고 알림 임계값
  expiryDate        DateTime?          // 유효기간
  expiryWarningDays Int                @default(30) // 만료 N일 전 경고
  metadata          Json               @default("{}")
  tags              String[]
  createdBy         String
  createdAt         DateTime           @default(now())
  updatedAt         DateTime           @updatedAt
  history           InventoryHistory[]
}

model InventoryHistory {
  id             String        @id @default(uuid())
  itemId         String
  item           InventoryItem @relation(fields: [itemId], references: [id], onDelete: Cascade)
  changeType     String        // "in" | "out" | "adjust" | "status_change"
  quantityBefore Float?
  quantityAfter  Float?
  quantityDelta  Float?        // 변화량 (양수=입고, 음수=출고)
  statusBefore   String?
  statusAfter    String?
  reason         String?       // 변경 사유
  performedBy    String
  createdAt      DateTime      @default(now())
}

model Category {
  id        String   @id @default(uuid())
  name      String   @unique
  createdAt DateTime @default(now())
}
```

### 5.4 scheduler 스키마

```sql
-- resources (장비/회의실)
CREATE TABLE scheduler.resources (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(200) NOT NULL,
  type        VARCHAR(50),                 -- equipment | room
  location    VARCHAR(200),
  is_active   BOOLEAN DEFAULT true
);

-- bookings
CREATE TABLE scheduler.bookings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id UUID REFERENCES scheduler.resources(id),
  user_id     UUID NOT NULL,
  title       VARCHAR(200),
  start_time  TIMESTAMPTZ NOT NULL,
  end_time    TIMESTAMPTZ NOT NULL,
  status      VARCHAR(20) DEFAULT 'pending', -- pending | approved | rejected | cancelled
  approved_by UUID,
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

### 5.5 signature 스키마

```sql
-- signatures
CREATE TABLE signature.signatures (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id     UUID NOT NULL,
  signer_id   UUID NOT NULL,
  signature_hash TEXT,                     -- TODO: 실제 해시 체인
  timestamp   TIMESTAMPTZ DEFAULT now(),
  status      VARCHAR(20) DEFAULT 'valid'  -- valid | revoked
);

-- audit_logs
CREATE TABLE signature.audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(50) NOT NULL,        -- note | inventory | booking | user
  entity_id   UUID NOT NULL,
  action      VARCHAR(50) NOT NULL,        -- created | updated | signed | exported | deleted
  actor_id    UUID NOT NULL,
  details     JSONB DEFAULT '{}',
  ip_address  INET,
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

---

## 6. 통신 방식

### 6.1 동기 통신 (기본)

- **REST API** (JSON over HTTP) — 모든 서비스 간 기본 통신
- api-gateway가 `/api/{service}/...` 패턴으로 라우팅
- 인증: `Authorization: Bearer <JWT>` 헤더 (gateway에서 검증 후 `X-User-Id` 헤더 주입)

### 6.2 비동기 이벤트 (확장 시)

Redis Pub/Sub 또는 메시지 큐를 통한 이벤트 전파:

| 이벤트 | 발행자 | 구독자 | 설명 |
|--------|--------|--------|------|
| `note.created` | eln-service | search-service, ai-assistant | 검색 인덱스 갱신, 벡터 인덱싱 |
| `note.updated` | eln-service | search-service | 인덱스 갱신 |
| `note.signed` | signature-audit | eln-service | 노트 status → locked |
| `inventory.updated` | inventory-service | search-service | 인덱스 갱신 |
| `file.uploaded` | file-service | eln-service | 첨부 메타 연결 |
| `export.completed` | signature-audit | (알림) | PDF/ZIP 생성 완료 |

### 6.3 서비스 간 호출 흐름 예시

```
[사용자] → [api-gateway] → [eln-service]
                                │
                                ├─ POST /notes/:id/attachments
                                │   └─→ [file-service] 파일 업로드
                                │
                                ├─ "서명하기" 클릭
                                │   └─→ [signature-audit-service] POST /sign/:noteId
                                │        └─→ eln-service에 status=locked 콜백
                                │        └─→ audit_logs 기록
                                │
                                └─ PDF 내보내기
                                    └─→ [signature-audit-service] POST /export/pdf/:noteId
                                         └─→ [file-service] PDF 저장
```

---

## 7. 프로젝트 구조 (모노레포)

```
labnote-eln/
├── apps/
│   └── web/                        # React + Vite 프론트엔드
│       ├── src/
│       │   ├── components/
│       │   ├── pages/
│       │   ├── lib/
│       │   └── ...
│       ├── Dockerfile
│       └── package.json
│
├── services/
│   ├── api-gateway/                # Node.js (Express/Fastify)
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── proxy.ts
│   │   │   └── middleware/
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── auth-service/               # Node.js + TypeScript
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── routes/
│   │   │   ├── controllers/
│   │   │   ├── dto/
│   │   │   ├── interfaces/
│   │   │   └── swagger.ts
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── eln-service/
│   ├── signature-audit-service/
│   ├── inventory-service/
│   ├── scheduler-service/
│   ├── search-service/
│   ├── ai-assistant-service/
│   └── file-service/
│
├── docker-compose.yml
├── .env.example
└── README.md                       # ← 이 문서
```

---

## 8. 배포 (Docker Compose)

```yaml
# docker-compose.yml (개요)
services:
  # --- 인프라 ---
  postgres:    { image: postgres:15, ports: ["5432:5432"] }
  redis:       { image: redis:7-alpine, ports: ["6379:6379"] }
  minio:       { image: minio/minio, ports: ["9000:9000", "9001:9001"] }
  opensearch:  { image: opensearchproject/opensearch:2, ports: ["9200:9200"] }
  qdrant:      { image: qdrant/qdrant, ports: ["6333:6333"] }

  # --- 서비스 ---
  api-gateway:           { build: ./services/api-gateway, ports: ["8000:8000"] }
  auth-service:          { build: ./services/auth-service, ports: ["8001:8001"] }
  eln-service:           { build: ./services/eln-service, ports: ["8002:8002"] }
  signature-audit-service: { build: ./services/signature-audit-service, ports: ["8003:8003"] }
  inventory-service:     { build: ./services/inventory-service, ports: ["8004:8004"] }
  scheduler-service:     { build: ./services/scheduler-service, ports: ["8005:8005"] }
  search-service:        { build: ./services/search-service, ports: ["8006:8006"] }
  ai-assistant-service:  { build: ./services/ai-assistant-service, ports: ["8007:8007"] }
  file-service:          { build: ./services/file-service, ports: ["8008:8008"] }

  # --- 프론트엔드 ---
  web:                   { build: ./apps/web, ports: ["3000:3000"] }
```

### 실행 방법

```bash
git clone <repo-url> && cd labnote-eln
cp .env.example .env
docker compose up --build
```

| 서비스 | URL |
|--------|-----|
| 프론트엔드 | http://localhost:3000 |
| API Gateway | http://localhost:8000 |
| MinIO 콘솔 | http://localhost:9001 |
| OpenSearch | http://localhost:9200 |

---

## 9. 주요 TODO

- [x] JWT 발급/검증 실제 구현 — 게이트웨이 `jose` 검증 + auth-service `jsonwebtoken` 발급
- [x] 비밀번호 해싱 (bcrypt) — auth-service `bcryptjs` 적용
- [x] DB 마이그레이션 스크립트 — Prisma schema 완비 + Dockerfile 기동 시 `prisma migrate deploy` 자동 실행
- [x] 전자서명 해시 체인 구현 — `prevHash + chainIndex` 체인 + `/verify` 무결성 검증
- [x] PDF 변환 엔진 연동 (Puppeteer) — BullMQ 큐 + Puppeteer-core + MinIO presigned URL + 프론트 폴링 UI 완료
- [x] MinIO 실제 파일 업/다운로드 — `@aws-sdk/client-s3` presigned URL + 스트리밍
- [x] OpenSearch 인덱싱 파이프라인 — 인덱스 자동 생성 + `POST /api/search/index` 수신 API
- [x] Qdrant 벡터 임베딩 + RAG 파이프라인 — @qdrant/js-client-rest + OpenAI text-embedding-3-small + BullMQ 비동기 인덱싱 + RAG 질의 완료
- [x] SSO/Keycloak 연동 — Keycloak 컨테이너 + realm 자동 임포트 + api-gateway 듀얼 모드(JWKS/로컬JWT) + 프론트 PKCE 리다이렉트 완료
- [x] RBAC 미들웨어 실제 권한 검증 — JWT에 permissions 배열 포함, `requirePermission()` 전 서비스 라우트 적용 완료
- [x] WebSocket 실시간 협업 편집 — collab-service(ws+Redis pub/sub) + NoteEditor 프레즌스 UI + 디바운스 콘텐츠 동기화 완료
- [x] i18n (ko/en) — react-i18next 적용, LoginPage/Dashboard/ExportsPage/AppLayout 번역 완료, 언어 토글 버튼 추가
