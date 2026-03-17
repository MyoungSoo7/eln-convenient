# ELN 백엔드 완성 구현 계획

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** eln-service에 strict audit 연동을 추가하고, signature-audit-service에 컴플라이언스 API(stats/list/editable)와 내부 audit 수신 엔드포인트를 구현한다.

**Architecture:** eln-service가 노트 작업 후 signature-audit-service `POST /api/audit/internal`을 호출하며, 실패 시 보상 트랜잭션(CREATE) 또는 [AUDIT_ORPHAN] 로그(UPDATE/DELETE) 후 503 반환. signature-audit-service는 eln-service HTTP 호출로 노트 데이터를 집계해 컴플라이언스 API를 제공한다.

**Tech Stack:** TypeScript, Express, Prisma (PostgreSQL), Node.js fetch API

**Spec:** `docs/superpowers/specs/2026-03-17-eln-backend-completion-design.md`

---

## 파일 구조

### 신규 생성
| 파일 | 역할 |
|------|------|
| `services/eln-service/src/lib/audit.ts` | signature-audit-service 호출 헬퍼 + AuditServiceError |
| `services/signature-audit-service/src/lib/eln.ts` | eln-service 호출 헬퍼 + ElnServiceError |

### 수정
| 파일 | 변경 내용 |
|------|---------|
| `services/eln-service/src/controllers/note.controller.ts` | 5개 함수에 callAuditLog 추가 |
| `services/signature-audit-service/src/controllers/audit.controller.ts` | createAuditLogInternal 핸들러 추가 |
| `services/signature-audit-service/src/controllers/signature.controller.ts` | compliance stats/list/editable 핸들러 추가 |
| `services/signature-audit-service/src/routes/audit.routes.ts` | POST /internal 라우트 추가 |
| `services/signature-audit-service/src/routes/signature.routes.ts` | compliance 라우트 3개 추가 |

---

## Task 1: eln-service — audit.ts 헬퍼 생성

**Files:**
- Create: `services/eln-service/src/lib/audit.ts`

- [ ] **Step 1: audit.ts 파일 생성**

```typescript
// services/eln-service/src/lib/audit.ts
import http from 'http';
import https from 'https';

const SIG_AUDIT_URL = process.env.SIGNATURE_AUDIT_SERVICE_URL || 'http://signature-audit-service:8003';
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || '';
const TIMEOUT_MS = 5000;

export class AuditServiceError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'AuditServiceError';
  }
}

export interface AuditEvent {
  entityType: string;
  entityId: string;
  action: string;
  actorId: string;
  details?: object;
  ipAddress?: string;
}

export async function callAuditLog(event: AuditEvent): Promise<void> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(event);
    const url = new URL(`${SIG_AUDIT_URL}/api/audit/internal`);
    const lib = url.protocol === 'https:' ? https : http;

    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'x-internal-secret': INTERNAL_SECRET,
        },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            console.error('[AUDIT_FAIL] audit 서비스 응답 오류', {
              status: res.statusCode,
              body: data,
              event,
            });
            reject(new AuditServiceError(`audit 서비스 응답 오류: ${res.statusCode}`));
          }
        });
      },
    );

    req.on('timeout', () => {
      req.destroy();
      console.error('[AUDIT_FAIL] audit 서비스 타임아웃', { event });
      reject(new AuditServiceError('audit 서비스 타임아웃'));
    });

    req.on('error', (err) => {
      console.error('[AUDIT_FAIL] audit 서비스 연결 실패', { err: err.message, event });
      reject(new AuditServiceError(`audit 서비스 연결 실패: ${err.message}`));
    });

    req.write(body);
    req.end();
  });
}
```

- [ ] **Step 2: 커밋**

```bash
git add services/eln-service/src/lib/audit.ts
git commit -m "feat(eln): audit 서비스 호출 헬퍼 추가 (callAuditLog, AuditServiceError)"
```

---

## Task 2: eln-service — note.controller.ts에 audit 연동

**Files:**
- Modify: `services/eln-service/src/controllers/note.controller.ts`

> **사전 확인:** note.controller.ts 상단 import에 `callAuditLog`, `AuditServiceError` 추가 필요

- [ ] **Step 1: import 추가**

`note.controller.ts` 상단에 다음 import 추가:
```typescript
import { callAuditLog, AuditServiceError } from '../lib/audit';
```

- [ ] **Step 2: createNote에 audit 연동 (보상 트랜잭션)**

기존 `res.status(201).json(...)` 직전 코드를 다음으로 교체:

