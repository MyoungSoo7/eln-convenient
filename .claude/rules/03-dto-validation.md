---
description: DTO/Zod 스키마 작성 규칙
globs: services/*/src/dtos/*.ts
---

# DTO / Zod 스키마 규칙

## 파일 위치
`services/<name>-service/src/dtos/<domain>.dto.ts`

## 작성 패턴
```typescript
import { z } from 'zod';

// 스키마 정의
export const CreateNoteSchema = z.object({
  title: z.string().min(1).max(255),
  content: z.string().optional(),
  type: z.enum(['note', 'protocol']).default('note'),
});

// 타입 추출
export type CreateNoteDto = z.infer<typeof CreateNoteSchema>;
```

## 규칙

1. **Zod 스키마와 TypeScript 타입을 함께 정의**: `z.infer<>`로 타입 추출
2. **스키마 이름 컨벤션**: `XxxSchema` (PascalCase + Schema 접미사)
3. **라우트에서 사용**: `validate({ body: CreateNoteSchema })` preHandler로 연결
4. **상태 전환 맵도 여기에 정의**: `ALLOWED_STATUS_TRANSITIONS`, `SYSTEM_STATUS_TRANSITIONS`
