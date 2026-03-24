  Keycloak 관리 콘솔                                                                                                                                                                                                               
  - URL: http://localhost:8080                                                                                                                                                                                                   
  - ID: admin                                               
  - PW: admin_secret_2024                                                                                                                                                                                                                  
  
   MinIO 콘솔                                                                                                                                                                                                                     
  - URL: http://localhost:9001                                                                                                                                                                                                   
  - ID: minioadmin
  - PW: minioadmin123   
 

admin@labnote.local  Admin1234!   
researcher@labnote.local Researcher1234!   
reviewer@labnote.local  Reviewer1234!
viewer@labnote.local Reviewer1234!  Researcher1234!

# LabNote ELN — MSA 설계 문서

## 1. 시스템 개요

사내 구축형 전자연구노트(ELN) 협업 플랫폼.
온프레미스 Docker Compose 배포를 전제로 하며, 각 서비스는 독립 컨테이너로 운영한다.

```
┌─────────────────────────────────────────────────────────────┐
│                      Reverse Proxy                           │
│                    (api-gateway:8000)                         │
└──┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬─────────┘
   │      │      │      │      │      │      │      │
 auth   eln   sig/aud  inv   sched  search  file  collab
 :8001  :8002  :8003   :8004  :8005  :8006  :8008  :8009(ws)
```

---

## 2. 서비스 경계 및 책임

| 서비스 | 포트 | 책임 |
|--------|------|------|
| **api-gateway** | 8000 | 단일 진입점, 라우팅, JWT 검증 (jose JWKS + 로컬 JWT 듀얼 모드), Rate Limit, 대시보드 집계 |
| **auth-service** | 8001 | 조직/팀/사용자 CRUD, RBAC, 토큰 발급(jsonwebtoken + bcryptjs) |
| **eln-service** | 8002 | 연구노트/프로토콜 CRUD, 버전관리, 상태 흐름, 태그, 첨부메타, 링크, 템플릿 |
| **signature-audit-service** | 8003 | 전자서명(해시체인), 감사로그, PDF/ZIP/보고서 변환(Puppeteer+BullMQ), 알림 |
| **inventory-service** | 8004 | 시약/샘플/장비/자산 CRUD, 바코드, 수량관리, 재고/유효기간 알림 |
| **scheduler-service** | 8005 | 장비/회의실 예약, 승인/거절/취소/완료 흐름 |
| **search-service** | 8006 | 통합검색(OpenSearch), 자동완성, 검색히스토리, 즐겨찾기, 키워드 즐겨찾기 |
| **file-service** | 8008 | 파일 업로드/다운로드(MinIO), presigned URL, 스트리밍, 내보내기 잡 |
| **collab-service** | 8009 | WebSocket 실시간 협업 편집, Redis pub/sub 멀티 인스턴스 동기화 |
| **inventory-frontend** | 80 (Nginx) | 인벤토리/프로토콜 전용 React SPA 프론트엔드 |
| **shared** | — | 공용 유틸리티 패키지 (에러, 로거, 권한, Zod 검증) |

---

## 3. 공용 인프라

| 컴포넌트 | 용도 | 비고 |
|----------|------|------|
| **PostgreSQL 15** | 서비스별 스키마 분리 (하나의 인스턴스) | `auth`, `eln`, `inventory`, `scheduler`, `signature`, `search`, `file` 스키마 |
| **Redis 7** | 세션, 캐시, 잡큐, 토큰 블랙리스트 | pub/sub (collab-service 멀티 인스턴스 동기화) |
| **MinIO** | 오브젝트 스토리지 (첨부파일, 내보내기) | S3 호환, 버킷: `labnote-files`, `labnote-exports` |
| **OpenSearch 2** | 전문검색 인덱스 | search-service 전용 |
| **Keycloak 24** | SSO 인증 (선택) | OIDC/PKCE, realm 자동 임포트, 듀얼 모드(JWKS/로컬JWT) |

---

## 4. API 목록

