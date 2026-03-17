# ELN 백엔드 미완성 기능 완성 설계

**날짜:** 2026-03-17
**범위:** `services/eln-service`, `services/signature-audit-service`
**작성 배경:** Phase 1 백엔드 인프라 - 기능 완성 스프린트

---

## 1. 현황 및 목표

### 이미 구현된 것 (변경 없음)
- 연구노트 CRUD, 상태 전환, admin-unlock
- 버전이력(NoteRevision), 첨부파일(Attachment), 링크(NoteLink)
- 템플릿 CRUD + 복사(copyTemplate) + useCount/copyCount
- 프로토콜 CRUD (type=protocol 재사용)
- 전자서명 sign/verify/revoke (해시체인)
- 감사로그 조회/필터 API

### 구현 목표 (실제 누락분)
1. eln-service → signature-audit-service 감사로그 연동 (strict audit)
2. signature-audit-service 컴플라이언스 API (stats, list, editable)

**템플릿 CRUD 감사 로그는 현재 범위 외 — 노트/프로토콜 작업만 대상으로 한다.**

---

## 2. 아키텍처 결정

### Audit Log 연동 방식: Strict HTTP
- eln-service가 노트 작업 후 signature-audit-service `POST /api/audit/internal` 호출
- **실패 시 작업 롤백**: audit 기록 불가 = 작업 자체 실패로 처리
- 내부 로그: `console.error("[AUDIT_FAIL]", ...)` 로 장애 추적 가능
- 사용자 응답: `503 서버 장애가 발생했습니다.` (audit 서비스 노출 금지)
- 인증: `x-internal-secret` 헤더 (eln-service가 `process.env.INTERNAL_SECRET` 읽어서 전송)
- 타임스탬프: signature-audit-service 수신 시점에 서버 시간으로 기록 (`createdAt @default(now())` 활용)

### Audit 롤백 패턴
외부 HTTP 호출은 Prisma 트랜잭션에 포함할 수 없으므로 **보상 트랜잭션(compensating transaction)** 패턴을 사용한다.

```
CREATE 계열:
  1. prisma.note.create()         // DB write
  2. callAuditLog()               // audit 호출
  3. 실패 시 → prisma.note.delete() 로 보상 삭제 → 503 반환
  4. 보상 삭제 자체 실패 시 → console.error("[AUDIT_ORPHAN]") → 503 반환
     (孤立 레코드는 운영팀 수동 정리 대상으로 남김)

UPDATE/DELETE 계열:
  1. prisma.note.update/delete()  // DB write
  2. callAuditLog()               // audit 호출
  3. 실패 시 → 503 반환
     (UPDATE는 이미 변경됨 — "audit 실패" 내부 로그 남기고 503)
     (DELETE는 이미 삭제됨 — 동일 처리)
```

> **결정:** UPDATE/DELETE 후 audit 실패는 데이터 롤백이 현실적으로 불가능하므로,
> 내부 로그(`[AUDIT_ORPHAN]`)를 남기고 503을 반환한다. 운영팀이 `[AUDIT_ORPHAN]` 로그를
> 모니터링해서 수동으로 audit 재기록 가능.

### 컴플라이언스 집계 위치: signature-audit-service
- 노트 데이터는 eln-service DB에 있으므로 HTTP 호출로 집계
- MSA 원칙 유지: 각 서비스는 자신의 DB만 소유
- eln-service 미응답 시 → `503` 반환 (부분 응답 금지)
- inter-service 타임아웃: 5초 (audit 호출 및 compliance 호출 모두 동일)

---

## 3. eln-service 변경 사항

### 3.1 신규 파일: `src/lib/audit.ts`

```typescript
// 역할: signature-audit-service에 감사 이벤트 전송
export class AuditServiceError extends Error {
  constructor(msg: string) { super(msg); this.name = 'AuditServiceError'; }
}

interface AuditEvent {
  entityType: string;   // 'note'
  entityId: string;
  action: string;       // 'note.created', 'note.updated', 등
  actorId: string;
  details?: object;
  ipAddress?: string;   // 일관성을 위해 ipAddress 사용
}

// x-internal-secret 헤더 포함해서 POST /api/audit/internal 호출
// 실패(네트워크 오류 / 4xx / 5xx) 시: console.error("[AUDIT_FAIL]", ...) 후 AuditServiceError throw
// 타임아웃: 5초
export async function callAuditLog(event: AuditEvent): Promise<void>
```

