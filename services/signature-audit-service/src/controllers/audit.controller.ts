import { Request, Response } from 'express';
import prisma from '../lib/prisma';

/** GET /api/audit */
export async function listAuditLogs(req: Request, res: Response): Promise<void> {
  const {
    entityId,
    entityType,
    actorId,
    action,
    dateFrom,
    dateTo,
    page = '1',
    limit = '50',
  } = req.query;

  const skip = (Number.parseInt(page as string) - 1) * Number.parseInt(limit as string);

  const where: Record<string, unknown> = {};
  if (entityId)   where.entityId   = entityId as string;
  if (entityType) where.entityType = entityType as string;
  if (actorId)    where.actorId    = actorId as string;
  if (action)     where.action     = action as string;

  if (dateFrom || dateTo) {
    where.createdAt = {
      ...(dateFrom && { gte: new Date(dateFrom as string) }),
      ...(dateTo   && { lte: new Date(dateTo as string) }),
    };
  }

  try {
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number.parseInt(limit as string),
      }),
      prisma.auditLog.count({ where }),
    ]);
    res.json({ ok: true, data: logs, total, page: Number.parseInt(page as string) });
  } catch (err) {
    console.error('[listAuditLogs]', err);
    res.status(500).json({ ok: false, error: '감사로그 목록 조회 중 오류가 발생했습니다.' });
  }
}

/** GET /api/audit/:id */
export async function getAuditLog(req: Request, res: Response): Promise<void> {
  try {
    const log = await prisma.auditLog.findUnique({ where: { id: req.params.id } });
    if (!log) { res.status(404).json({ ok: false, error: '감사로그를 찾을 수 없습니다.' }); return; }
    res.json({ ok: true, data: log });
  } catch (err) {
    console.error('[getAuditLog]', err);
    res.status(500).json({ ok: false, error: '감사로그 조회 중 오류가 발생했습니다.' });
  }
}

/** GET /api/audit/actions — 사용된 action 목록 (필터 UI용) */
export async function listAuditActions(_req: Request, res: Response): Promise<void> {
  try {
    const rows = await prisma.auditLog.findMany({
      distinct: ['action'],
      select: { action: true },
      orderBy: { action: 'asc' },
    });
    res.json({ ok: true, data: rows.map((r) => r.action) });
  } catch (err) {
    console.error('[listAuditActions]', err);
    res.status(500).json({ ok: false, error: '감사로그 액션 목록 조회 중 오류가 발생했습니다.' });
  }
}
