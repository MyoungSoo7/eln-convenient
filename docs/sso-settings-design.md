# SSO 설정 UI 분석 및 설계

> 작성일: 2026-03-23
> 대상: 시스템 설정 > SSO/Keycloak 설정 메뉴

---

## 1. 현행 분석

### 1.1 현재 상태

| 항목 | 상태 |
|------|------|
| SSO 백엔드 코드 | 완전 구현 (Gateway 듀얼 JWT, PKCE 플로우, sso-hook) |
| Keycloak 컨테이너 | Docker Compose에 포함 |
| Realm 설정 파일 | `realm-labnote.json` 정의됨 |
| 프론트엔드 SSO 로그인 | 조건부 렌더링 (`VITE_KEYCLOAK_ENABLED`) |
| **Admin SSO 설정 UI** | 읽기전용 하드코딩 ("Keycloak 미연결") |
| **런타임 SSO 설정 변경** | 불가 (환경변수 + 재시작 필요) |

### 1.2 현재 SSO 활성화 방법 (개발자 수동)

```bash
# .env 수정 → docker compose 재시작
KEYCLOAK_ENABLED=true
KEYCLOAK_HOOK_SECRET=xxx
VITE_KEYCLOAK_ENABLED=true
```

### 1.3 문제점

1. **Admin이 SSO를 켜고 끌 수 없음** — 환경변수 수정 + 재시작 필요
2. **Keycloak 연결 상태를 모름** — 헬스체크 없음
3. **설정 변경이 위험** — 잘못 설정하면 전체 인증 불통
4. **멀티테넌시 미지원** — 조직별 다른 IdP 사용 불가

---

## 2. 설계 기준

### 2.1 핵심 원칙

```
안전 우선: SSO 설정 오류 시에도 로컬 로그인은 항상 동작해야 함
점진적 활성화: 테스트 → 선택적 → 강제의 3단계 전환
롤백 가능: SSO 장애 시 즉시 로컬 모드로 복귀
```

### 2.2 SSO 모드 정의

| 모드 | 설명 | 로컬 로그인 | SSO 로그인 |
|------|------|:----------:|:----------:|
| **disabled** | SSO 비활성화 (기본값) | O | X |
| **optional** | SSO + 로컬 병행 | O | O |
| **preferred** | SSO 우선, 로컬 폴백 | O (숨김) | O (기본) |
| **enforced** | SSO 강제, 로컬 차단 | X | O |

---

## 3. 데이터 모델

### 3.1 SsoConfig (auth-service DB)

```prisma
model SsoConfig {
  id            String    @id @default(uuid())
  orgId         String    @unique          // 조직별 설정
  mode          SsoMode   @default(disabled)
  provider      String    @default("keycloak")  // keycloak | oidc | saml

  // Keycloak/OIDC 설정
  issuerUrl     String?                   // https://keycloak.example.com/realms/labnote
  clientId      String?                   // labnote-frontend
  clientSecret  String?                   // (encrypted) confidential client용
  jwksUri       String?                   // 자동 생성: {issuerUrl}/.well-known/openid-configuration

  // 동작 설정
  autoCreateUser    Boolean @default(true)   // SSO 최초 로그인 시 사용자 자동 생성
  defaultRoleId     String?                  // 자동 생성 사용자의 기본 역할
  defaultTeamId     String?                  // 자동 생성 사용자의 기본 팀
  syncDisplayName   Boolean @default(true)   // 이름 동기화
  hookSecret        String?                  // (encrypted) sso-hook 검증용

  // 상태
  isVerified    Boolean   @default(false)     // 연결 테스트 통과 여부
  lastVerifiedAt DateTime?
  lastError     String?

  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  org           Organization @relation(fields: [orgId], references: [id])
}

enum SsoMode {
  disabled
  optional
  preferred
  enforced
}
```

### 3.2 왜 DB에 저장하는가?

