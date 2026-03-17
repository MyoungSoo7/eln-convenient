import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import https from 'https';
import http from 'http';
import prisma from '../lib/prisma';
import { callAuditLog, AuditServiceError } from '../lib/audit';

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://auth-service:8001';
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || '';

/** auth-service에 비밀번호 검증 요청 */
async function verifyAdminPassword(userId: string, password: string): Promise<boolean> {
  return new Promise((resolve) => {
    const body = JSON.stringify({ userId, password });
    const url = new URL(`${AUTH_SERVICE_URL}/api/auth/internal/verify-password`);
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
          ...(INTERNAL_SECRET && { 'x-internal-secret': INTERNAL_SECRET }),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve(json.verified === true);
          } catch {
            resolve(false);
          }
        });
      },
    );
    req.on('error', () => resolve(false));
    req.write(body);
    req.end();
  });
}
import {
  ALLOWED_STATUS_TRANSITIONS,
  type NoteStatus,
  type NoteType,
  type ChangeStatusDto,
  type AdminUnlockDto,
} from '../dtos/note.dto';

// ─────────────────────────────────────────────
// 공통 헬퍼
// ─────────────────────────────────────────────

/** 노트 조회 + 404 처리 */
async function findNote(id: string) {
  return prisma.note.findUnique({ where: { id } });
}

/** 리비전 번호 채번 */
async function nextRevision(noteId: string) {
  const count = await prisma.noteRevision.count({ where: { noteId } });
  return count + 1;
}

// ─────────────────────────────────────────────
// 연구노트 CRUD
// ─────────────────────────────────────────────

/** GET /api/notes  또는  GET /api/protocols */
export async function getNotes(req: Request, res: Response): Promise<void> {
  const { status, tag, search, page = '1', limit = '20', type } = req.query;
  const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

  const where: Record<string, unknown> = {
    type: (type as NoteType) || 'note',
  };
  if (status) where.status = status;
  if (tag)    where.tags = { has: tag as string };
  if (search) {
    where.OR = [
      { title:   { contains: search as string, mode: 'insensitive' } },
      { content: { contains: search as string, mode: 'insensitive' } },
    ];
  }

  try {
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
  } catch (err) {
    console.error('[getNotes]', err);
    res.status(500).json({ ok: false, error: '노트 목록 조회 중 오류가 발생했습니다.' });
  }
}

/** GET /api/notes/:id */
export async function getNoteById(req: Request, res: Response): Promise<void> {
  try {
    const note = await prisma.note.findUnique({
      where: { id: req.params.id },
      include: { attachments: true, links: true },
    });
    if (!note) { res.status(404).json({ ok: false, error: '노트를 찾을 수 없습니다.' }); return; }
    res.json({ ok: true, data: note });
  } catch (err) {
    console.error('[getNoteById]', err);
    res.status(500).json({ ok: false, error: '노트 조회 중 오류가 발생했습니다.' });
  }
}

/** POST /api/notes  또는  POST /api/protocols */
export async function createNote(req: Request, res: Response): Promise<void> {
  const { title, content, sections, templateId, tags, type } = req.body;
  if (!title) {
    res.status(400).json({ ok: false, error: 'title은 필수입니다.' });
    return;
  }
  const authorId = (req.headers['x-user-id'] as string) || 'anonymous';
  const noteType: NoteType = type || 'note';

  try {
    const note = await prisma.note.create({
      data: {
        id: uuidv4(),
        type: noteType,
        title,
        content: content || '',
        sections: sections ?? [],
        status: 'draft',
        authorId,
        templateId: templateId || null,
        tags: tags || [],
      },
    });

    await prisma.noteRevision.create({
      data: {
        id: uuidv4(),
        noteId: note.id,
        revision: 1,
        content: note.content,
        sections: (note.sections as object) ?? [],
        changedBy: authorId,
        changeSummary: noteType === 'protocol' ? '프로토콜 생성' : '노트 생성',
      },
    });

    // (4) 템플릿 노트 생성 횟수 증가 — templateId가 있을 때 useCount +1
    if (templateId) {
      await prisma.template.update({
        where: { id: templateId },
        data: { useCount: { increment: 1 } },
      }).catch((e: Error) => {
        // 템플릿이 삭제되었거나 존재하지 않아도 노트 생성은 성공으로 처리
        console.warn('[createNote] 템플릿 useCount 증가 실패:', e.message);
      });
    }

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
  } catch (err) {
    console.error('[createNote]', err);
    res.status(500).json({ ok: false, error: '노트 생성 중 오류가 발생했습니다.' });
  }
}

