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

### 4.1 권한 상수 중앙화 부재 (Critical)

**현상**: 권한 문자열(`'note:read'`, `'file:upload'` 등)이 seed.ts와 각 서비스의 라우트 파일에 하드코딩으로 분산되어 있음

**위험**:
- 오타로 인한 권한 우회 (예: `'note:rea'` vs `'note:read'`)
- 새 권한 추가 시 seed와 라우트 간 불일치 가능
- 서비스 간 권한 문자열 동기화 보장 메커니즘 없음
- 리팩토링 시 전체 grep 필요

**영향 범위**: 전체 서비스 (7개)

### 4.2 리소스 소유권 검증 불일치 (High)

**현상**: 소유권 검증이 일부 엔드포인트에만 적용됨

| 서비스 | 소유권 체크 | 미적용 |
|--------|-----------|--------|
| eln-service | note PUT/DELETE (authorId) | attachment DELETE (업로더 확인 없음) |
| scheduler-service | booking PUT/cancel/complete (userId) | - |
| inventory-service | - | item PUT/DELETE (생성자 확인 없음) |
| file-service | - | file DELETE (업로더 확인 없음) |

**위험**: `file:delete` 권한을 가진 사용자가 타인의 파일을 삭제 가능

### 4.3 역할 변경 감사 로그 부재 (High)

**현상**: auth-service의 `updateUser()` 에서 roleId 변경 시 감사 로그가 남지 않음

**비교**:
- admin-unlock: 감사 로그 기록됨 (signature-audit-service)
- 역할 변경 (viewer→admin): 감사 로그 없음

**위험**: 권한 상승 공격 추적 불가, 규정 준수(GxP) 위반 소지

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

### 4.5 Keycloak 권한 동기화 미구현 (Medium)

**현상**: API Gateway에서 Keycloak 인증 시 permissions를 빈 배열로 주입

```javascript
// api-gateway auth.ts (Keycloak 분기)
(request.headers as any)['x-user-permissions'] = JSON.stringify([]);
```

**위험**: Keycloak SSO 사용자는 모든 `requirePermission()` 검사에서 403 반환 → SSO 사용 불가

### 4.6 와일드카드 권한의 seed/실행 불일치 (Medium)

**현상**:
- 이전 설계 문서에는 admin에 `'*'` 와일드카드 언급
- 현재 seed.ts에는 개별 권한 나열 방식 사용 (와일드카드 없음)
- `requirePermission()`은 `'*'` 와일드카드를 지원하는 코드 존재

**영향**: admin이 새 권한이 추가될 때마다 seed를 업데이트해야 함. 누락 시 admin도 접근 불가

### 4.7 `/internal/verify-password` 엔드포인트 보호 미흡 (High)

**현상**: auth-service의 내부 비밀번호 검증 API가 Public 경로에 노출

```javascript
router.post('/internal/verify-password', validate({ body: VerifyPasswordSchema }), ctrl.verifyPassword);
// requireAuth 없음, x-internal-secret 없음
```

**위험**: API Gateway를 통해 외부에서 직접 호출 가능 → 브루트포스 비밀번호 공격 벡터

### 4.8 JWT 갱신 시 권한 동기화 지연 (Medium)

**현상**: JWT에 권한이 포함되어 있어, admin이 사용자 역할을 변경해도 기존 토큰이 만료될 때까지 이전 권한 유지

**위험**: 권한 회수가 즉시 반영되지 않음 (토큰 유효기간 동안 지연)

### 4.9 조직 스코핑 미적용 (Medium)

**현상**: Role 테이블에 `orgId` 컬럼이 있지만, 실제 데이터 조회 시 org 필터링이 적용되지 않는 엔드포인트가 다수

**위험**: 멀티테넌트 환경에서 타 조직의 데이터에 접근 가능

### 4.10 scheduler-service의 `requirePermission` 구현 불완전 (Low)

**현상**: scheduler-service는 Fastify 기반이며, auth 플러그인에 `requirePermission` 함수가 존재하나 booking approve/reject에는 커스텀 인가 로직(`canManageBooking`) 사용

**영향**: 일관성 부족하나 기능적 문제는 아님

---

## 5. 개선 설계

### 5.1 권한 상수 중앙화 패키지

**목표**: 단일 소스에서 권한 문자열을 관리하여 서비스 간 일관성 보장

**설계**:

```
packages/
  shared-permissions/
    src/
      permissions.ts    ← 권한 상수 정의
      roles.ts          ← 역할별 기본 권한 매핑
      types.ts          ← TypeScript 타입
      index.ts          ← 재export
    package.json
```

