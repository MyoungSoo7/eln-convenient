import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
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

  const where: Record<string, unknown> = {};
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

  try {
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

/** POST /api/audit/internal — eln-service 전용 내부 감사로그 생성 */
export async function createAuditLogInternal(req: Request, res: Response): Promise<void> {
  // 매 요청마다 live env 값으로 검증 (모듈 로드 시 캡처 방지)
  // INTERNAL_SECRET 미설정 시 개발 환경으로 간주하고 검증 생략
  const internalSecret = process.env.INTERNAL_SECRET;
  if (internalSecret) {
    const secret = req.headers['x-internal-secret'];
    if (!secret || secret !== internalSecret) {
      res.status(401).json({ ok: false, error: '내부 인증 실패' });
      return;
    }
  }

  const { entityType, entityId, action, actorId, details, ipAddress } = req.body;

  try {
    const log = await prisma.auditLog.create({
      data: {
        entityType,
        entityId,
        action,
        actorId,
        details: details ?? {},
        ipAddress: ipAddress ?? null,
        // id, createdAt: DB default 사용
      },
    });
    res.status(201).json({ ok: true, data: { id: log.id } });
  } catch (err) {
    console.error('[createAuditLogInternal]', err);
    res.status(500).json({ ok: false, error: '감사로그 기록 중 오류가 발생했습니다.' });
  }
}
