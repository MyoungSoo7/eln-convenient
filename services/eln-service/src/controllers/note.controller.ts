import { FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import https from 'https';
import http from 'http';
import prisma from '../lib/prisma';
import { callAuditLog } from '../lib/audit';
import { callNotification } from '../lib/notification';
import { searchClient } from '../lib/searchClient';
import { AppError, ErrorCode, createLogger, getOrgId, getTeamIds } from '@lab/shared';

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
export async function getNotes(request: FastifyRequest, reply: FastifyReply) {
  const { status, tag, search, page = '1', limit = '20', type, templateId, authorId: queryAuthorId, teamId: queryTeamId } = request.query as Record<string, string>;
  const orgId = getOrgId(request.headers);
  const userId = request.headers['x-user-id'] as string;
  const userRole = request.headers['x-user-role'] as string;

  const where: Record<string, unknown> = {
    type: (type as NoteType) || 'note',
    orgId,
    deletedAt: null,
  };

  // authorId/teamId 쿼리 파라미터 (대시보드 집계용)
  if (queryAuthorId) where.authorId = queryAuthorId;
  if (queryTeamId) where.teamId = queryTeamId;

  // 팀 가시성 필터: admin이 아니고 특정 authorId/teamId 필터가 없는 경우
  if (userRole !== 'admin' && !queryAuthorId && !queryTeamId) {
    const teamIds = getTeamIds(request.headers);
    where.OR = [
      { authorId: userId },
      ...(teamIds.length > 0 ? [{ teamId: { in: teamIds } }] : []),
      { teamId: null },
    ];
  }

  if (status) where.status = status;
  if (tag)        where.tags = { has: tag };
  if (templateId) where.templateId = templateId;
  if (search) {
    // search는 AND 조건으로 적용 (OR와 별도)
    where.AND = [
      { OR: [
        { title:   { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } },
      ] },
    ];
  }

  const [notes, total] = await Promise.all([
    prisma.note.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (parseInt(page) - 1) * parseInt(limit),
      take: parseInt(limit),
    }),
    prisma.note.count({ where }),
  ]);
  return { ok: true, data: notes, total, page: parseInt(page) };
}

/** GET /api/notes/:id */
export async function getNoteById(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const note = await prisma.note.findFirst({
    where: { id, orgId: getOrgId(request.headers) },
    include: { attachments: true, links: true },
  });
  if (!note) throw new AppError(404, '노트를 찾을 수 없습니다.', ErrorCode.NOTE_NOT_FOUND);
  return { ok: true, data: note };
}

/** POST /api/notes  또는  POST /api/protocols (템플릿) */
export async function createNote(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as any;
  const { title, content, sections, templateId, tags, type, teamId } = body;
  const authorId = (request.headers['x-user-id'] as string) || 'anonymous';
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
      orgId: getOrgId(request.headers),
      teamId: teamId || null,
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
    ipAddress: request.ip,
  }).catch((auditErr: unknown) => {
    logger.warn({ noteId: note.id, err: auditErr instanceof Error ? auditErr.message : auditErr }, '[AUDIT_WARN] note.created audit 기록 실패 (노트 생성은 완료)');
  });
  reply.code(201);
  return { ok: true, data: note };
}

