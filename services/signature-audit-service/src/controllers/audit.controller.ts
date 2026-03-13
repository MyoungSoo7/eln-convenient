import { Request, Response } from 'express';
import prisma from '../lib/prisma';

export async function listAuditLogs(req: Request, res: Response): Promise<void> {
  const { entityId, type, page = '1', limit = '50' } = req.query;
  const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

  const where: Record<string, unknown> = {};
  if (entityId) where.entityId = entityId as string;
  if (type) where.entityType = type as string;

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: parseInt(limit as string),
    }),
    prisma.auditLog.count({ where }),
  ]);

  res.json({ ok: true, data: logs, total });
}

export async function getAuditLog(req: Request, res: Response): Promise<void> {
  const log = await prisma.auditLog.findUnique({ where: { id: req.params.id } });
  if (!log) { res.status(404).json({ ok: false, error: '감사로그를 찾을 수 없습니다.' }); return; }
  res.json({ ok: true, data: log });
}
