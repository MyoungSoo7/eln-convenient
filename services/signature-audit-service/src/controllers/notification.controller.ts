import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma';

// ─────────────────────────────────────────────
// 사용자 API (requireAuth 적용)
// ─────────────────────────────────────────────

/** GET /api/notifications — 내 알림 목록 */
export async function listNotifications(req: Request, res: Response): Promise<void> {
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

  try {
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
  } catch (err) {
    console.error('[listNotifications]', err);
    res.status(500).json({ ok: false, error: '알림 목록 조회 중 오류가 발생했습니다.' });
  }
}

/** GET /api/notifications/unread-count — 읽지 않은 알림 수 */
export async function getUnreadCount(req: Request, res: Response): Promise<void> {
  const recipientId = req.headers['x-user-id'] as string;
  try {
    const count = await prisma.notification.count({
      where: { recipientId, isRead: false },
    });
    res.json({ ok: true, data: { count } });
  } catch (err) {
    console.error('[getUnreadCount]', err);
    res.status(500).json({ ok: false, error: '읽지 않은 알림 수 조회 중 오류가 발생했습니다.' });
  }
}

/** PATCH /api/notifications/:id/read — 단건 읽음 처리 */
export async function markAsRead(req: Request, res: Response): Promise<void> {
  const recipientId = req.headers['x-user-id'] as string;
  try {
    const notification = await prisma.notification.findUnique({ where: { id: req.params.id } });
    if (!notification || notification.recipientId !== recipientId) {
      res.status(404).json({ ok: false, error: '알림을 찾을 수 없습니다.' });
      return;
    }
    const updated = await prisma.notification.update({
      where: { id: req.params.id },
      data: { isRead: true },
    });
    res.json({ ok: true, data: updated });
  } catch (err) {
    console.error('[markAsRead]', err);
    res.status(500).json({ ok: false, error: '알림 읽음 처리 중 오류가 발생했습니다.' });
  }
}

/** PATCH /api/notifications/read-all — 전체 읽음 처리 */
export async function markAllAsRead(req: Request, res: Response): Promise<void> {
  const recipientId = req.headers['x-user-id'] as string;
  try {
    const result = await prisma.notification.updateMany({
      where: { recipientId, isRead: false },
      data: { isRead: true },
    });
    res.json({ ok: true, data: { updated: result.count } });
  } catch (err) {
    console.error('[markAllAsRead]', err);
    res.status(500).json({ ok: false, error: '전체 읽음 처리 중 오류가 발생했습니다.' });
  }
}

// ─────────────────────────────────────────────
// 내부 API (서비스 간 호출용, requireAuth 미적용)
// ─────────────────────────────────────────────

/** POST /api/notifications/internal — 알림 생성 (내부 전용) */
export async function createNotificationInternal(req: Request, res: Response): Promise<void> {
  const internalSecret = process.env.INTERNAL_SECRET;
  if (internalSecret) {
    const secret = req.headers['x-internal-secret'];
    if (!secret || secret !== internalSecret) {
      res.status(401).json({ ok: false, error: '내부 인증 실패' });
      return;
    }
  }

  const { recipientId, type, entityType, entityId, title, message, actorId, actorName } = req.body;

  try {
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
    res.status(201).json({ ok: true, data: { id: notification.id } });
  } catch (err) {
    console.error('[createNotificationInternal]', err);
    res.status(500).json({ ok: false, error: '알림 생성 중 오류가 발생했습니다.' });
  }
}
