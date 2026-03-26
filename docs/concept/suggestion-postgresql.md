# PostgreSQL 사용 분석 및 제안사항

> 작성일: 2026-03-19

---

## 아키텍처 개요

```
                        ┌──────────────────────────────────┐
                        │   PostgreSQL 15 (단일 인스턴스)      │
                        │   Database: labnote               │
                        ├──────────────────────────────────┤
                        │  schema=auth       (auth-service)        │
                        │  schema=eln        (eln-service)         │
                        │  schema=signature  (signature-audit)     │
                        │  schema=inventory  (inventory-service)   │
                        │  schema=scheduler  (scheduler-service)   │
                        │  schema=search     (search-service)      │
                        │  schema=file       (file-service)        │
                        │  schema=keycloak   (Keycloak)            │
                        └──────────────────────────────────┘
```

단일 DB, 8개 스키마 — PostgreSQL schema 기반 멀티테넌시로 서비스 간 데이터 격리.

---

## 1. 서비스별 모델 구조

| 서비스 | 모델 | 핵심 역할 |
|--------|------|----------|
| **auth** | Organization, Role, User, Team, TeamMember | 사용자/조직/역할 관리, enum(admin/researcher/reviewer/viewer) |
| **eln** | Note, NoteRevision, NoteStatusHistory, NoteLink, Attachment, Template | 실험노트 CRUD, 이력 추적, 소프트 삭제 |
| **signature-audit** | Signature, AuditLog, ExportJob, Notification | 전자서명 해시체인, 감사로그, 내보내기 |
| **inventory** | InventoryItem, InventoryHistory, Category | 재고 관리, 수량 변경 이력 |
| **scheduler** | Resource, Booking | 장비/회의실 예약, 상태 머신(PENDING→APPROVED→COMPLETED) |
| **search** | SearchHistory, Favorite, SearchKeywordFavorite | 검색 히스토리/즐겨찾기 (실제 검색은 OpenSearch) |
| **file** | File, ExportJob | 파일 메타데이터, 내보내기 작업 큐 |

---

## 2. Prisma 클라이언트 패턴

### 싱글톤 패턴 (7개 서비스 공통)