```typescript
    // audit 기록 (실패 시 보상 삭제 후 503)
    try {
      await callAuditLog({
        entityType: 'note',
        entityId: note.id,
        action: 'note.created',
        actorId: authorId,
        details: { type: noteType, title: note.title, templateId: templateId || null },
        ipAddress: req.ip,
      });
    } catch (auditErr) {
      if (auditErr instanceof AuditServiceError) {
        await prisma.note.delete({ where: { id: note.id } }).catch((e: Error) => {
          console.error('[AUDIT_ORPHAN] note 보상 삭제 실패', { noteId: note.id, err: e.message });
        });
        res.status(503).json({ ok: false, error: '서버 장애가 발생했습니다.' });
        return;
      }
      throw auditErr;
    }

    res.status(201).json({ ok: true, data: note });
```

- [ ] **Step 3: updateNote에 audit 연동**

기존 `res.json({ ok: true, data: updated })` 직전에 추가:

```typescript
    try {
      await callAuditLog({
        entityType: 'note',
        entityId: req.params.id,
        action: 'note.updated',
        actorId: userId,
        details: { changedFields: Object.keys(req.body).filter(k => ['title','content','sections','tags'].includes(k)) },
        ipAddress: req.ip,
      });
    } catch (auditErr) {
      if (auditErr instanceof AuditServiceError) {
        console.error('[AUDIT_ORPHAN] note.updated audit 실패 (이미 변경됨)', { noteId: req.params.id });
        res.status(503).json({ ok: false, error: '서버 장애가 발생했습니다.' });
        return;
      }
      throw auditErr;
    }
```

- [ ] **Step 4: deleteNote에 audit 연동**

기존 `res.json({ ok: true, message: '노트가 삭제되었습니다.' ...})` 직전에 추가:

```typescript
    try {
      await callAuditLog({
        entityType: 'note',
        entityId: req.params.id,
        action: 'note.deleted',
        actorId: userId,
        details: { title: existing.title },
        ipAddress: req.ip,
      });
    } catch (auditErr) {
      if (auditErr instanceof AuditServiceError) {
        console.error('[AUDIT_ORPHAN] note.deleted audit 실패 (이미 삭제됨)', { noteId: req.params.id });
        res.status(503).json({ ok: false, error: '서버 장애가 발생했습니다.' });
        return;
      }
      throw auditErr;
    }
```

- [ ] **Step 5: changeNoteStatus에 audit 연동**

기존 `res.json({ ok: true, data: updated, message: ... })` 직전에 추가:

```typescript
    const actorId = (req.headers['x-user-id'] as string) || 'anonymous';
    try {
      await callAuditLog({
        entityType: 'note',
        entityId: req.params.id,
        action: 'note.status_changed',
        actorId,
        details: { from: note.status, to: newStatus },
        ipAddress: req.ip,
      });
    } catch (auditErr) {
      if (auditErr instanceof AuditServiceError) {
        console.error('[AUDIT_ORPHAN] note.status_changed audit 실패', { noteId: req.params.id });
        res.status(503).json({ ok: false, error: '서버 장애가 발생했습니다.' });
        return;
      }
      throw auditErr;
    }
```

- [ ] **Step 6: adminUnlockNote에 audit 연동**

기존 `res.json({ ok: true, data: updated, auditLog: ..., message: ... })` 직전에 추가:

```typescript
    try {
      await callAuditLog({
        entityType: 'note',
        entityId: req.params.id,
        action: 'note.admin_unlocked',
        actorId: adminId,
        details: { reason: reason || '관리자 잠금 해제' },
        ipAddress: req.ip,
      });
    } catch (auditErr) {
      if (auditErr instanceof AuditServiceError) {
        console.error('[AUDIT_ORPHAN] note.admin_unlocked audit 실패', { noteId: req.params.id });
        res.status(503).json({ ok: false, error: '서버 장애가 발생했습니다.' });
        return;
      }
      throw auditErr;
    }
```

- [ ] **Step 7: 커밋**

```bash
git add services/eln-service/src/controllers/note.controller.ts
git commit -m "feat(eln): 노트 CRUD/상태변경에 strict audit 연동 추가"
```

---

## Task 3: signature-audit-service — audit/internal 엔드포인트

**Files:**
- Modify: `services/signature-audit-service/src/controllers/audit.controller.ts`
- Modify: `services/signature-audit-service/src/routes/audit.routes.ts`

- [ ] **Step 1: createAuditLogInternal 핸들러 추가**

`audit.controller.ts` 하단에 추가:

```typescript
import { v4 as uuidv4 } from 'uuid';

const INTERNAL_SECRET = process.env.INTERNAL_SECRET || '';

/** POST /api/audit/internal — eln-service 전용 내부 감사로그 생성 */
export async function createAuditLogInternal(req: Request, res: Response): Promise<void> {
  // x-internal-secret 검증
  const secret = req.headers['x-internal-secret'];
  if (!secret || secret !== INTERNAL_SECRET) {
    res.status(401).json({ ok: false, error: '내부 인증 실패' });
    return;
  }

  const { entityType, entityId, action, actorId, details, ipAddress } = req.body;
  if (!entityType || !entityId || !action || !actorId) {
    res.status(400).json({ ok: false, error: 'entityType, entityId, action, actorId는 필수입니다.' });
    return;
  }

  try {
    const log = await prisma.auditLog.create({
      data: {
        id: uuidv4(),
        entityType,
        entityId,
        action,
        actorId,
        details: details ?? {},
        ipAddress: ipAddress ?? null,
        // createdAt은 @default(now()) 사용 — 서버 시간
      },
    });
    res.status(201).json({ ok: true, data: { id: log.id } });
  } catch (err) {
    console.error('[createAuditLogInternal]', err);
    res.status(500).json({ ok: false, error: '감사로그 기록 중 오류가 발생했습니다.' });
  }
}
```

> **주의:** `audit.controller.ts` 상단에 `import { v4 as uuidv4 } from 'uuid';`가 없으면 추가한다.

- [ ] **Step 2: audit.routes.ts에 internal 라우트 추가**

`router.use(requireAuth)` 줄 **위에** 다음 추가 (requireAuth 제외):

```typescript
// 내부 전용 — requireAuth 미들웨어 적용 안 함
router.post('/internal', ctrl.createAuditLogInternal);
```

최종 라우트 파일 형태:
```typescript
import { Router } from 'express';
import * as ctrl from '../controllers/audit.controller';
import { requireAuth, requirePermission } from '../middlewares/auth.middleware';

const router = Router();

// 내부 전용 — requireAuth 미들웨어 적용 안 함
router.post('/internal', ctrl.createAuditLogInternal);

router.use(requireAuth);

// actions는 /:id 보다 먼저 등록
router.get('/actions', requirePermission('audit:read'), ctrl.listAuditActions);
router.get('/',        requirePermission('audit:read'), ctrl.listAuditLogs);
router.get('/:id',     requirePermission('audit:read'), ctrl.getAuditLog);

export default router;
```

- [ ] **Step 3: 동작 확인**

```bash
# signature-audit-service 디렉토리에서 빌드 오류 확인
cd services/signature-audit-service
npx tsc --noEmit
```

예상: 오류 없음

- [ ] **Step 4: 커밋**

```bash
git add services/signature-audit-service/src/controllers/audit.controller.ts
git add services/signature-audit-service/src/routes/audit.routes.ts
git commit -m "feat(sig-audit): POST /api/audit/internal 내부 감사로그 수신 엔드포인트 추가"
```

---

## Task 4: signature-audit-service — eln.ts 헬퍼 생성

**Files:**
- Create: `services/signature-audit-service/src/lib/eln.ts`

- [ ] **Step 1: eln.ts 생성**

```typescript
// services/signature-audit-service/src/lib/eln.ts

const ELN_URL = process.env.ELN_SERVICE_URL || 'http://eln-service:8002';
const TIMEOUT_MS = 5000;

export class ElnServiceError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'ElnServiceError';
  }
}

export interface NoteData {
  id: string;
  title: string;
  status: string;
  authorId: string;
  updatedAt: string;
  type: string;
}

export interface NoteListResponse {
  ok: boolean;
  data: NoteData[];
  total: number;
  page: number;
}

/** 내부 시스템 호출용 공통 헤더 */
function internalHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-user-id': 'system',
    'x-user-role': 'admin',
    'x-user-permissions': JSON.stringify(['*']),
  };
}

/** fetch with timeout */
async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new ElnServiceError('eln-service 타임아웃');
    }
    throw new ElnServiceError(`eln-service 연결 실패: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}

/** GET /api/notes?type=note&status=X&limit=1 → total 카운트만 반환 */
export async function fetchNoteCount(status: string): Promise<number> {
  const url = `${ELN_URL}/api/notes?type=note&status=${status}&limit=1`;
  const res = await fetchWithTimeout(url, { headers: internalHeaders() });
  if (!res.ok) throw new ElnServiceError(`eln-service 오류: ${res.status}`);
  const body = await res.json() as NoteListResponse;
  return body.total ?? 0;
}

