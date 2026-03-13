import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma';
import { ALLOWED_STATUS_TRANSITIONS, type NoteStatus, type ChangeStatusDto, type AdminUnlockDto } from '../dtos/note.dto';

// ─── 노트 CRUD ───

export async function getNotes(req: Request, res: Response): Promise<void> {
  const { status, tag, page = '1', limit = '20' } = req.query;
  const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (tag) where.tags = { has: tag as string };

  const [notes, total] = await Promise.all([
    prisma.note.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip,
      take: parseInt(limit as string),
    }),
    prisma.note.count({ where }),
  ]);

  res.json({ ok: true, data: notes, total, page: parseInt(page as string) });
}

export async function getNoteById(req: Request, res: Response): Promise<void> {
  const note = await prisma.note.findUnique({
    where: { id: req.params.id },
    include: { attachments: true, links: true },
  });
  if (!note) { res.status(404).json({ ok: false, error: '노트를 찾을 수 없습니다.' }); return; }
  res.json({ ok: true, data: note });
}

export async function createNote(req: Request, res: Response): Promise<void> {
  const authorId = req.headers['x-user-id'] as string || 'anonymous';
  const note = await prisma.note.create({
    data: {
      id: uuidv4(),
      title: req.body.title,
      content: req.body.content || '',
      status: 'draft',
      authorId,
      templateId: req.body.templateId || null,
      tags: req.body.tags || [],
    },
  });
  // 최초 리비전 생성
  await prisma.noteRevision.create({
    data: {
      id: uuidv4(),
      noteId: note.id,
      revision: 1,
      content: note.content,
      changedBy: authorId,
      changeSummary: '노트 생성',
    },
  });
  res.status(201).json({ ok: true, data: note });
}

export async function updateNote(req: Request, res: Response): Promise<void> {
  const existing = await prisma.note.findUnique({ where: { id: req.params.id } });
  if (!existing) { res.status(404).json({ ok: false, error: '노트를 찾을 수 없습니다.' }); return; }
  if (existing.status === 'locked' || existing.status === 'signed') {
    res.status(403).json({ ok: false, error: '잠긴 노트는 수정할 수 없습니다.' });
    return;
  }

  const userId = req.headers['x-user-id'] as string || 'anonymous';
  const updated = await prisma.note.update({
    where: { id: req.params.id },
    data: {
      ...(req.body.title && { title: req.body.title }),
      ...(req.body.content !== undefined && { content: req.body.content }),
      ...(req.body.tags && { tags: req.body.tags }),
    },
  });

  // 리비전 저장
  const lastRev = await prisma.noteRevision.count({ where: { noteId: req.params.id } });
  await prisma.noteRevision.create({
    data: {
      id: uuidv4(),
      noteId: req.params.id,
      revision: lastRev + 1,
      content: updated.content,
      changedBy: userId,
      changeSummary: req.body.changeSummary || '노트 수정',
    },
  });

  res.json({ ok: true, data: updated });
}

export async function deleteNote(req: Request, res: Response): Promise<void> {
  await prisma.note.delete({ where: { id: req.params.id } });
  res.json({ ok: true, data: { message: '노트가 삭제되었습니다.', id: req.params.id } });
}

// ─── 상태 변경 ───

export async function changeNoteStatus(req: Request, res: Response): Promise<void> {
  const note = await prisma.note.findUnique({ where: { id: req.params.id } });
  if (!note) { res.status(404).json({ ok: false, error: '노트를 찾을 수 없습니다.' }); return; }

  const { status: newStatus } = req.body as ChangeStatusDto;
  const allowed = ALLOWED_STATUS_TRANSITIONS[note.status as NoteStatus] || [];

  if (!allowed.includes(newStatus)) {
    res.status(400).json({
      ok: false,
      error: `상태 전환 불가: "${note.status}" → "${newStatus}". 허용: [${allowed.join(', ')}]`,
    });
    return;
  }

  const updated = await prisma.note.update({
    where: { id: req.params.id },
    data: { status: newStatus },
  });

  res.json({
    ok: true,
    data: updated,
    message: `상태가 "${newStatus}"(으)로 변경되었습니다.`,
  });
}

