# RBAC 시스템 분석 및 설계 문서

> 작성일: 2026-03-19
> 범위: 역할/권한 체계 현황 분석, 미비점 식별, 개선 설계

---

## 1. 현재 아키텍처 개요

```
[Client] → [API Gateway] → [Downstream Services]
              │
              ├─ JWT 검증 (Local / Keycloak)
              ├─ 헤더 주입:
              │   x-user-id, x-user-role, x-user-email,
              │   x-user-permissions (JSON array), x-sso-provider
              └─ PUBLIC_PATHS: /health, /api/auth/login, /api/auth/register, /api/auth/sso-hook
```

### 인가 계층 (현재 구현)

| 계층 | 위치 | 메커니즘 | 설명 |
|------|------|----------|------|
| L1. 인증 | API Gateway | JWT 검증 | 토큰 유효성, 만료 확인 |
| L2. 역할 | 라우트 미들웨어 | `requireRole('admin')` | 역할 기반 broad access |
| L3. 권한 | 라우트 미들웨어 | `requirePermission('note:write')` | 기능 단위 fine-grained access |
| L4. 소유권 | 컨트롤러 | `authorId === userId \|\| role === 'admin'` | 리소스 소유자 검증 |
| L5. 상태 | 컨트롤러 | `status !== 'locked'` | 상태 기반 편집 제한 |
| L6. 비밀번호 | 컨트롤러 | bcrypt 검증 | admin-unlock 등 민감 작업 |

---

## 2. 역할 정의 및 권한 매트릭스 (현재 seed.ts 기준)

### 2.1 역할별 권한

| 권한 | Admin | Researcher | Reviewer | Viewer |
|------|:-----:|:----------:|:--------:|:------:|
| `note:read` | O | O | O | O |
| `note:write` | O | O | - | - |
| `note:delete` | O | - | - | - |
| `note:sign` | O | - | O | - |
| `note:unlock` | O | - | - | - |
| `template:read` | O | O | O | O |
| `template:write` | O | O | - | - |
| `template:delete` | O | - | - | - |
| `inventory:read` | O | O | O | O |
| `inventory:write` | O | O | - | - |
| `inventory:delete` | O | - | - | - |
| `scheduler:read` | O | O | O | O |
| `scheduler:write` | O | O | - | - |
| `file:read` | O | O | O | O |
| `file:upload` | O | O | - | - |
| `file:delete` | O | - | - | - |
| `user:read` | O | - | - | - |
| `user:write` | O | - | - | - |
| `user:delete` | O | - | - | - |
| `audit:read` | O | - | O | - |
| `export:pdf` | O | O | - | - |

### 2.2 역할 요약

- **Admin**: 시스템 전체 관리. 사용자/조직/팀/역할 CRUD, 노트 잠금해제, 서명 취소, 카테고리 관리, 감사 로그 열람
- **Researcher**: 핵심 연구 활동. 노트/프로토콜 작성·편집, 인벤토리 관리, 스케줄러 예약, 파일 업로드, PDF 내보내기 (서명 권한 없음 — 검토자가 서명)
- **Reviewer**: 검토·품질 관리. 노트 열람 및 서명, 감사 로그 열람 (읽기 + 서명만 가능)
- **Viewer**: 읽기 전용. 모든 리소스 열람만 가능, 어떠한 수정도 불가

---

## 3. 서비스별 엔드포인트 RBAC 현황

### 3.1 auth-service

| 엔드포인트 | 메서드 | 인가 |
|-----------|--------|------|
| `/login` | POST | Public |
| `/register` | POST | Public |
| `/sso-hook` | POST | Public |
| `/internal/verify-password` | POST | Public (내부 전용) |
| `/logout` | POST | requireAuth |
| `/me` | GET | requireAuth |
| `/orgs` | GET | requireAuth |
| `/orgs` | POST | requireRole('admin') |
| `/orgs/:id` | PUT | requireRole('admin') |
| `/orgs/:id` | DELETE | requireRole('admin') |
| `/teams` | GET | requireAuth |
| `/teams` | POST | requireRole('admin') |
| `/teams/:id` | PUT | requireRole('admin') |
| `/teams/:id` | DELETE | requireRole('admin') |
| `/teams/:id/members` | GET | requireAuth |
| `/teams/:id/members` | POST | requireRole('admin') |
| `/teams/:id/members/:userId` | DELETE | requireRole('admin') |
| `/users` | GET | requireRole('admin') |
| `/users` | POST | requireRole('admin') |
| `/users/:id` | PUT | requireRole('admin') |
| `/users/:id` | DELETE | requireRole('admin') |
| `/roles` | GET | requireRole('admin') |
| `/roles` | POST | requireRole('admin') |
| `/roles/:id/permissions` | PUT | requireRole('admin') |
| `/roles/:id` | DELETE | requireRole('admin') |