### 4.1 auth-service

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/auth/login` | 로그인 (JWT 발급) |
| POST | `/api/auth/register` | 회원가입 |
| POST | `/api/auth/logout` | 로그아웃 (토큰 블랙리스트) |
| GET | `/api/auth/me` | 현재 사용자 정보 |
| POST | `/api/auth/sso-hook` | Keycloak SSO 훅 |
| GET/POST | `/api/auth/orgs` | 조직 목록/생성 |
| PUT/DELETE | `/api/auth/orgs/:id` | 조직 수정/삭제 |
| GET/POST | `/api/auth/teams` | 팀 목록/생성 |
| PUT/DELETE | `/api/auth/teams/:id` | 팀 수정/삭제 |
| GET/POST | `/api/auth/teams/:id/members` | 팀원 목록/추가 |
| DELETE | `/api/auth/teams/:id/members/:userId` | 팀원 제거 |
| GET/POST | `/api/auth/users` | 사용자 목록/생성 |
| PUT/DELETE | `/api/auth/users/:id` | 사용자 수정/삭제 |
| GET/POST | `/api/auth/roles` | 역할 목록/생성 |
| PUT | `/api/auth/roles/:id/permissions` | 역할 권한 수정 |
| DELETE | `/api/auth/roles/:id` | 역할 삭제 |
| POST | `/api/auth/internal/verify-password` | (내부) 비밀번호 검증 |
| GET | `/api/auth/internal/role-permissions` | (내부) 역할별 권한 조회 |

### 4.2 eln-service

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/notes` | 노트 목록 (필터: status, tag, search, type) |
| POST | `/api/notes` | 노트 생성 |
| GET | `/api/notes/stats` | 노트 상태별 통계 |
| POST | `/api/notes/batch` | 노트 일괄 조회 (ids) |
| GET | `/api/notes/:id` | 노트 상세 |
| PUT | `/api/notes/:id` | 노트 수정 (리비전 자동 생성) |
| DELETE | `/api/notes/:id` | 노트 삭제 (soft) |
| PATCH | `/api/notes/:id/status` | 상태 변경 (draft↔in_progress→signed/locked) |
| POST | `/api/notes/:id/admin-unlock` | 관리자 잠금 해제 (비밀번호 검증) |
| GET | `/api/notes/:id/revisions` | 리비전 목록 |
| GET | `/api/notes/:id/revisions/:rev` | 특정 리비전 조회 |
| GET/POST | `/api/notes/:id/attachments` | 첨부 메타 목록/등록 |
| DELETE | `/api/notes/:id/attachments/:attachmentId` | 첨부 메타 삭제 |
| GET/POST | `/api/notes/:id/links` | 링크 목록/생성 |
| DELETE | `/api/notes/:id/links/:linkId` | 링크 삭제 |
| GET | `/api/tags` | 태그 목록 (?type=note\|protocol) |
| GET | `/api/protocols` | 프로토콜 목록 (type=protocol 필터) |
| POST | `/api/protocols` | 프로토콜 생성 |
| GET/PUT/DELETE | `/api/protocols/:id` | 프로토콜 상세/수정/삭제 |
| PATCH | `/api/protocols/:id/status` | 프로토콜 상태 변경 |
| GET | `/api/protocols/:id/revisions` | 프로토콜 리비전 목록 |
| GET | `/api/templates` | 템플릿 목록 (필터: category, search, publicOnly, sortBy) |
| POST | `/api/templates` | 템플릿 생성 |
| GET | `/api/templates/:id` | 템플릿 상세 |
| PUT | `/api/templates/:id` | 템플릿 수정 |
| DELETE | `/api/templates/:id` | 템플릿 삭제 |
| POST | `/api/templates/:id/copy` | 템플릿 복사 (copyCount 증가) |
| POST | `/api/templates/recommend` | 추천 템플릿 (카테고리별 Top 5) |

