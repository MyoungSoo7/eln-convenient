# API Endpoint Scaffolding Agent

새로운 API 엔드포인트를 프로젝트 규약에 맞게 스캐폴딩한다.

## 역할
- 라우트, 컨트롤러, Zod DTO 생성/수정
- 인증/권한 미들웨어 자동 적용
- 멀티테넌시(orgId) 패턴 준수
- 기존 코드 스타일과 일관성 유지

## 프로젝트 패턴

### 라우트 (FastifyPluginAsync)
```typescript
import { FastifyPluginAsync } from 'fastify';
import { requireAuth, requirePermission, requireRole } from '../middlewares/auth.middleware';
import { validate } from '@lab/shared';
import { Permission } from '@lab/shared';
import * as controller from '../controllers/<name>.controller';

const routes: FastifyPluginAsync = async (app) => {
  // 전체 라우트에 인증 적용
  app.addHook('onRequest', requireAuth);

  app.get('/', {
    preHandler: [requirePermission(Permission.XXX)]
  }, controller.list);

  app.get('/:id', {
    preHandler: [requirePermission(Permission.XXX)]
  }, controller.getById);

  app.post('/', {
    preHandler: [requirePermission(Permission.XXX), validate({ body: createSchema })]
  }, controller.create);

  app.patch('/:id', {
    preHandler: [requirePermission(Permission.XXX), validate({ body: updateSchema })]
  }, controller.update);

  app.delete('/:id', {
    preHandler: [requirePermission(Permission.XXX)]
  }, controller.remove);
};

export default routes;
```

### 컨트롤러
```typescript
import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../lib/prisma';
import { getOrgId, AppError, ErrorCode } from '@lab/shared';

export const list = async (req: FastifyRequest, reply: FastifyReply) => {
  const orgId = getOrgId(req.headers);
  const data = await prisma.model.findMany({
    where: { orgId, deletedAt: null },
  });
  return reply.send({ ok: true, data });
};
```

### Zod DTO
```typescript
import { z } from 'zod';

export const createSchema = z.object({
  name: z.string().min(1).max(200),
  // ...
});

export const updateSchema = createSchema.partial();

export type CreateInput = z.infer<typeof createSchema>;
```

### 인증 미들웨어 (서비스별 re-export)
```typescript
export {
  requireAuthFastify as requireAuth,
  requireRoleFastify as requireRole,
  requirePermissionFastify as requirePermission,
} from '@lab/shared';
```

### 응답 형식
- 성공: `{ ok: true, data: T }`
- 에러: `AppError` + `ErrorCode` 사용, `{ ok: false, error: string }`

## 체크리스트
- [ ] `requireAuth` 훅이 라우트 플러그인 최상단에 적용
- [ ] 각 엔드포인트에 `requirePermission(Permission.*)` 적용
- [ ] POST/PATCH 바디에 `validate({ body: schema })` 적용
- [ ] 모든 DB 쿼리에 `orgId` 필터 포함
- [ ] 소프트 삭제 패턴 준수 (`deletedAt: null` 필터, 삭제 시 `deletedAt` 세팅)
- [ ] 응답 형식 `{ ok: boolean, data: T }` 통일
- [ ] 에러 처리에 `AppError` + `ErrorCode` 사용
- [ ] app.ts에 라우트 등록

## 실행

$ARGUMENTS 를 엔드포인트 요구사항으로 받는다.
형식: `<서비스명> <리소스명> [CRUD 범위] [추가 요구사항]`
예시: `eln-service protocol GET,POST,PATCH,DELETE "Reviewer 이상만 삭제 가능"`

1. 대상 서비스의 기존 라우트/컨트롤러 구조를 먼저 확인
2. Zod DTO 스키마 생성 (또는 기존 파일에 추가)
3. 컨트롤러 함수 생성
4. 라우트 파일 생성 (또는 기존 파일에 추가)
5. app.ts에 라우트 등록 확인
6. Permission enum에 새 권한이 필요하면 안내
