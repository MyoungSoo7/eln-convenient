# LabNote ELN 프로젝트에서 배우는 디자인 패턴

> 작성일: 2026-03-24
> 범위: 9개 백엔드 마이크로서비스 + 공용 패키지 (@lab/shared) 전체 소스코드 분석

이 문서는 LabNote ELN 프로젝트에서 실제 사용된 디자인 패턴을 코드 레벨로 정리한 것이다.
교과서적 패턴이 실무 MSA 환경에서 어떻게 변형/적용되는지를 학습할 수 있다.

---

## 목차

1. [아키텍처 패턴](#1-아키텍처-패턴)
2. [생성 패턴 (Creational)](#2-생성-패턴-creational)
3. [구조 패턴 (Structural)](#3-구조-패턴-structural)
4. [행위 패턴 (Behavioral)](#4-행위-패턴-behavioral)
5. [동시성/분산 패턴 (Concurrency & Distributed)](#5-동시성분산-패턴)
6. [데이터 패턴 (Data)](#6-데이터-패턴)
7. [복원력 패턴 (Resilience)](#7-복원력-패턴-resilience)
8. [패턴 맵 (한눈에 보기)](#8-패턴-맵)

---

## 1. 아키텍처 패턴

### 1.1 API Gateway / Reverse Proxy

| 항목 | 내용 |
|------|------|
| 위치 | `services/api-gateway/src/routes/proxy.ts` |
| 설명 | 선언적 라우팅 테이블(`PROXY_TABLE`)로 14개 prefix를 9개 백엔드 서비스에 투명 프록시 |

```typescript
// proxy.ts
const PROXY_TABLE: Record<string, string> = {
  '/api/auth':       process.env.AUTH_SERVICE_URL       || 'http://auth-service:8001',
  '/api/notes':      process.env.ELN_SERVICE_URL        || 'http://eln-service:8002',
  '/api/signatures': process.env.SIGNATURE_SERVICE_URL  || 'http://signature-audit-service:8003',
  // ... 14개 엔트리
};

for (const [prefix, upstream] of Object.entries(PROXY_TABLE)) {
  await app.register(httpProxy, { upstream, prefix, rewritePrefix: prefix });
}
```

**배울 점**: 비즈니스 로직 없이 데이터 구조(객체)만으로 라우팅을 선언적으로 정의하면, 새 서비스 추가 시 한 줄만 추가하면 된다.

---

### 1.2 Aggregator Pattern (대시보드 집계)

| 항목 | 내용 |
|------|------|
| 위치 | `services/api-gateway/src/routes/dashboard.ts` |
| 설명 | Gateway가 여러 서비스에 병렬 요청 후 단일 응답으로 조합. 서비스 장애 시 해당 항목만 null |

```typescript
const [myNoteStats, myRecentNotes, myBookings, unreadCount, myAudit] =
  await Promise.allSettled([
    safeGet(`${ELN_URL}/api/notes/stats?...`, headers),
    safeGet(`${ELN_URL}/api/notes?...`,       headers),
    safeGet(`${SCH_URL}/api/scheduler/...`,   headers),
    safeGet(`${SIG_URL}/api/notifications/unread-count`, headers),
    safeGet(`${SIG_URL}/api/audit?...`,       headers),
  ]);
```

**배울 점**: `Promise.allSettled`로 개별 서비스 장애를 격리하는 것이 `Promise.all`과의 핵심 차이. MSA에서 하나의 서비스 다운이 전체 대시보드를 깨뜨리지 않는다.

---

### 1.3 Token Relay / Header Propagation

| 항목 | 내용 |
|------|------|
| 위치 | `services/api-gateway/src/middlewares/auth.ts` |
| 설명 | Gateway가 JWT를 한 번만 검증하고, 디코딩된 클레임을 신뢰 헤더로 주입 |

```typescript
// JWT 검증 후 다운스트림 헤더 주입
request.headers['x-user-id']          = payload.sub;
request.headers['x-user-role']        = payload.role || 'viewer';
request.headers['x-user-permissions'] = JSON.stringify(payload.permissions || []);
request.headers['x-user-org-id']      = payload.orgId;
request.headers['x-user-team-ids']    = JSON.stringify(teamIds);
```

**배울 점**: 각 서비스가 JWT 라이브러리를 가질 필요 없이 헤더만 읽으면 된다. 인증 로직이 단일 지점(Gateway)에 집중되어 유지보수가 용이하다.

---

### 1.4 CQRS-like (검색 서비스)

| 항목 | 내용 |
|------|------|
| 위치 | `services/search-service/src/routes/search.routes.ts` |
| 설명 | 쓰기(색인)는 내부 서비스만 (`x-internal-secret`), 읽기(검색)는 사용자용 (JWT) — 경로/인증을 분리 |

```
Write (Command): POST /api/search/index      → requireInternalSecret
Read  (Query):   GET  /api/search             → requireAuth + requirePermission(NOTE_READ)
```

**배울 점**: 같은 서비스 안에서도 명령(쓰기)과 조회(읽기) 경로를 분리하면 보안과 성능 최적화를 독립적으로 할 수 있다.

---

## 2. 생성 패턴 (Creational)

### 2.1 Factory Function (로거, 에러 핸들러)

| 항목 | 내용 |
|------|------|
| 위치 | `services/shared/src/logger.ts`, `errors.ts` |
| 설명 | 환경에 따라 다른 설정을 주입하는 팩토리 함수 |

```typescript
// logger.ts — 환경별 로거 팩토리
export function createLogger(serviceName: string) {
  return pino({
    name: serviceName,
    level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
    ...(isDev && { transport: { target: 'pino-pretty' } }),
  });
}

// 조합 팩토리 — 두 관련 객체를 함께 생성
export function createHttpLogger(serviceName: string) {
  const logger = createLogger(serviceName);
  const httpLogger = pinoHttp({ logger, ... });
  return { logger, httpLogger };
}
```

**배울 점**: `new Pino(...)` 직접 호출 대신 팩토리로 감싸면, 환경별 분기 로직을 한 곳에 캡슐화할 수 있다.

---

### 2.2 Strategy Pattern + Factory (StorageProvider)

| 항목 | 내용 |
|------|------|
| 위치 | `services/file-service/src/lib/storage/` |
| 설명 | 인터페이스 정의 → 구현체 2개 (S3, Local) → 환경변수로 선택 |

```typescript
// types.ts — 전략 인터페이스
export interface StorageProvider {
  upload(key: string, body: Buffer, contentType: string): Promise<void>;
  download(key: string): Promise<DownloadResult>;
  delete(key: string): Promise<void>;
  getPresignedDownloadUrl(key: string, expiresIn: number): Promise<string>;
  // ... 11개 메서드
}

// index.ts — 환경변수 기반 전략 선택 + 싱글턴
let _instance: StorageProvider | null = null;
export function getStorage(): StorageProvider {
  if (!_instance) {
    const cfg = buildConfigFromEnv();
    _instance = cfg.type === 'local'
      ? new LocalStorageProvider(cfg)
      : new S3StorageProvider(cfg);
  }
  return _instance;
}
```

**배울 점**: GoF Strategy 패턴의 교과서적 적용. `LocalStorageProvider`의 `getPresignedDownloadUrl()`은 스트리밍 경로를 반환하는 것처럼, 각 구현체가 인터페이스를 자기 방식으로 해석할 수 있다.

---

### 2.3 Builder Pattern (이벤트, 에러 응답)

| 항목 | 내용 |
|------|------|
| 위치 | `services/shared/src/service-events.ts`, `errors.ts` |
| 설명 | 인프라 필드(timestamp 등)를 자동 주입하는 빌더 함수 |

```typescript
// 이벤트 빌더 — 호출자는 도메인 필드만, timestamp는 자동
export function buildServiceEvent<T>(
  type: ServiceEventType, sourceService: string,
  entityId: string, payload: T,
): ServiceEvent<T> {
  return { type, sourceService, entityId, payload, timestamp: new Date().toISOString() };
}

// 에러 응답 빌더 — details가 있을 때만 포함
export function buildErrorResponse(statusCode: number, message: string, code?: string, details?: string[]) {
  const resp: ErrorResponse = { ok: false, error: message, code: code ?? `ERR_${statusCode}` };
  if (details?.length) resp.details = details;
  return resp;
}
```

**배울 점**: 단순한 함수형 빌더지만, 호출 측에서 인프라 관심사(timestamp, 기본 코드)를 신경 쓰지 않아도 된다.

---

### 2.4 Singleton (Prisma, Redis, Storage)

| 항목 | 내용 |
|------|------|
| 위치 | 각 서비스의 `src/lib/prisma.ts`, `redis.ts`, `storage/index.ts` |
| 설명 | 모듈 레벨 변수 + Fastify 플러그인 데코레이션으로 단일 인스턴스 보장 |

```typescript
// prisma.ts — 모듈 스코프 싱글턴
const prisma = new PrismaClient();
export default prisma;

// plugins/prisma.ts — Fastify에 데코레이션
const prismaPlugin = fp(async (fastify) => {
  fastify.decorate('prisma', prisma);
  fastify.addHook('onClose', async () => { await prisma.$disconnect(); });
});
```

**배울 점**: Node.js의 모듈 캐싱이 자연스러운 싱글턴이 된다. Fastify 플러그인으로 등록하면 종료 시 `$disconnect()`가 자동으로 호출된다.

---

## 3. 구조 패턴 (Structural)

### 3.1 Facade / Barrel (공용 패키지)

| 항목 | 내용 |
|------|------|
| 위치 | `services/shared/src/index.ts` |
| 설명 | 10개 내부 모듈을 단일 진입점으로 재수출 |

```typescript
export { AppError, buildErrorResponse, buildFastifyErrorHandler, setupProcessHandlers } from './errors';
export { ErrorCode } from './error-codes';
export { validate } from './validate';
export { createLogger, createHttpLogger } from './logger';
export { Permission, RoleName, RolePermissions } from './permissions';
export { getOrgId, withOrgScope, getTeamIds } from './org-scope';
// ...
```

**배울 점**: 소비 서비스는 `import { AppError, validate, Permission } from '@lab/shared'` 한 줄로 모든 것을 가져온다. 내부 파일 구조가 바뀌어도 import 경로는 불변.

---

### 3.2 Decorator — Object Spread (withOrgScope)

| 항목 | 내용 |
|------|------|
| 위치 | `services/shared/src/org-scope.ts` |
| 설명 | 기존 Prisma where 객체에 orgId를 비파괴적으로 추가 |

```typescript
export function withOrgScope<T extends Record<string, unknown>>(
  where: T, orgId: string,
): T & { orgId: string } {
  return { ...where, orgId };
}

// 사용 예: Prisma where 절에 멀티테넌시 필터 주입
const notes = await prisma.note.findMany({
  where: withOrgScope({ status: 'draft' }, orgId),
});
```

**배울 점**: 함수형 데코레이터는 원본 객체를 변경하지 않고 새 객체를 반환한다. TypeScript의 교차 타입(`T & { orgId: string }`)으로 타입 안전성도 보장.

---

### 3.3 Interface Segregation / Port (최소 인터페이스)

| 항목 | 내용 |
|------|------|
| 위치 | `services/shared/src/middleware.ts` |
| 설명 | Fastify에 직접 의존하지 않고 최소 인터페이스만 정의 |

```typescript
export interface MinimalRequest {
  headers: Record<string, string | string[] | undefined>;
}
export interface MinimalReply {
  code(statusCode: number): MinimalReply;  // Fluent Interface
  send(payload?: unknown): MinimalReply;
}
```

**배울 점**: 공용 패키지가 Fastify를 직접 `import`하면 버전 결합이 생긴다. 최소 인터페이스(Port)를 정의하면 프레임워크 교체 시에도 공용 패키지를 수정할 필요가 없다. (헥사고날 아키텍처의 Port 개념)

---

### 3.4 Prisma Middleware — Query Interceptor (소프트 삭제)

| 항목 | 내용 |
|------|------|
| 위치 | `services/eln-service/src/lib/prisma.ts` |
| 설명 | Prisma `$use`로 모든 Note 조회에 `deletedAt: null` 자동 주입 |

```typescript
prisma.$use(async (params, next) => {
  if (softDeleteModels.includes(params.model) && softDeleteActions.includes(params.action)) {
    if (!params.args.where) params.args.where = {};
    if (params.args.where.deletedAt === undefined) {
      params.args.where.deletedAt = null;
    }
  }
  return next(params);
});
```

**배울 점**: AOP(관점 지향)와 유사. 비즈니스 로직에서 `deletedAt`을 매번 체크하는 것을 잊어도 인프라 레벨에서 보장한다.

---

## 4. 행위 패턴 (Behavioral)

### 4.1 Chain of Responsibility (미들웨어 체이닝)

| 항목 | 내용 |
|------|------|
| 위치 | `services/eln-service/src/routes/note.routes.ts` |
| 설명 | `preHandler` 배열로 인증 → 역할 → 권한 → 검증을 순서대로 체이닝 |

```typescript
// 가장 엄격한 엔드포인트 — 4계층 체이닝
app.post('/notes/:id/admin-unlock', {
  preHandler: [
    requireRole(RoleName.ADMIN),                // 1. 역할 게이트
    requirePermission(Permission.NOTE_UNLOCK),   // 2. 권한 게이트
    validate({ body: AdminUnlockSchema }),        // 3. Zod 검증
  ],
}, ctrl.adminUnlockNote);                         // 4. 비즈니스 로직

// 소유권 검증 포함 — 리소스 로딩 + 권한 체크 통합
app.delete('/notes/:id/attachments/:attachmentId', {
  preHandler: [
    requirePermission(Permission.FILE_DELETE),
    requireOwnerOrAdminFastify(
      async (req) => prisma.attachment.findFirst({ where: { id: req.params.attachmentId } }),
      'uploadedBy',                              // 소유자 필드명
    ),
  ],
}, ctrl.deleteAttachment);
```

**배울 점**: 각 미들웨어는 단일 책임(역할 체크, 권한 체크, 검증)만 가진다. 조합 순서를 바꾸거나 새 미들웨어를 끼워넣는 것이 자유롭다.

---

### 4.2 Closure-based Guard Factory (고차 함수)

| 항목 | 내용 |
|------|------|
| 위치 | `services/shared/src/middleware.ts` |
| 설명 | 인자를 캡처하는 클로저를 반환하는 팩토리 함수 |

```typescript
// 인자(permission)를 클로저로 캡처 → 매번 다른 가드 함수 생성
export function requirePermissionFastify(permission: PermissionValue) {
  return async function permissionGuard(request: MinimalRequest, reply: MinimalReply) {
    const perms = JSON.parse(request.headers['x-user-permissions'] || '[]');
    if (!perms.includes('*') && !perms.includes(permission)) {
      reply.code(403).send({ ok: false, error: `권한이 없습니다: ${permission}` });
    }
  };
}

// 제네릭 + 콜백 주입 — 리소스 로딩 전략을 외부에서 교체 가능
export function requireOwnerOrAdminFastify<T>(
  findResource: (request: MinimalRequest) => Promise<T | null>,  // Strategy 주입
  ownerField: keyof T & string,
) {
  return async function ownerOrAdminGuard(request, reply) {
    const resource = await findResource(request);
    // ... 소유자 확인 후 request.routeResource에 결과 저장
  };
}
```

**배울 점**: 클래스 없이 함수 조합만으로 Strategy 패턴을 구현. `findResource` 콜백이 "어떤 테이블에서 어떤 리소스를 찾을지"라는 전략을 주입한다.

---

### 4.3 State Machine (노트 상태, 예약 상태)

| 항목 | 내용 |
|------|------|
| 위치 (노트) | `services/eln-service/src/dtos/note.dto.ts` + `controllers/note.controller.ts` |
| 위치 (예약) | `services/scheduler-service/src/lib/state-machine.ts` |
| 설명 | 허용 전환을 룩업 테이블로 정의하고, 전환 시 검증 |

```typescript
// eln-service — 노트 상태 전환 맵 (일반 vs 시스템)
export const ALLOWED_STATUS_TRANSITIONS: Record<NoteStatus, NoteStatus[]> = {
  draft:       ['in_progress'],
  in_progress: ['draft', 'locked'],
  signed:      [],            // 불변 종단 상태
  locked:      [],            // admin-unlock만 가능 (별도 경로)
};

// scheduler-service — 예약 상태 전환 맵
const TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  PENDING:   ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED:  ['COMPLETED', 'CANCELLED'],
  REJECTED:  [],   // 종단 상태
  CANCELLED: [],
  COMPLETED: [],
};

export function assertTransition(from: BookingStatus, to: BookingStatus): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw new InvalidTransitionError(from, to);
  }
}
```

**배울 점**: 상태 전환을 `if-else` 체인 대신 데이터(Record)로 선언하면, 전환 규칙을 한눈에 파악할 수 있고 테스트도 쉽다. 빈 배열 `[]`이 종단 상태를 명시적으로 표현한다.

---

### 4.4 Hash Chain (블록체인 유사 패턴)

| 항목 | 내용 |
|------|------|
| 위치 | `services/signature-audit-service/src/controllers/signature.controller.ts` |
| 설명 | 각 서명이 이전 서명의 해시를 참조하여 체인을 형성. 위변조 감지 가능 |

```typescript
// 서명 생성 — 이전 해시를 참조
const prevHash = latestSig?.signatureHash ?? null;
const chainIndex = latestSig ? latestSig.chainIndex + 1 : 0;

const hashInput = `${noteId}:${signerId}:${timestamp}:${prevHash ?? 'genesis'}:${comment ?? ''}`;
const signatureHash = `sha256:${sha256(hashInput)}`;

// 검증 — 체인 순회
for (let i = 0; i < signatures.length; i++) {
  const expectedPrevHash = i === 0 ? null : signatures[i - 1].signatureHash;
  if (sig.prevHash !== expectedPrevHash) { chainIntact = false; }
  if (sig.chainIndex !== i) { chainIntact = false; }
}
```

**배울 점**: 블록체인의 핵심 원리(해시 체인)를 전자서명에 적용. `revoke`는 `status: 'revoked'`만 변경하고 레코드는 보존 — 삭제하면 체인이 깨진다.

---

### 4.5 Observer / Pub-Sub (3가지 변형)

프로젝트에서 3가지 다른 Observer 패턴이 사용된다:

#### a) Redis Streams (이벤트 버스)
```
signature-audit-service → XADD labnote:events → eln-service XREADGROUP
```
- 메시지 지속성 보장, Consumer Group으로 분산 처리
- XCLAIM으로 60초 이상 미처리 메시지 자동 복구

#### b) Redis Pub/Sub (실시간)
```
collab-service → PUBLISH labnote:collab → 모든 인스턴스 SUBSCRIBE
```
- 멀티 서버 인스턴스 간 WebSocket 메시지 동기화
- 메시지 지속성 없음 (연결 끊기면 유실)

#### c) HTTP Fire-and-Forget (알림)
```
scheduler-service → POST /api/notifications/internal → signature-audit-service
```
- `.catch()`로 실패 무시 — 주 작업은 차단하지 않음

**배울 점**: 같은 Observer 패턴이라도 지속성/실시간성/결합도 요구사항에 따라 구현 방식이 다르다.

---

### 4.6 Const Object as Enum (타입 안전 상수)

| 항목 | 내용 |
|------|------|
| 위치 | `services/shared/src/error-codes.ts`, `permissions.ts`, `service-events.ts` |
| 설명 | TypeScript `enum` 대신 `as const` 객체 + 파생 유니온 타입 |

```typescript
export const Permission = {
  NOTE_READ:   'note:read',
  NOTE_WRITE:  'note:write',
  NOTE_SIGN:   'note:sign',
  // ... 22개
} as const;

export type PermissionValue = typeof Permission[keyof typeof Permission];
// → 'note:read' | 'note:write' | 'note:sign' | ...
```

**배울 점**: `as const`로 리터럴 타입을 보존하면서, 파생 유니온 타입으로 함수 인자의 타입 안전성을 확보. Tree-shaking에도 유리하다.

---

## 5. 동시성/분산 패턴

### 5.1 Pessimistic Locking (비관적 락)

| 항목 | 내용 |
|------|------|
| 위치 | `services/scheduler-service/src/routes/bookings.ts`, `services/eln-service/src/controllers/note.controller.ts` |
| 설명 | `SELECT ... FOR UPDATE`로 행 레벨 락을 건 뒤 상태 전환 |

```typescript
// 예약 승인 — 동시 승인 race condition 방지
const booking = await prisma.$transaction(async (tx) => {
  await tx.$executeRaw`SELECT 1 FROM bookings WHERE id = ${id} FOR UPDATE`;

  const current = await tx.booking.findUnique({ where: { id }, include: { resource: true } });
  assertTransition(current.status, 'APPROVED');

  // 승인 시점에 다시 시간 충돌 체크 (APPROVED 예약만)
  const conflict = await checkConflict(tx, current.resourceId, current.startAt, current.endAt, id, ['APPROVED']);
  if (conflict) throw new AppError(409, '승인 시점에 시간 충돌이 발생했습니다.');

  return tx.booking.update({ where: { id }, data: { status: 'APPROVED', ... } });
}, { timeout: 5000 });
```

**배울 점**: 낙관적 락(version 컬럼)이 아닌 비관적 락을 선택한 이유는, 예약 승인은 빈도가 낮지만 충돌 비용이 높기 때문. 승인 시점에 재충돌 체크를 하는 것이 핵심 — PENDING 끼리는 공존을 허용하되, APPROVED와의 충돌만 차단.

---

### 5.2 Event Sourcing (Redis Streams Consumer)

| 항목 | 내용 |
|------|------|
| 위치 | `services/eln-service/src/lib/eventConsumer.ts` |
| 설명 | XREADGROUP + XCLAIM 이중 루프로 이벤트 소비 + 복구 |

```
consumeLoop: XREADGROUP '>' → 신규 메시지 실시간 소비 (5초 블로킹)
claimLoop:   XPENDING + XCLAIM → 60초 이상 미ACK 메시지 재처리 (5회 초과 dead letter)
```

**배울 점**: Kafka 없이 Redis Streams만으로 Consumer Group, At-Least-Once 전달, Dead Letter 처리를 구현할 수 있다. `handleNoteSigned`는 멱등성을 보장하여 재처리가 안전하다.

---

### 5.3 Room Management (WebSocket)

| 항목 | 내용 |
|------|------|
| 위치 | `services/collab-service/src/index.ts` |
| 설명 | `Map<noteId, Map<userId, CollabUser>>`로 인메모리 룸 관리 |

```typescript
const rooms = new Map<string, Map<string, CollabUser>>();

// 입장: 룸 자동 생성, 색상 할당
const room = getRoom(noteId);
room.set(userId, { id: userId, name: userName, colorIdx: assignColorIdx(room), ws, noteId });

// 퇴장: 룸 자동 삭제 (마지막 사용자 퇴장 시)
room.delete(userId);
if (room.size === 0) rooms.delete(noteId);
```

**배울 점**: 외부 저장소(Redis) 없이 인메모리 맵으로 충분한 경우가 있다. 다만 멀티 인스턴스 배포 시 Redis Pub/Sub로 보완한다.

---

## 6. 데이터 패턴

### 6.1 Audit Trail (추가 전용 이력)

| 항목 | 내용 |
|------|------|
| 위치 (인벤토리) | `services/inventory-service/prisma/schema.prisma` — `InventoryHistory` |
| 위치 (노트) | `services/eln-service/prisma/schema.prisma` — `NoteStatusHistory` |
| 위치 (전체) | `services/signature-audit-service/prisma/schema.prisma` — `AuditLog` |
| 설명 | 모든 변경을 추가 전용(append-only) 테이블에 기록 |

```typescript
// 수량 변경 + 이력 기록을 트랜잭션으로 원자 처리
const [updated] = await prisma.$transaction([
  prisma.inventoryItem.update({ where: { id }, data: { quantity: after, status: newStatus } }),
  prisma.inventoryHistory.create({
    data: { changeType, quantityBefore: before, quantityAfter: after, quantityDelta: delta, ... }
  }),
]);
```

**배울 점**: 이력 테이블에는 UPDATE/DELETE API가 없다. 읽기 전용 → 데이터 무결성 자연스럽게 보장. 노트 상태 변경은 DB 트리거(`check_note_status_transition`)가 최종 안전장치.

---

### 6.2 Cache-Aside (캐시 옆에 두기)

| 항목 | 내용 |
|------|------|
| 위치 | `services/inventory-service/src/controllers/inventory.controller.ts` (카테고리) |
| 위치 | `services/search-service/src/controllers/search.controller.ts` (검색 결과) |
| 설명 | 읽기: Redis 캐시 확인 → 미스 시 DB → 결과를 Redis에 저장. 쓰기: DB 업데이트 → 캐시 무효화 |

```typescript
// 읽기 경로
const cached = await redis.get(cacheKey);
if (cached) return JSON.parse(cached);              // cache hit

const data = await prisma.category.findMany(...);    // cache miss → DB
await redis.set(cacheKey, JSON.stringify(data), 'EX', 1800);  // 30분 TTL

// 쓰기 경로 — 변경 후 캐시 삭제
await prisma.category.create({ data: { ... } });
await redis.del(`cache:inv-categories:${orgId}`);    // 무효화
```

**배울 점**: 검색 서비스는 SHA-256 해시 키로 쿼리별 캐시를 생성하고, 색인 변경 시 `cache:search:*` 패턴으로 일괄 무효화한다. 캐시 키 설계가 멀티테넌시(orgId, userId 포함)와 보안을 보장하는지 주의.

---

### 6.3 Soft Delete (논리 삭제)

프로젝트에서 2가지 레이어의 소프트 삭제가 존재:

| 레이어 | 방식 | 위치 |
|--------|------|------|
| PostgreSQL | `deletedAt` 필드 + Prisma 미들웨어 자동 필터 | eln-service (Note) |
| OpenSearch | `docStatus: 'deleted'` + 검색 쿼리 필터 | search-service |
| MinIO | `isDeleted: true` → 24시간 유예 → 6시간 배치 물리 삭제 | file-service |

**배울 점**: 소프트 삭제의 구현 방식이 저장소 특성에 따라 다르다. DB는 `deletedAt`, 검색엔진은 `docStatus`, 파일은 시간 유예 후 물리 삭제.

---

## 7. 복원력 패턴 (Resilience)

### 7.1 Redis → HTTP Fallback (수동 서킷 브레이크)

| 항목 | 내용 |
|------|------|
| 위치 | `services/signature-audit-service/src/controllers/signature.controller.ts` |
| 설명 | Redis Stream 발행 실패 시 HTTP 직접 호출로 폴백 |

```typescript
const eventId = await publishEvent('NOTE_SIGNED', { noteId, status, userId, timestamp });
if (eventId) return true;    // Redis 성공

// Redis 실패 → HTTP 폴백
logger.warn('Redis 이벤트 발행 실패 — HTTP 폴백으로 전환');
const res = await fetch(`${ELN_SERVICE_URL}/api/notes/${noteId}/status`, {
  method: 'PATCH',
  headers: { 'x-user-role': 'system', 'x-internal-secret': INTERNAL_SECRET },
  body: JSON.stringify({ status: 'signed' }),
});
```

---

### 7.2 Exponential Backoff Retry (지수 백오프 재시도)

| 항목 | 내용 |
|------|------|
| 위치 | `services/file-service/src/lib/jobWorker.ts` |
| 설명 | 실패 시 `2^retryCount * 5초` 간격으로 재시도 (최대 3회) |

```typescript
const delay = Math.pow(2, job.retryCount) * 5000;  // 5s → 10s → 20s
setTimeout(() => jobQueue.push(jobId), delay);
```

---

### 7.3 Timeout + AbortController

| 항목 | 내용 |
|------|------|
| 위치 | `services/signature-audit-service/src/lib/eln.ts` |
| 설명 | 외부 서비스 호출에 5초 타임아웃 + AbortController |

```typescript
async function fetchWithTimeout(url: string, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
```

---

### 7.4 Fire-and-Forget (비차단 부수효과)

| 항목 | 내용 |
|------|------|
| 위치 | 전 서비스의 audit, notification, search indexing 호출 |
| 설명 | 주 작업 완료 후 부수효과는 `.catch()`로 실패를 무시 |

```typescript
// 노트 생성 성공 → 감사 로그는 실패해도 노트 생성은 완료
await callAuditLog({ entityType: 'note', action: 'note.created', ... })
  .catch((err) => logger.warn({ err }, 'audit 기록 실패 (노트 생성은 완료)'));

// 검색 인덱싱도 fire-and-forget
searchClient.index({ id: note.id, doc: { ... } });  // no await
```

**배울 점**: 주 비즈니스 로직의 성공/실패와 부수효과(로깅, 검색, 알림)를 분리하면 가용성이 높아진다. 단, 부수효과의 일관성은 "결과적 일관성(eventual consistency)"으로 보장.

---

## 8. 패턴 맵

```
┌─────────────────────────────────────────────────────────────┐
│                    아키텍처 패턴                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │API Gateway│  │Aggregator│  │Token     │  │CQRS-like │   │
│  │/ Proxy   │  │(Dashboard)│  │Relay     │  │(Search)  │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
├─────────────────────────────────────────────────────────────┤
│                    생성 패턴                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │Factory   │  │Strategy  │  │Builder   │  │Singleton │   │
│  │Function  │  │+Factory  │  │(Event/Err)│  │(Prisma)  │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
├─────────────────────────────────────────────────────────────┤
│                    구조 패턴                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │Facade/   │  │Decorator │  │Interface │  │Query     │   │
│  │Barrel    │  │(OrgScope)│  │Segregation│  │Interceptor│   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
├─────────────────────────────────────────────────────────────┤
│                    행위 패턴                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │Chain of  │  │State     │  │Hash Chain│  │Observer  │   │
│  │Responsi. │  │Machine   │  │(Signature)│  │(Pub/Sub) │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
├─────────────────────────────────────────────────────────────┤
│              동시성/분산 + 데이터 + 복원력                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │Pessimistic│  │Event     │  │Cache-    │  │Retry/    │   │
│  │Locking   │  │Sourcing  │  │Aside     │  │Fallback  │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │Room      │  │Audit     │  │Soft      │  │Fire-and- │   │
│  │Management│  │Trail     │  │Delete    │  │Forget    │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 서비스별 패턴 적용 현황

| 패턴 | shared | gateway | auth | eln | sig-audit | inventory | scheduler | search | file | collab |
|------|:------:|:-------:|:----:|:---:|:---------:|:---------:|:---------:|:------:|:----:|:------:|
| Factory Function | O | | | | | | | | | |
| Strategy | O | | | | | | | | O | |
| Builder | O | | | | O | | | | | |
| Singleton | O | | | O | | O | | O | O | |
| Facade/Barrel | O | | | | | | | | | |
| Decorator | O | | | | | | | | | |
| Interface Segregation | O | | | | | | | | | |
| Chain of Responsibility | O | | O | O | O | O | O | O | O | |
| State Machine | | | | O | | | O | | | |
| Hash Chain | | | | | O | | | | | |
| Proxy | | O | | | | | | | | |
| Aggregator | | O | | | | | | | | |
| Token Relay | | O | | | | | | | | |
| CQRS-like | | | | | | | | O | | |
| Observer (Pub/Sub) | | O | | O | O | | O | | | O |
| Pessimistic Locking | | | | O | | | O | | | |
| Event Sourcing (Streams) | | | | O | O | | | | | |
| Cache-Aside | | O | | | | O | | O | | |
| Audit Trail | | | | O | O | O | | | | |
| Soft Delete | | | | O | | | | O | O | |
| Retry / Fallback | | | | | O | | | | O | |
| Fire-and-Forget | | | | O | O | | O | O | | |
| Room Management | | | | | | | | | | O |
| Query Interceptor | | | | O | | | | | | |

---

> **참고**: 이 문서의 모든 코드 스니펫은 실제 프로젝트 소스코드에서 발췌한 것이며, 파일 경로와 라인 번호는 작성 시점 기준이다.
