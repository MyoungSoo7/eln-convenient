# Admin RBAC 설계 문서

> **작성일**: 2026-03-18
> **범위**: auth-service · eln-service · API Gateway
> **브랜치**: eln-without-ai

---

## 1. 목적

이 문서는 시스템 내 관리자(admin) 접근 제어를 다음 세 가지 측면에서 정식화한다:

1. **사용자 등록 → 관리자 승격 플로우** 명확화
2. **역할(Role) + 권한(Permission) 2단계 인가 체인** 규칙 수립
3. **노트 잠금 해제 admin 인증** — 평문 비교 제거 → bcrypt 기반 내부 검증

---

## 2. 현재 상태 분석

### 2.1 인증 흐름

```
클라이언트 → API Gateway (JWT 검증)
           → x-user-id, x-user-role, x-user-permissions 헤더 주입
           → 하위 서비스 (auth-service / eln-service / ...)
```

### 2.2 RBAC 모델

| 구성요소 | 위치 | 내용 |
|---------|------|------|
| Role 테이블 | auth-service DB | id, orgId, name, permissions[] |
| JWT 페이로드 | API Gateway 발급 | `{ sub, email, role, permissions, orgId }` |
| requireRole | auth.middleware.ts | `x-user-role` 헤더 비교 |
| requirePermission | auth.middleware.ts | `x-user-permissions` 배열 비교 |

### 2.3 기본 역할 및 권한

| 역할 | 주요 권한 |
|------|---------|
| `admin` | `['note:*', 'user:*', 'audit:read', 'note:unlock', ...]` + `'*'` 포함 |
| `researcher` | `['note:read', 'note:write', 'note:sign', 'inventory:write', ...]` |
| `viewer` | `['note:read', 'template:read', 'inventory:read', ...]` |

### 2.4 현재 문제점

1. **인가 미들웨어 혼재**: `requireRole`과 `requirePermission`이 명확한 규칙 없이 혼용
2. **eln-service admin 체크 미흡**: `POST /notes/:id/admin-unlock`에서 컨트롤러 내부에서 `x-user-role` 수동 검사 + `adminPassword` 평문 비교 (TODO 상태)
3. **eln-service에 requireRole 미들웨어 없음**: auth-service와 패턴 불일치

---

## 3. 설계

### 3.1 사용자 등록 및 관리자 승격 플로우

**변경 없음** — 현재 방식이 적합하다고 판단:

```
POST /api/auth/register
  → viewer 역할 자동 부여 (orgId 내 viewer role)

PUT /api/auth/users/:id  (admin 전용)
  → { roleId: '<admin-role-id>' }
  → admin으로 승격
  → 다음 로그인 시 JWT에 role: 'admin' 반영
```

**seed 데이터**: 최초 admin은 `admin@labnote.local` (seed.ts)로 생성. 이후 admin이 다른 사용자를 승격.

### 3.2 2단계 인가 체인 규칙

#### 원칙

```
레이어 1 — requireRole('admin')
  목적: admin 전용 리소스(users/orgs/teams/roles) 보호
  위치: 라우트 미들웨어 체인 첫 번째

레이어 2 — requirePermission('X:Y')
  목적: 역할 내 기능 레벨 세분화
  위치: requireRole 뒤에 선택적으로 체인
```

#### 적용 매트릭스

| 상황 | 미들웨어 조합 |
|------|------------|
| admin 전용 리소스 읽기/쓰기 | `requireRole('admin')` |
| admin 전용 + 권한 세분화 | `requireRole('admin'), requirePermission('user:delete')` |
| 역할 무관, 권한 기반 접근 | `requirePermission('note:write')` |
| 로그인 사용자만 허용 | `requireAuth` |
| 누구나 접근 가능 | 미들웨어 없음 |

#### auth-service 라우트 (변경 없음 — 이미 올바름)

```typescript
// 읽기: 인증만
router.get('/orgs',  requireAuth, ctrl.getOrgs);
router.get('/teams', requireAuth, ctrl.getTeams);

// 쓰기/삭제: admin 레이어 1
router.post('/orgs',   requireRole('admin'), ctrl.createOrg);
router.put('/orgs/:id', requireRole('admin'), ctrl.updateOrg);
router.delete('/orgs/:id', requireRole('admin'), ctrl.deleteOrg);

router.get('/users',   requireRole('admin'), ctrl.getUsers);
router.post('/users',  requireRole('admin'), ctrl.createUser);
router.put('/users/:id', requireRole('admin'), ctrl.updateUser);
router.delete('/users/:id', requireRole('admin'), ctrl.deleteUser);

router.get('/roles',  requireRole('admin'), ctrl.getRoles);
router.post('/roles', requireRole('admin'), ctrl.createRole);
router.put('/roles/:id/permissions', requireRole('admin'), ctrl.updatePermissions);
router.delete('/roles/:id', requireRole('admin'), ctrl.deleteRole);
```