### 3.2 eln-service

| 엔드포인트 | 메서드 | Permission | 추가 검증 |
|-----------|--------|-----------|----------|
| `/tags` | GET | `note:read` | - |
| `/notes` | GET | `note:read` | - |
| `/notes` | POST | `note:write` | authorId 자동 설정 |
| `/notes/stats` | GET | `note:read` | - |
| `/notes/batch` | POST | `note:read` | - |
| `/notes/:id` | GET | `note:read` | - |
| `/notes/:id` | PUT | `note:write` | 소유권(authorId) + 상태(locked/signed 차단) |
| `/notes/:id` | DELETE | `note:delete` | 소유권(authorId) + 상태 |
| `/notes/:id/status` | PATCH | `note:write` | 상태 전이 규칙 검증 |
| `/notes/:id/admin-unlock` | POST | requireRole('admin') + `note:unlock` | bcrypt 비밀번호 재검증 |
| `/notes/:id/revisions` | GET | `note:read` | - |
| `/notes/:id/revisions/:rev` | GET | `note:read` | - |
| `/notes/:id/attachments` | GET | `file:read` | - |
| `/notes/:id/attachments` | POST | `file:upload` | uploadedBy 자동 설정 |
| `/notes/:id/attachments/:id` | DELETE | `file:delete` | - |
| `/notes/:id/links` | GET | `note:read` | - |
| `/notes/:id/links` | POST | `note:write` | - |
| `/notes/:id/links/:id` | DELETE | `note:write` | - |
| `/protocols/*` | * | notes와 동일 | type='protocol'로 필터 |

### 3.3 inventory-service

| 엔드포인트 | 메서드 | 인가 |
|-----------|--------|------|
| `/items` | GET | `inventory:read` |
| `/items` | POST | `inventory:write` |
| `/items/barcode/:barcode` | GET | `inventory:read` |
| `/items/:id` | GET | `inventory:read` |
| `/items/:id` | PUT | `inventory:write` |
| `/items/:id` | DELETE | `inventory:delete` |
| `/items/:id/quantity` | POST | `inventory:write` |
| `/items/:id/history` | GET | `inventory:read` |
| `/alerts/expiring` | GET | `inventory:read` |
| `/alerts/low-stock` | GET | `inventory:read` |
| `/categories` | GET | `inventory:read` |
| `/categories` | POST | requireRole('admin') |
| `/categories/:id` | PUT | requireRole('admin') |
| `/categories/:id` | DELETE | requireRole('admin') |

### 3.4 file-service

| 엔드포인트 | 메서드 | 인가 |
|-----------|--------|------|
| `/` | POST | `file:upload` |
| `/presigned-upload` | GET | `file:upload` |
| `/:id` | GET | `file:read` |
| `/:id/url` | GET | `file:read` |
| `/:id/stream` | GET | `file:read` |
| `/:id/meta` | GET | `file:read` |
| `/:id` | DELETE | `file:delete` |

### 3.5 signature-audit-service

| 엔드포인트 | 메서드 | 인가 |
|-----------|--------|------|
| `/signatures/compliance/stats` | GET | `note:read` |
| `/signatures/compliance/list` | GET | `note:read` |
| `/signatures/editable/:noteId` | GET | `note:read` |
| `/signatures/sign/:noteId` | POST | `note:sign` |
| `/signatures/verify/:noteId` | GET | `note:read` |
| `/signatures/revoke/:signatureId` | POST | requireRole('admin') |
| `/signatures/:noteId` | GET | `note:read` |

### 3.6 search-service

| 엔드포인트 | 메서드 | 인가 |
|-----------|--------|------|
| `/` | GET | `note:read` |
| `/suggest` | GET | `note:read` |
| `/history`, `/favorites`, `/keyword-favorites` | * | requireAuth (개인 데이터) |
| `/index`, `/index/bulk`, `/index/:id`, `/stats` | * | `x-internal-secret` (서비스 간 통신) |

### 3.7 scheduler-service (Fastify)

