/**
 * note.controller 단위 테스트
 *
 * 이 파일은 원래 express 기준으로 작성돼 있었다. 컨트롤러가 fastify 로 이관되면서
 * 세 가지가 동시에 바뀌었고, 테스트는 한 번도 실행된 적이 없어 드러나지 않았다.
 *
 *   1. 시그니처: (req: Request, res: Response) → (request: FastifyRequest, reply: FastifyReply)
 *   2. 오류 반환: res.status(n).json(...) → AppError 를 throw (fastify 에러 핸들러가 변환)
 *      성공 반환: res.json(x) → 값을 return (fastify 가 직렬화)
 *   3. org 스코핑: note.findUnique({ id }) → note.findFirst({ id, orgId })
 *      + 요청에 x-user-org-id 헤더 필수 (없으면 getOrgId 가 403)
 *
 * 입력 검증(ids 개수·type 열거)은 컨트롤러에서 라우트의 validate() preHandler 로
 * 옮겨갔다. 그래서 그 부분은 컨트롤러가 아니라 zod 스키마에 대고 검증한다 —
 * 로직이 있는 곳에서 재야 의미가 있다.
 *
 * jest.mock의 변수 호이스팅 규칙:
 *   factory 내에서 참조하는 변수는 반드시 'mock' 접두사여야 한다.
 */

// ── mock 변수 선언 (jest.mock 호이스팅 전 단계에서 허용) ──────────────────
const mockNoteDb = {
  findFirst: jest.fn(),
  findUnique: jest.fn(),
  findMany: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  count: jest.fn(),
  groupBy: jest.fn(),
};

const mockNoteStatusHistoryDb = {
  create: jest.fn(),
};

const mockNoteRevisionDb = {
  count: jest.fn(),
  create: jest.fn(),
};

const mockAuditLog = jest.fn().mockResolvedValue(undefined);
const mockNotification = jest.fn().mockResolvedValue(undefined);

const mockAttachmentDb = { create: jest.fn() };
const mockQueryRaw = jest.fn();
const mockExecuteRaw = jest.fn();
const mockTransaction = jest.fn();

/** verifyAdminPassword 가 내부적으로 때리는 auth-service 응답을 조작한다 */
let mockVerifiedResponse = '{"verified":true}';
const mockHttpRequest = jest.fn((_opts: unknown, cb?: (res: unknown) => void) => {
  const listeners: Record<string, Function[]> = {};
  const res = {
    on(ev: string, fn: Function) { (listeners[ev] ||= []).push(fn); return res; },
  };
  // cb 를 동기로 부르면 res.on 등록 전에 emit 되므로 다음 틱에 흘린다.
  process.nextTick(() => {
    cb?.(res);
    listeners['data']?.forEach((fn) => fn(mockVerifiedResponse));
    listeners['end']?.forEach((fn) => fn());
  });
  return { on: jest.fn(), write: jest.fn(), end: jest.fn() };
});

// ── 모듈 모킹 ──────────────────────────────────────────────────────────────
jest.mock('../lib/prisma', () => ({
  __esModule: true,
  default: {
    note: mockNoteDb,
    noteStatusHistory: mockNoteStatusHistoryDb,
    noteRevision: mockNoteRevisionDb,
    noteLink: { create: jest.fn() },
    attachment: mockAttachmentDb,
    template: { update: jest.fn() },
    $queryRaw: mockQueryRaw,
    $executeRaw: mockExecuteRaw,
    $transaction: mockTransaction,
  },
}));

jest.mock('../lib/audit', () => ({
  callAuditLog: mockAuditLog,
}));

jest.mock('../lib/notification', () => ({
  callNotification: mockNotification,
}));

jest.mock('../lib/searchClient', () => ({
  searchClient: { index: jest.fn(), delete: jest.fn() },
}));

jest.mock('http', () => ({
  __esModule: true,
  default: { request: mockHttpRequest },
  request: mockHttpRequest,
}));