```
환경변수 방식의 한계:
  - 변경 시 서비스 재시작 필요
  - 조직별 다른 IdP 설정 불가
  - Admin UI에서 제어 불가

DB 저장의 장점:
  - 런타임 변경 가능 (재시작 없음)
  - 조직별 독립 설정 (멀티테넌시)
  - 감사로그 연동 (누가 언제 변경했는지)
  - 롤백 가능 (이전 설정으로 복원)
```

---

## 4. API 설계

### 4.1 엔드포인트

```
GET    /api/auth/sso-config              ← 현재 조직의 SSO 설정 조회
PUT    /api/auth/sso-config              ← SSO 설정 변경 (admin 전용)
POST   /api/auth/sso-config/test         ← 연결 테스트 (JWKS 검증)
POST   /api/auth/sso-config/activate     ← SSO 활성화 (테스트 통과 후)
POST   /api/auth/sso-config/deactivate   ← SSO 비활성화 (즉시 롤백)
```

### 4.2 요청/응답 스펙

**GET /api/auth/sso-config** — 설정 조회

```typescript
// Response
{
  ok: true,
  data: {
    mode: 'disabled' | 'optional' | 'preferred' | 'enforced',
    provider: 'keycloak',
    issuerUrl: 'https://keycloak.example.com/realms/labnote',
    clientId: 'labnote-frontend',
    hasClientSecret: true,     // 값 자체는 노출하지 않음
    autoCreateUser: true,
    defaultRole: 'viewer',
    defaultTeam: '화학팀',
    syncDisplayName: true,
    isVerified: true,
    lastVerifiedAt: '2026-03-23T10:00:00Z',
    lastError: null,
  }
}
```

**PUT /api/auth/sso-config** — 설정 변경

```typescript
// Request Body
{
  issuerUrl: 'https://keycloak.example.com/realms/labnote',
  clientId: 'labnote-frontend',
  clientSecret: '...',          // optional
  autoCreateUser: true,
  defaultRoleId: 'role-uuid',
  defaultTeamId: 'team-uuid',
  syncDisplayName: true,
}

// Response
{ ok: true, data: { ...updatedConfig }, message: '설정이 저장되었습니다.' }
```

**POST /api/auth/sso-config/test** — 연결 테스트

```typescript
// 내부 동작:
// 1. issuerUrl + /.well-known/openid-configuration 조회
// 2. JWKS URI 추출 → JWKS 키 다운로드
// 3. authorization_endpoint, token_endpoint 유효성 확인
// 4. 결과 저장 (isVerified, lastVerifiedAt, lastError)

// Response (성공)
{
  ok: true,
  data: {
    status: 'connected',
    issuer: 'https://keycloak.example.com/realms/labnote',
    jwksKeys: 2,                    // JWKS 키 수
    endpoints: {
      authorization: true,
      token: true,
      userinfo: true,
    },
    realmRoles: ['admin', 'researcher', 'reviewer', 'viewer'],
    testedAt: '2026-03-23T10:00:00Z',
  }
}

// Response (실패)
{
  ok: false,
  error: 'JWKS 엔드포인트에 연결할 수 없습니다.',
  data: {
    status: 'error',
    errorCode: 'JWKS_UNREACHABLE',
    details: 'ECONNREFUSED keycloak:8080',
    testedAt: '2026-03-23T10:00:00Z',
  }
}
```

**POST /api/auth/sso-config/activate** — 활성화

```typescript
// Request Body
{ mode: 'optional' | 'preferred' | 'enforced' }

// 전제 조건: isVerified === true (테스트 통과 필수)

// Response
{ ok: true, message: 'SSO가 optional 모드로 활성화되었습니다.' }
```

**POST /api/auth/sso-config/deactivate** — 비활성화

```typescript
// 안전장치: admin 비밀번호 재확인 필수
// Request Body
{ password: '...' }

// Response
{ ok: true, message: 'SSO가 비활성화되었습니다. 로컬 로그인만 사용 가능합니다.' }
```

---

## 5. Gateway 연동 변경

### 5.1 현재: 환경변수 기반

```typescript
// auth.ts (현재)
const KEYCLOAK_ENABLED = process.env.KEYCLOAK_ENABLED === 'true';
const KEYCLOAK_JWKS_URI = process.env.KEYCLOAK_JWKS_URI || '';
```