### 4.3 signature-audit-service

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/signatures/sign/:noteId` | 전자서명 요청 (해시체인) |
| GET | `/api/signatures/verify/:noteId` | 서명 검증 (체인 무결성) |
| GET | `/api/signatures/:noteId` | 노트 서명 목록 |
| GET | `/api/signatures/editable/:noteId` | 편집 가능 여부 확인 |
| POST | `/api/signatures/revoke/:signatureId` | 서명 철회 (Admin) |
| GET | `/api/signatures/compliance/stats` | 서명 규정 준수 통계 |
| GET | `/api/signatures/compliance/list` | 규정 준수 목록 |
| GET | `/api/audit` | 감사로그 조회 (?entityId=&type=&action=) |
| GET | `/api/audit/:id` | 감사로그 상세 |
| GET | `/api/audit/actions` | 가용 액션 목록 |
| POST | `/api/audit/internal` | (내부) 감사로그 기록 |
| GET | `/api/exports/list` | 내보내기 작업 목록 |
| POST | `/api/exports/pdf/:noteId` | PDF 변환 요청 (Puppeteer) |
| POST | `/api/exports/zip` | 다건 ZIP 내보내기 |
| POST | `/api/exports/report` | 보고서 생성 |
| GET | `/api/exports/status/:jobId` | 변환 상태 조회 |
| GET | `/api/notifications` | 알림 목록 |
| GET | `/api/notifications/unread-count` | 읽지 않은 알림 수 |
| PATCH | `/api/notifications/:id/read` | 알림 읽음 처리 |
| PATCH | `/api/notifications/read-all` | 전체 읽음 처리 |
| POST | `/api/notifications/internal` | (내부) 알림 생성 |

### 4.4 inventory-service

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/inventory/items` | 아이템 목록 (필터: type, status, category, location, barcode, tag) |
| POST | `/api/inventory/items` | 아이템 생성 |
| GET | `/api/inventory/items/:id` | 아이템 상세 |
| PUT | `/api/inventory/items/:id` | 아이템 수정 |
| DELETE | `/api/inventory/items/:id` | 아이템 삭제 (soft) |
| GET | `/api/inventory/items/barcode/:barcode` | 바코드로 아이템 조회 |
| POST | `/api/inventory/items/:id/quantity` | 수량 변경 (입고/출고/조정) |
| GET | `/api/inventory/items/:id/history` | 아이템 변경 이력 |
| GET | `/api/inventory/alerts/low-stock` | 재고 부족 알림 |
| GET | `/api/inventory/alerts/expiring` | 유효기간 임박 알림 |
| GET | `/api/inventory/categories` | 카테고리 목록 |
| POST | `/api/inventory/categories` | 카테고리 생성 (Admin) |
| PUT | `/api/inventory/categories/:id` | 카테고리 수정 (Admin) |
| DELETE | `/api/inventory/categories/:id` | 카테고리 삭제 (Admin) |

### 4.5 scheduler-service

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/scheduler/resources` | 예약 가능 자원 목록 |
| GET | `/api/scheduler/resources/:id` | 자원 상세 |
| POST | `/api/scheduler/resources` | 자원 등록 (Admin) |
| PUT | `/api/scheduler/resources/:id` | 자원 수정 (Admin) |
| DELETE | `/api/scheduler/resources/:id` | 자원 비활성화 (Admin, soft) |
| GET | `/api/scheduler/bookings` | 예약 목록 (?resourceId=&from=&to=&status=) |
| GET | `/api/scheduler/bookings/:id` | 예약 상세 |
| GET | `/api/scheduler/calendar` | 캘린더 뷰 |
| POST | `/api/scheduler/bookings` | 예약 생성 (충돌 검사) |
| PUT | `/api/scheduler/bookings/:id` | 예약 수정 |
| POST | `/api/scheduler/bookings/:id/approve` | 예약 승인 |
| POST | `/api/scheduler/bookings/:id/reject` | 예약 거절 |
| POST | `/api/scheduler/bookings/:id/cancel` | 예약 취소 |
| POST | `/api/scheduler/bookings/:id/complete` | 예약 완료 |

### 4.6 search-service

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/search` | 통합검색 (?q=&type=note,protocol,inventory&page=&size=) |
| GET | `/api/search/suggest` | 자동완성 제안 |
| POST | `/api/search/history` | 검색 기록 저장 |
| GET | `/api/search/history` | 검색 기록 조회 |
| DELETE | `/api/search/history` | 검색 기록 전체 삭제 |
| DELETE | `/api/search/history/:id` | 검색 기록 개별 삭제 |
| POST | `/api/search/favorites` | 즐겨찾기 추가 |
| GET | `/api/search/favorites` | 즐겨찾기 목록 |
| DELETE | `/api/search/favorites/:id` | 즐겨찾기 삭제 |
| POST | `/api/search/keyword-favorites` | 키워드 즐겨찾기 추가 |
| GET | `/api/search/keyword-favorites` | 키워드 즐겨찾기 목록 |
| DELETE | `/api/search/keyword-favorites/:id` | 키워드 즐겨찾기 삭제 |
| POST | `/api/search/index` | (내부) 문서 인덱싱 |
| POST | `/api/search/index/bulk` | (내부) 일괄 인덱싱 |
| DELETE | `/api/search/index/:id` | (내부) 인덱스 삭제 |
| GET | `/api/search/stats` | (내부) 인덱스 통계 |

