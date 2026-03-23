---
description: API 응답 형식 및 프론트엔드 API 클라이언트 사용 규칙
globs: src/api/**/*.ts, services/*/src/controllers/*.ts
---

# API 응답/클라이언트 규칙

## 백엔드 응답 형식 (통일)
```typescript
// 성공
reply.send({ ok: true, data: result });

// 실패 (AppError 사용)
throw new AppError(404, '노트를 찾을 수 없습니다.', ErrorCode.NOT_FOUND);
// → 전역 에러핸들러가 { ok: false, error: '...', code: '...' } 형태로 변환
```

## 프론트엔드 API 클라이언트
- `src/api/client.ts`의 `apiClient` 싱글턴 사용
- JWT 자동 주입, 토큰 갱신, 401 자동 리디렉트 내장
- 응답 타입: `ApiResponse<T> = { ok: boolean, data: T, error?: string }`

```typescript
const res = await apiClient.get<Note[]>('/notes');
if (res.ok) { /* res.data 사용 */ }
```
