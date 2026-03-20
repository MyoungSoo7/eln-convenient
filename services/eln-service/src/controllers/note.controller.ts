import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import https from 'https';
import http from 'http';
import prisma from '../lib/prisma';
import { callAuditLog } from '../lib/audit';
import { callNotification } from '../lib/notification';
import { searchClient } from '../lib/searchClient';
import { AppError, asyncHandler, ErrorCode, createLogger, getOrgId } from '@lab/shared';

const logger = createLogger('eln-service');

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
          'Content-Type': 'application/json; charset=utf-8',
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
  ALLOWED_STATUS_TRANSITIONS, SYSTEM_STATUS_TRANSITIONS,
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

/** GET /api/notes  또는  GET /api/protocols (템플릿) */
export const getNotes = asyncHandler(async (req: Request, res: Response) => {
  const { status, tag, search, page = '1', limit = '20', type, templateId } = req.query;
  const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
  const orgId = getOrgId(req);

  const where: Record<string, unknown> = {
    type: (type as NoteType) || 'note',
    orgId,
  };
  if (status) where.status = status;
  if (tag)        where.tags = { has: tag as string };
  if (templateId) where.templateId = templateId as string;
  if (search) {
    where.OR = [
      { title:   { contains: search as string, mode: 'insensitive' } },
      { content: { contains: search as string, mode: 'insensitive' } },
    ];
  }

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
});

/** GET /api/notes/:id */
export const getNoteById = asyncHandler(async (req: Request, res: Response) => {
  const note = await prisma.note.findFirst({
    where: { id: req.params.id, orgId: getOrgId(req) },
    include: { attachments: true, links: true },
  });
  if (!note) throw new AppError(404, '노트를 찾을 수 없습니다.', ErrorCode.NOTE_NOT_FOUND);
  res.json({ ok: true, data: note });
});

/** POST /api/notes  또는  POST /api/protocols (템플릿) */
export const createNote = asyncHandler(async (req: Request, res: Response) => {
  const { title, content, sections, templateId, tags, type } = req.body;
  const authorId = (req.headers['x-user-id'] as string) || 'anonymous';
  const noteType: NoteType = type || 'note';

  const note = await prisma.note.create({
    data: {
      id: uuidv4(),
      type: noteType,
      title,
      content: content || '',
      sections: sections ?? [],
      status: 'draft',
      authorId,
      orgId: getOrgId(req),
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
      changeSummary: noteType === 'template' ? '템플릿 생성' : '노트 생성',
    },
  });

  // (4) 템플릿 노트 생성 횟수 증가 — templateId가 있을 때 useCount +1
  if (templateId) {
    await prisma.template.update({
      where: { id: templateId },
      data: { useCount: { increment: 1 } },
    }).catch((e: Error) => {
      // 템플릿이 삭제되었거나 존재하지 않아도 노트 생성은 성공으로 처리
      logger.warn({ err: e.message }, '[createNote] 템플릿 useCount 증가 실패');
    });
  }

  searchClient.index({
    id: note.id,
    doc: {
      domainType: note.type === 'template' ? 'TEMPLATE' : 'NOTE',
      title: note.title,
      content: note.content,
      tags: note.tags,
      ownerId: note.authorId,
      orgId: note.orgId,
      visibility: 'private',
      docStatus: 'active',
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
    },
  });

  // audit 기록 (실패 시 경고 로그만 — 노트 생성은 성공으로 처리)
  await callAuditLog({
    entityType: 'note',
    entityId: note.id,
    action: 'note.created',
    actorId: authorId,
    details: { type: noteType, title: note.title, templateId: templateId || null },
    ipAddress: req.ip,
  }).catch((auditErr: unknown) => {
    logger.warn({ noteId: note.id, err: auditErr instanceof Error ? auditErr.message : auditErr }, '[AUDIT_WARN] note.created audit 기록 실패 (노트 생성은 완료)');
  });
  res.status(201).json({ ok: true, data: note });
});

