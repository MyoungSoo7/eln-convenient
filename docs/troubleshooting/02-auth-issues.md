# 인증/권한 트러블슈팅

## 증상 1: 로그인 후 즉시 401 발생 (무한 리디렉트)

### 원인
JWT 토큰 갱신 실패 → 401 → 리디렉트 → 재로그인 → 401 반복.

### 진단
```bash
# API Gateway 로그 확인
docker compose logs -f api-gateway | grep "JWT"

# 브라우저 개발자 도구
# Network 탭 → 401 응답의 헤더 확인
# Application 탭 → localStorage의 accessToken 확인
```

### 해결
| 원인 | 해결 |
|------|------|
| JWT_SECRET 불일치 (Gateway vs Auth) | `.env`에서 동일한 값인지 확인 |
| 토큰 만료 시간이 0 | Auth Service의 `JWT_EXPIRES_IN` 설정 확인 |
| 리프레시 토큰도 만료 | 재로그인 필요 (정상 동작) |
| JWKS 엔드포인트 접근 불가 | Keycloak 기동 상태 확인 |

```bash
# JWT_SECRET 확인
docker compose exec api-gateway env | grep JWT_SECRET
docker compose exec auth-service env | grep JWT_SECRET
# 두 값이 동일해야 함
```

---

## 증상 2: API 호출 시 빈 결과 반환 (데이터가 있는데 안 보임)

### 원인
`x-user-org-id` 헤더 누락 또는 잘못된 orgId → 멀티테넌시 필터가 빈 결과 반환.

### 진단
```bash
# Gateway가 주입하는 헤더 확인
docker compose logs api-gateway | grep "x-user-org-id"

# 서비스 로그에서 orgId 확인
docker compose logs eln-service | grep "orgId"
```

### 해결
```bash
# 1. 사용자의 orgId가 DB에 존재하는지 확인
docker compose exec auth-service npx prisma studio
# Users 테이블에서 해당 사용자의 organizationId 확인

# 2. JWT 페이로드에 orgId가 포함되는지 확인
# 브라우저에서 토큰을 jwt.io에 붙여넣기
# payload.orgId 필드 확인
```

### 근본 원인
- 사용자 생성 시 Organization에 할당 안 됨
- JWT 생성 로직에서 orgId 누락 (auth-service 코드 확인)

---

## 증상 3: 서비스 간 통신 403 Forbidden

### 원인
`x-internal-secret` 헤더 불일치.

### 진단
```bash
# 각 서비스의 INTERNAL_SECRET 확인
docker compose exec eln-service env | grep INTERNAL_SECRET
docker compose exec signature-audit-service env | grep INTERNAL_SECRET
docker compose exec auth-service env | grep INTERNAL_SECRET
# 모두 동일한 값이어야 함
```

### 해결
```bash
# .env 파일에서 INTERNAL_SECRET 확인
grep INTERNAL_SECRET services/.env

# 모든 서비스가 같은 .env를 참조하는지 docker-compose.yml 확인
grep -A5 "env_file" services/docker-compose.yml
```

---

## 증상 4: 특정 기능에서 403 Permission Denied

### 원인
사용자 역할에 해당 권한이 없음.

### 진단
```bash
# 사용자의 역할 확인
docker compose logs api-gateway | grep "x-user-role"

# 해당 엔드포인트에 필요한 권한 확인
# 라우트 파일에서 requirePermission 확인
grep -r "requirePermission" services/<서비스명>/src/routes/
```

### 역할별 권한 매트릭스 (요약)

| 권한 | Researcher | Reviewer | Admin | Viewer |
|------|:----------:|:--------:|:-----:|:------:|
| note:read | O | O | O | O |
| note:write | O | O | O | X |
| note:sign | X | O | O | X |
| note:status | O | O | O | X |
| note:unlock | X | X | O | X |
| note:delete | O | O | O | X |
| inventory:write | O | O | O | X |
| export:pdf | O | O | O | X |
| audit:read | X | O | O | X |

### 해결
```bash
# Auth Service에서 사용자 역할 변경 (Admin 권한 필요)
# PUT /api/auth/users/:userId/role
curl -X PUT http://localhost:8000/api/auth/users/<userId>/role \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"roleId": "<역할ID>"}'
```

---

## 증상 5: Keycloak SSO 연동 실패

### 원인
Keycloak realm 설정 불일치 또는 연결 실패.

### 진단
```bash
# Keycloak 기동 상태
docker compose ps keycloak
docker compose logs keycloak | tail -30

# JWKS 엔드포인트 접근 확인
curl -s http://localhost:8080/realms/labnote/protocol/openid-connect/certs | jq .
```

### 해결
| 상황 | 조치 |
|------|------|
| Keycloak 미기동 | `docker compose up -d keycloak` |
| Realm 미설정 | `keycloak/realm-labnote.json` 임포트 |
| JWKS URL 불일치 | Gateway의 `JWKS_URL` 환경변수 확인 |
| 로컬 JWT 모드로 전환 | `AUTH_MODE=local` 설정 (Keycloak 없이 동작) |

---

## 증상 6: 토큰 갱신이 동시에 여러 번 발생

### 원인
프론트엔드에서 동시 API 호출 시 각각 401 → 각각 리프레시 시도.

### 진단
```bash
# 브라우저 Network 탭에서 /api/auth/refresh 호출 횟수 확인
# 정상: 동시에 1회만
# 비정상: 동시에 여러 회
```

### 해결
`src/api/client.ts`의 동시 리프레시 방지 로직 확인:
```typescript
// 단일 Promise로 중복 리프레시 차단
if (refreshPromise) return refreshPromise;
refreshPromise = doRefresh().finally(() => { refreshPromise = null; });
```

이 로직이 없거나 깨졌다면 수정 필요.

---

## 빠른 진단 체크리스트

```bash
# 1. JWT 관련 환경변수 일관성 확인
for svc in api-gateway auth-service eln-service signature-audit-service; do
  echo "=== $svc ==="
  docker compose exec $svc env | grep -E "JWT_SECRET|INTERNAL_SECRET" 2>/dev/null
done

# 2. Gateway 인증 로그 실시간 모니터링
docker compose logs -f api-gateway 2>&1 | grep -E "401|403|JWT|auth"

# 3. 특정 사용자의 토큰 정보 확인
# 브라우저 > 개발자 도구 > Console
# JSON.parse(atob(localStorage.getItem('accessToken').split('.')[1]))
```