### 4.7 file-service

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/files` | 파일 업로드 (multipart, 최대 50MB) |
| GET | `/api/files/presigned-upload` | presigned 업로드 URL 발급 |
| GET | `/api/files/:id` | 파일 다운로드 (presigned redirect) |
| GET | `/api/files/:id/url` | presigned URL 조회 (JSON) |
| GET | `/api/files/:id/stream` | 서버 스트리밍 다운로드 |
| GET | `/api/files/:id/meta` | 파일 메타데이터 |
| DELETE | `/api/files/:id` | 파일 삭제 (soft) |
| POST | `/api/exports` | 내보내기 잡 생성 |
| GET | `/api/exports` | 내보내기 잡 목록 |
| GET | `/api/exports/:jobId` | 내보내기 잡 상태 |
| GET | `/api/exports/:jobId/download` | 내보내기 파일 다운로드 |
| DELETE | `/api/exports/:jobId` | 내보내기 잡 삭제 |

### 4.8 collab-service

| Method | Path | 설명 |
|--------|------|------|
| WS | `/collab/notes/:noteId?token=<JWT>` | 실시간 협업 편집 (WebSocket) |
| GET | `/health` | 헬스체크 (활성 룸 수 포함) |

### 4.9 api-gateway (집계)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/dashboard` | 대시보드 집계 (ELN 통계, 서명 규정, 인벤토리 알림, 예약 현황) |

---

## 5. 데이터 모델

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

> Prisma 스키마 기준 (`services/scheduler-service/prisma/schema.prisma`)

```prisma
enum ResourceType {
  EQUIPMENT
  ROOM
}

enum BookingStatus {
  PENDING
  APPROVED
  REJECTED
  CANCELLED
  COMPLETED
}

model Resource {
  id          String       @id @default(uuid())
  name        String
  type        ResourceType
  location    String?
  description String?
  capacity    Int?         // 회의실 수용 인원
  ownerId     String?      // 승인 담당자
  isActive    Boolean      @default(true)
  createdAt   DateTime     @default(now())
  bookings    Booking[]

  @@index([type])
  @@index([isActive])
}

model Booking {
  id             String        @id @default(uuid())
  resourceId     String
  userId         String
  title          String
  description    String?
  startAt        DateTime
  endAt          DateTime
  status         BookingStatus @default(PENDING)
  approvedBy     String?
  approvedAt     DateTime?
  rejectedReason String?
  cancelledAt    DateTime?
  completedAt    DateTime?
  createdAt      DateTime      @default(now())
  resource       Resource      @relation(fields: [resourceId], references: [id])

  @@index([resourceId])
  @@index([userId])
  @@index([status])
  @@index([startAt, endAt])
  @@index([resourceId, status, startAt, endAt])
}
```

### 5.5 signature-audit 스키마

> Prisma 스키마 기준 (`services/signature-audit-service/prisma/schema.prisma`)