### 5.2 제안: DB 설정 + 캐시 기반

```typescript
// auth.ts (제안)
// Redis에 조직별 SSO 설정 캐시 (TTL 5분)
async function getSsoConfig(orgId: string): Promise<SsoConfig | null> {
  const cacheKey = `sso-config:${orgId}`;

  // 1. Redis 캐시 확인
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  // 2. auth-service에 조회
  const res = await fetch(
    `${AUTH_SERVICE_URL}/api/auth/internal/sso-config?orgId=${orgId}`,
    { headers: { 'x-internal-secret': INTERNAL_SECRET } }
  );
  const config = await res.json();

  // 3. 캐시 저장
  await redis.set(cacheKey, JSON.stringify(config.data), 'EX', 300);
  return config.data;
}

// JWT 검증 시:
// 1. 토큰에서 orgId 추출 (디코딩만, 검증 전)
// 2. 해당 조직의 SSO 설정 조회
// 3. mode에 따라 Keycloak JWKS 또는 로컬 JWT 검증
```

### 5.3 폴백 전략

```
토큰 검증 순서:

[환경변수 KEYCLOAK_ENABLED=true?]
  YES → [DB에서 조직 SSO 설정 조회]
         ├── mode: disabled → 로컬 JWT만 검증
         ├── mode: optional → Keycloak 시도 → 실패 시 로컬 JWT
         ├── mode: preferred → Keycloak 시도 → 실패 시 로컬 JWT
         └── mode: enforced → Keycloak만 → 실패 시 401
  NO  → 로컬 JWT만 검증 (현재와 동일)
```

---

## 6. 프론트엔드 UI 설계

### 6.1 시스템 설정 > SSO 설정 페이지

