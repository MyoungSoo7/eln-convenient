import { FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { AppError, ErrorCode, createLogger, getOrgId } from '@lab/shared';
import prisma from '../lib/prisma';
import { redisConnection } from '../lib/queue';

const logger = createLogger('signature-audit-service');

// ─────────────────────────────────────────────
// 사용자 API (requireAuth 적용)
// ─────────────────────────────────────────────

/** GET /api/notifications — 내 알림 목록 */
export async function listNotifications(request: FastifyRequest, reply: FastifyReply) {
  const recipientId = request.headers['x-user-id'] as string;
  const { page, limit, isRead } = request.query as unknown as {
    page: number;
    limit: number;
    isRead?: string;
  };

  const skip = (page - 1) * limit;
  const orgId = getOrgId(request.headers);
  const where: Record<string, unknown> = { recipientId, orgId };
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
  return { ok: true, data: notifications, total, page };
}

/** GET /api/notifications/unread-count — 읽지 않은 알림 수 (Redis 캐시 적용) */
export async function getUnreadCount(request: FastifyRequest, reply: FastifyReply) {
  const recipientId = request.headers['x-user-id'] as string;
  const orgId = getOrgId(request.headers);
  const cacheKey = `notif-unread:${orgId}:${recipientId}`;

  // Redis 캐시 확인
  try {
    const cached = await redisConnection.get(cacheKey);
    if (cached !== null) {
      return { ok: true, data: { count: parseInt(cached, 10) } };
    }
  } catch { /* Redis 오류 무시 → DB 폴백 */ }

  const count = await prisma.notification.count({
    where: { recipientId, isRead: false, orgId },
  });

  // Redis에 캐싱 (5분 TTL)
  try { await redisConnection.set(cacheKey, String(count), 'EX', 300); } catch { /* 무시 */ }

  return { ok: true, data: { count } };
}

/** PATCH /api/notifications/:id/read — 단건 읽음 처리 */
export async function markAsRead(request: FastifyRequest, reply: FastifyReply) {
  const recipientId = request.headers['x-user-id'] as string;
  const orgId = getOrgId(request.headers);
  const { id } = request.params as { id: string };
  const notification = await prisma.notification.findFirst({ where: { id, orgId } });
  if (!notification || notification.recipientId !== recipientId) {
    throw new AppError(404, '알림을 찾을 수 없습니다.', ErrorCode.NOTIFICATION_NOT_FOUND);
  }
  const updated = await prisma.notification.update({
    where: { id },
    data: { isRead: true },
  });

  // 읽지 않은 상태였던 경우만 DECR
  if (!notification.isRead) {
    try {
      const exists = await redisConnection.exists(`notif-unread:${orgId}:${recipientId}`);
      if (exists) await redisConnection.decr(`notif-unread:${orgId}:${recipientId}`);
    } catch { /* 무시 */ }
  }

  return { ok: true, data: updated };
}

/** PATCH /api/notifications/read-all — 전체 읽음 처리 */
export async function markAllAsRead(request: FastifyRequest, reply: FastifyReply) {
  const recipientId = request.headers['x-user-id'] as string;
  const orgId = getOrgId(request.headers);
  const result = await prisma.notification.updateMany({
    where: { recipientId, isRead: false, orgId },
    data: { isRead: true },
  });

  // 캐시 삭제 (0으로 리셋)
  try { await redisConnection.del(`notif-unread:${orgId}:${recipientId}`); } catch { /* 무시 */ }

  return { ok: true, data: { updated: result.count } };
}

// ─────────────────────────────────────────────
// 내부 API (서비스 간 호출용, requireAuth 미적용)
// ─────────────────────────────────────────────

/** POST /api/notifications/internal — 알림 생성 (requireInternalSecret 미들웨어로 보호) */
export async function createNotificationInternal(request: FastifyRequest, reply: FastifyReply) {
  const { recipientId, type, entityType, entityId, title, message, actorId, actorName, orgId } = request.body as any;

  const notification = await prisma.notification.create({
    data: {
      id: uuidv4(),
      recipientId,
      orgId: orgId || '',
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
    const exists = await redisConnection.exists(`notif-unread:${orgId || ''}:${recipientId}`);
    if (exists) await redisConnection.incr(`notif-unread:${orgId || ''}:${recipientId}`);
  } catch { /* 무시 */ }

  // Redis Pub/Sub: 실시간 알림 푸시
  try {
    redisConnection.publish(`notifications:${recipientId}`, JSON.stringify({
      id: notification.id, type, entityType, entityId, title, message, actorName: actorName ?? '',
      createdAt: notification.createdAt,
    }));
  } catch { /* 무시 */ }

  reply.code(201);
  return { ok: true, data: { id: notification.id } };
}
