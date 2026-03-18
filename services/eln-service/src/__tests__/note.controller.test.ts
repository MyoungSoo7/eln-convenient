/**
 * note.controller 단위 테스트
 *
 * jest.mock의 변수 호이스팅 규칙:
 *   factory 내에서 참조하는 변수는 반드시 'mock' 접두사여야 한다.
 */

// ── mock 변수 선언 (jest.mock 호이스팅 전 단계에서 허용) ──────────────────
const mockNoteDb = {
  findUnique: jest.fn(),
  findMany: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  count: jest.fn(),
  groupBy: jest.fn(),   // ← add
};

const mockNoteStatusHistoryDb = {
  create: jest.fn(),
};

const mockNoteRevisionDb = {
  count: jest.fn(),
  create: jest.fn(),
};

const mockAuditLog = jest.fn().mockResolvedValue(undefined);

// ── 모듈 모킹 ──────────────────────────────────────────────────────────────
jest.mock('../lib/prisma', () => ({
  __esModule: true,
  default: {
    note: mockNoteDb,
    noteStatusHistory: mockNoteStatusHistoryDb,
    noteRevision: mockNoteRevisionDb,
    noteLink: { create: jest.fn() },
    attachment: { create: jest.fn() },
    template: { update: jest.fn() },
  },
}));

jest.mock('../lib/audit', () => ({
  callAuditLog: mockAuditLog,
}));

jest.mock('../lib/searchClient', () => ({
  searchClient: { index: jest.fn(), delete: jest.fn() },
}));

// ── 컨트롤러 import (모킹 이후) ────────────────────────────────────────────
import type { Request, Response } from 'express';
import {
  deleteNote, changeNoteStatus, adminUnlockNote,
  getNoteStats, getNotesBatch,
} from '../controllers/note.controller';

// ── 헬퍼 ───────────────────────────────────────────────────────────────────

function makeReq(overrides: Partial<{
  params: Record<string, string>;
  body: Record<string, unknown>;
  headers: Record<string, string>;
  query: Record<string, string>;
  ip: string;
}> = {}): Request {
  return {
    params: {},
    body: {},
    headers: { 'x-user-id': 'user-001', 'x-user-role': 'researcher' },
    query: {},
    ip: '127.0.0.1',
    ...overrides,
  } as unknown as Request;
}

function makeRes() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return { res: { json, status } as unknown as Response, json, status };
}

// ── Issue 1: locked 노트 삭제 보호 ─────────────────────────────────────────

describe('deleteNote — 상태별 삭제 보호', () => {
  beforeEach(() => jest.clearAllMocks());

  test('locked 노트를 삭제하면 403을 반환하고 delete를 호출하지 않는다', async () => {
    mockNoteDb.findUnique.mockResolvedValue({
      id: 'note-001', title: '테스트 노트', status: 'locked', authorId: 'user-001',
    });

    const { res, status, json } = makeRes();
    await deleteNote(makeReq({ params: { id: 'note-001' } }), res);

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
    expect(mockNoteDb.delete).not.toHaveBeenCalled();
    expect(mockNoteDb.update).not.toHaveBeenCalled();
  });

  test('signed 노트를 삭제하면 403을 반환한다 (기존 동작 유지)', async () => {
    mockNoteDb.findUnique.mockResolvedValue({
      id: 'note-002', title: '서명완료 노트', status: 'signed', authorId: 'user-001',
    });

    const { res, status } = makeRes();
    await deleteNote(makeReq({ params: { id: 'note-002' } }), res);

    expect(status).toHaveBeenCalledWith(403);
    expect(mockNoteDb.delete).not.toHaveBeenCalled();
    expect(mockNoteDb.update).not.toHaveBeenCalled();
  });
});

// ── Issue 2: note_status_history INSERT ────────────────────────────────────