```prisma
enum SignatureStatus {
  valid
  revoked
}

enum ExportFormat {
  pdf
  zip
  report
}

enum ExportStatus {
  pending
  processing
  completed
  failed
}

enum NotificationType {
  NOTE_LOCKED
  NOTE_SIGNED
  NOTE_UNLOCKED
  BOOKING_APPROVED
}

model Signature {
  id             String          @id @default(uuid())
  noteId         String
  signerId       String
  signatureHash  String
  prevHash       String?         // 해시 체인 (이전 서명 해시)
  chainIndex     Int             // 체인 순서
  timestamp      DateTime        @default(now())
  status         SignatureStatus @default(valid)

  @@index([noteId])
}

model AuditLog {
  id          String   @id @default(uuid())
  entityType  String   // note | inventory | booking | user
  entityId    String
  action      String   // note.created | note.updated | note.signed | ...
  actorId     String
  details     Json     @default("{}")
  ipAddress   String?
  createdAt   DateTime @default(now())

  @@index([entityId])
  @@index([actorId])
  @@index([createdAt])
}

model ExportJob {
  id           String       @id @default(uuid())
  noteId       String?      // 단건 PDF용
  noteIds      String[]     // 다건 ZIP용
  format       ExportFormat
  status       ExportStatus @default(pending)
  requestedBy  String
  fileUrl      String?
  errorMsg     String?
  createdAt    DateTime     @default(now())
  completedAt  DateTime?

  @@index([requestedBy])
  @@index([status])
  @@index([createdAt])
}

model Notification {
  id          String           @id @default(uuid())
  recipientId String
  type        NotificationType
  entityType  String
  entityId    String
  title       String
  message     String
  actorId     String?
  actorName   String?
  isRead      Boolean          @default(false)
  createdAt   DateTime         @default(now())

  @@index([recipientId, isRead])
  @@index([recipientId, createdAt])
}
```

### 5.6 search 스키마

> Prisma 스키마 기준 (`services/search-service/prisma/schema.prisma`)

```prisma
model SearchHistory {
  id        String   @id @default(uuid())
  userId    String
  query     String
  createdAt DateTime @default(now())

  @@index([userId, createdAt])
}

model Favorite {
  id        String   @id @default(uuid())
  userId    String
  docType   String   // notes | templates | inventory
  docId     String
  title     String
  createdAt DateTime @default(now())

  @@unique([userId, docType, docId])
  @@index([userId])
}

model SearchKeywordFavorite {
  id        String   @id @default(uuid())
  userId    String
  keyword   String
  createdAt DateTime @default(now())

  @@unique([userId, keyword])
  @@index([userId])
}
```

### 5.7 file 스키마

> Prisma 스키마 기준 (`services/file-service/prisma/schema.prisma`)

```prisma
model File {
  id             String   @id @default(uuid())
  bucket         String
  objectKey      String   @unique
  originalName   String
  mimeType       String?
  sizeBytes      Int?
  checksumSha256 String?
  uploaderId     String?
  refType        String?  // note | protocol | export
  refId          String?
  isDeleted      Boolean  @default(false)
  deletedAt      DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([refType, refId])
  @@index([uploaderId])
  @@index([isDeleted])
}

model ExportJob {
  id           String   @id @default(uuid())
  type         String
  status       String   @default("PENDING") // PENDING | PROCESSING | COMPLETED | FAILED
  requestedBy  String
  params       Json     @default("{}")
  resultFileId String?  @unique
  errorMessage String?
  retryCount   Int      @default(0)
  startedAt    DateTime?
  completedAt  DateTime?
  expiresAt    DateTime?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  resultFile   File?    @relation(fields: [resultFileId], references: [id])

  @@index([status])
  @@index([requestedBy])
}
```

---

## 6. 통신 방식

### 6.1 동기 통신 (기본)

- **REST API** (JSON over HTTP) — 모든 서비스 간 기본 통신
- api-gateway가 `/api/{service}/...` 패턴으로 라우팅
- 인증: `Authorization: Bearer <JWT>` 헤더 (gateway에서 검증 후 `x-user-id`, `x-user-role`, `x-user-permissions` 헤더 주입)
- 내부 서비스 간 통신: `x-internal-secret` 헤더로 인증

### 6.2 WebSocket 실시간 통신

- **collab-service** (포트 8009) — 노트 실시간 협업 편집
- JWT 토큰으로 인증 (`?token=<JWT>` 쿼리 파라미터)
- Redis pub/sub로 멀티 인스턴스 동기화
- 메시지 타입: `content-update`, `awareness`, `user-joined`, `user-left`

### 6.3 비동기 이벤트

서비스 간 HTTP 콜백을 통한 이벤트 전파:

| 이벤트 | 발행자 | 구독자 | 설명 |
|--------|--------|--------|------|
| `note.created` | eln-service | search-service | 검색 인덱스 갱신 |
| `note.updated` | eln-service | search-service | 인덱스 갱신 |
| `note.signed` | signature-audit | eln-service | 노트 status → signed |
| `note.locked` | eln-service | signature-audit (알림) | 잠금 알림 발송 |
| `inventory.updated` | inventory-service | search-service | 인덱스 갱신 |
| `export.completed` | signature-audit | (알림) | PDF/ZIP 생성 완료 |

