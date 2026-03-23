# Code Review Agent

현재 변경사항(git diff)을 이 프로젝트 기준으로 코드 리뷰한다.

## 역할
- git diff 기반 변경사항 분석
- 프로젝트 규약 준수 여부 검증
- 보안/성능 이슈 탐지
- 누락된 작업 알림

## 리뷰 체크리스트

### 인증/권한 (Critical)
- [ ] 새 라우트에 `requireAuth` 훅이 적용되었는가
- [ ] 엔드포인트에 적절한 `requirePermission(Permission.*)` 이 있는가
- [ ] 민감 엔드포인트에 `requireRole()` 이 필요하지 않은가
- [ ] 내부 서비스 간 호출에 `x-internal-secret` 검증이 있는가

### 멀티테넌시 (Critical)
- [ ] DB 쿼리에 `orgId` 필터가 빠지지 않았는가 (`getOrgId(req.headers)` 사용)
- [ ] 다른 조직 데이터에 접근 가능한 경로가 없는가
- [ ] Prisma `findMany`/`findFirst`에 `where: { orgId }` 가 포함되었는가

### API 응답 형식
- [ ] 응답이 `{ ok: boolean, data: T, error?: string }` 형식을 따르는가
- [ ] 에러가 `AppError` + `ErrorCode` 를 사용하는가
- [ ] HTTP 상태코드가 적절한가 (200/201/400/401/403/404/500)

### 검증
- [ ] 요청 바디/쿼리에 Zod 스키마 + `validate()` 미들웨어가 적용되었는가
- [ ] 사용자 입력이 직접 DB 쿼리에 들어가지 않는가

### Prisma/DB
- [ ] 새 모델에 `orgId` 필드가 있는가
- [ ] 적절한 인덱스가 있는가 (`@@index([orgId, ...])`)
- [ ] N+1 쿼리 위험이 없는가 (`include`/`select` 적절 사용)
- [ ] 소프트 삭제 패턴이 일관적인가 (`deletedAt` 필터)

### 서비스 경계
- [ ] 서비스 간 직접 DB 접근이 없는가 (HTTP/Redis Stream만 허용)
- [ ] 다른 서비스 모델을 import하지 않는가
- [ ] 이벤트 발행 시 `@lab/shared`의 `ServiceEventType` 을 사용하는가

### 다국어
- [ ] 새 텍스트가 있으면 `ko/`, `en/` JSON 모두 반영했는가
- [ ] 하드코딩된 한글/영어 문자열이 없는가

### 로깅
- [ ] `@lab/shared`의 `createLogger()` 를 사용하는가 (console.log 금지)
- [ ] 민감 정보(비밀번호, 토큰)가 로그에 포함되지 않는가

## 출력 형식

```
## Critical
- [파일:라인] 설명 → 수정 방법

## Warning
- [파일:라인] 설명 → 수정 방법

## Suggestion
- [파일:라인] 설명
```

## 실행

$ARGUMENTS 가 있으면 해당 파일/경로만 리뷰한다. 없으면 `git diff` (unstaged + staged) 전체를 리뷰한다.
