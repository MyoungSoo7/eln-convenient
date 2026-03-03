import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ALLOWED_STATUS_TRANSITIONS, type NoteStatus, type ChangeStatusDto, type AdminUnlockDto } from '../dtos/note.dto';

// ─── 인터페이스 (DB 모델 대응) ───
interface INote {
  id: string;
  title: string;
  content: string;
  status: NoteStatus;
  authorId: string;
  templateId?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

interface INoteRevision {
  id: string;
  noteId: string;
  revision: number;
  content: string;
  changedBy: string;
  changeSummary: string;
  createdAt: string;
}

interface INoteLink {
  id: string;
  noteId: string;
  targetType: string;
  targetId: string;
  createdAt: string;
}

interface IAttachment {
  id: string;
  noteId: string;
  [key: string]: unknown;
  createdAt: string;
}

interface ITemplate {
  id: string;
  title: string;
  description: string;
  content: string;
  category: string;
  tags: string[];
  createdBy: string;
  isPublic: boolean;
  createdAt: string;
}

// ─── 더미 데이터 ───
const DUMMY_NOTES: INote[] = [
  {
    id: 'note-001', title: 'PCR 최적화 실험',
    content: '# 목적\nPCR 조건 최적화\n\n# 재료\n- Taq Polymerase\n- dNTP Mix\n\n# 방법\n1. 마스터 믹스 준비\n2. 온도 구배 설정\n\n# 결과\n최적 어닐링 온도: 58°C',
    status: 'draft', authorId: 'dev-user-001', templateId: 'tmpl-001',
    tags: ['PCR', '분자생물학'],
    createdAt: '2024-01-15T09:00:00Z', updatedAt: '2024-01-15T14:30:00Z',
  },
  {
    id: 'note-002', title: '세포 배양 기록 #42',
    content: '# 세포주\nHeLa cells\n\n# 계대 정보\nPassage 15 → 16',
    status: 'signed', authorId: 'dev-user-001',
    tags: ['세포배양', 'HeLa'],
    createdAt: '2024-01-10T10:00:00Z', updatedAt: '2024-01-10T16:00:00Z',
  },
];

const DUMMY_TEMPLATES: ITemplate[] = [
  { id: 'tmpl-001', title: '일반 실험 노트', description: '목적/재료/방법/결과/고찰 구조', content: '# 목적\n\n# 재료\n\n# 방법\n\n# 결과\n\n# 고찰', category: '일반', tags: [], createdBy: 'dev-user-001', isPublic: true, createdAt: '2024-01-01T00:00:00Z' },
  { id: 'tmpl-002', title: 'PCR 프로토콜', description: 'PCR 실험 전용 템플릿', content: '# 목적\n\n# 프라이머 정보\n\n# 반응 조건\n| 단계 | 온도 | 시간 |\n|------|------|------|\n| 초기변성 | 95°C | 5분 |\n\n# 결과\n\n# 고찰', category: 'PCR', tags: ['PCR'], createdBy: 'dev-user-001', isPublic: true, createdAt: '2024-01-01T00:00:00Z' },
];

// ─── 노트 CRUD ───

export function getNotes(req: Request, res: Response): void {
  let notes = [...DUMMY_NOTES];
  const { status, tag } = req.query;
  if (status) notes = notes.filter((n) => n.status === status);
  if (tag) notes = notes.filter((n) => n.tags.includes(tag as string));
  res.json({ ok: true, data: notes, total: notes.length });
}

export function getNoteById(req: Request, res: Response): void {
  const note = DUMMY_NOTES.find((n) => n.id === req.params.id);
  if (!note) { res.status(404).json({ ok: false, error: '노트를 찾을 수 없습니다.' }); return; }
  res.json({ ok: true, data: note });
}

export function createNote(req: Request, res: Response): void {
  const note: INote = {
    id: uuidv4(), title: req.body.title, content: req.body.content || '',
    status: 'draft',
    authorId: req.headers['x-user-id'] as string || 'dev-user-001',
    templateId: req.body.templateId,
    tags: req.body.tags || [],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  res.status(201).json({ ok: true, data: note });
}

export function updateNote(req: Request, res: Response): void {
  const note = DUMMY_NOTES.find((n) => n.id === req.params.id);
  if (!note) { res.status(404).json({ ok: false, error: '노트를 찾을 수 없습니다.' }); return; }
  if (note.status === 'locked') {
    res.status(403).json({ ok: false, error: '잠긴 노트는 수정할 수 없습니다.' });
    return;
  }
  res.json({ ok: true, data: { ...note, ...req.body, updatedAt: new Date().toISOString() } });
}

export function deleteNote(req: Request, res: Response): void {
  res.json({ ok: true, data: { message: '노트가 삭제되었습니다.', id: req.params.id } });
}

// ─── 상태 변경 ───

/** PATCH /api/notes/:id/status — 노트 상태 전환 */
export function changeNoteStatus(req: Request, res: Response): void {
  const note = DUMMY_NOTES.find((n) => n.id === req.params.id);
  if (!note) { res.status(404).json({ ok: false, error: '노트를 찾을 수 없습니다.' }); return; }

  const { status: newStatus } = req.body as ChangeStatusDto;
  const allowed = ALLOWED_STATUS_TRANSITIONS[note.status] || [];

  if (!allowed.includes(newStatus)) {
    res.status(400).json({
      ok: false,
      error: `상태 전환 불가: "${note.status}" → "${newStatus}". 허용: [${allowed.join(', ')}]`,
    });
    return;
  }

  // TODO: DB 업데이트 + 감사로그 기록
  res.json({
    ok: true,
    data: { ...note, status: newStatus, updatedAt: new Date().toISOString() },
    message: `상태가 "${newStatus}"(으)로 변경되었습니다.`,
  });
}

/** POST /api/notes/:id/admin-unlock — 관리자 잠금 해제 */
export function adminUnlockNote(req: Request, res: Response): void {
  const note = DUMMY_NOTES.find((n) => n.id === req.params.id);
  if (!note) { res.status(404).json({ ok: false, error: '노트를 찾을 수 없습니다.' }); return; }

  if (note.status !== 'locked') {
    res.status(400).json({ ok: false, error: '잠긴 상태의 노트만 잠금 해제할 수 있습니다.' });
    return;
  }

  const { adminPassword, reason } = req.body as AdminUnlockDto;
  const userRole = req.headers['x-user-role'] as string;

  // 관리자 권한 확인
  if (userRole !== 'admin') {
    res.status(403).json({ ok: false, error: '관리자 권한이 필요합니다.' });
    return;
  }

  // TODO: 실제 비밀번호 검증 로직
  if (!adminPassword || adminPassword.trim() === '') {
    res.status(400).json({ ok: false, error: '관리자 비밀번호를 입력해주세요.' });
    return;
  }

  // TODO: DB 업데이트 + 감사로그 기록 (관리자 잠금 해제 이벤트)
  res.json({
    ok: true,
    data: { ...note, status: 'draft' as NoteStatus, updatedAt: new Date().toISOString() },
    auditLog: {
      action: 'admin_unlock',
      noteId: req.params.id,
      adminId: req.headers['x-user-id'],
      reason: reason || '관리자 잠금 해제',
      timestamp: new Date().toISOString(),
    },
    message: '관리자 권한으로 노트 잠금이 해제되었습니다. 감사로그에 기록되었습니다.',
  });
}

// ─── 리비전 ───

export function getRevisions(req: Request, res: Response): void {
  const revisions: INoteRevision[] = [
    { id: 'rev-001', noteId: req.params.id, revision: 1, content: '초기 작성', changedBy: 'dev-user-001', changeSummary: '노트 생성', createdAt: '2024-01-15T09:00:00Z' },
    { id: 'rev-002', noteId: req.params.id, revision: 2, content: '결과 추가', changedBy: 'dev-user-001', changeSummary: '결과 섹션 업데이트', createdAt: '2024-01-15T14:30:00Z' },
  ];
  res.json({ ok: true, data: revisions });
}

export function getRevisionById(req: Request, res: Response): void {
  res.json({
    ok: true,
    data: {
      id: `rev-${req.params.rev}`, noteId: req.params.id,
      revision: parseInt(req.params.rev), content: '리비전 내용 (더미)',
      changedBy: 'dev-user-001', changeSummary: '변경 요약',
      createdAt: new Date().toISOString(),
    },
  });
}

// ─── 첨부파일 ───

export function addAttachment(req: Request, res: Response): void {
  const attachment: IAttachment = { id: uuidv4(), noteId: req.params.id, ...req.body, createdAt: new Date().toISOString() };
  res.status(201).json({ ok: true, data: attachment });
}

// ─── 링크 ───

export function getNoteLinks(req: Request, res: Response): void {
  const links: INoteLink[] = [
    { id: 'link-001', noteId: req.params.id, targetType: 'inventory_item', targetId: 'item-001', createdAt: new Date().toISOString() },
  ];
  res.json({ ok: true, data: links });
}

export function createNoteLink(req: Request, res: Response): void {
  const link: INoteLink = { id: uuidv4(), noteId: req.params.id, ...req.body, createdAt: new Date().toISOString() };
  res.status(201).json({ ok: true, data: link });
}

// ─── 템플릿 ───

export function getTemplates(_req: Request, res: Response): void {
  res.json({ ok: true, data: DUMMY_TEMPLATES, total: DUMMY_TEMPLATES.length });
}

export function getTemplateById(req: Request, res: Response): void {
  const tmpl = DUMMY_TEMPLATES.find((t) => t.id === req.params.id);
  if (!tmpl) { res.status(404).json({ ok: false, error: '템플릿을 찾을 수 없습니다.' }); return; }
  res.json({ ok: true, data: tmpl });
}

export function createTemplate(req: Request, res: Response): void {
  const tmpl: ITemplate = {
    id: uuidv4(), ...req.body,
    createdBy: req.headers['x-user-id'] as string || 'dev-user-001',
    isPublic: req.body.isPublic ?? false, createdAt: new Date().toISOString(),
  };
  res.status(201).json({ ok: true, data: tmpl });
}
