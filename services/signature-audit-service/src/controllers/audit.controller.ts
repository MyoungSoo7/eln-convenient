import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getOrgId, asyncHandler, AppError, ErrorCode, createLogger } from '@lab/shared';
import prisma from '../lib/prisma';

const logger = createLogger('audit-controller');

/** GET /api/audit */
export const listAuditLogs = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const {
    entityId,
    entityType,
    actorId,
    action,
    dateFrom,
    dateTo,
    page,
    limit,
  } = req.query as unknown as {
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

  const where: Record<string, unknown> = { orgId: getOrgId(req) };
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
  res.json({ ok: true, data: logs, total, page });
});

/** GET /api/audit/:id */
export const getAuditLog = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const log = await prisma.auditLog.findFirst({ where: { id: req.params.id, orgId: getOrgId(req) } });
  if (!log) { throw new AppError(404, '감사로그를 찾을 수 없습니다.', ErrorCode.NOT_FOUND); }
  res.json({ ok: true, data: log });
});

/** GET /api/audit/actions — 사용된 action 목록 (필터 UI용) */
export const listAuditActions = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const rows = await prisma.auditLog.findMany({
    where: { orgId: getOrgId(req) },
    distinct: ['action'],
    select: { action: true },
    orderBy: { action: 'asc' },
  });
  res.json({ ok: true, data: rows.map((r) => r.action) });
});

/** POST /api/audit/internal — 내부 감사로그 생성 (requireInternalSecret 미들웨어로 보호) */
export const createAuditLogInternal = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { entityType, entityId, action, actorId, orgId, details, ipAddress } = req.body;

  const log = await prisma.auditLog.create({
    data: {
      entityType,
      entityId,
      action,
      actorId,
      orgId: orgId ?? '',
      details: details ?? {},
      ipAddress: ipAddress ?? null,
      // id, createdAt: DB default 사용
    },
  });
  res.status(201).json({ ok: true, data: { id: log.id } });
});