/** PUT /api/notes/:id */
export async function updateNote(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const body = request.body as any;
  const userId = (request.headers['x-user-id'] as string) || 'anonymous';
  const userRole = request.headers['x-user-role'] as string;

  const existing = await prisma.note.findFirst({ where: { id, orgId: getOrgId(request.headers) } });
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

  const { title, content, sections, tags, changeSummary } = body;
  const updated = await prisma.note.update({
    where: { id },
    data: {
      ...(title     !== undefined && { title }),
      ...(content   !== undefined && { content }),
      ...(sections  !== undefined && { sections }),
      ...(tags      !== undefined && { tags }),
    },
  });

  const rev = await nextRevision(id);
  await prisma.noteRevision.create({
    data: {
      id: uuidv4(),
      noteId: id,
      revision: rev,
      content: updated.content,
      sections: (updated.sections as object) ?? [],
      changedBy: userId,
      changeSummary: changeSummary || '노트 수정',
    },
  });

  await callAuditLog({
    entityType: 'note',
    entityId: id,
    action: 'note.updated',
    actorId: userId,
    details: { changedFields: Object.keys(body).filter((k: string) => ['title','content','sections','tags'].includes(k)) },
    ipAddress: request.ip,
  }).catch((auditErr: unknown) => {
    logger.warn({ noteId: id, err: auditErr instanceof Error ? auditErr.message : auditErr }, '[AUDIT_WARN] note.updated audit 기록 실패 (수정은 완료)');
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
  return { ok: true, data: updated };
}

/** DELETE /api/notes/:id */
export async function deleteNote(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const userId = (request.headers['x-user-id'] as string) || 'anonymous';
  const userRole = request.headers['x-user-role'] as string;

  const existing = await prisma.note.findFirst({ where: { id, orgId: getOrgId(request.headers) } });
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

  await prisma.note.update({ where: { id }, data: { deletedAt: new Date() } });
  searchClient.delete(id);
  await callAuditLog({
    entityType: 'note',
    entityId: id,
    action: 'note.deleted',
    actorId: userId,
    details: { title: existing.title },
    ipAddress: request.ip,
  }).catch((auditErr: unknown) => {
    logger.warn({ noteId: id, err: auditErr instanceof Error ? auditErr.message : auditErr }, '[AUDIT_WARN] note.deleted audit 기록 실패 (삭제는 완료)');
  });
  return { ok: true, message: '노트가 삭제되었습니다.', id };
}

// ─────────────────────────────────────────────
// 상태 관리
// ─────────────────────────────────────────────

/** PATCH /api/notes/:id/status */
export async function changeNoteStatus(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const { status: newStatus } = request.body as ChangeStatusDto;
  const userRole = request.headers['x-user-role'] as string;
  const actorId = (request.headers['x-user-id'] as string) || 'anonymous';
  const orgId = getOrgId(request.headers);

  // 잠금(locked) 전환은 Reviewer 또는 Admin만 가능
  if (newStatus === 'locked') {
    if (userRole !== 'reviewer' && userRole !== 'admin') {
      throw new AppError(403, '노트 잠금은 검토자(Reviewer) 또는 관리자(Admin)만 수행할 수 있습니다.', ErrorCode.NOTE_LOCK_ROLE_REQUIRED);
    }
  }

  // 트랜잭션 + FOR UPDATE: 동시 상태 전환 race condition 방지
  const { updated, fromStatus } = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT 1 FROM "Note" WHERE id = ${id} FOR UPDATE`;
    const note = await tx.note.findFirst({ where: { id, orgId } });
    if (!note) throw new AppError(404, '노트를 찾을 수 없습니다.', ErrorCode.NOTE_NOT_FOUND);

    const transitions = userRole === 'system'
      ? SYSTEM_STATUS_TRANSITIONS
      : ALLOWED_STATUS_TRANSITIONS;
    const allowed = transitions[note.status as NoteStatus] ?? [];

    if (!allowed.includes(newStatus)) {
      throw new AppError(400, `상태 전환 불가: "${note.status}" → "${newStatus}". 허용: [${allowed.join(', ')}]`, ErrorCode.NOTE_STATUS_TRANSITION);
    }

    const upd = await tx.note.update({
      where: { id },
      data: { status: newStatus },
    });

    await tx.noteStatusHistory.create({
      data: {
        id: uuidv4(),
        noteId: id,
        fromStatus: note.status as NoteStatus,
        toStatus: newStatus,
        changedBy: actorId,
        isAdminAction: false,
      },
    });

    return { updated: upd, fromStatus: note.status };
  }, { timeout: 5000 });

  await callAuditLog({
    entityType: 'note',
    entityId: id,
    action: 'note.status_changed',
    actorId,
    details: { from: fromStatus, to: newStatus },
    ipAddress: request.ip,
  }).catch((auditErr: unknown) => {
    logger.warn({ noteId: id, err: auditErr instanceof Error ? auditErr.message : auditErr }, '[AUDIT_WARN] note.status_changed audit 기록 실패 (상태변경은 완료)');
  });

  // 잠금 알림: 노트 작성자에게 알림
  if (newStatus === 'locked' && updated.authorId && updated.authorId !== actorId) {
    callNotification({
      recipientId: updated.authorId,
      type: 'NOTE_LOCKED',
      entityType: 'note',
      entityId: id,
      title: '연구노트가 잠금되었습니다',
      message: `'${updated.title}' 노트가 잠금 처리되었습니다.`,
      actorId,
    }).catch((err: unknown) => {
      logger.warn({ noteId: id, err: err instanceof Error ? err.message : err }, '[NOTIFICATION_WARN] 잠금 알림 실패');
    });
  }

  return { ok: true, data: updated, message: `상태가 "${newStatus}"(으)로 변경되었습니다.` };
}

/** POST /api/notes/:id/admin-unlock */
export async function adminUnlockNote(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const note = await prisma.note.findFirst({ where: { id, orgId: getOrgId(request.headers) } });
  if (!note) throw new AppError(404, '노트를 찾을 수 없습니다.', ErrorCode.NOTE_NOT_FOUND);
  if (note.status !== 'locked') {
    throw new AppError(400, '잠긴 상태의 노트만 잠금 해제할 수 있습니다.', ErrorCode.NOTE_NOT_LOCKED);
  }

  const { adminPassword, reason } = request.body as AdminUnlockDto;

  const adminId = request.headers['x-user-id'] as string;
  const verified = await verifyAdminPassword(adminId, adminPassword);
  if (!verified) {
    throw new AppError(400, '관리자 비밀번호가 올바르지 않습니다.', ErrorCode.NOTE_ADMIN_PASSWORD_INVALID);
  }

  const updated = await prisma.note.update({
    where: { id },
    data: { status: 'draft' },
  });

  await prisma.noteStatusHistory.create({
    data: {
      id: uuidv4(),
      noteId: id,
      fromStatus: 'locked',
      toStatus: 'draft',
      changedBy: adminId,
      reason: reason || '관리자 잠금 해제',
      isAdminAction: true,
    },
  }).catch((histErr: unknown) => {
    logger.warn({ noteId: id, err: histErr instanceof Error ? histErr.message : histErr }, '[HISTORY_WARN] note_status_history 기록 실패 (잠금해제는 완료)');
  });

  await callAuditLog({
    entityType: 'note',
    entityId: id,
    action: 'note.admin_unlocked',
    actorId: adminId,
    details: { reason: reason || '관리자 잠금 해제' },
    ipAddress: request.ip,
  }).catch((auditErr: unknown) => {
    logger.warn({ noteId: id, err: auditErr instanceof Error ? auditErr.message : auditErr }, '[AUDIT_WARN] note.admin_unlocked audit 기록 실패 (잠금해제는 완료)');
  });

  // 잠금 해제 알림: 노트 작성자에게 알림
  if (note.authorId && note.authorId !== adminId) {
    callNotification({
      recipientId: note.authorId,
      type: 'NOTE_UNLOCKED',
      entityType: 'note',
      entityId: id,
      title: '연구노트 잠금이 해제되었습니다',
      message: `'${note.title}' 노트의 잠금이 관리자에 의해 해제되었습니다.`,
      actorId: adminId,
    }).catch((err: unknown) => {
      logger.warn({ noteId: id, err: err instanceof Error ? err.message : err }, '[NOTIFICATION_WARN] 잠금해제 알림 실패');
    });
  }

  return {
    ok: true,
    data: updated,
    auditLog: {
      action: 'admin_unlock',
      noteId: id,
      adminId: request.headers['x-user-id'],
      reason: reason || '관리자 잠금 해제',
      timestamp: new Date().toISOString(),
    },
    message: '관리자 권한으로 노트 잠금이 해제되었습니다.',
  };
}

// ─────────────────────────────────────────────
// 리비전 (버전 관리)
// ─────────────────────────────────────────────

/** GET /api/notes/:id/revisions */
export async function getRevisions(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const orgId = getOrgId(request.headers);
  const note = await prisma.note.findFirst({ where: { id, orgId } });
  if (!note) throw new AppError(404, '노트를 찾을 수 없습니다.', ErrorCode.NOTE_NOT_FOUND);

  const revisions = await prisma.noteRevision.findMany({
    where: { noteId: id },
    orderBy: { revision: 'asc' },
  });
  return { ok: true, data: revisions };
}

/** GET /api/notes/:id/revisions/:rev */
export async function getRevisionById(request: FastifyRequest, reply: FastifyReply) {
  const { id, rev } = request.params as { id: string; rev: string };
  const orgId = getOrgId(request.headers);
  const note = await prisma.note.findFirst({ where: { id, orgId } });
  if (!note) throw new AppError(404, '노트를 찾을 수 없습니다.', ErrorCode.NOTE_NOT_FOUND);

  const revision = await prisma.noteRevision.findFirst({
    where: { noteId: id, revision: parseInt(rev) },
  });
  if (!revision) throw new AppError(404, '리비전을 찾을 수 없습니다.', ErrorCode.REVISION_NOT_FOUND);
  return { ok: true, data: revision };
}

// ─────────────────────────────────────────────
// 첨부파일
// ─────────────────────────────────────────────

/** GET /api/notes/:id/attachments */
export async function getAttachments(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const note = await prisma.note.findFirst({
    where: { id, orgId: getOrgId(request.headers) },
    include: { attachments: { orderBy: { createdAt: 'asc' } } },
  });
  if (!note) throw new AppError(404, '노트를 찾을 수 없습니다.', ErrorCode.NOTE_NOT_FOUND);
  return { ok: true, data: note.attachments };
}

/** POST /api/notes/:id/attachments */
export async function addAttachment(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const body = request.body as any;
  const note = await prisma.note.findFirst({ where: { id, orgId: getOrgId(request.headers) } });
  if (!note) throw new AppError(404, '노트를 찾을 수 없습니다.', ErrorCode.NOTE_NOT_FOUND);

  try {
    const attachment = await prisma.attachment.create({
      data: {
        id: uuidv4(),
        noteId: id,
        fileId: body.fileId || uuidv4(),
        fileName: body.fileName || 'unknown',
        mimeType: body.mimeType || null,
        sizeBytes: body.sizeBytes || null,
        uploadedBy: (request.headers['x-user-id'] as string) || 'anonymous',
      },
    });
    reply.code(201);
    return { ok: true, data: attachment };
  } catch (err: any) {
    if (err?.code === 'P2003') {
      throw new AppError(404, '노트를 찾을 수 없습니다.', ErrorCode.NOTE_NOT_FOUND);
    }
    throw err;
  }
}

/** DELETE /api/notes/:id/attachments/:attachmentId */
export async function deleteAttachment(request: FastifyRequest, reply: FastifyReply) {
  // 소유권 검증은 라우트의 requireOwnerOrAdmin preHandler에서 수행됨
  // request.routeResource에 attachment가 담겨 있음
  const attachment = (request as any).routeResource;
  await prisma.attachment.delete({ where: { id: attachment.id } });
  return { ok: true, message: '첨부파일이 삭제되었습니다.' };
}

// ─────────────────────────────────────────────
// 링크 (교차 참조)
// ─────────────────────────────────────────────

/** GET /api/notes/:id/links */
export async function getNoteLinks(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const note = await prisma.note.findFirst({ where: { id, orgId: getOrgId(request.headers) } });
  if (!note) throw new AppError(404, '노트를 찾을 수 없습니다.', ErrorCode.NOTE_NOT_FOUND);

  const links = await prisma.noteLink.findMany({ where: { noteId: id } });
  return { ok: true, data: links };
}

/** POST /api/notes/:id/links */
export async function createNoteLink(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const body = request.body as any;
  const note = await prisma.note.findFirst({ where: { id, orgId: getOrgId(request.headers) } });
  if (!note) throw new AppError(404, '노트를 찾을 수 없습니다.', ErrorCode.NOTE_NOT_FOUND);

  const { targetType, targetId, label } = body;
  const link = await prisma.noteLink.create({
    data: {
      id: uuidv4(),
      noteId: id,
      targetType,
      targetId,
      label: label || null,
      createdBy: (request.headers['x-user-id'] as string) || 'anonymous',
    },
  });
  reply.code(201);
  return { ok: true, data: link };
}

/** DELETE /api/notes/:id/links/:linkId */
export async function deleteNoteLink(request: FastifyRequest, reply: FastifyReply) {
  const { id, linkId } = request.params as { id: string; linkId: string };
  const note = await prisma.note.findFirst({ where: { id, orgId: getOrgId(request.headers) } });
  if (!note) throw new AppError(404, '노트를 찾을 수 없습니다.', ErrorCode.NOTE_NOT_FOUND);

  const link = await prisma.noteLink.findUnique({ where: { id: linkId } });
  if (!link) throw new AppError(404, '링크를 찾을 수 없습니다.', ErrorCode.LINK_NOT_FOUND);

  const userId = (request.headers['x-user-id'] as string) || '';
  const userRole = request.headers['x-user-role'] as string;
  const isOwner = link.createdBy === userId || note.authorId === userId;
  if (!isOwner && userRole !== 'admin') {
    throw new AppError(403, '링크 삭제 권한이 없습니다.', ErrorCode.LINK_PERMISSION_DENIED);
  }

  await prisma.noteLink.delete({ where: { id: linkId } });
  return { ok: true, message: '링크가 삭제되었습니다.' };
}

// ─────────────────────────────────────────────
// 태그 (전체 태그 목록)
// ─────────────────────────────────────────────

/** GET /api/tags?type=note|template */
export async function getTags(request: FastifyRequest, reply: FastifyReply) {
  const { type } = request.query as Record<string, string>;
  const noteType = (type as NoteType) || 'note';
  const orgId = getOrgId(request.headers);
  // UNNEST+DISTINCT로 DB 레벨에서 중복 제거 및 정렬.
  // 의도적 동작 변경: deletedAt IS NULL 필터 추가 → 소프트 삭제된 노트의 태그 제외.
  const rows = await prisma.$queryRaw<{ tag: string }[]>`
    SELECT DISTINCT UNNEST(tags) AS tag
    FROM "Note"
    WHERE type = ${noteType}::"NoteType" AND "deletedAt" IS NULL AND "orgId" = ${orgId}
    ORDER BY tag
  `;
  return { ok: true, data: rows.map((r) => r.tag) };
}

// ─────────────────────────────────────────────
// 템플릿 (note.routes.ts에서 /api/templates 이하 라우트용)
// ─────────────────────────────────────────────

export async function getTemplates(request: FastifyRequest, reply: FastifyReply) {
  const orgId = getOrgId(request.headers);
  const templates = await prisma.template.findMany({
    where: { OR: [{ orgId }, { isPublic: true }] },
    orderBy: { createdAt: 'asc' },
  });
  return { ok: true, data: templates, total: templates.length };
}

export async function getTemplateById(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const tmpl = await prisma.template.findFirst({
    where: { id, OR: [{ orgId: getOrgId(request.headers) }, { isPublic: true }] },
  });
  if (!tmpl) throw new AppError(404, '템플릿을 찾을 수 없습니다.', ErrorCode.TEMPLATE_NOT_FOUND);
  return { ok: true, data: tmpl };
}

export async function createTemplate(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as any;
  const tmpl = await prisma.template.create({
    data: {
      id: uuidv4(),
      title: body.title,
      description: body.description || '',
      content: body.content || '',
      category: body.category || '일반',
      sections: body.sections ?? [],
      tags: body.tags || [],
      createdBy: (request.headers['x-user-id'] as string) || 'anonymous',
      orgId: getOrgId(request.headers),
      isPublic: body.isPublic ?? false,
    },
  });
  reply.code(201);
  return { ok: true, data: tmpl };
}

/** GET /api/notes/stats */
export async function getNoteStats(request: FastifyRequest, reply: FastifyReply) {
  const { type, authorId: queryAuthorId, teamId: queryTeamId } = request.query as Record<string, string>;
  const noteType = type || 'note';
  const orgId = getOrgId(request.headers);
  const where: Record<string, unknown> = { type: noteType as NoteType, deletedAt: null, orgId };
  if (queryAuthorId) where.authorId = queryAuthorId;
  if (queryTeamId) where.teamId = queryTeamId;
  const rows = await prisma.note.groupBy({
    by: ['status'],
    where,
    _count: { _all: true },
  });
  const base = { draft: 0, in_progress: 0, locked: 0, signed: 0 };
  for (const row of rows) {
    base[row.status as keyof typeof base] = row._count._all;
  }
  const total = base.draft + base.in_progress + base.locked + base.signed;
  return { ok: true, data: { ...base, total } };
}

/** POST /api/notes/batch */
export async function getNotesBatch(request: FastifyRequest, reply: FastifyReply) {
  const { ids } = request.body as any;
  const orgId = getOrgId(request.headers);
  const notes = await prisma.note.findMany({
    where: { id: { in: ids }, deletedAt: null, orgId },
  });
  return { ok: true, data: notes };
}
