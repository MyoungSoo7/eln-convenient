import { FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { getOrgId, AppError, ErrorCode, createLogger } from '@lab/shared';
import prisma from '../lib/prisma';

const logger = createLogger('audit-controller');

/** GET /api/audit */
export async function listAuditLogs(request: FastifyRequest, reply: FastifyReply) {
  const {
    entityId,
    entityType,
    actorId,
    action,
    dateFrom,
    dateTo,
    page,
    limit,
  } = request.query as unknown as {
    entityId?: string;
    entityType?: string;
    actorId?: string;
    action?: string;
    dateFrom?: string;
    dateTo?: string;
    page: number;
    limit: number;
  };

  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = { orgId: getOrgId(request.headers) };
  if (entityId)   where.entityId   = entityId;
  if (entityType) where.entityType = entityType;
  if (actorId)    where.actorId    = actorId;
  if (action)     where.action     = action;

  if (dateFrom || dateTo) {
    where.createdAt = {
      ...(dateFrom && { gte: new Date(dateFrom) }),
      ...(dateTo   && { lte: new Date(dateTo) }),
    };
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { ok: true, data: logs, total, page };
}

/** GET /api/audit/:id */
export async function getAuditLog(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const log = await prisma.auditLog.findFirst({ where: { id, orgId: getOrgId(request.headers) } });
  if (!log) { throw new AppError(404, '감사로그를 찾을 수 없습니다.', ErrorCode.NOT_FOUND); }
  return { ok: true, data: log };
}

/** GET /api/audit/actions — 사용된 action 목록 (필터 UI용) */
export async function listAuditActions(request: FastifyRequest, reply: FastifyReply) {
  const rows = await prisma.auditLog.findMany({
    where: { orgId: getOrgId(request.headers) },
    distinct: ['action'],
    select: { action: true },
    orderBy: { action: 'asc' },
  });
  return { ok: true, data: rows.map((r) => r.action) };
}

/** POST /api/audit/internal — 내부 감사로그 생성 (requireInternalSecret 미들웨어로 보호)
 *  멱등성: body.eventId가 주어지면 동일 eventId의 로그가 이미 있을 경우 신규 생성하지 않는다.
 *  → publisher가 재시도해도 AuditLog는 1회만 기록됨.
 */
export async function createAuditLogInternal(request: FastifyRequest, reply: FastifyReply) {
  const { eventId, entityType, entityId, action, actorId, orgId, details, ipAddress } = request.body as any;

  // eventId가 있으면 idempotent upsert
  if (eventId) {
    const existing = await prisma.auditLog.findUnique({ where: { eventId } });
    if (existing) {
      reply.code(200);
      return { ok: true, data: { id: existing.id, deduplicated: true } };
    }
    try {
      const log = await prisma.auditLog.create({
        data: {
          eventId,
          entityType,
          entityId,
          action,
          actorId,
          orgId: orgId ?? '',
          details: details ?? {},
          ipAddress: ipAddress ?? null,
        },
      });
      reply.code(201);
      return { ok: true, data: { id: log.id } };
    } catch (err: any) {
      // 동시 요청으로 UNIQUE 충돌 — 멱등으로 처리
      if (err?.code === 'P2002') {
        const existing2 = await prisma.auditLog.findUnique({ where: { eventId } });
        reply.code(200);
        return { ok: true, data: { id: existing2?.id, deduplicated: true } };
      }
      throw err;
    }
  }

  // 레거시 호출 (eventId 없음) — 기존 동작 유지
  const log = await prisma.auditLog.create({
    data: {
      entityType,
      entityId,
      action,
      actorId,
      orgId: orgId ?? '',
      details: details ?? {},
      ipAddress: ipAddress ?? null,
    },
  });
  reply.code(201);
  return { ok: true, data: { id: log.id } };
}
