# JWT 인증 — 전체 흐름 가이드

## 개요

API Gateway가 JWT를 검증하고, 내부 서비스에는 헤더로 사용자 정보를 전달하는 구조.
내부 서비스는 JWT를 직접 검증하지 않고 Gateway를 신뢰한다.

## 토큰 저장 위치

| 토큰 | 저장 위치 | 생명주기 | 보안 |
|------|----------|----------|------|
| **Access Token** | 브라우저 JS 변수 (RAM) | 탭 닫으면 사라짐 (15분 TTL) | XSS 탈취 어려움 |
| **Refresh Token** | 브라우저 httpOnly 쿠키 | 브라우저 종료해도 유지 (8시간 TTL) | JS 접근 불가 |
| **User 정보** | 브라우저 localStorage | 직접 삭제할 때까지 유지 | 민감 정보 없음 |

Access Token을 localStorage가 아닌 JS 변수에 저장하는 이유:
- localStorage → XSS로 `localStorage.getItem()` 탈취 가능
- JS 변수 → XSS로 읽기 훨씬 어려움. 대신 새 탭/새로고침 시 사라짐

```typescript
// src/lib/authToken.ts
let accessToken: string | null = null;  // 이게 전부 — 브라우저 RAM

export function setToken(token: string): void {
  accessToken = token;
}
export function getToken(): string | null {
  return accessToken;
}
```

## 1단계: 로그인 → 토큰 발급

```
브라우저                    API Gateway              auth-service
  │                           │                         │
  │ POST /api/auth/login      │                         │
  │ { email, password }       │                         │
  │──────────────────────────→│────────────────────────→│
  │                           │                         │
  │                           │  1. DB에서 User 조회 (email)
  │                           │  2. bcrypt.compare(password, hash)
  │                           │  3. user.status === 'active' 확인
  │                           │  4. JWT 2개 생성 (아래 참고)
  │                           │                         │
  │←──────────────────────────│←────────────────────────│
  │ { token, refreshToken,    │                         │
  │   user: { id, role, ... }}│                         │
```

### Access Token payload (15분)

```javascript
jwt.sign({
  sub: user.id,                       // 사용자 UUID
  email: user.email,                  // 이메일
  role: user.role.name,               // 'admin' | 'researcher' | 'reviewer' | 'viewer'
  permissions: user.role.permissions, // ['note:read', 'note:write', ...]
  orgId: user.orgId,                  // 조직 UUID (멀티테넌시)
  teams: [{ id, role }],             // 소속 팀 목록
}, JWT_SECRET, { expiresIn: '15m' })
```

### Refresh Token payload (8시간)

```javascript
jwt.sign({
  sub: user.id,
  type: 'refresh'     // access와 구분하기 위한 플래그
}, JWT_SECRET, { expiresIn: '8h' })
```

> 두 토큰 모두 같은 `JWT_SECRET`으로 서명. 대칭키(HS256) 방식.

## 2단계: 토큰 저장 (프론트엔드)

로그인 응답을 받으면:

```typescript
// 1. Access Token → 메모리 변수
setToken(data.token);

// 2. Refresh Token → httpOnly 쿠키 (서버에 위임)
await storeRefreshToken(data.refreshToken);
// → POST /api/auth/session { refreshToken }
// → Gateway가 Set-Cookie: refresh_token=...; HttpOnly; Path=/

// 3. User 정보 → localStorage
setStoredUser(data.user);
```

## 3단계: API 요청 시 검증 (API Gateway)

모든 API 요청은 Gateway의 `authHook`을 거친다.

```
브라우저                        API Gateway                    내부 서비스
  │                               │                               │
  │ GET /api/notes                │                               │
  │ Authorization: Bearer <JWT>   │                               │
  │──────────────────────────────→│                               │
  │                               │                               │
  │                  ① 공개 경로 체크                              │
  │                    /health, /api/auth/login 등 → 검증 없이 통과│
  │                                                                │
  │                  ② /internal/ 경로 차단                        │
  │                    서비스 간 내부 통신 전용 → 404               │
  │                                                                │
  │                  ③ Bearer 토큰 추출                            │
  │                    없으면 401                                   │
  │                                                                │
  │                  ④ Redis 토큰 블랙리스트 확인                   │
  │                    blacklist:{token} → 로그아웃된 토큰 차단     │
  │                                                                │
  │                  ⑤ JWT 서명 검증                               │
  │                    jose.jwtVerify(token, JWT_SECRET)            │
  │                    실패 시 401                                  │
  │                                                                │
  │                  ⑥ 사용자 블랙리스트 확인                      │
  │                    blacklist:user:{userId}                      │
  │                    iat < invalidatedAt → 401                   │
  │                                                                │
  │                  ⑦ orgId 확인                                  │
  │                    없으면 403                                   │
  │                                                                │
  │                  ⑧ payload → 내부 헤더 변환                    │
  │                               │──────────────────────────────→│
  │                               │ x-user-id: "user-uuid"        │
  │                               │ x-user-role: "researcher"     │
  │                               │ x-user-email: "a@b.com"       │
  │                               │ x-user-permissions: [...]     │
  │                               │ x-user-org-id: "org-uuid"     │
  │                               │ x-sso-provider: "local"       │
```