/** GET /api/notes with arbitrary query params */
export async function fetchNotes(params: Record<string, string>): Promise<NoteListResponse> {
  const qs = new URLSearchParams(params).toString();
  const url = `${ELN_URL}/api/notes?${qs}`;
  const res = await fetchWithTimeout(url, { headers: internalHeaders() });
  if (!res.ok) throw new ElnServiceError(`eln-service 오류: ${res.status}`);
  return res.json() as Promise<NoteListResponse>;
}

/** GET /api/notes/:id → NoteData 또는 null(404) */
export async function fetchNote(noteId: string): Promise<NoteData | null> {
  const url = `${ELN_URL}/api/notes/${noteId}`;
  const res = await fetchWithTimeout(url, { headers: internalHeaders() });
  if (res.status === 404) return null;
  if (!res.ok) throw new ElnServiceError(`eln-service 오류: ${res.status}`);
  const body = await res.json() as { ok: boolean; data: NoteData };
  return body.data;
}
```

- [ ] **Step 2: 커밋**

```bash
git add services/signature-audit-service/src/lib/eln.ts
git commit -m "feat(sig-audit): eln-service 호출 헬퍼 추가 (fetchNoteCount, fetchNotes, fetchNote)"
```

---

## Task 5: signature-audit-service — compliance 컨트롤러 추가

**Files:**
- Modify: `services/signature-audit-service/src/controllers/signature.controller.ts`

- [ ] **Step 1: import 추가**

`signature.controller.ts` 상단에 추가:
```typescript
import { fetchNoteCount, fetchNotes, fetchNote, ElnServiceError } from '../lib/eln';
```

- [ ] **Step 2: getComplianceStats 핸들러 추가**

파일 하단에 추가:

```typescript
/** GET /api/signatures/compliance/stats */
export async function getComplianceStats(_req: Request, res: Response): Promise<void> {
  try {
    const [signed, pending, locked, draft, totalSignatures] = await Promise.all([
      fetchNoteCount('signed'),
      fetchNoteCount('in_progress'),
      fetchNoteCount('locked'),
      fetchNoteCount('draft'),
      prisma.signature.count({ where: { status: 'valid' } }),
    ]);

    res.json({
      ok: true,
      data: { signed, pending, locked, draft, totalSignatures },
    });
  } catch (err) {
    if (err instanceof ElnServiceError) {
      res.status(503).json({ ok: false, error: '노트 데이터를 가져올 수 없습니다.' });
      return;
    }
    console.error('[getComplianceStats]', err);
    res.status(500).json({ ok: false, error: '컴플라이언스 통계 조회 중 오류가 발생했습니다.' });
  }
}
```

- [ ] **Step 3: getComplianceList 핸들러 추가**

```typescript
/** GET /api/signatures/compliance/list */
export async function getComplianceList(req: Request, res: Response): Promise<void> {
  const { status, page = '1', limit = '20' } = req.query;
  const limitNum = Math.min(parseInt(limit as string), 100);

  try {
    const params: Record<string, string> = {
      type: 'note',
      page: page as string,
      limit: String(limitNum),
    };
    if (status) params.status = status as string;

    const noteList = await fetchNotes(params);
    const noteIds = noteList.data.map((n) => n.id);

    // 해당 노트들의 유효 서명 조회
    const signatures = noteIds.length > 0
      ? await prisma.signature.findMany({
          where: { noteId: { in: noteIds }, status: 'valid' },
          orderBy: { chainIndex: 'desc' },
        })
      : [];

    // noteId → 서명 목록 맵
    const sigMap = new Map<string, typeof signatures>();
    for (const sig of signatures) {
      if (!sigMap.has(sig.noteId)) sigMap.set(sig.noteId, []);
      sigMap.get(sig.noteId)!.push(sig);
    }

    const data = noteList.data.map((note) => {
      const noteSigs = sigMap.get(note.id) ?? [];
      const latest = noteSigs[0] ?? null;
      return {
        noteId: note.id,
        title: note.title,
        status: note.status,
        authorId: note.authorId,
        updatedAt: note.updatedAt,
        isSigned: noteSigs.length > 0,
        signatureCount: noteSigs.length,
        latestSignature: latest
          ? {
              id: latest.id,
              signerId: latest.signerId,
              signatureHash: latest.signatureHash,
              timestamp: latest.timestamp.toISOString(),
            }
          : null,
        editable: ['draft', 'in_progress'].includes(note.status),
      };
    });

    res.json({ ok: true, data, total: noteList.total, page: parseInt(page as string) });
  } catch (err) {
    if (err instanceof ElnServiceError) {
      res.status(503).json({ ok: false, error: '노트 데이터를 가져올 수 없습니다.' });
      return;
    }
    console.error('[getComplianceList]', err);
    res.status(500).json({ ok: false, error: '서명 현황 목록 조회 중 오류가 발생했습니다.' });
  }
}
```

- [ ] **Step 4: getNoteEditable 핸들러 추가**

```typescript
/** GET /api/signatures/editable/:noteId */
export async function getNoteEditable(req: Request, res: Response): Promise<void> {
  const { noteId } = req.params;
  try {
    const note = await fetchNote(noteId);
    if (!note) {
      res.status(404).json({ ok: false, error: '노트를 찾을 수 없습니다.' });
      return;
    }

    const editable = ['draft', 'in_progress'].includes(note.status);
    const reason = editable ? 'editable' : note.status as 'locked' | 'signed';

    res.json({
      ok: true,
      data: { noteId: note.id, status: note.status, editable, reason },
    });
  } catch (err) {
    if (err instanceof ElnServiceError) {
      res.status(503).json({ ok: false, error: '노트 데이터를 가져올 수 없습니다.' });
      return;
    }
    console.error('[getNoteEditable]', err);
    res.status(500).json({ ok: false, error: '수정 가능 여부 조회 중 오류가 발생했습니다.' });
  }
}
```

- [ ] **Step 5: 커밋**

```bash
git add services/signature-audit-service/src/controllers/signature.controller.ts
git commit -m "feat(sig-audit): compliance stats/list/editable 컨트롤러 추가"
```

---

## Task 6: signature-audit-service — compliance 라우트 등록

**Files:**
- Modify: `services/signature-audit-service/src/routes/signature.routes.ts`

- [ ] **Step 1: compliance 라우트 추가**

> **주의:** `compliance/stats`, `compliance/list`, `editable/:noteId` 라우트는 반드시 `/signatures/:noteId` **앞에** 등록해야 한다. Express는 등록 순서대로 매칭하므로 `:noteId`가 먼저 있으면 `compliance`도 파라미터로 잡아버린다.

`signature.routes.ts` 전체를 다음으로 교체:

```typescript
import { Router } from 'express';
import * as ctrl from '../controllers/signature.controller';
import { requireAuth, requirePermission, requireRole } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