#### eln-service 라우트 (변경 필요)

```typescript
// admin-unlock: requireRole 미들웨어 추가 (레이어 1)
// 컨트롤러 내부 x-user-role 수동 검사 제거
router.post('/:id/admin-unlock',
  requireRole('admin'),       // 레이어 1: 역할 게이트
  ctrl.adminUnlockNote        // 레이어 2: verify-password (컨트롤러 내)
);
```

### 3.3 admin-unlock bcrypt 패치

#### 현재 코드 (문제)

```typescript
// 평문 비교 — 보안 취약
if (adminPassword !== process.env.ADMIN_PASSWORD) {
  return res.status(403)...
}
```

#### 변경 후

**내부 호출 방식**: 이미 존재하는 `POST /api/auth/internal/verify-password` 활용

```
[eln-service adminUnlockNote 컨트롤러]

1. requireRole('admin') 미들웨어가 이미 역할 검증 완료
2. userId = req.headers['x-user-id']
3. fetch(AUTH_SERVICE_URL + '/api/auth/internal/verify-password', {
     method: 'POST',
     headers: { 'x-internal-secret': INTERNAL_SECRET },
     body: { userId, password: req.body.adminPassword }
   })
4. { verified: true } → 잠금 해제 진행
   { verified: false } → 403 반환
```

#### 환경변수

```env
# eln-service .env 추가
AUTH_SERVICE_URL=http://auth-service:3001
INTERNAL_SECRET=<shared-with-auth-service>
```

#### 제거

- `process.env.ADMIN_PASSWORD` 환경변수
- 컨트롤러 내 `x-user-role === 'admin'` 수동 검사

---

## 4. 파일 변경 목록

| 서비스 | 파일 | 변경 유형 | 설명 |
|--------|------|----------|------|
| `eln-service` | `src/middlewares/auth.middleware.ts` | **신규** | `requireRole`, `requireAuth` 미들웨어 추가 (auth-service 패턴 동일) |
| `eln-service` | `src/routes/note.routes.ts` | **수정** | `admin-unlock` 라우트에 `requireRole('admin')` 추가 |
| `eln-service` | `src/controllers/note.controller.ts` | **수정** | 평문 비교 제거 → `verify-password` 내부 호출, `x-user-role` 수동 검사 제거 |
| `eln-service` | `src/lib/authClient.ts` | **신규** | `verifyAdminPassword(userId, password)` 헬퍼 함수 |
| `docker-compose.yml` / `.env` | 환경변수 | **수정** | eln-service에 `AUTH_SERVICE_URL`, `INTERNAL_SECRET` 추가 |
| `auth-service` | 전체 | **변경 없음** | 이미 올바른 구조 |
| `api-gateway` | 전체 | **변경 없음** | JWT 검증 및 헤더 주입 이미 완성 |

---

## 5. 보안 고려사항

| 항목 | 구현 |
|------|------|
| admin 역할 검증 | API Gateway JWT → `x-user-role` 헤더 신뢰 (Gateway 통과 후) |
| admin-unlock 비밀번호 | bcrypt 해시 비교 (auth-service 내부 API 위임) |
| 내부 API 보호 | `x-internal-secret` 헤더 (서비스 간 공유 시크릿) |
| 감사 추적 | 잠금 해제 시 `audit_logs` INSERT (변경 없음) |
| 자기 삭제 방지 | `deleteUser` 컨트롤러에서 `callerId === req.params.id` 검사 (변경 없음) |

---

## 6. 테스트 범위

| 테스트 | 대상 |
|--------|------|
| `requireRole('admin')` — 비관리자 403 | eln-service middleware |
| `requireRole('admin')` — 관리자 통과 | eln-service middleware |
| `adminUnlockNote` — 비밀번호 틀림 403 | note.controller |
| `adminUnlockNote` — 비밀번호 맞음 200 + audit | note.controller |
| `verifyAdminPassword` — auth-service 호출 실패 시 503 | authClient |
