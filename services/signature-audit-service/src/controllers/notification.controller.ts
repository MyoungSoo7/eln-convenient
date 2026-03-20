import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AppError, asyncHandler, ErrorCode, createLogger } from '@lab/shared';
import prisma from '../lib/prisma';
import { redisConnection } from '../lib/queue';

const logger = createLogger('signature-audit-service');

// ─────────────────────────────────────────────
// 사용자 API (requireAuth 적용)
// ─────────────────────────────────────────────

/** GET /api/notifications — 내 알림 목록 */
export const listNotifications = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const recipientId = req.headers['x-user-id'] as string;
  const { page, limit, isRead } = req.query as unknown as {
    page: number;
    limit: number;
    isRead?: string;
  };

  const skip = (page - 1) * limit;
  const where: Record<string, unknown> = { recipientId };
  if (isRead === 'true') where.isRead = true;
  if (isRead === 'false') where.isRead = false;

  const [notifications, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.notification.count({ where }),
  ]);
  res.json({ ok: true, data: notifications, total, page });
});

/** GET /api/notifications/unread-count — 읽지 않은 알림 수 (Redis 캐시 적용) */
export const getUnreadCount = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const recipientId = req.headers['x-user-id'] as string;
  const cacheKey = `notif-unread:${recipientId}`;

  // Redis 캐시 확인
  try {
    const cached = await redisConnection.get(cacheKey);
    if (cached !== null) {
      res.json({ ok: true, data: { count: parseInt(cached, 10) } });
      return;
    }
  } catch { /* Redis 오류 무시 → DB 폴백 */ }

  const count = await prisma.notification.count({
    where: { recipientId, isRead: false },
  });

  // Redis에 캐싱 (5분 TTL)
  try { await redisConnection.set(cacheKey, String(count), 'EX', 300); } catch { /* 무시 */ }

  res.json({ ok: true, data: { count } });
});

/** PATCH /api/notifications/:id/read — 단건 읽음 처리 */
export const markAsRead = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const recipientId = req.headers['x-user-id'] as string;
  const notification = await prisma.notification.findUnique({ where: { id: req.params.id } });
  if (!notification || notification.recipientId !== recipientId) {
    throw new AppError(404, '알림을 찾을 수 없습니다.', ErrorCode.NOTIFICATION_NOT_FOUND);
  }
  const updated = await prisma.notification.update({
    where: { id: req.params.id },
    data: { isRead: true },
  });

  // 읽지 않은 상태였던 경우만 DECR
  if (!notification.isRead) {
    try {
      const exists = await redisConnection.exists(`notif-unread:${recipientId}`);
      if (exists) await redisConnection.decr(`notif-unread:${recipientId}`);
    } catch { /* 무시 */ }
  }

  res.json({ ok: true, data: updated });
});

/** PATCH /api/notifications/read-all — 전체 읽음 처리 */
export const markAllAsRead = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const recipientId = req.headers['x-user-id'] as string;
  const result = await prisma.notification.updateMany({
    where: { recipientId, isRead: false },
    data: { isRead: true },
  });

  // 캐시 삭제 (0으로 리셋)
  try { await redisConnection.del(`notif-unread:${recipientId}`); } catch { /* 무시 */ }

  res.json({ ok: true, data: { updated: result.count } });
});

// ─────────────────────────────────────────────
// 내부 API (서비스 간 호출용, requireAuth 미적용)
// ─────────────────────────────────────────────

/** POST /api/notifications/internal — 알림 생성 (내부 전용) */
export const createNotificationInternal = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const internalSecret = process.env.INTERNAL_SECRET;
  if (internalSecret) {
    const secret = req.headers['x-internal-secret'];
    if (!secret || secret !== internalSecret) {
      throw new AppError(401, '내부 인증 실패', ErrorCode.INTERNAL_AUTH_FAILED);
    }
  }

  const { recipientId, type, entityType, entityId, title, message, actorId, actorName } = req.body;

  const notification = await prisma.notification.create({
    data: {
      id: uuidv4(),
      recipientId,
      type,
      entityType,
      entityId,
      title,
      message,
      actorId,
      actorName: actorName ?? '',
    },
  });

  // Redis: 미읽음 카운트 증가 (키가 존재하면 INCR, 없으면 무시 — 다음 조회 시 DB에서 재설정)
  try {
    const exists = await redisConnection.exists(`notif-unread:${recipientId}`);
    if (exists) await redisConnection.incr(`notif-unread:${recipientId}`);
  } catch { /* 무시 */ }

  // Redis Pub/Sub: 실시간 알림 푸시
  try {
    redisConnection.publish(`notifications:${recipientId}`, JSON.stringify({
      id: notification.id, type, entityType, entityId, title, message, actorName: actorName ?? '',
      createdAt: notification.createdAt,
    }));
  } catch { /* 무시 */ }

  res.status(201).json({ ok: true, data: { id: notification.id } });
});