/** PUT /api/notes/:id */
export const updateNote = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req.headers['x-user-id'] as string) || 'anonymous';
  const userRole = req.headers['x-user-role'] as string;

  const existing = await prisma.note.findFirst({ where: { id: req.params.id, orgId: getOrgId(req) } });
  if (!existing) throw new AppError(404, '노트를 찾을 수 없습니다.', ErrorCode.NOTE_NOT_FOUND);

  if (existing.status === 'locked') {
    throw new AppError(403, '잠긴 노트는 수정할 수 없습니다.', ErrorCode.NOTE_LOCKED);
  }
  if (existing.status === 'signed') {
    throw new AppError(403, '서명된 노트는 수정할 수 없습니다.', ErrorCode.NOTE_SIGNED);
  }

  // 소유자 또는 admin만 수정 가능
  if (existing.authorId !== userId && userRole !== 'admin') {
    throw new AppError(403, '노트 수정 권한이 없습니다.', ErrorCode.NOTE_PERMISSION_DENIED);
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

  await callAuditLog({
    entityType: 'note',
    entityId: req.params.id,
    action: 'note.updated',
    actorId: userId,
    details: { changedFields: Object.keys(req.body).filter(k => ['title','content','sections','tags'].includes(k)) },
    ipAddress: req.ip,
  }).catch((auditErr: unknown) => {
    logger.warn({ noteId: req.params.id, err: auditErr instanceof Error ? auditErr.message : auditErr }, '[AUDIT_WARN] note.updated audit 기록 실패 (수정은 완료)');
  });
  searchClient.index({
    id: updated.id,
    doc: {
      domainType: updated.type === 'template' ? 'TEMPLATE' : 'NOTE',
      title: updated.title,
      content: updated.content,
      tags: updated.tags,
      ownerId: updated.authorId,
      orgId: updated.orgId,
      visibility: 'private',
      docStatus: 'active',
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
  res.json({ ok: true, data: updated });
});

/** DELETE /api/notes/:id */
export const deleteNote = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req.headers['x-user-id'] as string) || 'anonymous';
  const userRole = req.headers['x-user-role'] as string;

  const existing = await prisma.note.findFirst({ where: { id: req.params.id, orgId: getOrgId(req) } });
  if (!existing) throw new AppError(404, '노트를 찾을 수 없습니다.', ErrorCode.NOTE_NOT_FOUND);

  if (existing.authorId !== userId && userRole !== 'admin') {
    throw new AppError(403, '노트 삭제 권한이 없습니다.', ErrorCode.NOTE_PERMISSION_DENIED);
  }

  if (existing.status === 'signed') {
    throw new AppError(403, '서명 완료된 노트는 삭제할 수 없습니다.', ErrorCode.NOTE_SIGNED);
  }

  if (existing.status === 'locked') {
    throw new AppError(403, '잠긴 노트는 삭제할 수 없습니다. 관리자가 먼저 잠금을 해제해야 합니다.', ErrorCode.NOTE_DELETE_LOCKED);
  }

  await prisma.note.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
  searchClient.delete(req.params.id);
  await callAuditLog({
    entityType: 'note',
    entityId: req.params.id,
    action: 'note.deleted',
    actorId: userId,
    details: { title: existing.title },
    ipAddress: req.ip,
  }).catch((auditErr: unknown) => {
    logger.warn({ noteId: req.params.id, err: auditErr instanceof Error ? auditErr.message : auditErr }, '[AUDIT_WARN] note.deleted audit 기록 실패 (삭제는 완료)');
  });
  res.json({ ok: true, message: '노트가 삭제되었습니다.', id: req.params.id });
});

// ─────────────────────────────────────────────
// 상태 관리
// ─────────────────────────────────────────────

