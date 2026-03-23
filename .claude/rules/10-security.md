---
description: 보안 관련 코드 작성 시 반드시 확인할 사항
globs: services/*/src/**/*.ts, src/**/*.ts
---

# 보안 규칙

## 인증 흐름 (절대 우회 금지)
1. api-gateway가 JWT 검증 (jose JWKS + 로컬 JWT 듀얼)
2. 내부 서비스로 헤더 주입: `x-user-id`, `x-user-role`, `x-user-permissions`, `x-user-org-id`
3. 각 서비스에서 `requireAuth` → `requirePermission` 미들웨어로 검증
4. 서비스 간 통신: `x-internal-secret` 헤더 인증

## 필수 체크

1. **orgId 필터 누락 = 데이터 유출**: 모든 쿼리에 `getOrgId()` + `withOrgScope()` 사용
2. **권한 체크 누락 = 권한 상승**: 새 엔드포인트에 반드시 `requirePermission()` 추가
3. **SQL 인젝션**: Prisma ORM 사용, `$queryRawUnsafe` 사용 금지
4. **XSS**: 프론트엔드에서 `dangerouslySetInnerHTML` 사용 금지 (필수 시 DOMPurify)
5. **시크릿 하드코딩 금지**: 환경변수(`process.env`)로 관리
6. **.env 파일 커밋 금지**: `.gitignore`에 포함되어 있는지 확인