```typescript
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
});
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

- scheduler-service만 Fastify 플러그인 데코레이터 방식 사용
- file-service만 development 로깅에 `warn` 레벨 추가

---

## 3. 주요 쿼리 패턴

### 병렬 쿼리 (eln-service)

```typescript
const [notes, total] = await Promise.all([
  prisma.note.findMany({ where, skip, take }),
  prisma.note.count({ where }),
]);
```

### 트랜잭션 + 비관적 잠금 (scheduler-service)

```typescript
await fastify.prisma.$transaction(async (tx) => {
  await tx.$executeRaw`SELECT 1 FROM bookings WHERE id = ${id} FOR UPDATE`;
  // 상태 검증 → 충돌 확인 → 업데이트
});
```

approve/reject/cancel/complete 4개 엔드포인트에서 사용.

### 배치 트랜잭션 (inventory-service)

```typescript
const [updated] = await prisma.$transaction([
  prisma.inventoryItem.update({ data: { quantity, status } }),
  prisma.inventoryHistory.create({ data: { /* 이력 */ } }),
]);
```

### Raw SQL (eln-service — 태그 추출)

```typescript
const rows = await prisma.$queryRaw<{ tag: string }[]>`
  SELECT DISTINCT UNNEST(tags) AS tag FROM "Note"
  WHERE type = ${type}::text AND "deletedAt" IS NULL ORDER BY tag
`;
```

### Health Check (file-service)

```typescript
await prisma.$queryRaw`SELECT 1`;
```

---

## 4. 소프트 삭제 현황

| 서비스 | 방식 | 구현 |
|--------|------|------|
| **eln** | `deletedAt DateTime?` | `where: { deletedAt: null }` 필터 |
| **file** | `isDeleted Boolean` + `deletedAt DateTime?` | 이중 플래그 |
| **나머지** | 소프트 삭제 없음 | 하드 삭제 또는 상태 변경 |

---

## 5. Seed 데이터

- **auth-service**: `upsert` 패턴으로 기본 조직/역할/사용자 4명 생성 (bcrypt 10라운드)
- **scheduler-service**: `count()` 가드 후 장비/회의실 4건 생성

---

## 6. Graceful Shutdown 현황

| 서비스 | 방식 | 비고 |
|--------|------|------|
| **scheduler** | Fastify `onClose` 훅에서 `prisma.$disconnect()` | 정상 구현 |
| **eln** | `SIGTERM/SIGINT`에서 event consumer 정지 | Prisma disconnect는 없음 |
| **auth seed** | `finally` 블록에서 `prisma.$disconnect()` | seed 스크립트 한정 |
| **나머지 5개** | 명시적 disconnect 없음 | 프로세스 종료 시 자동 해제에 의존 |

---

## 제안사항

### 제안 1. 커넥션 풀 설정 명시

현재 모든 서비스가 Prisma 기본값(connection_limit 미지정)을 사용. 7개 서비스 × 기본 풀(~5개 커넥션) = 최소 35개 커넥션이 단일 PostgreSQL에 연결. Keycloak까지 합하면 더 많음.

- `DATABASE_URL`에 `?connection_limit=5&pool_timeout=10` 명시 권장
- 프로덕션에서는 **PgBouncer** 같은 외부 커넥션 풀러 도입 검토
- PostgreSQL `max_connections` (기본 100) 설정 확인 필요

### 제안 2. Prisma Middleware로 소프트 삭제 일관성 확보

eln-service와 file-service에서 소프트 삭제를 수동으로 `where: { deletedAt: null }` 필터링하고 있는데, 개발자가 빠뜨리면 삭제된 데이터가 노출됨.

- Prisma middleware(`prisma.$use()`)로 `findMany`/`findFirst`/`count` 호출 시 자동으로 `deletedAt: null` 조건 삽입 권장
- file-service의 이중 플래그(`isDeleted` + `deletedAt`)를 하나로 통일하는 것이 좋음

### 제안 3. Graceful Shutdown 통합 (5개 서비스 미비)

auth, search, file, inventory, signature-audit 서비스에서 `prisma.$disconnect()`를 호출하지 않음. Docker 컨테이너 종료 시 커넥션이 즉시 끊기면서 진행 중인 쿼리가 실패하거나 PostgreSQL에 orphaned connection이 남을 수 있음.

- `@lab/shared`의 `setupProcessHandlers`에 Prisma disconnect 로직을 통합하면 한 곳에서 관리 가능

### 제안 4. Health Check 불균형 해소

file-service만 `SELECT 1`로 DB 상태를 확인하고, 나머지 6개 서비스는 DB 연결 상태 없이 단순 `{ status: 'ok' }` 응답. Docker healthcheck가 통과해도 실제 DB 연결이 끊어진 상태일 수 있음.

- 모든 서비스에 DB health check 추가 권장 (공통 유틸로 `@lab/shared`에 제공)

### 제안 5. 인덱스 최적화

Prisma 스키마에 명시적 인덱스가 부족:

| 서비스 | 테이블 | 권장 인덱스 | 이유 |
|--------|--------|------------|------|
| **eln** | Note | `@@index([ownerId, type, status])` | 목록 조회 시 매번 사용 |
| **inventory** | InventoryItem | `@@index([expiryDate])` | 만료 알림 조회 |
| **signature-audit** | AuditLog | `@@index([userId, createdAt])` | 감사 로그 조회 |
| **scheduler** | Booking | `@@index([resourceId, startAt, endAt])` | 충돌 검출 쿼리 최적화 |

### 제안 6. 크로스 서비스 데이터 참조 무결성

스키마가 분리되어 있어 서비스 간 FK가 없음. 예: `Note.ownerId`가 `auth.User.id`를 참조하지만, 사용자가 삭제되어도 노트는 남음.

- 서비스 간 이벤트 기반 정합성(예: 사용자 삭제 이벤트 → 관련 데이터 비활성화)을 도입하거나
- 주기적 정합성 체크 배치 작업 고려

### 제안 7. 트랜잭션 타임아웃 설정

scheduler-service의 `$transaction` + `FOR UPDATE`에 타임아웃이 없음. 데드락 발생 시 커넥션이 무한 대기할 수 있음.

- `prisma.$transaction(fn, { timeout: 5000 })` 옵션 추가 권장
- PostgreSQL 레벨에서 `statement_timeout`이나 `lock_timeout` 설정도 고려

### 제안 8. 마이그레이션 전략 정립

`prisma/migrations` 폴더가 존재하지만, 서비스별 마이그레이션 실행 순서나 CI/CD 파이프라인에서의 실행 방식이 불명확. 프로덕션 배포 시 7개 스키마의 마이그레이션 순서 관리가 중요.

- docker-compose의 `depends_on`은 마이그레이션 완료를 보장하지 않으므로, 별도 init 컨테이너나 entrypoint 스크립트에서 `prisma migrate deploy`를 실행하는 구조 권장