// 컴플라이언스 API — 반드시 :noteId 라우트 앞에 등록
router.get('/signatures/compliance/stats',       requirePermission('note:read'),  ctrl.getComplianceStats);
router.get('/signatures/compliance/list',        requirePermission('note:read'),  ctrl.getComplianceList);
router.get('/signatures/editable/:noteId',       requirePermission('note:read'),  ctrl.getNoteEditable);

// 전자서명
router.post('/signatures/sign/:noteId',          requirePermission('note:sign'),  ctrl.signNote);
router.get('/signatures/verify/:noteId',         requirePermission('note:read'),  ctrl.verifySignature);
router.post('/signatures/revoke/:signatureId',   requireRole('admin'),            ctrl.revokeSignature);
router.get('/signatures/:noteId',                requirePermission('note:read'),  ctrl.listSignatures);

export default router;
```

- [ ] **Step 2: TypeScript 빌드 오류 확인**

```bash
cd services/signature-audit-service
npx tsc --noEmit
```

예상: 오류 없음

- [ ] **Step 3: 커밋**

```bash
git add services/signature-audit-service/src/routes/signature.routes.ts
git commit -m "feat(sig-audit): compliance 라우트 등록 (stats/list/editable)"
```

---

## Task 7: eln-service TypeScript 빌드 확인

- [ ] **Step 1: eln-service 빌드 오류 확인**

```bash
cd services/eln-service
npx tsc --noEmit
```

예상: 오류 없음

- [ ] **Step 2: 전체 변경 최종 커밋**

이미 각 task마다 커밋했으므로, 이상 없으면 완료.

---

## 체크리스트 (완료 기준)

- [ ] `services/eln-service/src/lib/audit.ts` 존재
- [ ] note.controller.ts의 createNote / updateNote / deleteNote / changeNoteStatus / adminUnlockNote 에 callAuditLog 호출 존재
- [ ] `POST /api/audit/internal` 엔드포인트 응답 (x-internal-secret 검증)
- [ ] `services/signature-audit-service/src/lib/eln.ts` 존재
- [ ] `GET /api/signatures/compliance/stats` 응답 (signed/pending/locked/draft/totalSignatures)
- [ ] `GET /api/signatures/compliance/list` 응답 (페이지네이션, 서명 현황 포함)
- [ ] `GET /api/signatures/editable/:noteId` 응답 (editable/reason)
- [ ] TypeScript 빌드 오류 없음 (양쪽 서비스 모두)
