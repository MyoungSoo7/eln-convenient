---
description: "@lab/shared 패키지 수정 시 영향 범위와 규칙"
globs: services/shared/src/**/*.ts
---

# @lab/shared 패키지 규칙

## 역할
모든 백엔드 서비스가 의존하는 공용 패키지. 수정 시 전 서비스에 영향.

## 제공하는 것
- `AppError`, `buildErrorResponse`, `buildFastifyErrorHandler` — 에러 처리
- `ErrorCode` — 에러 코드 상수
- `validate()` — Zod 기반 preHandler
- `createLogger`, `createHttpLogger` — Pino 로거
- `Permission`, `RoleName`, `RolePermissions` — 권한 상수
- `getOrgId`, `withOrgScope` — 멀티테넌시
- `requireAuthFastify`, `requireRoleFastify`, `requirePermissionFastify` — 인증 미들웨어
- `requireOwnerOrAdminFastify` — 소유자/관리자 체크
- `requireInternalSecretFastify` — 내부 서비스 인증
- `ServiceEventType`, `buildServiceEvent` — 서비스 간 이벤트

## 규칙

1. **Breaking change 주의**: 함수 시그니처 변경 시 모든 서비스에서 사용처 확인
2. **export 추가 시**: `src/index.ts`에 re-export 등록 필수
3. **수정 후**: `services/shared`에서 빌드하고, 의존하는 모든 서비스 재빌드 필요
4. **타입만 변경해도**: 컴파일 타임에 영향이므로 재빌드 필요
