# 전역 예외처리 개선 가이드

## 개요

모든 마이크로서비스에 일관된 전역 예외처리 체계를 적용했다.
기존에는 각 서비스마다 인라인 에러 핸들러와 수동 try-catch에만 의존하고 있었으며,
프로세스 레벨 예외 핸들러가 없어 예기치 않은 크래시 위험이 있었다.

---

## 변경 사항 요약

### 1. `AppError` 커스텀 에러 클래스 도입

**위치**: 각 Express 서비스의 `src/lib/errors.ts`

```typescript
import { AppError } from '../lib/errors';

// 컨트롤러에서 사용
throw new AppError(404, '노트를 찾을 수 없습니다.', 'NOTE_NOT_FOUND');
throw new AppError(403, '권한이 없습니다.', 'FORBIDDEN');
throw new AppError(400, '잘못된 요청입니다.'); // code는 'ERR_400'으로 자동 생성
```

**에러 응답 형식**:
```json
{
  "ok": false,
  "error": "노트를 찾을 수 없습니다.",
  "code": "NOTE_NOT_FOUND"
}
```

`AppError`가 아닌 일반 에러는 기존과 동일하게 500으로 처리된다:
```json
{
  "ok": false,
  "error": "서버 내부 오류가 발생했습니다.",
  "code": "ERR_INTERNAL"
}
```

---

### 2. `asyncHandler` 래퍼 도입

**위치**: 각 Express 서비스의 `src/lib/errors.ts`

Express에서 async 핸들러의 에러가 글로벌 에러 핸들러에 도달하려면
반드시 `next(err)`를 호출해야 한다. 기존에는 모든 컨트롤러에 수동 try-catch를
넣어서 해결했지만, 하나라도 빠뜨리면 응답이 hang된다.

`asyncHandler`는 이 문제의 안전망이다:

```typescript
import { asyncHandler } from '../lib/errors';

// 라우트에서 사용 (try-catch 없이도 에러가 글로벌 핸들러로 전파됨)
router.get('/notes', asyncHandler(async (req, res) => {
  const notes = await prisma.note.findMany();
  res.json({ ok: true, data: notes });
}));
```

> **참고**: 기존 컨트롤러의 try-catch를 제거할 필요는 없다.
> `asyncHandler`는 try-catch가 빠진 핸들러에 대한 **안전망** 역할이다.
> 새로 작성하는 컨트롤러부터 적용하면 된다.

---

### 3. `globalErrorHandler` 중앙화

**위치**: 각 Express 서비스의 `src/lib/errors.ts` → `src/index.ts`에서 사용

기존 인라인 에러 핸들러를 `globalErrorHandler` 팩토리 함수로 교체했다:

```typescript
// before
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[service-name]', err);
  res.status(500).json({ ok: false, error: '서버 내부 오류가 발생했습니다.' });
});

// after
app.use(globalErrorHandler('service-name'));
```

**개선점**:
- `AppError` 인스턴스는 설정된 `statusCode`와 `code`로 응답
- 일반 에러는 스택 트레이스를 포함하여 로깅
- 클라이언트에 `code` 필드를 제공하여 프로그래매틱 에러 핸들링 가능

---

### 4. 프로세스 레벨 에러 핸들러

**적용 대상**: 모든 서비스 (Express 6개 + Fastify 2개 + WebSocket 1개)

```typescript
// Express 서비스: lib/errors.ts의 setupProcessHandlers() 호출
setupProcessHandlers('service-name');

// Fastify/WebSocket 서비스: index.ts에 직접 등록
process.on('unhandledRejection', (reason) => {
  console.error('[service-name] Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[service-name] Uncaught Exception:', err);
  process.exit(1);
});
```

| 이벤트 | 동작 |
|--------|------|
| `unhandledRejection` | 로깅만 수행 (프로세스 유지) |
| `uncaughtException` | 로깅 후 `process.exit(1)` (복구 불가능한 상태이므로 재시작 유도) |

---

### 5. Collab Service (WebSocket) 에러 로깅 개선

기존에 silent catch (`catch {}`)로 무시되던 에러들에 로깅을 추가했다:

| 위치 | 변경 전 | 변경 후 |
|------|---------|---------|
| Redis `on('error')` | `() => {}` | `err.message` 로깅 |
| Redis subscribe 실패 | 무시 | `err.message` 로깅 |
| Redis 메시지 파싱 | `catch {}` | 에러 객체 로깅 |
| Redis publish | `catch {}` | 에러 객체 로깅 |
| WebSocket 메시지 파싱 | `catch {}` | 에러 객체 로깅 |
| WebSocket `on('error')` | `() => {}` | `err.message` + 사용자명 로깅 |

---

## 적용된 서비스 목록

| 서비스 | 유형 | `AppError` | `asyncHandler` | `globalErrorHandler` | 프로세스 핸들러 | 에러 로깅 개선 |
|--------|------|:----------:|:--------------:|:--------------------:|:--------------:|:-------------:|
| auth-service | Express | O | O | O | O | - |
| eln-service | Express | O | O | O | O | - |
| file-service | Express | O | O | O | O | - |
| inventory-service | Express | O | O | O | O | - |
| search-service | Express | O | O | O | O | - |
| signature-audit-service | Express | O | O | O | O | - |
| api-gateway | Fastify | - | - | 기존 유지 | O | - |
| scheduler-service | Fastify | - | - | 기존 유지 | O | - |
| collab-service | WebSocket | - | - | - | O | O |

---

## 파일 구조

```
services/
├── auth-service/src/
│   ├── lib/errors.ts          ← NEW
│   └── index.ts               ← UPDATED
├── eln-service/src/
│   ├── lib/errors.ts          ← NEW
│   └── index.ts               ← UPDATED
├── file-service/src/
│   ├── lib/errors.ts          ← NEW
│   └── index.ts               ← UPDATED
├── inventory-service/src/
│   ├── lib/errors.ts          ← NEW
│   └── index.ts               ← UPDATED
├── search-service/src/
│   ├── lib/errors.ts          ← NEW
│   └── index.ts               ← UPDATED
├── signature-audit-service/src/
│   ├── lib/errors.ts          ← NEW
│   └── index.ts               ← UPDATED
├── api-gateway/src/
│   └── index.ts               ← UPDATED
├── scheduler-service/src/
│   └── index.ts               ← UPDATED
└── collab-service/src/
    └── index.ts               ← UPDATED
```

---

## 향후 작업 (선택사항)

- **컨트롤러에서 `AppError` 활용**: 기존 컨트롤러의 수동 `res.status(4xx).json(...)` 패턴을 `throw new AppError(...)` + `asyncHandler`로 점진적 전환
- **에러 코드 표준화**: 서비스별 에러 코드 enum 정의 (예: `AUTH_INVALID_CREDENTIALS`, `NOTE_NOT_FOUND`)
- **구조화 로깅**: `console.error` → pino/winston 등 구조화 로거로 교체
- **DB 연결 실패 시 graceful shutdown**: 현재 search/file 서비스는 DB 연결 실패 시에도 서비스가 실행됨