/** PUT /api/notes/:id */
export async function updateNote(req: Request, res: Response): Promise<void> {
  const userId = (req.headers['x-user-id'] as string) || 'anonymous';
  const userRole = req.headers['x-user-role'] as string;

  try {
    const existing = await findNote(req.params.id);
    if (!existing) { res.status(404).json({ ok: false, error: '노트를 찾을 수 없습니다.' }); return; }

    if (existing.status === 'locked' || existing.status === 'signed') {
      res.status(403).json({ ok: false, error: '잠긴/서명된 노트는 수정할 수 없습니다.' });
      return;
    }

    // 소유자 또는 admin만 수정 가능
    if (existing.authorId !== userId && userRole !== 'admin') {
      res.status(403).json({ ok: false, error: '노트 수정 권한이 없습니다.' });
      return;
    }

    const { title, content, sections, tags, changeSummary } = req.body;
    const updated = await prisma.note.update({
      where: { id: req.params.id },
      data: {
        ...(title     !== undefined && { title }),
        ...(content   !== undefined && { content }),
        ...(sections  !== undefined && { sections }),
        ...(tags      !== undefined && { tags }),
      },
    });

    const rev = await nextRevision(req.params.id);
    await prisma.noteRevision.create({
      data: {
        id: uuidv4(),
        noteId: req.params.id,
        revision: rev,
        content: updated.content,
        sections: (updated.sections as object) ?? [],
        changedBy: userId,
        changeSummary: changeSummary || '노트 수정',
      },
    });

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
    res.json({ ok: true, data: updated });
  } catch (err) {
    console.error('[updateNote]', err);
    res.status(500).json({ ok: false, error: '노트 수정 중 오류가 발생했습니다.' });
  }
}

/** DELETE /api/notes/:id */
export async function deleteNote(req: Request, res: Response): Promise<void> {
  const userId = (req.headers['x-user-id'] as string) || 'anonymous';
  const userRole = req.headers['x-user-role'] as string;

  try {
    const existing = await findNote(req.params.id);
    if (!existing) { res.status(404).json({ ok: false, error: '노트를 찾을 수 없습니다.' }); return; }

    if (existing.authorId !== userId && userRole !== 'admin') {
      res.status(403).json({ ok: false, error: '노트 삭제 권한이 없습니다.' });
      return;
    }

    if (existing.status === 'signed') {
      res.status(403).json({ ok: false, error: '서명 완료된 노트는 삭제할 수 없습니다.' });
      return;
    }

    await prisma.note.delete({ where: { id: req.params.id } });
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
    res.json({ ok: true, message: '노트가 삭제되었습니다.', id: req.params.id });
  } catch (err) {
    console.error('[deleteNote]', err);
    res.status(500).json({ ok: false, error: '노트 삭제 중 오류가 발생했습니다.' });
  }
}

// ─────────────────────────────────────────────
// 상태 관리
// ─────────────────────────────────────────────

/** PATCH /api/notes/:id/status */
export async function changeNoteStatus(req: Request, res: Response): Promise<void> {
  try {
    const note = await findNote(req.params.id);
    if (!note) { res.status(404).json({ ok: false, error: '노트를 찾을 수 없습니다.' }); return; }

    const { status: newStatus } = req.body as ChangeStatusDto;
    const allowed = ALLOWED_STATUS_TRANSITIONS[note.status as NoteStatus] ?? [];

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
    res.json({ ok: true, data: updated, message: `상태가 "${newStatus}"(으)로 변경되었습니다.` });
  } catch (err) {
    console.error('[changeNoteStatus]', err);
    res.status(500).json({ ok: false, error: '상태 변경 중 오류가 발생했습니다.' });
  }
}