// ── 컨트롤러 import (모킹 이후) ────────────────────────────────────────────
import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  deleteNote, changeNoteStatus, adminUnlockNote,
  getNoteStats, getNotesBatch,
  getAttachments, addAttachment, getTags,
} from '../controllers/note.controller';
import { NoteStatsQuerySchema, NotesBatchBodySchema } from '../dtos/note.dto';

// ── 헬퍼 ───────────────────────────────────────────────────────────────────

const ORG = 'org-001';

function makeReq(overrides: Partial<{
  params: Record<string, string>;
  body: Record<string, unknown>;
  headers: Record<string, string>;
  query: Record<string, string>;
  ip: string;
}> = {}): FastifyRequest {
  const { headers, ...rest } = overrides;
  return {
    params: {},
    body: {},
    query: {},
    ip: '127.0.0.1',
    ...rest,
    headers: {
      'x-user-id': 'user-001',
      'x-user-role': 'researcher',
      'x-user-org-id': ORG,
      ...headers,
    },
  } as unknown as FastifyRequest;
}

/** fastify 의 reply 는 code() 가 자기 자신을 돌려주는 체이너블 객체다 */
function makeReply() {
  const code = jest.fn(function (this: unknown) { return reply; });
  const send = jest.fn(function (this: unknown) { return reply; });
  const reply = { code, send } as unknown as FastifyReply;
  return { reply, code, send };
}

/** AppError 를 throw 하는 컨트롤러의 상태코드를 검사한다 */
async function expectStatus(promise: Promise<unknown>, statusCode: number) {
  await expect(promise).rejects.toMatchObject({ statusCode });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockVerifiedResponse = '{"verified":true}';
  // 트랜잭션은 같은 목 객체를 tx 로 넘겨 라우트가 tx.note.* 를 써도 잡히게 한다.
  mockTransaction.mockImplementation(async (fn: Function) => fn({
    $executeRaw: mockExecuteRaw,
    note: mockNoteDb,
    noteStatusHistory: mockNoteStatusHistoryDb,
  }));
});

// ── Issue 1: locked 노트 삭제 보호 ─────────────────────────────────────────

describe('deleteNote — 상태별 삭제 보호', () => {
  test('locked 노트를 삭제하면 403이고 delete를 호출하지 않는다', async () => {
    mockNoteDb.findFirst.mockResolvedValue({
      id: 'note-001', title: '테스트 노트', status: 'locked', authorId: 'user-001',
    });

    const { reply } = makeReply();
    await expectStatus(deleteNote(makeReq({ params: { id: 'note-001' } }), reply), 403);

    expect(mockNoteDb.delete).not.toHaveBeenCalled();
    expect(mockNoteDb.update).not.toHaveBeenCalled();
  });

  test('signed 노트를 삭제하면 403이다 (기존 동작 유지)', async () => {
    mockNoteDb.findFirst.mockResolvedValue({
      id: 'note-002', title: '서명완료 노트', status: 'signed', authorId: 'user-001',
    });

    const { reply } = makeReply();
    await expectStatus(deleteNote(makeReq({ params: { id: 'note-002' } }), reply), 403);

    expect(mockNoteDb.delete).not.toHaveBeenCalled();
    expect(mockNoteDb.update).not.toHaveBeenCalled();
  });

  test('다른 조직의 노트는 조회되지 않아 404다', async () => {
    mockNoteDb.findFirst.mockResolvedValue(null);

    const { reply } = makeReply();
    await expectStatus(deleteNote(makeReq({ params: { id: 'note-001' } }), reply), 404);

    expect(mockNoteDb.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'note-001', orgId: ORG } }),
    );
  });

  test('org 헤더가 없으면 DB 조회 전에 403으로 막는다', async () => {
    const req = makeReq({ params: { id: 'note-001' } });
    (req.headers as Record<string, unknown>)['x-user-org-id'] = undefined;

    const { reply } = makeReply();
    await expectStatus(deleteNote(req, reply), 403);

    expect(mockNoteDb.findFirst).not.toHaveBeenCalled();
  });
});

