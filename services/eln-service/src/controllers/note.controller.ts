import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { INote, INoteRevision, ITemplate, INoteLink, IAttachment } from '../interfaces/note.interface';

// ─── 더미 데이터 ───
const DUMMY_NOTES: INote[] = [
  {
    id: 'note-001', title: 'PCR 최적화 실험', content: '# 목적\nPCR 조건 최적화\n\n# 재료\n- Taq Polymerase\n- dNTP Mix\n\n# 방법\n1. 마스터 믹스 준비\n2. 온도 구배 설정\n\n# 결과\n최적 어닐링 온도: 58°C',
    status: 'draft', authorId: 'dev-user-001', templateId: 'tmpl-001', tags: ['PCR', '분자생물학'], createdAt: '2024-01-15T09:00:00Z', updatedAt: '2024-01-15T14:30:00Z',
  },
  {
    id: 'note-002', title: '세포 배양 기록 #42', content: '# 세포주\nHeLa cells\n\n# 계대 정보\nPassage 15 → 16',
    status: 'signed', authorId: 'dev-user-001', tags: ['세포배양', 'HeLa'], createdAt: '2024-01-10T10:00:00Z', updatedAt: '2024-01-10T16:00:00Z',
  },
];

const DUMMY_TEMPLATES: ITemplate[] = [
  { id: 'tmpl-001', title: '일반 실험 노트', description: '목적/재료/방법/결과/고찰 구조', content: '# 목적\n\n# 재료\n\n# 방법\n\n# 결과\n\n# 고찰', category: '일반', tags: [], createdBy: 'dev-user-001', isPublic: true, createdAt: '2024-01-01T00:00:00Z' },
  { id: 'tmpl-002', title: 'PCR 프로토콜', description: 'PCR 실험 전용 템플릿', content: '# 목적\n\n# 프라이머 정보\n\n# 반응 조건\n| 단계 | 온도 | 시간 |\n|------|------|------|\n| 초기변성 | 95°C | 5분 |\n\n# 결과\n\n# 고찰', category: 'PCR', tags: ['PCR'], createdBy: 'dev-user-001', isPublic: true, createdAt: '2024-01-01T00:00:00Z' },
];

// ─── 노트 CRUD ───

export function getNotes(req: Request, res: Response): void {
  // TODO: DB 조회 + 필터(status, tag, author)
  res.json({ data: DUMMY_NOTES, total: DUMMY_NOTES.length });
}

export function getNoteById(req: Request, res: Response): void {
  const note = DUMMY_NOTES.find((n) => n.id === req.params.id);
  if (!note) { res.status(404).json({ error: '노트를 찾을 수 없습니다.' }); return; }
  res.json(note);
}

export function createNote(req: Request, res: Response): void {
  const note: INote = {
    id: uuidv4(), title: req.body.title, content: req.body.content || '', status: 'draft',
    authorId: req.headers['x-user-id'] as string || 'dev-user-001', templateId: req.body.templateId,
    tags: req.body.tags || [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  res.status(201).json(note);
}

export function updateNote(req: Request, res: Response): void {
  const note = DUMMY_NOTES.find((n) => n.id === req.params.id);
  if (!note) { res.status(404).json({ error: '노트를 찾을 수 없습니다.' }); return; }
  res.json({ ...note, ...req.body, updatedAt: new Date().toISOString() });
}

export function deleteNote(req: Request, res: Response): void {
  // TODO: soft delete
  res.json({ message: '노트가 삭제되었습니다.', id: req.params.id });
}

// ─── 리비전 ───

export function getRevisions(req: Request, res: Response): void {
  const revisions: INoteRevision[] = [
    { id: 'rev-001', noteId: req.params.id, revision: 1, content: '초기 작성', changedBy: 'dev-user-001', changeSummary: '노트 생성', createdAt: '2024-01-15T09:00:00Z' },
    { id: 'rev-002', noteId: req.params.id, revision: 2, content: '결과 추가', changedBy: 'dev-user-001', changeSummary: '결과 섹션 업데이트', createdAt: '2024-01-15T14:30:00Z' },
  ];
  res.json(revisions);
}

export function getRevisionById(req: Request, res: Response): void {
  res.json({ id: `rev-${req.params.rev}`, noteId: req.params.id, revision: parseInt(req.params.rev), content: '리비전 내용 (더미)', changedBy: 'dev-user-001', changeSummary: '변경 요약', createdAt: new Date().toISOString() });
}

// ─── 첨부파일 ───

export function addAttachment(req: Request, res: Response): void {
  const attachment: IAttachment = { id: uuidv4(), noteId: req.params.id, ...req.body, createdAt: new Date().toISOString() };
  res.status(201).json(attachment);
}

// ─── 링크 ───

export function getNoteLinks(req: Request, res: Response): void {
  const links: INoteLink[] = [
    { id: 'link-001', noteId: req.params.id, targetType: 'inventory_item', targetId: 'item-001', createdAt: new Date().toISOString() },
  ];
  res.json(links);
}

export function createNoteLink(req: Request, res: Response): void {
  const link: INoteLink = { id: uuidv4(), noteId: req.params.id, ...req.body, createdAt: new Date().toISOString() };
  res.status(201).json(link);
}

// ─── 템플릿 ───

export function getTemplates(_req: Request, res: Response): void {
  res.json({ data: DUMMY_TEMPLATES, total: DUMMY_TEMPLATES.length });
}

export function getTemplateById(req: Request, res: Response): void {
  const tmpl = DUMMY_TEMPLATES.find((t) => t.id === req.params.id);
  if (!tmpl) { res.status(404).json({ error: '템플릿을 찾을 수 없습니다.' }); return; }
  res.json(tmpl);
}

export function createTemplate(req: Request, res: Response): void {
  const tmpl: ITemplate = {
    id: uuidv4(), ...req.body, createdBy: req.headers['x-user-id'] as string || 'dev-user-001',
    isPublic: req.body.isPublic ?? false, createdAt: new Date().toISOString(),
  };
  res.status(201).json(tmpl);
}
