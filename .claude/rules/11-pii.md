# PII / 민감정보 처리 규칙

## 분류

| 등급 | 정의 | 예시 필드 |
|---|---|---|
| **L0 공개** | 식별 불가 | id(uuid), createdAt, status, action |
| **L1 식별자** | 단독으로 개인 특정 가능 | email, phone, employeeNumber, name |
| **L2 인증** | 노출 시 즉시 권한 탈취 | password, passwordHash, token, refreshToken, jwt, apiKey, internalSecret |
| **L3 민감** | 법적/계약상 보호 의무 | 주민번호, 의료/실험 결과, 계약서 본문 |

## 절대 금지

1. **L2를 로그/감사로그/에러메시지/응답 본문에 절대 기록 금지** — 즉시 보안 사고
2. **L1·L3을 AuditLog `details`에 평문 저장 금지** — `maskPII()` 통과 필수
3. **L1을 URL/query string에 사용 금지** — 액세스 로그에 잔존
4. **`console.log(req.body)` 전체 덤프 금지** — 자동 마스킹 우회됨

## 필수 패턴

### 1. AuditLog 기록 시
```typescript
import { maskPII } from '@lab/shared';

await callAuditLog({
  entityType: 'user',
  entityId: user.id,
  action: 'user.update',
  actorId: req.headers['x-user-id'] as string,
  details: maskPII({
    email: user.email,        // 자동 마스킹: jo***@example.com
    phone: user.phone,        // 자동 마스킹: 010-****-1234
    role: user.role,          // 그대로 (L0)
    password: req.body.pwd,   // 자동 제거 (L2)
  }),
});
```

### 2. 에러 응답 시
- `AppError`의 message에 사용자 입력값 직접 echo 금지
  - 나쁜 예: `throw new AppError(400, \`이메일 ${email} 중복\`)`
  - 좋은 예: `throw new AppError(400, '이미 등록된 이메일입니다')`

### 3. 로깅 시
```typescript
logger.info({ userId: user.id, action: 'login' }, '로그인 성공');  // OK
logger.info({ user }, '로그인 성공');  // 금지 - user 객체 전체 덤프
```

### 4. 외부 응답 직렬화 시
- Prisma `select`로 필요한 필드만 명시 — `findMany()` 통째로 반환 금지
- L2 필드는 schema 레벨에서 `select: { passwordHash: false }` 기본값 권장

## 검증

- 새 엔드포인트 추가 시: PR 리뷰에서 응답 페이로드의 PII 등급 표기 필수
- AuditLog `details`에 평문 password/token이 들어갔는지 정기 grep:
  ```bash
  docker exec labnote-postgres psql -U postgres labnote -c \
    "SELECT count(*) FROM \"AuditLog\" WHERE details::text ~* 'password|token|secret';"
  ```
  → 0이어야 정상

## 마스킹 헬퍼

`@lab/shared`에서 제공:

- `maskPII(obj)` — 객체 내 알려진 키(`password`, `token`, `secret`, `apiKey` 등)는 제거, `email`/`phone`은 부분 마스킹
- `maskEmail(email)` — `jo***@example.com`
- `maskPhone(phone)` — `010-****-1234`

규칙은 `services/shared/src/pii.ts` 한 곳에서 관리.