// ── Issue 2: note_status_history INSERT ────────────────────────────────────

describe('changeNoteStatus — note_status_history 기록', () => {
  test('상태 변경 성공 시 note_status_history에 INSERT한다', async () => {
    mockNoteDb.findFirst.mockResolvedValue({ id: 'note-001', status: 'draft', authorId: 'user-001' });
    mockNoteDb.update.mockResolvedValue({ id: 'note-001', status: 'in_progress', updatedAt: new Date() });
    mockNoteStatusHistoryDb.create.mockResolvedValue({});

    const req = makeReq({ params: { id: 'note-001' }, body: { status: 'in_progress' } });
    const { reply } = makeReply();

    await expect(changeNoteStatus(req, reply)).resolves.toMatchObject({ ok: true });

    expect(mockNoteStatusHistoryDb.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fromStatus: 'draft',
          toStatus: 'in_progress',
          changedBy: 'user-001',
          isAdminAction: false,
        }),
      }),
    );
  });

  test('허용되지 않은 전환 시 400이고 note_status_history에 INSERT하지 않는다', async () => {
    mockNoteDb.findFirst.mockResolvedValue({ id: 'note-001', status: 'signed', authorId: 'user-001' });

    const req = makeReq({ params: { id: 'note-001' }, body: { status: 'draft' } });
    const { reply } = makeReply();

    await expectStatus(changeNoteStatus(req, reply), 400);
    expect(mockNoteStatusHistoryDb.create).not.toHaveBeenCalled();
  });

  test('잠금 전환은 reviewer/admin이 아니면 403이고 트랜잭션에 진입하지 않는다', async () => {
    const req = makeReq({ params: { id: 'note-001' }, body: { status: 'locked' } });
    const { reply } = makeReply();

    await expectStatus(changeNoteStatus(req, reply), 403);
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});

describe('adminUnlockNote — note_status_history 기록', () => {
  test('잠금 해제 성공 시 is_admin_action=true로 note_status_history INSERT한다', async () => {
    mockNoteDb.findFirst.mockResolvedValue({ id: 'note-001', status: 'locked', authorId: 'user-001' });
    mockNoteDb.update.mockResolvedValue({ id: 'note-001', status: 'draft', updatedAt: new Date() });
    mockNoteStatusHistoryDb.create.mockResolvedValue({});

    const req = makeReq({
      params: { id: 'note-001' },
      body: { adminPassword: 'secret', reason: '테스트 수정' },
      headers: { 'x-user-id': 'admin-001', 'x-user-role': 'admin' },
    });
    const { reply } = makeReply();

    await expect(adminUnlockNote(req, reply)).resolves.toMatchObject({ ok: true });

    expect(mockNoteStatusHistoryDb.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fromStatus: 'locked',
          toStatus: 'draft',
          isAdminAction: true,
          changedBy: 'admin-001',
        }),
      }),
    );
  });

  test('관리자 비밀번호가 틀리면 400이고 상태를 바꾸지 않는다', async () => {
    mockNoteDb.findFirst.mockResolvedValue({ id: 'note-001', status: 'locked', authorId: 'user-001' });
    mockVerifiedResponse = '{"verified":false}';

    const req = makeReq({
      params: { id: 'note-001' },
      body: { adminPassword: 'wrong', reason: '테스트' },
      headers: { 'x-user-id': 'admin-001', 'x-user-role': 'admin' },
    });
    const { reply } = makeReply();

    await expectStatus(adminUnlockNote(req, reply), 400);
    expect(mockNoteDb.update).not.toHaveBeenCalled();
    expect(mockNoteStatusHistoryDb.create).not.toHaveBeenCalled();
  });

  test('잠기지 않은 노트는 400이다', async () => {
    mockNoteDb.findFirst.mockResolvedValue({ id: 'note-001', status: 'draft', authorId: 'user-001' });

    const req = makeReq({
      params: { id: 'note-001' },
      body: { adminPassword: 'secret' },
      headers: { 'x-user-id': 'admin-001', 'x-user-role': 'admin' },
    });
    const { reply } = makeReply();

    await expectStatus(adminUnlockNote(req, reply), 400);
    expect(mockNoteDb.update).not.toHaveBeenCalled();
  });
});