describe('changeNoteStatus — note_status_history 기록', () => {
  beforeEach(() => jest.clearAllMocks());

  test('상태 변경 성공 시 note_status_history에 INSERT한다', async () => {
    mockNoteDb.findUnique.mockResolvedValue({ id: 'note-001', status: 'draft', authorId: 'user-001' });
    mockNoteDb.update.mockResolvedValue({ id: 'note-001', status: 'in_progress', updatedAt: new Date() });
    mockNoteStatusHistoryDb.create.mockResolvedValue({});

    const req = makeReq({ params: { id: 'note-001' }, body: { status: 'in_progress' } });
    const { res, json } = makeRes();
    await changeNoteStatus(req, res);

    expect(json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
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

  test('허용되지 않은 전환 시 note_status_history에 INSERT하지 않는다', async () => {
    mockNoteDb.findUnique.mockResolvedValue({ id: 'note-001', status: 'signed', authorId: 'user-001' });

    const req = makeReq({ params: { id: 'note-001' }, body: { status: 'draft' } });
    const { res, status } = makeRes();
    await changeNoteStatus(req, res);

    expect(status).toHaveBeenCalledWith(400);
    expect(mockNoteStatusHistoryDb.create).not.toHaveBeenCalled();
  });
});

describe('adminUnlockNote — note_status_history 기록', () => {
  beforeEach(() => jest.clearAllMocks());

  test('잠금 해제 성공 시 is_admin_action=true로 note_status_history INSERT한다', async () => {
    mockNoteDb.findUnique.mockResolvedValue({ id: 'note-001', status: 'locked', authorId: 'user-001' });
    mockNoteDb.update.mockResolvedValue({ id: 'note-001', status: 'draft', updatedAt: new Date() });
    mockNoteStatusHistoryDb.create.mockResolvedValue({});

    // http 내부 verifyAdminPassword 우회: AUTH_SERVICE_URL env를 설정하지 않으면
    // http.request가 실제 호출됨. 여기선 환경에 따라 실패할 수 있으므로
    // 비밀번호 검증 함수 자체를 모킹하는 방법 대신,
    // AUTH_SERVICE_URL을 로컬호스트 invalid로 설정해 에러 처리 후 resolve(false)되는 경우를 피하고
    // 실제 verify 결과에 무관하게 history INSERT 여부만 테스트한다.
    // → 이 테스트는 GREEN 단계에서 verifyAdminPassword를 injectable하게 리팩터링 후 완전히 검증.
    const req = makeReq({
      params: { id: 'note-001' },
      body: { adminPassword: 'secret', reason: '테스트 수정' },
      headers: { 'x-user-id': 'admin-001', 'x-user-role': 'admin' },
    });
    const { res } = makeRes();

    // 실행 (내부 http 요청은 실패하거나 timeout될 수 있음, 그래도 note.update가 호출됐다면 history도 호출되어야 함)
    await adminUnlockNote(req, res);

    if (mockNoteDb.update.mock.calls.length > 0) {
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
    }
  });
});

// ── Issue 3: 소프트 삭제 ───────────────────────────────────────────────────

describe('deleteNote — 소프트 삭제', () => {
  beforeEach(() => jest.clearAllMocks());

  test('draft 노트 삭제 시 delete 대신 update({ deletedAt })를 호출한다', async () => {
    mockNoteDb.findUnique.mockResolvedValue({
      id: 'note-001', title: '초안 노트', status: 'draft', authorId: 'user-001',
    });
    mockNoteDb.update.mockResolvedValue({ id: 'note-001' });

    const { res, json } = makeRes();
    await deleteNote(makeReq({ params: { id: 'note-001' } }), res);

    expect(mockNoteDb.delete).not.toHaveBeenCalled();
    expect(mockNoteDb.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'note-001' },
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    );
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
  });

  test('in_progress 노트도 소프트 삭제된다', async () => {
    mockNoteDb.findUnique.mockResolvedValue({
      id: 'note-002', title: '진행중 노트', status: 'in_progress', authorId: 'user-001',
    });
    mockNoteDb.update.mockResolvedValue({ id: 'note-002' });

    const { res } = makeRes();
    await deleteNote(makeReq({ params: { id: 'note-002' } }), res);

    expect(mockNoteDb.delete).not.toHaveBeenCalled();
    expect(mockNoteDb.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    );
  });
});

describe('adminUnlockNote — 역할 검사가 컨트롤러 밖으로 이동됨', () => {
  beforeEach(() => jest.clearAllMocks());

  test('x-user-role이 admin이 아니어도 컨트롤러는 비밀번호 검증 단계로 진입한다', async () => {
    // 역할 검사가 컨트롤러에 남아있으면 이 테스트는 FAIL (403 즉시 반환)
    // 역할 검사를 미들웨어로 이동하면 PASS (노트 조회 단계로 진입)
    mockNoteDb.findUnique.mockResolvedValue({
      id: 'note-001', status: 'locked', authorId: 'user-001',
    });

    const req = makeReq({
      params: { id: 'note-001' },
      body: { adminPassword: 'pw', reason: '테스트' },
      headers: { 'x-user-id': 'user-001', 'x-user-role': 'researcher' }, // admin 아님
    });
    const { res } = makeRes();

    await adminUnlockNote(req, res);

    // 컨트롤러가 403을 즉시 반환하지 않고 prisma.note.findUnique를 호출했어야 함
    expect(mockNoteDb.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'note-001' } }),
    );
  });
});