### 3.2 수정 파일: `src/controllers/note.controller.ts`

각 함수에 audit 호출 추가. DB write 성공 후, 응답 전에 호출.

| 함수 | action 값 | details |
|------|-----------|---------|
| `createNote` | `note.created` | `{ type, title, templateId }` |
| `updateNote` | `note.updated` | `{ changedFields: string[] }` |
| `deleteNote` | `note.deleted` | `{ title }` |
| `changeNoteStatus` | `note.status_changed` | `{ from: string, to: string }` |
| `adminUnlockNote` | `note.admin_unlocked` | `{ reason: string }` |

**createNote 에러 흐름 (보상 트랜잭션):**
```typescript
const note = await prisma.note.create(...)
try {
  await callAuditLog({ ..., entityId: note.id, action: 'note.created' })
} catch (err) {
  if (err instanceof AuditServiceError) {
    // 보상 삭제
    await prisma.note.delete({ where: { id: note.id } }).catch(e => {
      console.error('[AUDIT_ORPHAN] note 보상 삭제 실패', { noteId: note.id, err: e })
    })
    res.status(503).json({ ok: false, error: '서버 장애가 발생했습니다.' })
    return
  }
  throw err
}
res.status(201).json({ ok: true, data: note })
```

**updateNote / deleteNote / changeNoteStatus / adminUnlockNote 에러 흐름:**
```typescript
const updated = await prisma.note.update(...)
try {
  await callAuditLog({ ..., action: 'note.updated' })
} catch (err) {
  if (err instanceof AuditServiceError) {
    console.error('[AUDIT_ORPHAN] audit 기록 실패 (이미 변경됨)', { noteId, action })
    res.status(503).json({ ok: false, error: '서버 장애가 발생했습니다.' })
    return
  }
  throw err
}
res.json({ ok: true, data: updated })
```

---

## 4. signature-audit-service 변경 사항

### 4.1 신규 파일: `src/lib/eln.ts`

eln-service 호출 공통 헬퍼.

```typescript
const ELN_URL = process.env.ELN_SERVICE_URL || 'http://eln-service:8002'

// GET /api/notes?type=note&status=X&limit=1 → { total }
export async function fetchNoteCount(status: string): Promise<number>

// GET /api/notes?type=note&status=X&page=P&limit=L&... → { data, total }
export async function fetchNotes(params: Record<string, string>): Promise<NoteListResponse>

// GET /api/notes/:id → note 또는 null(404)
export async function fetchNote(noteId: string, userId: string): Promise<NoteData | null>
```

- 타임아웃: 5초
- eln-service 미응답 / 5xx → `ELnServiceError` throw
- 호출 시 `x-user-id: system`, `x-user-role: admin` 헤더 포함 (권한 우회용 internal 호출)

### 4.2 신규 엔드포인트: `POST /api/audit/internal`

eln-service 전용 내부 수신 엔드포인트.

```
POST /api/audit/internal
Headers: x-internal-secret: <secret>
Body: { entityType, entityId, action, actorId, details?, ipAddress? }
Response 201: { ok: true, data: { id } }
Response 401: x-internal-secret 불일치
Response 400: 필수 필드 누락
```

- `requireAuth` 미들웨어 **적용 안 함**
- `x-internal-secret` 미들웨어로 검증
- `createdAt`은 DB default(now()) 사용 (서버 시간 — 클라이언트 시간 불신)
- Swagger/OpenAPI 문서에서 `tags: ['internal']` 로 별도 분리

### 4.3 신규 엔드포인트: `GET /api/signatures/compliance/stats`

```
GET /api/signatures/compliance/stats
Auth: requireAuth + requirePermission('note:read')

Response 200:
{
  ok: true,
  data: {
    signed: number,         // eln-service 노트 status=signed 개수
    pending: number,        // eln-service 노트 status=in_progress 개수
    locked: number,         // eln-service 노트 status=locked 개수
    draft: number,          // eln-service 노트 status=draft 개수
    totalSignatures: number // 자체 DB 유효 서명(status=valid) 총 수
  }
}
Response 503: eln-service 미응답 시
```