### 6.4 서비스 간 호출 흐름 예시

```
[사용자] → [api-gateway] → [eln-service]
                                │
                                ├─ POST /notes/:id/attachments
                                │   └─→ [file-service] 파일 업로드
                                │
                                ├─ "서명하기" 클릭
                                │   └─→ [signature-audit-service] POST /sign/:noteId
                                │        ├─→ eln-service PATCH /notes/:id/status → signed
                                │        ├─→ audit_logs 기록
                                │        └─→ notification 발송
                                │
                                ├─ PDF 내보내기
                                │   └─→ [signature-audit-service] POST /exports/pdf/:noteId
                                │        └─→ [MinIO] PDF 저장 → presigned URL 반환
                                │
                                └─ 실시간 편집
                                    └─→ [collab-service] WebSocket /collab/notes/:noteId
                                         └─→ [Redis pub/sub] 멀티 인스턴스 브로드캐스트
```

---

## 7. 프로젝트 구조 (모노레포)

```
lab-companion/
├── src/                           # React + Vite 메인 프론트엔드 (포트 5173)
│   ├── api/                       # API 클라이언트 (JWT 자동 주입)
│   ├── components/                # 공용 컴포넌트 + shadcn/ui
│   ├── pages/                     # 페이지 컴포넌트
│   │   └── admin/                 # 관리자 페이지
│   ├── hooks/                     # 커스텀 React 훅
│   ├── lib/                       # 유틸리티
│   └── i18n/                      # 다국어 (ko/en)
│
├── services/
│   ├── shared/                    # 공용 패키지 (@lab/shared)
│   │   └── src/
│   │       ├── errors.ts          # 커스텀 에러 클래스
│   │       ├── logger.ts          # Pino 로거
│   │       ├── permissions.ts     # RBAC 권한/역할 enum
│   │       └── validate.ts        # Zod 검증 미들웨어
│   │
│   ├── api-gateway/               # Fastify + @fastify/http-proxy
│   │   └── src/
│   │       ├── index.ts
│   │       ├── routes/
│   │       │   ├── proxy.ts       # 서비스별 프록시 라우팅
│   │       │   └── dashboard.ts   # 대시보드 집계 API
│   │       └── middlewares/
│   │           └── auth.ts        # JWT 검증 (jose, 듀얼 모드)
│   │
│   ├── auth-service/              # Express + Prisma
│   │   └── src/
│   │       ├── routes/
│   │       ├── controllers/
│   │       ├── dtos/
│   │       └── swagger.ts
│   │
│   ├── eln-service/               # Express + Prisma
│   │   └── src/
│   │       ├── routes/
│   │       │   ├── note.routes.ts
│   │       │   └── template.routes.ts
│   │       ├── controllers/
│   │       │   ├── note.controller.ts
│   │       │   └── template.controller.ts
│   │       ├── dtos/
│   │       ├── middlewares/
│   │       └── lib/
│   │
│   ├── signature-audit-service/   # Express + Prisma + BullMQ + Puppeteer
│   ├── inventory-service/         # Express + Prisma
│   ├── scheduler-service/         # Express + Prisma
│   ├── search-service/            # Express + Prisma + OpenSearch
│   ├── file-service/              # Express + Prisma + MinIO (@aws-sdk/client-s3)
│   ├── collab-service/            # ws + Redis pub/sub (WebSocket)
│   │
│   ├── inventory-frontend/        # React + Vite (인벤토리/프로토콜 전용 SPA)
│   │   └── src/
│   │       ├── api/
│   │       ├── components/
│   │       ├── pages/
│   │       └── types/
│   │
│   ├── keycloak/                  # Keycloak realm 설정
│   │   └── realm-labnote.json
│   │
│   └── docker-compose.yml
│
├── .env.example
├── package.json
└── README.md                      # ← 이 문서
```

---

## 8. 배포 (Docker Compose)