```
┌─────────────────────────────────────────────────────────────┐
│  시스템 설정 > SSO 설정                                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  SSO 상태                                                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  ● 비활성화                                          │    │
│  │  현재 로컬 로그인만 사용 중입니다.                    │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                               │
│  ─── IdP 연결 설정 ──────────────────────────────────────    │
│                                                               │
│  Provider        [ Keycloak          ▼ ]                     │
│                                                               │
│  Issuer URL      [ https://keycloak.example.com/realms/lab ] │
│                    ℹ Keycloak Realm의 전체 URL               │
│                                                               │
│  Client ID       [ labnote-frontend                        ] │
│                    ℹ Keycloak에서 생성한 Client ID           │
│                                                               │
│  Client Secret   [ ••••••••••••     ] [표시]                 │
│                    ℹ Confidential Client인 경우에만 입력      │
│                                                               │
│  [연결 테스트]                                               │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  ✓ 연결 성공                                         │    │
│  │  Issuer: https://keycloak.example.com/realms/lab    │    │
│  │  JWKS 키: 2개                                        │    │
│  │  Realm 역할: admin, researcher, reviewer, viewer     │    │
│  │  마지막 테스트: 2026-03-23 10:00                     │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                               │
│  ─── 사용자 프로비저닝 ───────────────────────────────────    │
│                                                               │
│  SSO 최초 로그인 시 자동 사용자 생성   [✓]                   │
│                                                               │
│  기본 역할        [ Viewer             ▼ ]                   │
│                                                               │
│  기본 팀          [ (없음)             ▼ ]                   │
│                                                               │
│  프로필 이름 동기화                    [✓]                   │
│                    ℹ IdP에서 이름 변경 시 자동 반영           │
│                                                               │
│  ─── SSO 모드 ────────────────────────────────────────────    │
│                                                               │
│  ○ 비활성화 (disabled)                                       │
│    로컬 로그인만 사용합니다.                                 │
│                                                               │
│  ◉ 선택적 (optional) ← 권장 시작점                          │
│    SSO와 로컬 로그인을 모두 허용합니다.                      │
│    로그인 화면에 "SSO 로그인" 버튼이 추가됩니다.             │
│                                                               │
│  ○ SSO 우선 (preferred)                                      │
│    SSO 로그인이 기본이며, 로컬 로그인은 "다른 방법" 링크로   │
│    숨겨집니다. SSO 장애 시 로컬 로그인이 자동 노출됩니다.    │
│                                                               │
│  ○ SSO 강제 (enforced) ⚠                                    │
│    SSO 로그인만 허용합니다. 로컬 로그인이 완전히 차단됩니다. │
│    ⚠ SSO 장애 시 모든 사용자가 로그인할 수 없습니다.        │
│    ⚠ 최소 1명의 admin이 로컬 계정을 유지해야 합니다.        │
│                                                               │
│  ─────────────────────────────────────────────────────────    │
│                                                               │
│                              [저장]  [SSO 활성화]            │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 SSO 활성화 확인 다이얼로그

```
┌────────────────────────────────────────────────┐
│  SSO 활성화 확인                                │
├────────────────────────────────────────────────┤
│                                                  │
│  SSO를 "optional" 모드로 활성화합니다.          │
│                                                  │
│  ✓ IdP 연결 테스트 통과                         │
│  ✓ Client ID 설정 완료                          │
│  ✓ 기본 역할 지정 완료 (viewer)                 │
│                                                  │
│  활성화 후:                                      │
│  • 로그인 화면에 "SSO 로그인" 버튼이 추가됩니다 │
│  • 기존 로컬 로그인은 계속 사용 가능합니다      │
│  • 비활성화는 언제든 가능합니다                  │
│                                                  │
│  계속하시겠습니까?                               │
│                                                  │
│                    [취소]  [활성화]              │
└────────────────────────────────────────────────┘
```

### 6.3 SSO 비활성화 확인 다이얼로그

```
┌────────────────────────────────────────────────┐
│  ⚠ SSO 비활성화                                │
├────────────────────────────────────────────────┤
│                                                  │
│  SSO를 비활성화하면:                            │
│  • SSO로 로그인한 사용자는 세션 만료 후         │
│    로컬 계정으로만 로그인해야 합니다            │
│  • 로컬 비밀번호가 없는 SSO 전용 사용자는       │
│    로그인할 수 없게 됩니다                      │
│                                                  │
│  관리자 비밀번호를 입력하여 확인해주세요:        │
│                                                  │
│  비밀번호  [ •••••••••• ]                       │
│                                                  │
│                    [취소]  [비활성화]            │
└────────────────────────────────────────────────┘
```

### 6.4 로그인 페이지 모드별 변화

```
disabled 모드:
  ┌──────────────────┐
  │  이메일  [      ] │
  │  비밀번호 [      ] │
  │  [로그인]         │
  └──────────────────┘

optional 모드:
  ┌──────────────────┐
  │  이메일  [      ] │
  │  비밀번호 [      ] │
  │  [로그인]         │
  │  ── 또는 ──      │
  │  [SSO 로그인]     │
  └──────────────────┘

preferred 모드:
  ┌──────────────────┐
  │  [SSO 로그인]     │  ← 메인 버튼
  │                    │
  │  다른 방법으로     │  ← 접혀있는 링크
  │  로그인 >         │
  │  ┌──────────────┐ │
  │  │ 이메일 [    ] │ │  (펼치면 보임)
  │  │ 비번   [    ] │ │
  │  │ [로그인]      │ │
  │  └──────────────┘ │
  └──────────────────┘

enforced 모드:
  ┌──────────────────┐
  │  [SSO 로그인]     │  ← 유일한 옵션
  │                    │
  │  SSO 인증만       │
  │  사용 가능합니다   │
  └──────────────────┘
```

---

## 7. 안전장치

### 7.1 enforced 모드 전환 조건

```
enforced 모드 활성화 전 필수 확인:
  ✓ 연결 테스트 24시간 이내 통과
  ✓ SSO로 최소 1명 admin이 로그인 성공한 이력
  ✓ 비상 복구용 로컬 admin 계정 지정 (이 계정만 로컬 로그인 허용)
  ✓ 관리자 비밀번호 재확인
