# LabNote ELN - TypeScript 패턴 가이드

> 이 프로젝트에서 실제 사용된 TypeScript 고급 패턴을 코드와 함께 정리한다.
> 각 패턴이 **왜** 그렇게 쓰였는지, **어디에서** 쓰였는지를 중심으로 설명한다.

---

## 목차

1. [`as const` + 파생 유니온 타입](#1-as-const--파생-유니온-타입)
2. [Zod 스키마 + `z.infer` 타입 추출](#2-zod-스키마--zinfer-타입-추출)
3. [제네릭 함수와 제약 조건](#3-제네릭-함수와-제약-조건)
4. [교차 타입 (Intersection Types)](#4-교차-타입-intersection-types)
5. [고차 함수와 클로저 타이핑](#5-고차-함수와-클로저-타이핑)
6. [Record 유틸리티 타입으로 상태 머신 정의](#6-record-유틸리티-타입으로-상태-머신-정의)
7. [`declare module` — Fastify 타입 확장](#7-declare-module--fastify-타입-확장)
8. [최소 인터페이스 (Interface Segregation)](#8-최소-인터페이스-interface-segregation)
9. [`instanceof` 타입 내로잉](#9-instanceof-타입-내로잉)
10. [문자열 리터럴 유니온과 판별 유니온](#10-문자열-리터럴-유니온과-판별-유니온)
11. [Omit/유틸리티 타입 활용](#11-omit유틸리티-타입-활용)
12. [커스텀 에러 클래스 상속](#12-커스텀-에러-클래스-상속)
13. [타입 별칭 재수출](#13-타입-별칭-재수출)
14. [Fastify 인라인 제네릭](#14-fastify-인라인-제네릭)
15. [패턴 요약 매트릭스](#15-패턴-요약-매트릭스)

---

## 1. `as const` + 파생 유니온 타입

**가장 자주 쓰이는 패턴.** TypeScript `enum` 대신 `as const` 객체와 파생 타입으로 타입 안전 상수를 만든다.

### 패턴

```typescript
// 1. const 객체 선언
export const Permission = {
  NOTE_READ:  'note:read',
  NOTE_WRITE: 'note:write',
  NOTE_SIGN:  'note:sign',
  // ...
} as const;

// 2. 값의 유니온 타입 추출
export type PermissionValue = typeof Permission[keyof typeof Permission];
// → 'note:read' | 'note:write' | 'note:sign' | ...
```

### 이렇게 동작한다

```
typeof Permission
  → { readonly NOTE_READ: 'note:read'; readonly NOTE_WRITE: 'note:write'; ... }

keyof typeof Permission
  → 'NOTE_READ' | 'NOTE_WRITE' | 'NOTE_SIGN' | ...

typeof Permission[keyof typeof Permission]
  → 'note:read' | 'note:write' | 'note:sign' | ...
```

### 프로젝트 적용 (5곳)

| 상수 | 파생 타입 | 파일 |
|------|----------|------|
| `Permission` | `PermissionValue` | `shared/src/permissions.ts:8-50` |
| `RoleName` | `RoleNameValue` | `shared/src/permissions.ts:54-61` |
| `ErrorCode` | `ErrorCodeValue` | `shared/src/error-codes.ts:4-95` |
| `ServiceEventType` | `ServiceEventType` (동명 타입) | `shared/src/service-events.ts:13-21` |
| `EXPIRY` | (타입 추출 없음, 값만 사용) | `file-service/src/lib/storage/types.ts:61-65` |

### 왜 `enum` 대신 이 패턴인가?

| 비교 | `enum` | `as const` 객체 |
|------|--------|-----------------|
| 런타임 코드 | 역방향 매핑 객체 생성 | 순수 객체 — 추가 코드 없음 |
| Tree-shaking | 불가 (IIFE로 컴파일) | 가능 |
| 값 접근 | `Permission.NOTE_READ` | 동일 |
| 타입 검사 | `Permission` (enum 타입) | `PermissionValue` (유니온 타입) |
| JS 호환성 | `.js` 파일에서 못 씀 | 그냥 객체라 아무데서나 가능 |

### 고급: 동명 값/타입 (Value-Type Namespace Merging)

```typescript
// shared/src/service-events.ts
export const ServiceEventType = { ... } as const;           // 값 (런타임 객체)
export type ServiceEventType = (typeof ServiceEventType)[keyof typeof ServiceEventType];  // 타입

// 사용처에서 값으로도 타입으로도 쓸 수 있다
const evt: ServiceEventType = ServiceEventType.NOTE_SIGNED;  // 둘 다 ServiceEventType
```

TypeScript에서 같은 이름으로 `const`와 `type`을 선언하면, 사용 맥락에 따라 자동으로 값/타입이 구분된다.

---

## 2. Zod 스키마 + `z.infer` 타입 추출

**모든 서비스의 DTO에서 사용.** 런타임 검증(Zod)과 컴파일타임 타입을 하나의 소스에서 생성한다.

### 기본 패턴

```typescript
// eln-service/src/dtos/note.dto.ts

// 1. Zod 스키마 정의 (런타임 검증기)
export const CreateNoteSchema = z.object({
  title: z.string().min(1, 'title은 필수입니다.'),
  type: z.enum(['note', 'template']).optional(),
  content: z.string().optional(),
  sections: z.array(SectionSchema).optional(),
  templateId: z.string().optional(),
  tags: z.array(z.string()).default([]),
});

// 2. 타입 자동 추출 (컴파일타임)
export type CreateNoteDto = z.infer<typeof CreateNoteSchema>;
// → { title: string; type?: 'note' | 'template'; content?: string; ... }
```

### Zod enum → TypeScript 유니온

```typescript
export const NoteStatusEnum = z.enum(['draft', 'in_progress', 'signed', 'locked']);
export type NoteStatus = z.infer<typeof NoteStatusEnum>;
// → 'draft' | 'in_progress' | 'signed' | 'locked'
```

### 고급 Zod 패턴들

```typescript
// 1. z.record — 자유 형식 객체
metadata: z.record(z.string(), z.unknown()).default({})
// → Record<string, unknown>

// 2. z.literal — 정확한 값 하나
type: z.literal('pdf')
// → { type: 'pdf' } (디스크리미네이터)

// 3. .passthrough() — 정의된 필드 외 추가 필드 허용
const IndexDocBodySchema = z.object({
  id: z.string().min(1),
  doc: z.object({ domainType: DomainTypeEnum }).passthrough(),
});
// doc에 domainType 외 어떤 필드든 추가 가능

// 4. z.coerce — 문자열을 자동 변환
page: z.coerce.number().min(1).default(1)
// query string "3" → number 3

// 5. .nullable().optional() 조합
roleId: z.string().nullable().optional()
// → string | null | undefined
```

### validate 미들웨어 연결

```typescript
// shared/src/validate.ts
interface ValidateSchemas {
  body?: ZodSchema;     // 어떤 Zod 스키마든 가능
  query?: ZodSchema;
  params?: ZodSchema;
}

export function validate(schemas: ValidateSchemas) {
  return async (request, reply) => {
    if (schemas.body) request.body = schemas.body.parse(request.body);
    // parse 성공 → 검증된 타입으로 교체
    // parse 실패 → ZodError throw → 에러 핸들러에서 400 반환
  };
}

// 사용: 라우트에서 preHandler로 연결
app.post('/notes', {
  preHandler: [requirePermission(Permission.NOTE_WRITE), validate({ body: CreateNoteSchema })],
}, ctrl.createNote);
```

### 프로젝트 전체 Zod 스키마 현황

| 서비스 | 파일 | 스키마 수 | 주요 스키마 |
|--------|------|-----------|------------|
| auth | `auth.dto.ts` | 12 | Login, Register, CreateUser, CreateRole |
| eln | `note.dto.ts` | 14 | CreateNote, UpdateNote, ChangeStatus, AdminUnlock, AddLink, CreateTemplate |
| inventory | `inventory.dto.ts` | 9 | CreateItem, UpdateItem, AdjustQuantity, CreateCategory |
| search | `search.dto.ts` | 10 | SearchQuery, IndexDocBody, AddFavorite |
| file | `file.dto.ts` | 8 | UploadFile, CreatePdfExport, CreateZipExport |
| signature-audit | `signature.dto.ts` | 13 | SignNote, RevokeSignature, CreateAuditLog, ExportZipBody |

---

## 3. 제네릭 함수와 제약 조건

### 기본 제네릭 함수

```typescript
// shared/src/service-events.ts
export function buildServiceEvent<T>(
  type: ServiceEventType,
  sourceService: string,
  entityId: string,
  payload: T,                    // T는 호출 시 자동 추론
): ServiceEvent<T> {             // 반환 타입도 T를 포함
  return { type, sourceService, entityId, payload, timestamp: new Date().toISOString() };
}

// 호출 시 타입 자동 추론
const event = buildServiceEvent('NOTE_SIGNED', 'signature', 'note-123', { signerId: 'user-1' });
// event: ServiceEvent<{ signerId: string }>
```

### 제네릭 인터페이스 + 기본 타입 파라미터

```typescript
// shared/src/service-events.ts
export interface ServiceEvent<T = unknown> {  // T 생략 시 unknown
  type: ServiceEventType;
  payload: T;                                  // T가 payload의 타입을 결정
  // ...
}

// 사용
const specific: ServiceEvent<NoteSignedPayload> = { ... }; // payload가 NoteSignedPayload
const generic: ServiceEvent = { ... };                      // payload가 unknown
```

### `extends` 제약 조건

```typescript
// shared/src/org-scope.ts
export function withOrgScope<T extends Record<string, unknown>>(
//                           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
//                           T는 최소한 객체여야 한다
  where: T,
  orgId: string,
): T & { orgId: string } {
  return { ...where, orgId };
}

// 컴파일 타임에 보장:
withOrgScope({ status: 'draft' }, 'org-1');        // OK
withOrgScope('not-an-object', 'org-1');            // 컴파일 에러!
```

### `keyof T & string` — 키 타입 좁히기

```typescript
// shared/src/middleware.ts
export function requireOwnerOrAdminFastify<T extends Record<string, unknown>>(
  findResource: (request: MinimalRequest) => Promise<T | null>,
  ownerField: keyof T & string,   // T의 키 중 string인 것만 허용
//            ^^^^^^^^^^^^^^^^^
//            keyof T는 string | number | symbol 이 될 수 있다.
//            & string으로 교차하면 string 키만 남는다.
) { ... }

// 사용: ownerField에 실제 존재하는 필드명만 넣을 수 있다
requireOwnerOrAdminFastify(
  async (req) => prisma.attachment.findFirst({ ... }),
  'uploadedBy',    // Attachment 모델에 uploadedBy 필드가 있어야 컴파일 통과
);
```

### 제네릭 HTTP 헬퍼

```typescript
// file-service/src/lib/elnClient.ts
function request<T>(path: string): Promise<T> {
  // 내부: fetch → JSON parse → T로 캐스팅
}

// 호출 시 반환 타입 지정
const note = await request<NoteExportData>(`/api/notes/${noteId}`);
// note: NoteExportData (타입 안전)

const notes = await request<NoteListItem[]>('/api/notes?status=signed');
// notes: NoteListItem[]
```

---

## 4. 교차 타입 (Intersection Types)

### 객체 확장 (Decorator 패턴)

```typescript
// shared/src/org-scope.ts
export function withOrgScope<T extends Record<string, unknown>>(
  where: T,
  orgId: string,
): T & { orgId: string } {     // T의 모든 필드 + orgId
  return { ...where, orgId };
}

// 입력: { status: 'draft' }
// 출력: { status: 'draft', orgId: 'org-1' }
// 타입: { status: string } & { orgId: string }
```

### 요청 객체 확장

```typescript
// shared/src/middleware.ts
request: MinimalRequest & { routeResource?: T }
//       ^^^^^^^^^^^^^^^   ^^^^^^^^^^^^^^^^^
//       기본 요청 타입      + 리소스 프로퍼티 추가
```

**왜 교차 타입인가?** `extends`로 새 인터페이스를 만드는 대신 `&`로 즉석에서 조합하면, 일회성 타입에 이름을 붙이지 않아도 된다.

---

## 5. 고차 함수와 클로저 타이핑

### 미들웨어 팩토리 — 클로저가 파라미터를 캡처

```typescript
// shared/src/middleware.ts

// 외부 함수: 파라미터를 받아 클로저를 반환
export function requirePermissionFastify(
  permission: PermissionValue              // 컴파일타임에 유효한 권한 문자열만 허용
): (request: MinimalRequest, reply: MinimalReply) => Promise<void> {
//  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
//  반환 타입: Fastify preHandler 시그니처

  // 내부 함수: permission을 클로저로 캡처
  return async function permissionGuard(request, reply) {
    const perms: string[] = JSON.parse(
      (request.headers['x-user-permissions'] as string) || '[]'
    );
    if (!perms.includes('*') && !perms.includes(permission)) {
      reply.code(403).send({ ok: false, error: `권한이 없습니다: ${permission}` });
    }
  };
}
```

### 제네릭 + 콜백 주입 (Strategy)

```typescript
// shared/src/middleware.ts
export function requireOwnerOrAdminFastify<T extends Record<string, unknown>>(
  findResource: (request: MinimalRequest) => Promise<T | null>,  // 전략 콜백
  ownerField: keyof T & string,                                  // 소유자 필드명
  errorCode: string = ErrorCode.FORBIDDEN,                       // 기본값 매개변수
) {
  return async function ownerOrAdminGuard(
    request: MinimalRequest & { routeResource?: T },  // 교차 타입으로 확장
    reply: MinimalReply,
  ): Promise<void> {
    const resource = await findResource(request);
    if (!resource) throw new AppError(404, ...);
    const ownerId = String(resource[ownerField]);
    const userId = request.headers['x-user-id'] as string;
    const role = request.headers['x-user-role'] as string;
    if (ownerId !== userId && role !== 'admin') {
      throw new AppError(403, ...);
    }
    (request as any).routeResource = resource;  // 하위 핸들러에서 재사용
  };
}
```

### 사용 예: 서비스마다 다른 "전략" 주입

```typescript
// eln-service — 첨부파일 소유권 검증
requireOwnerOrAdminFastify(
  async (req) => prisma.attachment.findFirst({ where: { id: req.params.attachmentId } }),
  'uploadedBy',
)

// file-service — 파일 소유권 검증
requireOwnerOrAdminFastify(
  async (req) => prisma.file.findFirst({ where: { id: req.params.id, orgId } }),
  'uploadedBy',
)

// inventory-service — 아이템 소유권 검증
requireOwnerOrAdminFastify(
  async (req) => prisma.inventoryItem.findFirst({ where: { id: req.params.id, orgId } }),
  'createdBy',
)
```

동일한 제네릭 함수가 `Attachment`, `File`, `InventoryItem` 세 가지 다른 모델에 타입 안전하게 적용된다.

---

## 6. `Record` 유틸리티 타입으로 상태 머신 정의

### 핵심: `Record<EnumType, EnumType[]>`로 전환 맵 선언

```typescript
// eln-service/src/dtos/note.dto.ts
export const ALLOWED_STATUS_TRANSITIONS: Record<NoteStatus, NoteStatus[]> = {
  draft:       ['in_progress'],
  in_progress: ['draft', 'locked'],
  signed:      [],
  locked:      [],
};
```

**Record가 강제하는 것:**

```typescript
Record<NoteStatus, NoteStatus[]>
// = Record<'draft' | 'in_progress' | 'signed' | 'locked', NoteStatus[]>
// → 4개 키가 모두 있어야 컴파일 통과
```

만약 `signed` 키를 빠뜨리면:
```
Property 'signed' is missing in type '{ draft: ...; in_progress: ...; locked: ...; }'
but required in type 'Record<NoteStatus, NoteStatus[]>'.
```

### 예약 상태도 동일 패턴

```typescript
// scheduler-service/src/lib/state-machine.ts
const TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  PENDING:   ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED:  ['COMPLETED', 'CANCELLED'],
  REJECTED:  [],      // 종단 상태
  CANCELLED: [],
  COMPLETED: [],
};
```

### 역할-권한 매핑

```typescript
// shared/src/permissions.ts
export const RolePermissions: Record<RoleNameValue, readonly string[]> = {
  admin:      ['*'],
  researcher: [Permission.NOTE_READ, Permission.NOTE_WRITE, ...],
  reviewer:   [Permission.NOTE_READ, Permission.NOTE_STATUS, Permission.NOTE_SIGN, ...],
  viewer:     [Permission.NOTE_READ, ...],
};
```

`Record<RoleNameValue, ...>`이므로 새 역할(`RoleName`에 추가)이 생기면, `RolePermissions`에도 반드시 추가해야 컴파일된다.

### 프론트엔드 라벨/색상 맵

```typescript
// inventory-frontend/src/types/inventory.ts
const ITEM_STATUS_LABELS: Record<ItemStatus, string> = {
  available: '사용 가능', in_use: '사용 중', depleted: '소진', ...
};
const ITEM_STATUS_COLORS: Record<ItemStatus, string> = {
  available: 'green', in_use: 'blue', depleted: 'gray', ...
};
```

---

## 7. `declare module` — Fastify 타입 확장

### 패턴: 7개 서비스에서 동일하게 사용

```typescript
// services/*/src/plugins/prisma.ts (auth, eln, inventory, scheduler, search, signature-audit, file)

import { PrismaClient } from '@prisma/client';
import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

// 1. 모듈 선언 병합 — FastifyInstance에 prisma 프로퍼티 추가
declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

// 2. 런타임에 실제로 프로퍼티 장착
const prismaPlugin: FastifyPluginAsync = fp(async (fastify) => {
  fastify.decorate('prisma', prisma);   // 이제 fastify.prisma 로 접근 가능
  fastify.addHook('onClose', async () => {
    await prisma.$disconnect();
  });
});
```

### 어떻게 동작하는가

TypeScript의 **Declaration Merging**: 같은 `interface FastifyInstance`를 여러 곳에서 선언하면, 컴파일러가 모든 선언을 합친다.

```
Fastify 원본:    interface FastifyInstance { log: Logger; ... }
우리 서비스:     interface FastifyInstance { prisma: PrismaClient; }
                                            ↓ 병합
최종:            interface FastifyInstance { log: Logger; prisma: PrismaClient; ... }
```

이후 `fastify.prisma.note.findMany(...)` 같은 코드에서 자동 완성과 타입 검사가 작동한다.

---

## 8. 최소 인터페이스 (Interface Segregation)

### Fastify에 직접 의존하지 않는 공용 패키지

```typescript
// shared/src/middleware.ts

// Fastify의 Request/Reply 대신 최소한의 인터페이스만 정의
export interface MinimalRequest {
  headers: Record<string, string | string[] | undefined>;
}

export interface MinimalReply {
  code(statusCode: number): MinimalReply;   // Fluent Interface: 자기 자신 반환
  send(payload?: unknown): MinimalReply;
}
```

### 왜 이렇게 하는가?

```
@lab/shared는 Fastify를 import하지 않는다
→ Fastify 버전 업그레이드 시 shared 패키지를 수정할 필요 없음
→ 이론적으로 Express 등 다른 프레임워크에서도 shared를 쓸 수 있음
```

이것은 헥사고날 아키텍처의 **Port** 개념이다. `MinimalRequest`/`MinimalReply`가 Port이고, 실제 Fastify 객체가 Adapter.

### 에러 핸들러도 마찬가지

```typescript
// shared/src/errors.ts
interface FastifyLikeError extends Error {
  statusCode?: number;
  validation?: { message?: string }[];
}

export function buildFastifyErrorHandler(logger?: Logger) {
  return (error: FastifyLikeError, _request: unknown, reply: MinimalReply) => { ... };
}
```

`FastifyLikeError`는 Fastify의 실제 에러 타입을 import하지 않고, 필요한 필드만 정의한 구조적 타입(structural type)이다.

---

## 9. `instanceof` 타입 내로잉

### 에러 핸들링에서 계층적 내로잉

```typescript
// shared/src/errors.ts — 에러 핸들러 (3단계 내로잉)
export function buildFastifyErrorHandler(logger?: Logger) {
  return (error: FastifyLikeError, _request: unknown, reply: MinimalReply) => {

    // 1단계: 커스텀 AppError인가?
    if (error instanceof AppError) {
      // 여기서 error는 AppError 타입 → .statusCode, .code, .details 접근 가능
      return reply.code(error.statusCode).send(buildErrorResponse(...));
    }

    // 2단계: Fastify 유효성 검증 에러인가?
    if (error.validation) {
      // 여기서 error.validation은 { message?: string }[]
      const details = error.validation.map((v) => v.message ?? String(v));
      return reply.code(400).send(buildErrorResponse(400, '입력값 검증 실패', ...));
    }

    // 3단계: 알 수 없는 에러 (fallback)
    return reply.code(500).send(buildErrorResponse(500, '서버 내부 오류'));
  };
}
```

### Zod 에러 내로잉

```typescript
// shared/src/validate.ts
try {
  if (schemas.body) request.body = schemas.body.parse(request.body);
} catch (err) {
  if (err instanceof ZodError) {
    // err: ZodError → .issues 배열 접근 가능
    const details = err.issues.map((e) => `${e.path.join('.')}: ${e.message}`);
    reply.code(400).send(buildErrorResponse(400, '입력값이 올바르지 않습니다.', ...));
  }
}
```

### 서비스별 커스텀 에러 내로잉

```typescript
// scheduler-service/src/routes/bookings.ts
try {
  assertTransition(current.status, 'APPROVED');
} catch (err) {
  if (err instanceof InvalidTransitionError) {
    // err: InvalidTransitionError → .from, .to 속성 접근 가능
    return reply.code(400).send({ ok: false, error: err.message });
  }
  throw err;  // 다른 에러는 상위로 전파
}
```

---

## 10. 문자열 리터럴 유니온과 판별 유니온

### 문자열 리터럴 유니온 — 인터페이스 필드

```typescript
// signature-audit-service/src/interfaces/signature.interface.ts
export interface ISignature {
  status: 'valid' | 'revoked';          // 2개 중 하나
}

export interface IAuditLog {
  entityType: 'note' | 'inventory' | 'booking' | 'user';     // 4개 중 하나
  action: 'created' | 'updated' | 'signed' | 'exported' | 'deleted' | 'admin_unlock';
}

export interface IExportJob {
  format: 'pdf' | 'zip';
  status: 'pending' | 'processing' | 'completed' | 'failed';
}
```

### 판별 유니온 (Discriminated Union) — `ok: false` 리터럴

```typescript
// shared/src/errors.ts
export interface ErrorResponse {
  ok: false;              // ← 리터럴 타입이 판별자(discriminant)
  error: string;
  code: string;
  details?: string[];
}

// 이렇게 쓰면:
type ApiResponse<T> = { ok: true; data: T } | ErrorResponse;

// 사용처에서 자동 내로잉:
if (response.ok) {
  response.data;    // OK — ok: true 분기이므로 data 존재
} else {
  response.error;   // OK — ok: false 분기이므로 error 존재
}
```

### 런타임 내로잉 — 변수 타입 선언

```typescript
// signature-audit-service/src/controllers/signature.controller.ts
const reason: 'editable' | 'locked' | 'signed' = editable
  ? 'editable'
  : note.status === 'locked' ? 'locked' : 'signed';
```

---

## 11. `Omit` / 유틸리티 타입 활용

### Prisma 트랜잭션 타입 추출

```typescript
// scheduler-service/src/lib/conflict.ts
type PrismaTx = Omit<PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;
// → PrismaClient에서 라이프사이클 메서드를 제거한 타입
//   트랜잭션 콜백 안에서 사용 가능한 메서드만 남음

// 유니온 파라미터: 트랜잭션 안팎 모두에서 동작
export async function checkConflict(
  client: PrismaClient | PrismaTx,  // 두 타입 모두 허용
  resourceId: string,
  ...
): Promise<ConflictInfo | null> { ... }
```

### `ReturnType<typeof fn>` — 함수 반환 타입 추출

```typescript
// scheduler-service/src/__tests__/bookings.test.ts
let app: ReturnType<typeof buildApp>;
// buildApp()이 반환하는 타입을 직접 쓰지 않고 자동 추출
```

### `ConstructorParameters<typeof C>[0]` — 생성자 인자 타입 추출

```typescript
// file-service/src/lib/storage/s3.provider.ts
const s3Config: ConstructorParameters<typeof S3Client>[0] = {
  region: this.config.region || 'us-east-1',
  endpoint: this.config.endpoint,
  // ... S3Client 생성자의 첫 번째 인자와 동일한 타입
};
```

---

## 12. 커스텀 에러 클래스 상속

### 기본 에러 클래스 (shared)

```typescript
// shared/src/errors.ts
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: string[];

  constructor(statusCode: number, message: string, code?: string, details?: string[]) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code || `ERR_${statusCode}`;
    this.details = details;
  }
}
```

### 서비스별 특화 에러

```typescript
// scheduler-service/src/lib/state-machine.ts
export class InvalidTransitionError extends Error {
  readonly from: BookingStatus;
  readonly to: BookingStatus;

  constructor(from: BookingStatus, to: BookingStatus) {
    super(`유효하지 않은 상태 전이: ${from} → ${to}. 가능한 전이: ${TRANSITIONS[from].join(', ') || '없음'}`);
    this.from = from;
    this.to = to;
  }
}

// signature-audit-service/src/lib/eln.ts
export class ElnServiceError extends Error {}

// eln-service/src/lib/audit.ts
export class AuditServiceError extends Error {}
```

에러 클래스를 분리하면 `instanceof`로 정확한 분기가 가능하고, `readonly` 필드로 에러 컨텍스트를 타입 안전하게 전달한다.

---

## 13. 타입 별칭 재수출

### 외부 라이브러리 타입을 프로젝트 타입으로 감싸기

```typescript
// shared/src/logger.ts
export type Logger = pino.Logger;
```

**왜?** 소비 서비스에서 `import type { Logger } from '@lab/shared'`로 쓸 수 있다. pino를 다른 로거로 교체해도 `Logger` 타입 별칭만 수정하면 된다.

### Barrel 재수출 (Facade)

```typescript
// shared/src/index.ts — 전체 re-export
export { AppError, buildErrorResponse, buildFastifyErrorHandler, setupProcessHandlers } from './errors';
export { ErrorCode, type ErrorCodeValue } from './error-codes';
export { validate } from './validate';
export { Permission, RoleName, RolePermissions, type PermissionValue, type RoleNameValue } from './permissions';
export { getOrgId, withOrgScope, getTeamIds } from './org-scope';
export type { Logger } from './logger';
// ...
```

---

## 14. Fastify 인라인 제네릭

### 라우트 핸들러에서 Params/Body 타입 지정

```typescript
// scheduler-service/src/routes/bookings.ts
fastify.get<{ Params: { id: string } }>(
  '/bookings/:id',
  { preHandler: [...] },
  async (request, reply) => {
    const { id } = request.params;  // id: string (타입 안전)
  }
);

fastify.post<{ Params: { id: string }; Body: { reason?: string } }>(
  '/bookings/:id/reject',
  { preHandler: [...] },
  async (request, reply) => {
    const { id } = request.params;     // string
    const { reason } = request.body;   // string | undefined
  }
);
```

Fastify의 `RouteGenericInterface`를 인라인으로 지정하면, `request.params`와 `request.body`가 자동으로 타입이 좁혀진다.

---

## 15. 패턴 요약 매트릭스

| 패턴 | 난이도 | 핵심 키워드 | 대표 파일 |
|------|:------:|------------|----------|
| `as const` + 파생 유니온 | ★★☆ | `typeof X[keyof typeof X]` | `permissions.ts`, `error-codes.ts` |
| Zod + `z.infer` | ★★☆ | 런타임 검증 = 컴파일타임 타입 | 모든 `dtos/*.dto.ts` |
| 제네릭 함수 | ★★☆ | `function fn<T>(arg: T): T` | `service-events.ts`, `org-scope.ts` |
| 제네릭 제약 | ★★★ | `<T extends Record<...>>` | `middleware.ts` |
| 교차 타입 | ★★☆ | `T & { orgId: string }` | `org-scope.ts`, `middleware.ts` |
| 고차 함수 타이핑 | ★★★ | `(param) => (req, reply) => void` | `middleware.ts` |
| `Record<Enum, V>` 상태 머신 | ★★☆ | 전환 맵 완전성 보장 | `note.dto.ts`, `state-machine.ts` |
| `declare module` | ★★★ | Declaration Merging | `plugins/prisma.ts` (x7) |
| 최소 인터페이스 | ★★☆ | Interface Segregation Principle | `middleware.ts` |
| `instanceof` 내로잉 | ★☆☆ | 에러 분기 처리 | `errors.ts`, `validate.ts` |
| 리터럴/판별 유니온 | ★★☆ | `ok: false` 판별자 | `errors.ts`, 모든 인터페이스 |
| `Omit<T, K>` | ★★★ | Prisma 트랜잭션 타입 | `conflict.ts` |
| 커스텀 에러 상속 | ★☆☆ | `extends Error` + `readonly` | `errors.ts`, `state-machine.ts` |
| 타입 재수출 | ★☆☆ | Facade/Barrel | `shared/src/index.ts` |
| Fastify 인라인 제네릭 | ★★☆ | `<{ Params: ...; Body: ... }>` | `bookings.ts` |

---

> **참고**: 모든 코드는 프로젝트 실제 소스에서 발췌. 파일 경로는 `services/` 기준 상대 경로.