/** POST /api/notes/:id/admin-unlock */
export async function adminUnlockNote(req: Request, res: Response): Promise<void> {
  const userRole = req.headers['x-user-role'] as string;
  if (userRole !== 'admin') {
    res.status(403).json({ ok: false, error: '관리자 권한이 필요합니다.' });
    return;
  }

  try {
    const note = await findNote(req.params.id);
    if (!note) { res.status(404).json({ ok: false, error: '노트를 찾을 수 없습니다.' }); return; }
    if (note.status !== 'locked') {
      res.status(400).json({ ok: false, error: '잠긴 상태의 노트만 잠금 해제할 수 있습니다.' });
      return;
    }

    const { adminPassword, reason } = req.body as AdminUnlockDto;
    if (!adminPassword?.trim()) {
      res.status(400).json({ ok: false, error: '관리자 비밀번호를 입력해주세요.' });
      return;
    }

    const adminId = req.headers['x-user-id'] as string;
    const verified = await verifyAdminPassword(adminId, adminPassword);
    if (!verified) {
      res.status(403).json({ ok: false, error: '관리자 비밀번호가 올바르지 않습니다.' });
      return;
    }

    const updated = await prisma.note.update({
      where: { id: req.params.id },
      data: { status: 'draft' },
    });

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
  } catch (err) {
    console.error('[adminUnlockNote]', err);
    res.status(500).json({ ok: false, error: '잠금 해제 중 오류가 발생했습니다.' });
  }
}

// ─────────────────────────────────────────────
// 리비전 (버전 관리)
// ─────────────────────────────────────────────

/** GET /api/notes/:id/revisions */
export async function getRevisions(req: Request, res: Response): Promise<void> {
  try {
    const revisions = await prisma.noteRevision.findMany({
      where: { noteId: req.params.id },
      orderBy: { revision: 'asc' },
    });
    res.json({ ok: true, data: revisions });
  } catch (err) {
    console.error('[getRevisions]', err);
    res.status(500).json({ ok: false, error: '리비전 목록 조회 중 오류가 발생했습니다.' });
  }
}

/** GET /api/notes/:id/revisions/:rev */
export async function getRevisionById(req: Request, res: Response): Promise<void> {
  try {
    const revision = await prisma.noteRevision.findFirst({
      where: { noteId: req.params.id, revision: parseInt(req.params.rev) },
    });
    if (!revision) { res.status(404).json({ ok: false, error: '리비전을 찾을 수 없습니다.' }); return; }
    res.json({ ok: true, data: revision });
  } catch (err) {
    console.error('[getRevisionById]', err);
    res.status(500).json({ ok: false, error: '리비전 조회 중 오류가 발생했습니다.' });
  }
}

// ─────────────────────────────────────────────
// 첨부파일
// ─────────────────────────────────────────────

/** GET /api/notes/:id/attachments */
export async function getAttachments(req: Request, res: Response): Promise<void> {
  try {
    const note = await findNote(req.params.id);
    if (!note) { res.status(404).json({ ok: false, error: '노트를 찾을 수 없습니다.' }); return; }
    const attachments = await prisma.attachment.findMany({
      where: { noteId: req.params.id },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ ok: true, data: attachments });
  } catch (err) {
    console.error('[getAttachments]', err);
    res.status(500).json({ ok: false, error: '첨부파일 목록 조회 중 오류가 발생했습니다.' });
  }
}

/** POST /api/notes/:id/attachments */
export async function addAttachment(req: Request, res: Response): Promise<void> {
  try {
    const note = await findNote(req.params.id);
    if (!note) { res.status(404).json({ ok: false, error: '노트를 찾을 수 없습니다.' }); return; }

    const attachment = await prisma.attachment.create({
      data: {
        id: uuidv4(),
        noteId: req.params.id,
        fileId: req.body.fileId || uuidv4(),
        fileName: req.body.fileName || 'unknown',
        mimeType: req.body.mimeType || null,
        sizeBytes: req.body.sizeBytes || null,
        uploadedBy: (req.headers['x-user-id'] as string) || 'anonymous',
      },
    });
    res.status(201).json({ ok: true, data: attachment });
  } catch (err) {
    console.error('[addAttachment]', err);
    res.status(500).json({ ok: false, error: '첨부파일 등록 중 오류가 발생했습니다.' });
  }
}

/** DELETE /api/notes/:id/attachments/:attachmentId */
export async function deleteAttachment(req: Request, res: Response): Promise<void> {
  try {
    await prisma.attachment.delete({ where: { id: req.params.attachmentId } });
    res.json({ ok: true, message: '첨부파일이 삭제되었습니다.' });
  } catch (err: any) {
    if (err?.code === 'P2025') {
      res.status(404).json({ ok: false, error: '첨부파일을 찾을 수 없습니다.' });
      return;
    }
    console.error('[deleteAttachment]', err);
    res.status(500).json({ ok: false, error: '첨부파일 삭제 중 오류가 발생했습니다.' });
  }
}

// ─────────────────────────────────────────────
// 링크 (교차 참조)
// ─────────────────────────────────────────────