// ── Issue 3: 소프트 삭제 ───────────────────────────────────────────────────

describe('deleteNote — 소프트 삭제', () => {
  test('draft 노트 삭제 시 delete 대신 update({ deletedAt })를 호출한다', async () => {
    mockNoteDb.findFirst.mockResolvedValue({
      id: 'note-001', title: '초안 노트', status: 'draft', authorId: 'user-001',
    });
    mockNoteDb.update.mockResolvedValue({ id: 'note-001' });

    const { reply } = makeReply();
    await expect(deleteNote(makeReq({ params: { id: 'note-001' } }), reply))
      .resolves.toMatchObject({ ok: true });

    expect(mockNoteDb.delete).not.toHaveBeenCalled();
    expect(mockNoteDb.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'note-001' },
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    );
  });

  test('in_progress 노트도 소프트 삭제된다', async () => {
    mockNoteDb.findFirst.mockResolvedValue({
      id: 'note-002', title: '진행중 노트', status: 'in_progress', authorId: 'user-001',
    });
    mockNoteDb.update.mockResolvedValue({ id: 'note-002' });

    const { reply } = makeReply();
    await deleteNote(makeReq({ params: { id: 'note-002' } }), reply);

    expect(mockNoteDb.delete).not.toHaveBeenCalled();
    expect(mockNoteDb.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    );
  });
});

describe('adminUnlockNote — 역할 검사가 컨트롤러 밖으로 이동됨', () => {
  test('x-user-role이 admin이 아니어도 컨트롤러는 노트 조회 단계로 진입한다', async () => {
    // 역할 검사가 컨트롤러에 남아있으면 이 테스트는 FAIL (조회 전에 403)
    // 라우트의 requireRole(ADMIN) preHandler 로 이동했으면 PASS
    mockNoteDb.findFirst.mockResolvedValue({
      id: 'note-001', status: 'locked', authorId: 'user-001',
    });
    mockNoteDb.update.mockResolvedValue({ id: 'note-001', status: 'draft' });
    mockNoteStatusHistoryDb.create.mockResolvedValue({});

    const req = makeReq({
      params: { id: 'note-001' },
      body: { adminPassword: 'pw', reason: '테스트' },
      headers: { 'x-user-id': 'user-001', 'x-user-role': 'researcher' }, // admin 아님
    });
    const { reply } = makeReply();

    await adminUnlockNote(req, reply);

    expect(mockNoteDb.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'note-001', orgId: ORG } }),
    );
  });
});

// ── getNoteStats ─────────────────────────────────────────────────────
describe('getNoteStats', () => {
  test('상태별 카운트를 groupBy로 조합해 반환한다', async () => {
    mockNoteDb.groupBy.mockResolvedValue([
      { status: 'draft',       _count: { _all: 5 } },
      { status: 'in_progress', _count: { _all: 3 } },
      { status: 'signed',      _count: { _all: 8 } },
      // 'locked'는 없음 → 기본값 0으로 채워져야 함
    ]);
    const req = makeReq({ query: { type: 'note' } });
    const { reply } = makeReply();

    await expect(getNoteStats(req, reply)).resolves.toEqual({
      ok: true,
      data: { draft: 5, in_progress: 3, locked: 0, signed: 8, total: 16 },
    });
  });

  test('집계는 요청자의 org로 스코핑된다', async () => {
    mockNoteDb.groupBy.mockResolvedValue([]);
    await getNoteStats(makeReq({ query: { type: 'note' } }), makeReply().reply);

    expect(mockNoteDb.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ orgId: ORG }) }),
    );
  });
});