**permissions.ts 구조**:
```
Permission = {
  NOTE_READ: 'note:read',
  NOTE_WRITE: 'note:write',
  ...
}
```

**roles.ts 구조**:
```
RolePermissions = {
  admin: [Permission.NOTE_READ, Permission.NOTE_WRITE, ...],
  researcher: [...],
  reviewer: [...],
  viewer: [...],
  lab_manager: [...],
}
```

**적용 방식**:
- 각 서비스가 이 패키지를 의존성으로 사용
- 라우트에서 `requirePermission(Permission.NOTE_WRITE)` 형태로 사용
- seed.ts에서 `RolePermissions.admin` 형태로 사용
- 컴파일 타임에 오타/불일치 감지

### 5.2 `lab_manager` 역할 추가

**변경 사항**:

1. Prisma 스키마 `RoleName` enum에 `lab_manager` 추가
2. seed.ts에 lab_manager 역할 및 권한 추가
3. JWT에 lab_manager 역할 포함

**lab_manager 권한 설계**:

| 권한 | 부여 여부 | 근거 |
|------|:---------:|------|
| `note:read` | O | 연구 데이터 열람 필요 |
| `note:write` | - | 연구노트 작성은 Researcher 영역 |
| `inventory:read` | O | 장비/시약 현황 파악 |
| `inventory:write` | O | 장비/시약 관리 |
| `scheduler:read` | O | 예약 현황 확인 |
| `scheduler:write` | O | 예약 관리 |
| `scheduler:manage` | O | 예약 승인/거절 (신규 권한) |
| `resource:write` | O | 장비 리소스 CRUD (신규 권한) |
| `file:read` | O | 파일 열람 |
| `template:read` | O | 템플릿 열람 |

### 5.3 소유권 검증 통합

**원칙**: 수정/삭제 작업은 반드시 소유자 또는 admin만 가능

**적용 대상**:

| 서비스 | 엔드포인트 | 소유권 필드 | 현재 | 목표 |
|--------|-----------|-----------|------|------|
| eln-service | DELETE /attachments/:id | `uploadedBy` | 미검증 | 소유자/admin 검증 |
| file-service | DELETE /:id | `uploadedBy` | 미검증 | 소유자/admin 검증 |
| inventory-service | PUT/DELETE /items/:id | `createdBy` (신규) | 미검증 | 소유자/admin 검증 |

**미들웨어 설계**: 각 서비스에 `requireOwnerOrAdmin(modelName, ownerField)` 유틸리티 함수 추가

```
requireOwnerOrAdmin 동작 흐름:
1. DB에서 리소스 조회
2. ownerField 값과 x-user-id 비교
3. 불일치 시 x-user-role === 'admin' 확인
4. 둘 다 아니면 403
```

### 5.4 역할 변경 감사 로그

**설계**:

```
audit_log 테이블 (signature-audit-service 확장):
  id          UUID
  action      ENUM('role_change', 'permission_update', 'user_status_change', 'admin_unlock', ...)
  targetId    STRING   ← 대상 사용자 ID
  performedBy STRING   ← 실행한 관리자 ID
  before      JSON     ← 변경 전 상태
  after       JSON     ← 변경 후 상태
  reason      STRING?  ← 변경 사유
  ipAddress   STRING?
  timestamp   DATETIME
```

**트리거 지점**:
- `PUT /auth/users/:id` (roleId 변경 시)
- `PUT /auth/roles/:id/permissions` (권한 변경 시)
- `DELETE /auth/users/:id` (사용자 삭제 시)

**구현 방식**: auth-service 컨트롤러에서 변경 전/후 상태를 캡처하여 signature-audit-service로 이벤트 전송

### 5.5 Keycloak 권한 동기화

**현재 문제**: Keycloak 인증 시 permissions가 빈 배열

**해결 방안 (2단계)**:

**Phase A - DB 조회 방식 (단기)**:
```
API Gateway Keycloak 분기:
1. JWT에서 role 추출 (realm_access.roles)
2. auth-service 내부 API 호출: GET /internal/role-permissions?role=researcher
3. 응답의 permissions 배열을 x-user-permissions 헤더에 주입
```

**Phase B - Keycloak 속성 매핑 (중기)**:
- Keycloak에 커스텀 클레임(permissions) 매핑 설정
- JWT에 권한이 직접 포함되어 추가 API 호출 불필요
- API Gateway에서 Keycloak JWT의 permissions 클레임 직접 사용

### 5.6 내부 API 보호