```yaml
# services/docker-compose.yml (개요)
services:
  # --- 인프라 ---
  postgres:     { image: postgres:15-alpine, ports: ["5432:5432"] }
  redis:        { image: redis:7-alpine, ports: ["6379:6379"] }
  minio:        { image: minio/minio, ports: ["9000:9000", "9001:9001"] }
  opensearch:   { image: opensearchproject/opensearch:2, ports: ["9200:9200"] }
  keycloak:     { image: quay.io/keycloak/keycloak:24.0, ports: ["8080:8080"] }

  # --- 백엔드 서비스 ---
  api-gateway:              { build: ./api-gateway, ports: ["8000:8000"] }
  auth-service:             { build: { context: ., dockerfile: auth-service/Dockerfile } }
  eln-service:              { build: { context: ., dockerfile: eln-service/Dockerfile } }
  signature-audit-service:  { build: { context: ., dockerfile: signature-audit-service/Dockerfile } }
  inventory-service:        { build: { context: ., dockerfile: inventory-service/Dockerfile } }
  scheduler-service:        { build: { context: ., dockerfile: scheduler-service/Dockerfile } }
  search-service:           { build: { context: ., dockerfile: search-service/Dockerfile } }
  file-service:             { build: { context: ., dockerfile: file-service/Dockerfile } }
  collab-service:           { build: ./collab-service }

  # --- 프론트엔드 ---
  inventory-frontend:       { build: ./inventory-frontend, ports: ["3000:80"] }
```

### 실행 방법

```bash
git clone <repo-url> && cd lab-companion
cp .env.example .env        # 환경변수 설정 (JWT_SECRET 등 필수)
cd services
docker compose up --build
```

| 서비스 | URL |
|--------|-----|
| 프론트엔드 (인벤토리) | http://localhost:3000 |
| 메인 프론트엔드 (개발) | http://localhost:5173 (vite dev) |
| API Gateway | http://localhost:8000 |
| MinIO 콘솔 | http://localhost:9001 |
| OpenSearch | http://localhost:9200 |
| Keycloak 관리 콘솔 | http://localhost:8080 |

---

## 9. 주요 TODO

- [x] JWT 발급/검증 실제 구현 — 게이트웨이 `jose` 검증 + auth-service `jsonwebtoken` 발급
- [x] 비밀번호 해싱 (bcrypt) — auth-service `bcryptjs` 적용
- [x] DB 마이그레이션 스크립트 — Prisma schema 완비 + Dockerfile 기동 시 `prisma migrate deploy` 자동 실행
- [x] 전자서명 해시 체인 구현 — `prevHash + chainIndex` 체인 + `/verify` 무결성 검증
- [x] PDF 변환 엔진 연동 (Puppeteer) — BullMQ 큐 + Puppeteer-core + MinIO presigned URL + 프론트 폴링 UI 완료
- [x] MinIO 실제 파일 업/다운로드 — `@aws-sdk/client-s3` presigned URL + 스트리밍
- [x] OpenSearch 인덱싱 파이프라인 — 인덱스 자동 생성 + `POST /api/search/index` 수신 API
- [x] SSO/Keycloak 연동 — Keycloak 컨테이너 + realm 자동 임포트 + api-gateway 듀얼 모드(JWKS/로컬JWT) + 프론트 PKCE 리다이렉트 완료
- [x] RBAC 미들웨어 실제 권한 검증 — JWT에 permissions 배열 포함, `requirePermission()` 전 서비스 라우트 적용 완료
- [x] WebSocket 실시간 협업 편집 — collab-service(ws+Redis pub/sub) + NoteEditor 프레즌스 UI + 디바운스 콘텐츠 동기화 완료
- [x] i18n (ko/en) — react-i18next 적용, LoginPage/Dashboard/ExportsPage/AppLayout 번역 완료, 언어 토글 버튼 추가
- [x] 알림 시스템 — signature-audit-service 내장, 내부 API + 폴링 UI (NotificationBell) 완료
- [x] 검색 히스토리/즐겨찾기 — search-service Prisma 모델 + CRUD API 완료
- [x] 인벤토리 알림 — 재고 부족/유효기간 임박 알림 API 완료
- [ ] AI 어시스턴트 서비스 (8007) — 템플릿 추천, 초안 생성, 벡터 인덱싱(Qdrant), RAG 질의