// ── getNotesBatch ─────────────────────────────────────────────────────
describe('getNotesBatch', () => {
  test('ID 배열로 노트 목록을 반환한다', async () => {
    const notes = [{ id: 'a' }, { id: 'b' }];
    mockNoteDb.findMany.mockResolvedValue(notes);
    const req = makeReq({ body: { ids: ['a', 'b'] } });
    const { reply } = makeReply();

    await expect(getNotesBatch(req, reply)).resolves.toEqual({ ok: true, data: notes });
  });

  test('조회는 요청자의 org와 미삭제 노트로 제한된다', async () => {
    mockNoteDb.findMany.mockResolvedValue([]);
    await getNotesBatch(makeReq({ body: { ids: ['a'] } }), makeReply().reply);

    expect(mockNoteDb.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['a'] }, deletedAt: null, orgId: ORG },
    });
  });
});

/**
 * ids 개수·타입 검증은 컨트롤러에서 라우트의 validate({ body: NotesBatchBodySchema })
 * 로 이동했다. 예전 테스트는 컨트롤러에 대고 이걸 검사했는데, 이제 컨트롤러까지
 * 오면 이미 통과한 입력이라 그 자리에선 검증할 수 없다. 로직이 있는 스키마에 댄다.
 *
 * 메시지 문자열은 검사하지 않는다. rd-team 머지로 서비스단 Zod 한글 메시지가
 * 전부 걷혔고(에러 문구는 프론트 errorCodeMap 이 i18n 으로 붙인다), 여기서 한글을
 * 기대하면 번역을 고칠 때마다 테스트가 깨진다. 계약은 문구가 아니라 제약조건이므로
 * zod issue 의 code 와 path 를 본다.
 */
describe('입력 검증 스키마 (컨트롤러에서 라우트로 이동한 계약)', () => {
  test('ids가 빈 배열이면 거부한다', () => {
    const r = NotesBatchBodySchema.safeParse({ ids: [] });
    expect(r.success).toBe(false);
    expect(r.error!.issues).toEqual([
      expect.objectContaining({ code: 'too_small', minimum: 1, path: ['ids'] }),
    ]);
  });

  test('ids 요소가 문자열이 아니면 거부한다', () => {
    expect(NotesBatchBodySchema.safeParse({ ids: [1, null, 'valid'] }).success).toBe(false);
  });

  test('ids가 500개 초과면 거부한다', () => {
    const r = NotesBatchBodySchema.safeParse({ ids: Array(501).fill('uuid') });
    expect(r.success).toBe(false);
    expect(r.error!.issues).toEqual([
      expect.objectContaining({ code: 'too_big', maximum: 500, path: ['ids'] }),
    ]);
  });

  test('ids가 정확히 500개면 통과한다 (경계값)', () => {
    expect(NotesBatchBodySchema.safeParse({ ids: Array(500).fill('uuid') }).success).toBe(true);
  });

  test('stats의 type이 열거값이 아니면 거부한다', () => {
    expect(NoteStatsQuerySchema.safeParse({ type: 'invalid' }).success).toBe(false);
  });

  test('stats의 type을 생략하면 note로 기본값이 채워진다', () => {
    expect(NoteStatsQuerySchema.parse({})).toEqual({ type: 'note' });
  });
});

// ── getAttachments ─────────────────────────────────────────────────
describe('getAttachments', () => {
  test('노트가 없으면 404다', async () => {
    mockNoteDb.findFirst.mockResolvedValue(null);
    const { reply } = makeReply();
    await expectStatus(getAttachments(makeReq({ params: { id: 'note-1' } }), reply), 404);
  });

  test('include로 첨부파일을 단일 쿼리로 반환한다', async () => {
    const attachments = [{ id: 'att-1', fileName: 'a.pdf' }];
    mockNoteDb.findFirst.mockResolvedValue({ id: 'note-1', attachments });
    const { reply } = makeReply();

    await expect(getAttachments(makeReq({ params: { id: 'note-1' } }), reply))
      .resolves.toEqual({ ok: true, data: attachments });

    expect(mockNoteDb.findFirst).toHaveBeenCalledTimes(1);
    expect(mockNoteDb.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ include: expect.objectContaining({ attachments: expect.anything() }) }),
    );
  });
});