**대상**: `/api/auth/internal/verify-password`

**설계**:

```
방법 1 - x-internal-secret 헤더 검증:
  - search-service와 동일한 패턴
  - API Gateway에서 /internal/* 경로를 외부 차단

방법 2 - API Gateway 라우팅 제어:
  - proxy 설정에서 /api/auth/internal/* 를 upstream으로 라우팅하지 않음
  - 서비스 간 직접 통신으로만 접근 가능
```

**권장**: 방법 1 + 방법 2 병행 (심층 방어)

### 5.7 JWT 즉시 무효화 메커니즘

**설계**:

```
Redis 기반 토큰 블랙리스트:
  key: blacklist:{userId}
  value: 무효화 시각(timestamp)
  TTL: JWT 만료시간과 동일

검증 흐름 (API Gateway):
  1. JWT 서명 검증
  2. Redis에서 blacklist:{userId} 조회
  3. 토큰 발급시각 < 무효화 시각 → 401
  4. 통과 → 기존 헤더 주입 흐름
```

**트리거**:
- admin이 사용자 역할 변경 시 → 해당 사용자 토큰 무효화
- admin이 사용자 비활성화/정지 시 → 해당 사용자 토큰 무효화
- 사용자 비밀번호 변경 시 → 해당 사용자 토큰 무효화

### 5.8 조직(Org) 스코핑 적용

**원칙**: 모든 데이터 조회 시 요청자의 orgId로 필터링

**적용 방식**:

```
API Gateway 헤더 추가:
  x-user-org-id: JWT의 orgId 클레임에서 추출

각 서비스 미들웨어:
  req.orgId = req.headers['x-user-org-id']

DB 쿼리:
  where: { orgId: req.orgId, ...기존조건 }
```

**적용 대상**:
- eln-service: notes, protocols (orgId 필터)
- inventory-service: items, categories (orgId 필터)
- scheduler-service: resources, bookings (orgId 필터)
- signature-audit-service: signatures (orgId 필터)

---

## 6. 구현 우선순위

| 순위 | 항목 | 심각도 | 난이도 | 상태 |
|:----:|------|:------:|:------:|:----:|
| 1 | 내부 API 보호 (5.6) | High | 낮음 | **완료** |
| 2 | lab_manager 역할 추가 (5.2) | High | 낮음 | **완료** |
| 3 | Keycloak 권한 동기화 Phase A (5.5) | High | 중간 | **완료** |
| 4 | 권한 상수 중앙화 (5.1) | Critical | 중간 | **완료** |
| 5 | 역할 변경 감사 로그 (5.4) | High | 중간 | **완료** |
| 6 | 소유권 검증 통합 (5.3) | High | 중간 | **완료** |
| 7 | 조직 스코핑 (5.8) | Medium | 높음 | **부분완료** (API Gateway 헤더 주입 + auth-service 쿼리 필터 완료, 다른 서비스는 orgId 필드 추가 필요) |
| 8 | JWT 즉시 무효화 (5.7) | Medium | 높음 | **완료** |
| 9 | Keycloak 권한 동기화 Phase B (5.5) | Medium | 높음 | 미구현 (Keycloak 설정 필요) |

---

## 7. 최종 권한 매트릭스 (목표 상태)

개선 완료 후 5개 역할의 권한 체계:

| 권한 | Admin | Lab Manager | Researcher | Reviewer | Viewer |
|------|:-----:|:-----------:|:----------:|:--------:|:------:|
| `note:read` | O | O | O | O | O |
| `note:write` | O | - | O | - | - |
| `note:delete` | O | - | - | - | - |
| `note:sign` | O | - | O | O | - |
| `note:unlock` | O | - | - | - | - |
| `template:read` | O | O | O | O | O |
| `template:write` | O | - | O | - | - |
| `template:delete` | O | - | - | - | - |
| `inventory:read` | O | O | O | O | O |
| `inventory:write` | O | O | O | - | - |
| `inventory:delete` | O | - | - | - | - |
| `scheduler:read` | O | O | O | O | O |
| `scheduler:write` | O | O | O | - | - |
| `scheduler:manage` | O | O | - | - | - |
| `resource:write` | O | O | - | - | - |
| `file:read` | O | O | O | O | O |
| `file:upload` | O | O | O | - | - |
| `file:delete` | O | - | - | - | - |
| `user:read` | O | - | - | - | - |
| `user:write` | O | - | - | - | - |
| `user:delete` | O | - | - | - | - |
| `audit:read` | O | - | - | O | - |
| `export:pdf` | O | - | O | - | - |

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