| 엔드포인트 | 메서드 | 인가 | 추가 검증 |
|-----------|--------|------|----------|
| `/resources` | GET | `scheduler:read` | - |
| `/resources/:id` | GET | `scheduler:read` | - |
| `/resources` | POST | requireRole('admin', 'lab_manager') | - |
| `/resources/:id` | PUT | requireRole('admin', 'lab_manager') | - |
| `/resources/:id` | DELETE | requireRole('admin', 'lab_manager') | soft delete |
| `/bookings` | GET | `scheduler:read` | - |
| `/bookings/:id` | GET | `scheduler:read` | - |
| `/calendar` | GET | `scheduler:read` | APPROVED만 반환 |
| `/bookings` | POST | `scheduler:write` | - |
| `/bookings/:id` | PUT | `scheduler:write` | 소유자 또는 admin/lab_manager |
| `/bookings/:id/approve` | POST | 커스텀 | admin, lab_manager, 또는 resource ownerId |
| `/bookings/:id/reject` | POST | 커스텀 | admin, lab_manager, 또는 resource ownerId |
| `/bookings/:id/cancel` | POST | `scheduler:write` | 소유자 또는 admin/lab_manager |
| `/bookings/:id/complete` | POST | `scheduler:write` | 소유자 또는 admin/lab_manager |

---

## 4. 식별된 문제점 및 분석


### 4.4 `lab_manager` 역할 불일치 (High)

**현상**: scheduler-service에서 `requireRole('admin', 'lab_manager')` 사용하지만, Prisma 스키마의 `RoleName` enum에 `lab_manager` 없음

```prisma
enum RoleName {
  admin
  researcher
  reviewer
  viewer
  // lab_manager 없음!
}
```

**위험**: scheduler-service의 리소스 관리 라우트가 admin 외에는 접근 불가능한 dead code

 


 

### 4.10 scheduler-service의 `requirePermission` 구현 불완전 (Low)

**현상**: scheduler-service는 Fastify 기반이며, auth 플러그인에 `requirePermission` 함수가 존재하나 booking approve/reject에는 커스텀 인가 로직(`canManageBooking`) 사용

**영향**: 일관성 부족하나 기능적 문제는 아님

---

## 5. 개선 설계

### 5.2 `lab_manager` 역할 추가

**변경 사항**:

1. Prisma 스키마 `RoleName` enum에 `lab_manager` 추가
2. seed.ts에 lab_manager 역할 및 권한 추가
3. JWT에 lab_manager 역할 포함

**lab_manager 권한 설계**:






## 6. 구현 우선순위

| 순위 | 항목 | 심각도 | 난이도 | 상태 |
|:----:|------|:------:|:------:|:----:|
| 1 | 내부 API 보호 (5.6) | High | 낮음 | **완료** | 
| 3 | Keycloak 권한 동기화 Phase A (5.5) | High | 중간 | **완료** |
| 4 | 권한 상수 중앙화 (5.1) | Critical | 중간 | **완료** |
| 5 | 역할 변경 감사 로그 (5.4) | High | 중간 | **완료** |
| 6 | 소유권 검증 통합 (5.3) | High | 중간 | **완료** |
| 7 | 조직 스코핑 (5.8) | Medium | 높음 | **부분완료** (API Gateway 헤더 주입 + auth-service 쿼리 필터 완료, 다른 서비스는 orgId 필드 추가 필요) |
| 8 | JWT 즉시 무효화 (5.7) | Medium | 높음 | **완료** |
| 9 | Keycloak 권한 동기화 Phase B (5.5) | Medium | 높음 | 미구현 (Keycloak 설정 필요) |

---
 

---

## 8. 참고: 현재 파일 위치

| 파일 | 경로 |
|------|------|
| Prisma 스키마 | `services/auth-service/prisma/schema.prisma` |
| Seed 데이터 | `services/auth-service/prisma/seed.ts` |
| API Gateway 인증 | `services/api-gateway/src/middlewares/auth.ts` |
| Auth 미들웨어 (각 서비스) | `services/*/src/middlewares/auth.middleware.ts` |
| Auth 컨트롤러 | `services/auth-service/src/controllers/auth.controller.ts` |
| Auth 라우트 | `services/auth-service/src/routes/auth.routes.ts` |
| ELN 라우트 | `services/eln-service/src/routes/note.routes.ts` |
| Inventory 라우트 | `services/inventory-service/src/routes/inventory.routes.ts` |
| File 라우트 | `services/file-service/src/routes/file.routes.ts` |
| Signature 라우트 | `services/signature-audit-service/src/routes/signature.routes.ts` |
| Search 라우트 | `services/search-service/src/routes/search.routes.ts` |
| Scheduler 라우트 | `services/scheduler-service/src/routes/bookings.ts`, `resources.ts` |
| Scheduler Auth | `services/scheduler-service/src/plugins/auth.ts` |
