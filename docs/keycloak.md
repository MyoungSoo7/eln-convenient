# Keycloak — SSO 인증 (선택 사항)

## 접속 정보

| 항목 | 값 |
|------|-----|
| 관리 콘솔 URL | http://localhost:8080 |
| 로그인 | `.env`의 `KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD` |
| Realm | `labnote` |

## Keycloak이 하는 일

**SSO(Single Sign-On)** 인증 서버. 조직에서 이미 사용 중인 LDAP, Google Workspace, SAML 등의 외부 인증 시스템과 연동하여 통합 로그인을 제공한다.

> **이 시스템에서 Keycloak은 선택 사항이다.**
> `KEYCLOAK_ENABLED=true` 환경변수가 설정되어야만 활성화된다.
> 미설정 시 자체 JWT(auth-service 발급) 모드로 동작한다.

## 듀얼 인증 모드

API Gateway가 JWT를 검증할 때 두 가지 모드로 동작한다:

```
모드 1 (기본): 로컬 JWT
브라우저 → auth-service (로그인) → JWT 발급 (JWT_SECRET으로 서명)
        → API Gateway → JWT_SECRET으로 검증 → 헤더 주입 → 내부 서비스

모드 2 (KEYCLOAK_ENABLED=true): Keycloak SSO
브라우저 → Keycloak (SSO 로그인) → JWT 발급 (RS256, JWKS로 서명)
        → API Gateway → JWKS로 검증 → auth-service에서 권한 조회 → 헤더 주입
        검증 실패 시 → 모드 1(로컬 JWT)로 자동 폴백
```

### 헤더 주입 (두 모드 공통)

검증 성공 시 API Gateway가 내부 서비스로 전달하는 헤더:

| 헤더 | 설명 |
|------|------|
| `x-user-id` | 사용자 고유 ID |
| `x-user-role` | admin / researcher / reviewer / viewer |
| `x-user-email` | 이메일 |
| `x-user-permissions` | 권한 배열 JSON (`["note:read","note:write",...]`) |
| `x-user-org-id` | 조직 ID (멀티테넌시) |
| `x-sso-provider` | `keycloak` 또는 `local` |

## 연동 서비스

| 서비스 | 역할 |
|--------|------|
| **API Gateway** | Keycloak JWKS로 JWT 검증. 실패 시 로컬 JWT 폴백 |
| **auth-service** | Keycloak SSO 사용자의 역할→권한 매핑 조회 (`/internal/role-permissions`) |
| **프론트엔드** | SSO 콜백 페이지 (`/sso-callback`), 세션 정보 조회 |

## 콘솔 사용법

### 1. Realm 설정 확인
- 좌측 상단 드롭다운에서 `labnote` realm 선택
- **Realm Settings** → General, Login, Tokens 설정 확인

### 2. 사용자 관리
- **Users** → Keycloak에 등록된 SSO 사용자 목록
- 사용자 클릭 → **Role Mappings** → realm 역할 확인 (admin, researcher, reviewer)

### 3. 클라이언트 설정
- **Clients** → `labnote-frontend` 클라이언트
- Valid Redirect URIs, Web Origins 설정이 프론트엔드 URL과 일치해야 SSO 로그인 가능

### 4. Identity Providers (SSO 연동)
- **Identity Providers** → Google, SAML, LDAP 등 외부 인증 연동 설정
- 온프레미스 환경에서 사내 LDAP 연동 시 여기서 설정

## Realm 초기 설정

`services/keycloak/realm-labnote.json` 파일이 컨테이너 시작 시 자동 import된다.
이미 존재하면 `IGNORE_EXISTING` 전략으로 건너뛴다.

## 가장 중요하게 봐야 할 점

1. **unhealthy 상태는 정상일 수 있다**: dev 모드 경고가 뜨지만 실제 동작에 문제 없음. 프로덕션에서는 `--optimized` 플래그로 빌드해야 한다
2. **KEYCLOAK_ENABLED 미설정 시 완전 무시됨**: 기본값은 로컬 JWT 모드. Keycloak 컨테이너가 떠 있어도 사용하지 않음
3. **realm 역할 매핑**: Keycloak 토큰의 `realm_access.roles`에서 역할을 추출한다. `admin > researcher > reviewer > viewer` 우선순위로 선택
4. **권한 캐싱**: Gateway가 auth-service에서 조회한 권한을 Redis에 5분 캐싱. 권한 변경 후 최대 5분 지연 발생 가능
5. **Valid Redirect URIs**: 프론트엔드 URL이 바뀌면 Keycloak 콘솔에서도 업데이트해야 SSO 리디렉트가 동작한다