// ── addAttachment ──────────────────────────────────────────────────
describe('addAttachment', () => {
  test('첨부파일을 201로 생성한다', async () => {
    const created = { id: 'att-1', noteId: 'note-1', fileName: 'a.pdf' };
    mockNoteDb.findFirst.mockResolvedValue({ id: 'note-1' });
    mockAttachmentDb.create.mockResolvedValue(created);

    const req = makeReq({
      params: { id: 'note-1' },
      body: { fileId: 'f1', fileName: 'a.pdf' },
      headers: { 'x-user-id': 'u1' },
    });
    const { reply, code } = makeReply();

    await expect(addAttachment(req, reply)).resolves.toEqual({ ok: true, data: created });
    expect(code).toHaveBeenCalledWith(201);
  });

  test('org 스코프 밖의 노트면 create를 시도하지 않고 404다', async () => {
    // 예전에는 FK 위반(P2003)을 받아 404로 바꿨다. org 스코핑이 들어오면서
    // 선조회가 생겼다 — 다른 조직 노트에 첨부를 붙이는 것 자체를 막아야 하는데
    // FK는 조직을 구분하지 못하기 때문이다.
    mockNoteDb.findFirst.mockResolvedValue(null);

    const req = makeReq({
      params: { id: 'ghost-note' },
      body: { fileId: 'f1', fileName: 'a.pdf' },
      headers: { 'x-user-id': 'u1' },
    });
    const { reply } = makeReply();

    await expectStatus(addAttachment(req, reply), 404);
    expect(mockAttachmentDb.create).not.toHaveBeenCalled();
  });

  test('noteId FK 위반(P2003)이면 404를 반환한다', async () => {
    mockNoteDb.findFirst.mockResolvedValue({ id: 'note-1' });
    mockAttachmentDb.create.mockRejectedValue(Object.assign(new Error('FK violation'), { code: 'P2003' }));

    const req = makeReq({
      params: { id: 'note-1' },
      body: { fileId: 'f1', fileName: 'a.pdf' },
      headers: { 'x-user-id': 'u1' },
    });
    const { reply } = makeReply();

    await expectStatus(addAttachment(req, reply), 404);
  });
});

// ── getTags ───────────────────────────────────────────────────────
describe('getTags', () => {
  test('$queryRaw UNNEST로 중복 없는 태그 목록을 반환한다', async () => {
    mockQueryRaw.mockResolvedValue([{ tag: 'alpha' }, { tag: 'beta' }]);
    const { reply } = makeReply();

    await expect(getTags(makeReq({ query: { type: 'note' } }), reply))
      .resolves.toEqual({ ok: true, data: ['alpha', 'beta'] });

    expect(mockNoteDb.findMany).not.toHaveBeenCalled();
    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
  });

  test('DB에서 온 순서 그대로 반환한다 (ORDER BY는 SQL에서 처리됨)', async () => {
    mockQueryRaw.mockResolvedValue([{ tag: 'zeta' }, { tag: 'alpha' }]);
    const { reply } = makeReply();

    await expect(getTags(makeReq({ query: { type: 'note' } }), reply))
      .resolves.toEqual({ ok: true, data: ['zeta', 'alpha'] });
  });

  test('type과 orgId를 $queryRaw 바인딩 파라미터로 전달한다', async () => {
    mockQueryRaw.mockResolvedValue([]);
    await getTags(makeReq({ query: { type: 'template' } }), makeReply().reply);

    // tagged template literal: [0]=문자열 조각 배열, 이후가 보간값
    const callArgs = mockQueryRaw.mock.calls[0];
    expect(callArgs[1]).toBe('template');
    expect(callArgs[2]).toBe(ORG);
  });
});