**구현:**
```typescript
// eln-service에 4개 병렬 요청 (type=note, limit=1, status 필터)
const [signed, pending, locked, draft, totalSigs] = await Promise.all([
  fetchNoteCount('signed'),
  fetchNoteCount('in_progress'),
  fetchNoteCount('locked'),
  fetchNoteCount('draft'),
  prisma.signature.count({ where: { status: 'valid' } }),
])
```

### 4.4 신규 엔드포인트: `GET /api/signatures/compliance/list`

```
GET /api/signatures/compliance/list?page=1&limit=20&status=signed|in_progress|locked|draft
Auth: requireAuth + requirePermission('note:read')

Response 200:
{
  ok: true,
  data: [{
    noteId: string,
    title: string,
    status: string,
    authorId: string,
    updatedAt: string,
    isSigned: boolean,
    signatureCount: number,      // 유효 서명 수 (0 이상)
    latestSignature: {
      id: string,
      signerId: string,
      signatureHash: string,
      timestamp: string          // signature-audit-service DB의 timestamp 필드
    } | null,
    editable: boolean            // status === 'draft' || 'in_progress'
  }],
  total: number,
  page: number
}
Response 503: eln-service 미응답 시
```

**구현:**
```
1. fetchNotes({ type: 'note', status?, page, limit, sortBy: updatedAt desc })
   → eln-service GET /api/notes?type=note&...
2. noteIds 목록으로 자체 DB 서명 조회 (LEFT JOIN 방식: 서명 없는 노트도 포함)
   → prisma.signature.findMany({ where: { noteId: { in: noteIds }, status: 'valid' } })
3. noteId 기준으로 merge:
   - isSigned = signatures.some(s => s.noteId === note.id)
   - signatureCount = signatures.filter(...).length
   - latestSignature = signatures.filter(...).sort(chainIndex desc)[0] ?? null
   - editable = ['draft','in_progress'].includes(note.status)
```

> **일관성:** eln-service 노트 목록과 서명 조회 사이 시점 차이로 데이터가 미세하게 다를 수 있음.
> 실시간 정합성이 필요하면 단일 DB 아키텍처가 필요 — 현재 MSA 구조에서는 허용 트레이드오프.

### 4.5 신규 엔드포인트: `GET /api/signatures/editable/:noteId`

```
GET /api/signatures/editable/:noteId
Auth: requireAuth + requirePermission('note:read')

Response 200:
{
  ok: true,
  data: {
    noteId: string,
    status: string,
    editable: boolean,
    reason: 'editable' | 'locked' | 'signed'
  }
}
Response 404: 노트 없음
Response 503: eln-service 미응답 시
```

**구현:** fetchNote(noteId) → status 체크

---

## 5. 파일 변경 목록 요약

### eln-service (신규 1, 수정 1)
| 파일 | 변경 유형 |
|------|---------|
| `src/lib/audit.ts` | 신규 |
| `src/controllers/note.controller.ts` | 수정 (5개 함수) |

### signature-audit-service (신규 2, 수정 4)
| 파일 | 변경 유형 |
|------|---------|
| `src/lib/eln.ts` | 신규 |
| `src/controllers/signature.controller.ts` | 수정 (+3 핸들러) |
| `src/controllers/audit.controller.ts` | 수정 (+1 핸들러) |
| `src/routes/signature.routes.ts` | 수정 (+3 라우트) |
| `src/routes/audit.routes.ts` | 수정 (+1 라우트) |

---

## 6. 환경 변수

### eln-service
```env
SIGNATURE_AUDIT_SERVICE_URL=http://signature-audit-service:8003
INTERNAL_SECRET=<shared-secret>
```

### signature-audit-service
```env
ELN_SERVICE_URL=http://eln-service:8002     # 이미 존재
INTERNAL_SECRET=<shared-secret>              # 이미 존재
```

---

## 7. 비기능 요구사항

- 모든 inter-service 호출 타임아웃: 5초
- compliance/list 최대 limit: 100
- `POST /api/audit/internal`은 Swagger `tags: ['internal']`로 분리
- `[AUDIT_FAIL]`, `[AUDIT_ORPHAN]` 로그 prefix로 운영팀 모니터링 대상 식별

---

*작성일: 2026-03-17 | 브랜치: feature/phase2-todo-service*