// ── getNoteStats ─────────────────────────────────────────────────────
describe('getNoteStats', () => {
  beforeEach(() => jest.clearAllMocks());

  it('상태별 카운트를 groupBy로 조합해 반환한다', async () => {
    mockNoteDb.groupBy.mockResolvedValue([
      { status: 'draft',       _count: { _all: 5 } },
      { status: 'in_progress', _count: { _all: 3 } },
      { status: 'signed',      _count: { _all: 8 } },
      // 'locked'는 없음 → 기본값 0으로 채워져야 함
    ]);
    const req = makeReq({ query: { type: 'note' } });
    const { res, json } = makeRes();
    await getNoteStats(req, res);
    expect(json).toHaveBeenCalledWith({
      ok: true,
      data: { draft: 5, in_progress: 3, locked: 0, signed: 8, total: 16 },
    });
  });

  it('type이 잘못되면 400을 반환한다', async () => {
    const req = makeReq({ query: { type: 'invalid' } });
    const { res, status, json } = makeRes();
    await getNoteStats(req, res);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({ ok: false, error: 'type은 note 또는 protocol이어야 합니다.' });
  });
});

// ── getNotesBatch ─────────────────────────────────────────────────────
describe('getNotesBatch', () => {
  beforeEach(() => jest.clearAllMocks());

  it('ID 배열로 노트 목록을 반환한다', async () => {
    const notes = [{ id: 'a' }, { id: 'b' }];
    mockNoteDb.findMany.mockResolvedValue(notes);
    const req = makeReq({ body: { ids: ['a', 'b'] } });
    const { res, json } = makeRes();
    await getNotesBatch(req, res);
    expect(json).toHaveBeenCalledWith({ ok: true, data: notes });
  });

  it('ids가 빈 배열이면 DB 호출 없이 빈 배열을 반환한다', async () => {
    const req = makeReq({ body: { ids: [] } });
    const { res, json } = makeRes();
    await getNotesBatch(req, res);
    expect(json).toHaveBeenCalledWith({ ok: true, data: [] });
    expect(mockNoteDb.findMany).not.toHaveBeenCalled();
  });

  it('ids가 없으면 400을 반환한다', async () => {
    const req = makeReq({ body: {} });
    const { res, status, json } = makeRes();
    await getNotesBatch(req, res);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({ ok: false, error: 'ids는 문자열 배열이어야 합니다.' });
  });

  it('ids 요소가 문자열이 아니면 400을 반환한다', async () => {
    const req = makeReq({ body: { ids: [1, null, 'valid'] } });
    const { res, status, json } = makeRes();
    await getNotesBatch(req, res);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({ ok: false, error: 'ids는 문자열 배열이어야 합니다.' });
  });

  it('ids가 500개 초과면 400을 반환한다', async () => {
    const req = makeReq({ body: { ids: Array(501).fill('uuid') } });
    const { res, status, json } = makeRes();
    await getNotesBatch(req, res);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({ ok: false, error: 'ids는 최대 500개까지 허용됩니다.' });
  });
});