/** PATCH /api/notes/:id/status */
export const changeNoteStatus = asyncHandler(async (req: Request, res: Response) => {
  const note = await prisma.note.findFirst({ where: { id: req.params.id, orgId: getOrgId(req) } });
  if (!note) throw new AppError(404, '노트를 찾을 수 없습니다.', ErrorCode.NOTE_NOT_FOUND);

  const { status: newStatus } = req.body as ChangeStatusDto;
  const userRole = req.headers['x-user-role'] as string;
  // system 역할(서명 서비스 내부 호출)은 signed 전환 허용, 일반 사용자는 차단
  const transitions = userRole === 'system'
    ? SYSTEM_STATUS_TRANSITIONS
    : ALLOWED_STATUS_TRANSITIONS;
  const allowed = transitions[note.status as NoteStatus] ?? [];

  if (!allowed.includes(newStatus)) {
    throw new AppError(400, `상태 전환 불가: "${note.status}" → "${newStatus}". 허용: [${allowed.join(', ')}]`, ErrorCode.NOTE_STATUS_TRANSITION);
  }

  // 잠금(locked) 전환은 Reviewer 또는 Admin만 가능
  if (newStatus === 'locked') {
    if (userRole !== 'reviewer' && userRole !== 'admin') {
      throw new AppError(403, '노트 잠금은 검토자(Reviewer) 또는 관리자(Admin)만 수행할 수 있습니다.', ErrorCode.NOTE_LOCK_ROLE_REQUIRED);
    }
  }

  const updated = await prisma.note.update({
    where: { id: req.params.id },
    data: { status: newStatus },
  });

  const actorId = (req.headers['x-user-id'] as string) || 'anonymous';

  await prisma.noteStatusHistory.create({
    data: {
      id: uuidv4(),
      noteId: req.params.id,
      fromStatus: note.status as NoteStatus,
      toStatus: newStatus,
      changedBy: actorId,
      isAdminAction: false,
    },
  }).catch((histErr: unknown) => {
    logger.warn({ noteId: req.params.id, err: histErr instanceof Error ? histErr.message : histErr }, '[HISTORY_WARN] note_status_history 기록 실패 (상태변경은 완료)');
  });

  await callAuditLog({
    entityType: 'note',
    entityId: req.params.id,
    action: 'note.status_changed',
    actorId,
    details: { from: note.status, to: newStatus },
    ipAddress: req.ip,
  }).catch((auditErr: unknown) => {
    logger.warn({ noteId: req.params.id, err: auditErr instanceof Error ? auditErr.message : auditErr }, '[AUDIT_WARN] note.status_changed audit 기록 실패 (상태변경은 완료)');
  });

  // 잠금 알림: 노트 작성자에게 알림
  if (newStatus === 'locked' && note.authorId && note.authorId !== actorId) {
    callNotification({
      recipientId: note.authorId,
      type: 'NOTE_LOCKED',
      entityType: 'note',
      entityId: req.params.id,
      title: '연구노트가 잠금되었습니다',
      message: `'${note.title}' 노트가 잠금 처리되었습니다.`,
      actorId,
    }).catch((err: unknown) => {
      logger.warn({ noteId: req.params.id, err: err instanceof Error ? err.message : err }, '[NOTIFICATION_WARN] 잠금 알림 실패');
    });
  }

  res.json({ ok: true, data: updated, message: `상태가 "${newStatus}"(으)로 변경되었습니다.` });
});

/** POST /api/notes/:id/admin-unlock */
export const adminUnlockNote = asyncHandler(async (req: Request, res: Response) => {
  const note = await prisma.note.findFirst({ where: { id: req.params.id, orgId: getOrgId(req) } });
  if (!note) throw new AppError(404, '노트를 찾을 수 없습니다.', ErrorCode.NOTE_NOT_FOUND);
  if (note.status !== 'locked') {
    throw new AppError(400, '잠긴 상태의 노트만 잠금 해제할 수 있습니다.', ErrorCode.NOTE_NOT_LOCKED);
  }

  const { adminPassword, reason } = req.body as AdminUnlockDto;

  const adminId = req.headers['x-user-id'] as string;
  const verified = await verifyAdminPassword(adminId, adminPassword);
  if (!verified) {
    throw new AppError(400, '관리자 비밀번호가 올바르지 않습니다.', ErrorCode.NOTE_ADMIN_PASSWORD_INVALID);
  }

  const updated = await prisma.note.update({
    where: { id: req.params.id },
    data: { status: 'draft' },
  });

  await prisma.noteStatusHistory.create({
    data: {
      id: uuidv4(),
      noteId: req.params.id,
      fromStatus: 'locked',
      toStatus: 'draft',
      changedBy: adminId,
      reason: reason || '관리자 잠금 해제',
      isAdminAction: true,
    },
  }).catch((histErr: unknown) => {
    logger.warn({ noteId: req.params.id, err: histErr instanceof Error ? histErr.message : histErr }, '[HISTORY_WARN] note_status_history 기록 실패 (잠금해제는 완료)');
  });

  await callAuditLog({
    entityType: 'note',
    entityId: req.params.id,
    action: 'note.admin_unlocked',
    actorId: adminId,
    details: { reason: reason || '관리자 잠금 해제' },
    ipAddress: req.ip,
  }).catch((auditErr: unknown) => {
    logger.warn({ noteId: req.params.id, err: auditErr instanceof Error ? auditErr.message : auditErr }, '[AUDIT_WARN] note.admin_unlocked audit 기록 실패 (잠금해제는 완료)');
  });

  // 잠금 해제 알림: 노트 작성자에게 알림
  if (note.authorId && note.authorId !== adminId) {
    callNotification({
      recipientId: note.authorId,
      type: 'NOTE_UNLOCKED',
      entityType: 'note',
      entityId: req.params.id,
      title: '연구노트 잠금이 해제되었습니다',
      message: `'${note.title}' 노트의 잠금이 관리자에 의해 해제되었습니다.`,
      actorId: adminId,
    }).catch((err: unknown) => {
      logger.warn({ noteId: req.params.id, err: err instanceof Error ? err.message : err }, '[NOTIFICATION_WARN] 잠금해제 알림 실패');
    });
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
});

// ─────────────────────────────────────────────
// 리비전 (버전 관리)
// ─────────────────────────────────────────────

/** GET /api/notes/:id/revisions */
export const getRevisions = asyncHandler(async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  const note = await prisma.note.findFirst({ where: { id: req.params.id, orgId } });
  if (!note) throw new AppError(404, '노트를 찾을 수 없습니다.', ErrorCode.NOTE_NOT_FOUND);

  const revisions = await prisma.noteRevision.findMany({
    where: { noteId: req.params.id },
    orderBy: { revision: 'asc' },
  });
  res.json({ ok: true, data: revisions });
});