/** GET /api/notes/:id/links */
export async function getNoteLinks(req: Request, res: Response): Promise<void> {
  try {
    const links = await prisma.noteLink.findMany({ where: { noteId: req.params.id } });
    res.json({ ok: true, data: links });
  } catch (err) {
    console.error('[getNoteLinks]', err);
    res.status(500).json({ ok: false, error: '링크 목록 조회 중 오류가 발생했습니다.' });
  }
}

/** POST /api/notes/:id/links */
export async function createNoteLink(req: Request, res: Response): Promise<void> {
  const { targetType, targetId, label } = req.body;
  if (!targetType || !targetId) {
    res.status(400).json({ ok: false, error: 'targetType과 targetId는 필수입니다.' });
    return;
  }
  try {
    const link = await prisma.noteLink.create({
      data: {
        id: uuidv4(),
        noteId: req.params.id,
        targetType,
        targetId,
        label: label || null,
      },
    });
    res.status(201).json({ ok: true, data: link });
  } catch (err) {
    console.error('[createNoteLink]', err);
    res.status(500).json({ ok: false, error: '링크 생성 중 오류가 발생했습니다.' });
  }
}

/** DELETE /api/notes/:id/links/:linkId */
export async function deleteNoteLink(req: Request, res: Response): Promise<void> {
  try {
    await prisma.noteLink.delete({ where: { id: req.params.linkId } });
    res.json({ ok: true, message: '링크가 삭제되었습니다.' });
  } catch (err: any) {
    if (err?.code === 'P2025') {
      res.status(404).json({ ok: false, error: '링크를 찾을 수 없습니다.' });
      return;
    }
    console.error('[deleteNoteLink]', err);
    res.status(500).json({ ok: false, error: '링크 삭제 중 오류가 발생했습니다.' });
  }
}

// ─────────────────────────────────────────────
// 태그 (전체 태그 목록)
// ─────────────────────────────────────────────

/** GET /api/tags?type=note|protocol */
export async function getTags(req: Request, res: Response): Promise<void> {
  const type = (req.query.type as NoteType) || 'note';
  try {
    const notes = await prisma.note.findMany({
      where: { type },
      select: { tags: true },
    });
    const tagSet = new Set<string>();
    notes.forEach((n) => n.tags.forEach((t) => tagSet.add(t)));
    res.json({ ok: true, data: Array.from(tagSet).sort() });
  } catch (err) {
    console.error('[getTags]', err);
    res.status(500).json({ ok: false, error: '태그 목록 조회 중 오류가 발생했습니다.' });
  }
}

// ─────────────────────────────────────────────
// 템플릿 (note.routes.ts에서 /api/templates 이하 라우트용)
// ─────────────────────────────────────────────

export async function getTemplates(_req: Request, res: Response): Promise<void> {
  try {
    const templates = await prisma.template.findMany({ orderBy: { createdAt: 'asc' } });
    res.json({ ok: true, data: templates, total: templates.length });
  } catch (err) {
    console.error('[getTemplates]', err);
    res.status(500).json({ ok: false, error: '템플릿 목록 조회 중 오류가 발생했습니다.' });
  }
}

export async function getTemplateById(req: Request, res: Response): Promise<void> {
  try {
    const tmpl = await prisma.template.findUnique({ where: { id: req.params.id } });
    if (!tmpl) { res.status(404).json({ ok: false, error: '템플릿을 찾을 수 없습니다.' }); return; }
    res.json({ ok: true, data: tmpl });
  } catch (err) {
    console.error('[getTemplateById]', err);
    res.status(500).json({ ok: false, error: '템플릿 조회 중 오류가 발생했습니다.' });
  }
}

export async function createTemplate(req: Request, res: Response): Promise<void> {
  if (!req.body.title) {
    res.status(400).json({ ok: false, error: 'title은 필수입니다.' });
    return;
  }
  try {
    const tmpl = await prisma.template.create({
      data: {
        id: uuidv4(),
        title: req.body.title,
        description: req.body.description || '',
        content: req.body.content || '',
        category: req.body.category || '일반',
        sections: req.body.sections ?? [],
        tags: req.body.tags || [],
        createdBy: (req.headers['x-user-id'] as string) || 'anonymous',
        isPublic: req.body.isPublic ?? false,
      },
    });
    res.status(201).json({ ok: true, data: tmpl });
  } catch (err) {
    console.error('[createTemplate]', err);
    res.status(500).json({ ok: false, error: '템플릿 생성 중 오류가 발생했습니다.' });
  }
}
