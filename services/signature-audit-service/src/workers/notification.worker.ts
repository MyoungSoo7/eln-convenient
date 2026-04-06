import { Worker, Job } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import { NotificationJobPayload, redisConnection } from '../lib/queue';
import prisma from '../lib/prisma';
import { createLogger } from '@lab/shared';

const logger = createLogger('notification-worker');

/**
 * 알림 잡 처리기:
 * 1) Notification 테이블 INSERT (idempotencyKey로 중복 방지)
 * 2) Redis 미읽음 카운트 INCR (캐시 존재 시)
 * 3) Redis Pub/Sub publish — SSE 실시간 전달
 *
 * 실패 시 BullMQ가 자동 재시도 (3회, 지수 백오프 2→4→8초).
 */
async function processNotificationJob(job: Job<NotificationJobPayload>): Promise<void> {
  const {
    recipientId,
    orgId,
    type,
    entityType,
    entityId,
    title,
    message,
    actorId,
    actorName,
    idempotencyKey,
  } = job.data;

  logger.info({ jobId: job.id, type, recipientId, idempotencyKey }, '알림 잡 처리 시작');

  // 1. 멱등성 체크
  if (idempotencyKey) {
    const existing = await prisma.notification.findUnique({ where: { idempotencyKey } });
    if (existing) {
      logger.info({ jobId: job.id, idempotencyKey, existingId: existing.id }, '중복 알림 — 스킵');
      // 이미 처리되었으므로 publish만 재실행하지 않고 종료
      return;
    }
  }

  // 2. DB INSERT
  let notification;
  try {
    notification = await prisma.notification.create({
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
        idempotencyKey: idempotencyKey ?? null,
      },
    });
  } catch (err: any) {
    // 동시 경쟁: 같은 idempotencyKey로 이미 INSERT된 경우
    if (idempotencyKey && err?.code === 'P2002') {
      logger.info({ jobId: job.id, idempotencyKey }, '동시 INSERT 충돌 — 기존 레코드 사용');
      const existing = await prisma.notification.findUnique({ where: { idempotencyKey } });
      if (existing) {
        notification = existing;
      } else {
        throw err;
      }
    } else {
      throw err; // BullMQ가 재시도
    }
  }

  // 3. Redis 미읽음 카운트 증가 (best-effort)
  try {
    const exists = await redisConnection.exists(`notif-unread:${orgId || ''}:${recipientId}`);
    if (exists) await redisConnection.incr(`notif-unread:${orgId || ''}:${recipientId}`);
  } catch (err: any) {
    logger.warn({ err: err.message }, '미읽음 카운트 갱신 실패 (무시)');
  }

  // 4. Redis Pub/Sub — SSE 실시간 전달 (best-effort)
  try {
    await redisConnection.publish(
      `notifications:${recipientId}`,
      JSON.stringify({
        id: notification.id,
        type,
        entityType,
        entityId,
        title,
        message,
        actorName: actorName ?? '',
        orgId: orgId || '',
        createdAt: notification.createdAt,
      }),
    );
  } catch (err: any) {
    logger.warn({ err: err.message }, 'Redis pub/sub 실패 (DB는 저장됨)');
  }

  logger.info({ jobId: job.id, notificationId: notification.id, type }, '알림 잡 처리 완료');
}

/** 워커 인스턴스 */
export const notificationWorker = new Worker<NotificationJobPayload>(
  'labnote-notification',
  processNotificationJob,
  {
    connection: redisConnection,
    concurrency: 5,
  },
);

notificationWorker.on('failed', (job, err) => {
  logger.error(
    { jobId: job?.id, attemptsMade: job?.attemptsMade, err: err.message },
    '[notification-worker] 잡 실패',
  );
});

notificationWorker.on('completed', (job) => {
  logger.debug({ jobId: job.id }, '[notification-worker] 잡 완료');
});