/** GET /api/notes/:id/revisions/:rev */
export const getRevisionById = asyncHandler(async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  const note = await prisma.note.findFirst({ where: { id: req.params.id, orgId } });
  if (!note) throw new AppError(404, '노트를 찾을 수 없습니다.', ErrorCode.NOTE_NOT_FOUND);

  const revision = await prisma.noteRevision.findFirst({
    where: { noteId: req.params.id, revision: parseInt(req.params.rev) },
  });
  if (!revision) throw new AppError(404, '리비전을 찾을 수 없습니다.', ErrorCode.REVISION_NOT_FOUND);
  res.json({ ok: true, data: revision });
});

// ─────────────────────────────────────────────
// 첨부파일
// ─────────────────────────────────────────────

/** GET /api/notes/:id/attachments */
export const getAttachments = asyncHandler(async (req: Request, res: Response) => {
  const note = await prisma.note.findFirst({
    where: { id: req.params.id, orgId: getOrgId(req) },
    include: { attachments: { orderBy: { createdAt: 'asc' } } },
  });
  if (!note) throw new AppError(404, '노트를 찾을 수 없습니다.', ErrorCode.NOTE_NOT_FOUND);
  res.json({ ok: true, data: note.attachments });
});

/** POST /api/notes/:id/attachments */
export const addAttachment = asyncHandler(async (req: Request, res: Response) => {
  const note = await prisma.note.findFirst({ where: { id: req.params.id, orgId: getOrgId(req) } });
  if (!note) throw new AppError(404, '노트를 찾을 수 없습니다.', ErrorCode.NOTE_NOT_FOUND);

  try {
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
  } catch (err: any) {
    if (err?.code === 'P2003') {
      throw new AppError(404, '노트를 찾을 수 없습니다.', ErrorCode.NOTE_NOT_FOUND);
    }
    throw err;
  }
});

/** DELETE /api/notes/:id/attachments/:attachmentId */
export const deleteAttachment = asyncHandler(async (req: Request, res: Response) => {
  // 소유권 검증은 라우트의 requireOwnerOrAdmin 미들웨어에서 수행됨
  // res.locals.resource에 attachment가 담겨 있음
  const attachment = res.locals.resource;
  await prisma.attachment.delete({ where: { id: attachment.id } });
  res.json({ ok: true, message: '첨부파일이 삭제되었습니다.' });
});

// ─────────────────────────────────────────────
// 링크 (교차 참조)
// ─────────────────────────────────────────────

/** GET /api/notes/:id/links */
export const getNoteLinks = asyncHandler(async (req: Request, res: Response) => {
  const note = await prisma.note.findFirst({ where: { id: req.params.id, orgId: getOrgId(req) } });
  if (!note) throw new AppError(404, '노트를 찾을 수 없습니다.', ErrorCode.NOTE_NOT_FOUND);

  const links = await prisma.noteLink.findMany({ where: { noteId: req.params.id } });
  res.json({ ok: true, data: links });
});

/** POST /api/notes/:id/links */
export const createNoteLink = asyncHandler(async (req: Request, res: Response) => {
  const note = await prisma.note.findFirst({ where: { id: req.params.id, orgId: getOrgId(req) } });
  if (!note) throw new AppError(404, '노트를 찾을 수 없습니다.', ErrorCode.NOTE_NOT_FOUND);

  const { targetType, targetId, label } = req.body;
  const link = await prisma.noteLink.create({
    data: {
      id: uuidv4(),
      noteId: req.params.id,
      targetType,
      targetId,
      label: label || null,
      createdBy: (req.headers['x-user-id'] as string) || 'anonymous',
    },
  });
  res.status(201).json({ ok: true, data: link });
});