export async function adminUnlockNote(req: Request, res: Response): Promise<void> {
  const note = await prisma.note.findUnique({ where: { id: req.params.id } });
  if (!note) { res.status(404).json({ ok: false, error: '노트를 찾을 수 없습니다.' }); return; }
  if (note.status !== 'locked') {
    res.status(400).json({ ok: false, error: '잠긴 상태의 노트만 잠금 해제할 수 있습니다.' });
    return;
  }

  const userRole = req.headers['x-user-role'] as string;
  if (userRole !== 'admin') {
    res.status(403).json({ ok: false, error: '관리자 권한이 필요합니다.' });
    return;
  }

  const { adminPassword, reason } = req.body as AdminUnlockDto;
  if (!adminPassword || adminPassword.trim() === '') {
    res.status(400).json({ ok: false, error: '관리자 비밀번호를 입력해주세요.' });
    return;
  }

  const updated = await prisma.note.update({
    where: { id: req.params.id },
    data: { status: 'draft' },
  });

  res.json({
    ok: true,
    data: updated,
    auditLog: {
      action: 'admin_unlock',
      noteId: req.params.id,
      adminId: req.headers['x-user-id'],
      reason: reason || '관리자 잠금 해제',
      timestamp: new Date().toISOString(),
    },
    message: '관리자 권한으로 노트 잠금이 해제되었습니다.',
  });
}

// ─── 리비전 ───

export async function getRevisions(req: Request, res: Response): Promise<void> {
  const revisions = await prisma.noteRevision.findMany({
    where: { noteId: req.params.id },
    orderBy: { revision: 'asc' },
  });
  res.json({ ok: true, data: revisions });
}

export async function getRevisionById(req: Request, res: Response): Promise<void> {
  const revision = await prisma.noteRevision.findFirst({
    where: { noteId: req.params.id, revision: parseInt(req.params.rev) },
  });
  if (!revision) { res.status(404).json({ ok: false, error: '리비전을 찾을 수 없습니다.' }); return; }
  res.json({ ok: true, data: revision });
}

// ─── 첨부파일 ───

export async function addAttachment(req: Request, res: Response): Promise<void> {
  const attachment = await prisma.attachment.create({
    data: {
      id: uuidv4(),
      noteId: req.params.id,
      fileId: req.body.fileId || uuidv4(),
      fileName: req.body.fileName || 'unknown',
      mimeType: req.body.mimeType || null,
      sizeBytes: req.body.sizeBytes || null,
      uploadedBy: req.headers['x-user-id'] as string || 'anonymous',
    },
  });
  res.status(201).json({ ok: true, data: attachment });
}

// ─── 링크 ───

export async function getNoteLinks(req: Request, res: Response): Promise<void> {
  const links = await prisma.noteLink.findMany({ where: { noteId: req.params.id } });
  res.json({ ok: true, data: links });
}

export async function createNoteLink(req: Request, res: Response): Promise<void> {
  const link = await prisma.noteLink.create({
    data: {
      id: uuidv4(),
      noteId: req.params.id,
      targetType: req.body.targetType,
      targetId: req.body.targetId,
      label: req.body.label || null,
    },
  });
  res.status(201).json({ ok: true, data: link });
}

// ─── 템플릿 ───

export async function getTemplates(_req: Request, res: Response): Promise<void> {
  const templates = await prisma.template.findMany({ orderBy: { createdAt: 'asc' } });
  res.json({ ok: true, data: templates, total: templates.length });
}

export async function getTemplateById(req: Request, res: Response): Promise<void> {
  const tmpl = await prisma.template.findUnique({ where: { id: req.params.id } });
  if (!tmpl) { res.status(404).json({ ok: false, error: '템플릿을 찾을 수 없습니다.' }); return; }
  res.json({ ok: true, data: tmpl });
}

export async function createTemplate(req: Request, res: Response): Promise<void> {
  const tmpl = await prisma.template.create({
    data: {
      id: uuidv4(),
      title: req.body.title,
      description: req.body.description || '',
      content: req.body.content || '',
      category: req.body.category || '일반',
      sections: req.body.sections || [],
      tags: req.body.tags || [],
      createdBy: req.headers['x-user-id'] as string || 'anonymous',
      isPublic: req.body.isPublic ?? false,
    },
  });
  res.status(201).json({ ok: true, data: tmpl });
}