### Gateway가 주입하는 내부 헤더

| 헤더 | 값 | 출처 (JWT payload) |
|------|-----|-------------------|
| `x-user-id` | 사용자 UUID | `sub` |
| `x-user-role` | admin / researcher / reviewer / viewer | `role` |
| `x-user-email` | 이메일 | `email` |
| `x-user-permissions` | 권한 배열 JSON | `permissions` |
| `x-user-org-id` | 조직 UUID | `orgId` |
| `x-sso-provider` | `local` 또는 `keycloak` | Gateway가 결정 |

## 4단계: 내부 서비스에서 사용자 확인

내부 서비스는 JWT를 직접 검증하지 않는다. Gateway가 주입한 헤더만 읽는다.

```typescript
// 인증 확인 — x-user-id 존재 여부만 체크
requireAuth(request, reply) {
  if (!request.headers['x-user-id']) {
    reply.code(401).send({ ok: false, error: '인증이 필요합니다.' });
  }
}

// 권한 확인 — x-user-permissions에서 특정 권한 포함 여부
requirePermission('note:write')(request, reply) {
  const permissions = JSON.parse(request.headers['x-user-permissions']);
  if (!permissions.includes('*') && !permissions.includes('note:write')) {
    reply.code(403).send({ ok: false, error: '권한 부족' });
  }
}

// 역할 확인 — x-user-role이 특정 역할인지
requireRole('admin')(request, reply) {
  const role = request.headers['x-user-role'];
  if (role !== 'admin') {
    reply.code(403).send({ ok: false, error: '관리자만 접근 가능합니다.' });
  }
}

// 조직 스코프 — 모든 DB 쿼리에 orgId 필터 (멀티테넌시)
const orgId = getOrgId(request.headers);  // x-user-org-id 추출
const notes = await prisma.note.findMany({
  where: withOrgScope({ status: 'draft' }, orgId)
  // → { status: 'draft', orgId: 'org-uuid' }
});
```

## 5단계: 토큰 자동 갱신

Access Token이 만료 임박(1분 전)하면 프론트엔드가 자동 갱신한다.

```
① 매 API 요청 전에 isTokenExpiringSoon() 체크
② 만료 임박 시:

브라우저                    API Gateway              auth-service
  │                           │                         │
  │ POST /api/auth/session/refresh                      │
  │ Cookie: refresh_token=... │ (자동 전송)              │
  │──────────────────────────→│────────────────────────→│
  │                           │                         │
  │                           │  jwt.verify(refreshToken, JWT_SECRET)
  │                           │  type === 'refresh' 확인
  │                           │  DB에서 user 재조회 → 최신 역할/권한 반영
  │                           │  새 access + refresh 토큰 발급
  │                           │                         │
  │←──────────────────────────│←────────────────────────│
  │ { token: "새 JWT" }       │                         │

③ 새 access token을 메모리에 저장
④ 원래 요청을 새 토큰으로 재시도
```

### 새 탭/새로고침 시

Access Token이 메모리에만 있으므로 사라진다:

```
새 탭 열기 → accessToken = null
         → POST /api/auth/session/refresh (httpOnly 쿠키 자동 전송)
         → 새 access token 발급 → 메모리에 저장
         → 정상 사용 가능
```

## 6단계: 블랙리스트 (강제 만료)

Redis에 2종류의 블랙리스트가 있다:

### 토큰 단위 (로그아웃)

```
로그아웃 → Redis SET blacklist:{token전체} "1" EX {남은만료시간}
→ 해당 토큰으로 요청 시 401
→ 토큰 만료되면 Redis 키도 자동 삭제 (TTL)
```

### 사용자 단위 (역할 변경/비활성화)

```
관리자가 역할 변경 → Redis SET blacklist:user:{userId} "1711180502" (현재 Unix 타임스탬프)
→ 이 시각 이전에 발급된 토큰 (iat < 1711180502) 전부 401
→ 사용자가 재로그인하면 새 토큰 (iat > 1711180502) 으로 정상 통과
```

## 듀얼 인증 모드 (Keycloak SSO)

`KEYCLOAK_ENABLED=true` 설정 시 Gateway가 2단계로 검증한다:

```
토큰 도착
  │
  ├─ Keycloak JWKS 검증 시도 (RS256, 비대칭키)
  │   ├─ 성공 → Keycloak 토큰. auth-service에서 역할→권한 조회 (Redis 5분 캐시)
  │   └─ 실패 → 폴백 ↓
  │
  └─ 로컬 JWT_SECRET 검증 (HS256, 대칭키)
      ├─ 성공 → 로컬 토큰. payload에서 직접 권한 추출
      └─ 실패 → 401
```

| 항목 | 로컬 JWT | Keycloak JWT |
|------|----------|-------------|
| 서명 방식 | HS256 (JWT_SECRET) | RS256 (JWKS 공개키) |
| 권한 포함 | JWT payload에 직접 포함 | auth-service에서 별도 조회 |
| 발급자 | auth-service | Keycloak 서버 |
| orgId | payload.orgId | payload.org_id (커스텀 클레임) |
| `x-sso-provider` | `local` | `keycloak` |

## 서비스 간 내부 통신 인증

서비스 간 직접 호출 시에는 JWT가 아닌 `x-internal-secret` 헤더를 사용한다.

```typescript
// 호출 측 (eln-service → search-service)
fetch('http://search-service:8006/api/search/index', {
  headers: { 'x-internal-secret': process.env.INTERNAL_SECRET }
});

// 수신 측 (search-service)
requireInternalSecretFastify(request, reply) {
  if (request.headers['x-internal-secret'] !== process.env.INTERNAL_SECRET) {
    reply.code(401).send({ ok: false, error: '내부 요청 인증 실패' });
  }
}
```

Gateway는 `/internal/` 경로를 외부에서 접근 불가하도록 차단한다.

## 전체 아키텍처 다이어그램

```
┌─────────────────────────────────────────────────────────────┐
│  브라우저                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ Access Token │  │ Refresh Token│  │ User Info        │   │
│  │ (JS 변수)    │  │ (httpOnly쿠키)│  │ (localStorage)   │   │
│  └──────┬───────┘  └──────┬───────┘  └──────────────────┘   │
└─────────┼─────────────────┼─────────────────────────────────┘
          │ Authorization:  │ Cookie:
          │ Bearer <JWT>    │ refresh_token=...
          ▼                 ▼
┌─────────────────────────────────────────────────────────────┐
│  API Gateway (:8000)                                        │
│                                                               │
│  authHook():                                                 │
│  ① 공개 경로 체크 → 통과                                     │
│  ② /internal/ 차단                                           │
│  ③ Bearer 토큰 추출                                          │
│  ④ Redis blacklist:{token} 확인                              │
│  ⑤ jose.jwtVerify(token, JWT_SECRET) → payload              │
│  ⑥ Redis blacklist:user:{userId} 확인 (iat 비교)            │
│  ⑦ orgId 없으면 403                                         │
│  ⑧ payload → 내부 헤더 변환                                  │
└────────────────────────┬────────────────────────────────────┘
                         │ 내부 헤더만 전달
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  내부 서비스 (eln, file, inventory, search, ...)             │
│                                                               │
│  requireAuth       → x-user-id 존재 확인                     │
│  requirePermission → x-user-permissions 권한 체크             │
│  requireRole       → x-user-role 역할 확인                   │
│  getOrgId          → x-user-org-id로 데이터 격리              │
│                                                               │
│  ※ JWT 검증 안 함 — Gateway만 신뢰                           │
└─────────────────────────────────────────────────────────────┘
         │
         │ 서비스 간 통신
         │ x-internal-secret 헤더
         ▼
┌─────────────────────────────────────────────────────────────┐
│  Redis                                                       │
│  ┌─────────────────────┐  ┌──────────────────────────────┐  │
│  │ blacklist:{token}   │  │ blacklist:user:{userId}      │  │
│  │ 로그아웃된 토큰 차단  │  │ 역할 변경 시 기존 토큰 무효화 │  │
│  └─────────────────────┘  └──────────────────────────────┘  │
│  ┌─────────────────────┐                                     │
│  │ role-perms:{role}   │  ← Keycloak SSO 시 권한 캐시 (5분) │
│  └─────────────────────┘                                     │
└─────────────────────────────────────────────────────────────┘
```

## 관련 파일

| 역할 | 파일 경로 |
|------|----------|
| 토큰 발급 (로그인) | `services/auth-service/src/controllers/auth.controller.ts` |
| 토큰 갱신 (refresh) | 동일 파일 `refreshToken()` |
| Gateway JWT 검증 | `services/api-gateway/src/middlewares/auth.ts` |
| 프론트엔드 토큰 관리 | `src/lib/authToken.ts` |
| API 클라이언트 (자동 주입) | `src/api/client.ts` |
| 내부 서비스 인증 미들웨어 | `services/shared/src/middleware.ts` |
| 내부 서비스 간 인증 | `services/shared/src/middleware.ts` → `requireInternalSecretFastify` |
| 권한 상수 | `services/shared/src/permissions.ts` |