/** DELETE /api/notes/:id/links/:linkId */
export const deleteNoteLink = asyncHandler(async (req: Request, res: Response) => {
  const note = await prisma.note.findFirst({ where: { id: req.params.id, orgId: getOrgId(req) } });
  if (!note) throw new AppError(404, '노트를 찾을 수 없습니다.', ErrorCode.NOTE_NOT_FOUND);

  const link = await prisma.noteLink.findUnique({ where: { id: req.params.linkId } });
  if (!link) throw new AppError(404, '링크를 찾을 수 없습니다.', ErrorCode.LINK_NOT_FOUND);

  const userId = (req.headers['x-user-id'] as string) || '';
  const userRole = req.headers['x-user-role'] as string;
  const isOwner = link.createdBy === userId || note.authorId === userId;
  if (!isOwner && userRole !== 'admin') {
    throw new AppError(403, '링크 삭제 권한이 없습니다.', ErrorCode.LINK_PERMISSION_DENIED);
  }

  await prisma.noteLink.delete({ where: { id: req.params.linkId } });
  res.json({ ok: true, message: '링크가 삭제되었습니다.' });
});

// ─────────────────────────────────────────────
// 태그 (전체 태그 목록)
// ─────────────────────────────────────────────

/** GET /api/tags?type=note|template */
export const getTags = asyncHandler(async (req: Request, res: Response) => {
  const type = (req.query.type as NoteType) || 'note';
  const orgId = getOrgId(req);
  // UNNEST+DISTINCT로 DB 레벨에서 중복 제거 및 정렬.
  // 의도적 동작 변경: deletedAt IS NULL 필터 추가 → 소프트 삭제된 노트의 태그 제외.
  const rows = await prisma.$queryRaw<{ tag: string }[]>`
    SELECT DISTINCT UNNEST(tags) AS tag
    FROM "Note"
    WHERE type = ${type}::text AND "deletedAt" IS NULL AND "orgId" = ${orgId}
    ORDER BY tag
  `;
  res.json({ ok: true, data: rows.map((r) => r.tag) });
});

// ─────────────────────────────────────────────
// 템플릿 (note.routes.ts에서 /api/templates 이하 라우트용)
// ─────────────────────────────────────────────

export const getTemplates = asyncHandler(async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  const templates = await prisma.template.findMany({
    where: { OR: [{ orgId }, { isPublic: true }] },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ ok: true, data: templates, total: templates.length });
});

export const getTemplateById = asyncHandler(async (req: Request, res: Response) => {
  const tmpl = await prisma.template.findFirst({
    where: { id: req.params.id, OR: [{ orgId: getOrgId(req) }, { isPublic: true }] },
  });
  if (!tmpl) throw new AppError(404, '템플릿을 찾을 수 없습니다.', ErrorCode.TEMPLATE_NOT_FOUND);
  res.json({ ok: true, data: tmpl });
});

export const createTemplate = asyncHandler(async (req: Request, res: Response) => {
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
      orgId: getOrgId(req),
      isPublic: req.body.isPublic ?? false,
    },
  });
  res.status(201).json({ ok: true, data: tmpl });
});

/** GET /api/notes/stats */
export const getNoteStats = asyncHandler(async (req: Request, res: Response) => {
  const type = (req.query.type as string) || 'note';
  const orgId = getOrgId(req);
  const rows = await prisma.note.groupBy({
    by: ['status'],
    where: { type: type as NoteType, deletedAt: null, orgId },
    _count: { _all: true },
  });
  const base = { draft: 0, in_progress: 0, locked: 0, signed: 0 };
  for (const row of rows) {
    base[row.status as keyof typeof base] = row._count._all;
  }
  const total = base.draft + base.in_progress + base.locked + base.signed;
  res.json({ ok: true, data: { ...base, total } });
});

/** POST /api/notes/batch */
export const getNotesBatch = asyncHandler(async (req: Request, res: Response) => {
  const { ids } = req.body;
  const orgId = getOrgId(req);
  const notes = await prisma.note.findMany({
    where: { id: { in: ids }, deletedAt: null, orgId },
  });
  res.json({ ok: true, data: notes });
});
