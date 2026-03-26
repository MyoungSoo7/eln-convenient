---
description: Fastify 라우트 정의 시 따라야 할 규칙
globs: services/*/src/routes/*.ts
---

# 라우트 정의 규칙

## 라우트 파일 구조
```typescript
import { FastifyPluginAsync } from 'fastify';
import * as ctrl from '../controllers/xxx.controller';
import { requireAuth, requirePermission, requireRole } from '../middlewares/auth.middleware';
import { validate, Permission, RoleName } from '@lab/shared';
import { SomeSchema } from '../dtos/xxx.dto';

const routes: FastifyPluginAsync = async (app) => {
  // 전역 인증 훅
  app.addHook('onRequest', requireAuth);

  // 라우트 정의
  app.get('/path', {
    preHandler: [requirePermission(Permission.XXX)]
  }, ctrl.handler);
};

export default routes;
```

## 규칙

1. **미들웨어는 항상 re-export 사용**: `auth.middleware.ts`에서 `@lab/shared` re-export를 import
2. **Zod 검증**: 요청 body/query/params가 있으면 반드시 `validate()` preHandler 추가
3. **Permission 상수**: `Permission.NOTE_READ` 같은 타입 안전 상수만 사용, 문자열 리터럴 금지
4. **라우트 순서 주의**: `/notes/stats` 같은 고정 경로는 `/notes/:id` 앞에 위치해야 한다
5. **app.ts에서 등록**: `app.register(routes, { prefix: '/api' })` 형태로 등록
