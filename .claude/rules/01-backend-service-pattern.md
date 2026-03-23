---
description: 백엔드 서비스 코드 작성/수정 시 따라야 할 공통 패턴
globs: services/*/src/**/*.ts
---

# 백엔드 서비스 공통 패턴

## 서비스 구조
모든 백엔드 서비스는 동일한 구조를 따른다:
```
services/<name>-service/src/
├── index.ts          # 엔트리 — buildApp() + listen + setupProcessHandlers
├── app.ts            # Fastify 앱 빌더 — 플러그인, 라우트, 에러핸들러 등록
├── routes/           # Fastify 라우트 — preHandler로 auth/validate 체이닝
├── controllers/      # 비즈니스 로직 핸들러
├── dtos/             # Zod 스키마 + 타입 정의
├── middlewares/      # auth.middleware.ts — @lab/shared에서 re-export
├── plugins/          # Fastify 플러그인
└── lib/              # prisma.ts, 유틸리티
```

## 필수 패턴

### 1. 에러 처리
- `AppError`와 `ErrorCode`를 사용한다 (`@lab/shared`에서 import)
- `throw new AppError(404, '노트를 찾을 수 없습니다.', ErrorCode.NOT_FOUND)`
- 절대로 `res.status(xxx).json({ error: ... })` 직접 작성하지 않는다

### 2. API 응답 형식
- 모든 성공 응답: `{ ok: true, data: T }`
- 모든 실패 응답: `{ ok: false, error: string, code: string }`
- `buildErrorResponse()`로 에러 응답 생성

### 3. 인증/권한 미들웨어 체이닝
라우트 등록 시 반드시 다음 순서로 preHandler를 체이닝한다:
```typescript
app.addHook('onRequest', requireAuth);  // 전역 또는 라우트별
app.get('/path', {
  preHandler: [
    requirePermission(Permission.XXX),   // 권한 체크
    validate({ body: SomeSchema }),       // Zod 검증
  ]
}, handler);
```

### 4. 멀티테넌시
- 모든 데이터 쿼리에 `orgId` 필터 필수: `getOrgId(req.headers)`
- Prisma where절: `withOrgScope({ status: 'draft' }, orgId)` 사용
- orgId 없이 데이터 조회하면 보안 위반

### 5. 로거
- `createLogger('service-name')` 사용 (Pino 기반)
- `console.log` 대신 `logger.info/warn/error` 사용

### 6. 서비스 간 통신
- `x-internal-secret` 헤더로 내부 인증
- `requireInternalSecretFastify` 미들웨어로 검증

### 7. Prisma 사용
- 각 서비스별 독립 스키마 (`services/<name>/prisma/schema.prisma`)
- `import prisma from '../lib/prisma'`로 인스턴스 import
- index.ts의 onShutdown에서 반드시 `prisma.$disconnect()` 호출