```

### 7.2 비상 복구 로컬 계정

```
enforced 모드에서도 예외적으로 로컬 로그인을 허용하는 계정.
SSO 장애 시 이 계정으로 접속하여 SSO를 비활성화할 수 있음.

DB 필드: SsoConfig.emergencyLocalAdminId (User ID)
로그인 URL: /login?mode=local (숨겨진 URL, 비상 복구용)
```

### 7.3 자동 폴백

```
preferred/enforced 모드에서 Keycloak 장애 감지:
  1. Gateway가 JWKS fetch 3회 연속 실패 시
  2. Redis에 sso-fallback:{orgId} = true 저장 (TTL 5분)
  3. 해당 조직은 자동으로 optional 모드로 폴백
  4. Admin에게 알림 발송 (notification-service)
  5. Keycloak 복구 감지 시 자동 원복
```

### 7.4 감사로그 기록

```
SSO 설정 변경 시 AuditLog에 기록:
  action: 'sso_config_update'
  details: {
    before: { mode: 'disabled', issuerUrl: null },
    after:  { mode: 'optional', issuerUrl: 'https://...' },
    changedBy: 'admin-uuid',
  }
```

---

## 8. 구현 로드맵

### Phase 1: DB 모델 + API (1주)

```
1. auth-service에 SsoConfig 모델 추가 (Prisma)
2. CRUD API 구현 (GET/PUT/POST test/activate/deactivate)
3. 연결 테스트 로직 (OIDC Discovery + JWKS 검증)
4. 감사로그 연동
```

### Phase 2: Gateway 연동 (1주)

```
1. Gateway에서 DB 기반 SSO 설정 조회 (Redis 캐시)
2. 조직별 JWT 검증 전략 분기
3. 자동 폴백 로직
4. sso-config 캐시 무효화 이벤트
```

### Phase 3: 프론트엔드 (1주)

```
1. AdminSettingsPage SSO 설정 UI 구현
2. 연결 테스트 + 결과 표시
3. 모드별 로그인 페이지 분기
4. SSO 활성화/비활성화 확인 다이얼로그
```

### Phase 4: 안전장치 (0.5주)

```
1. enforced 모드 전환 조건 검증
2. 비상 복구 로컬 계정
3. 자동 폴백 + 알림
4. E2E 테스트 (SSO 플로우 전체)
```

---

## 9. 환경변수 정리 (최종)

### 기존 유지 (하위 호환)

```bash
# 전역 SSO 스위치 (DB 설정 조회 전 게이트 역할)
KEYCLOAK_ENABLED=false             # true면 DB에서 조직별 설정 조회

# Keycloak 서비스 접속 (Docker 내부)
KEYCLOAK_JWKS_URI=http://keycloak:8080/realms/labnote/protocol/openid-connect/certs
KEYCLOAK_ISSUER=http://keycloak:8080/realms/labnote

# 프론트엔드 (Vite 빌드 타임)
VITE_KEYCLOAK_ENABLED=true
VITE_KEYCLOAK_URL=http://localhost:8080
VITE_KEYCLOAK_REALM=labnote
VITE_KEYCLOAK_CLIENT_ID=labnote-frontend
```

### 제안 추가

```bash
# DB 기반 설정 활성화 (Phase 2 이후)
SSO_CONFIG_FROM_DB=true            # true면 DB 우선, false면 환경변수 우선
```

---

## 10. 요약

| 구분 | 현재 | 제안 |
|------|------|------|
| 설정 저장 | 환경변수 (.env) | DB (SsoConfig) + Redis 캐시 |
| 변경 방법 | .env 수정 + 재시작 | Admin UI에서 실시간 변경 |
| 조직별 설정 | 불가 (전역 1개) | 조직별 독립 IdP |
| 연결 확인 | 수동 (로그 확인) | UI 연결 테스트 버튼 |
| 안전장치 | 없음 | 모드별 전환 조건 + 자동 폴백 + 비상 계정 |
| 모드 | on/off 2가지 | disabled/optional/preferred/enforced 4단계 |
