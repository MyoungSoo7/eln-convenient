import { FastifyInstance } from 'fastify';
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

/**
 * SSE (Server-Sent Events) 엔드포인트
 * - /api/events/exports  : 내보내기 작업 상태 실시간 전달
 * - /api/events/notifications : 알림 실시간 전달
 *
 * 각 클라이언트 연결마다 전용 Redis subscriber를 생성하여 해당 사용자의 이벤트만 전달.
 */
export async function registerSSE(app: FastifyInstance) {

  // ── 내보내기 상태 SSE ──
  app.get('/api/events/exports', async (request, reply) => {
    const userId = (request.headers as any)['x-user-id'] as string;
    if (!userId) {
      return reply.status(401).send({ ok: false, error: '인증이 필요합니다.' });
    }

    const raw = reply.raw;
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    raw.write(':ok\n\n');

    let sub: Redis | null = null;
    try {
      sub = new Redis(REDIS_URL, { lazyConnect: false, maxRetriesPerRequest: 1 });

      sub.subscribe('export-status', (err) => {
        if (err) {
          console.error('[sse/exports] Redis subscribe 실패:', err.message);
          raw.end();
        }
      });

      sub.on('message', (_channel: string, data: string) => {
        try {
          const parsed = JSON.parse(data);
          // 해당 사용자의 이벤트만 전달
          if (parsed.requestedBy === userId) {
            raw.write(`event: export-status\ndata: ${data}\n\n`);
          }
        } catch { /* 무시 */ }
      });
    } catch {
      raw.end();
      return;
    }

    // Keep-alive (30초마다)
    const heartbeat = setInterval(() => {
      raw.write(':heartbeat\n\n');
    }, 30_000);

    // 연결 종료 시 정리
    request.raw.on('close', () => {
      clearInterval(heartbeat);
      if (sub) {
        sub.unsubscribe().catch(() => {});
        sub.disconnect();
      }
    });

    // Fastify가 자동으로 reply를 닫지 않도록 hijack
    await reply.hijack();
  });

  // ── 알림 실시간 SSE ──
  app.get('/api/events/notifications', async (request, reply) => {
    const userId = (request.headers as any)['x-user-id'] as string;
    if (!userId) {
      return reply.status(401).send({ ok: false, error: '인증이 필요합니다.' });
    }

    const raw = reply.raw;
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    raw.write(':ok\n\n');

    let sub: Redis | null = null;
    try {
      sub = new Redis(REDIS_URL, { lazyConnect: false, maxRetriesPerRequest: 1 });

      // 사용자별 채널 구독
      sub.subscribe(`notifications:${userId}`, (err) => {
        if (err) {
          console.error('[sse/notifications] Redis subscribe 실패:', err.message);
          raw.end();
        }
      });

      sub.on('message', (_channel: string, data: string) => {
        raw.write(`event: notification\ndata: ${data}\n\n`);
      });
    } catch {
      raw.end();
      return;
    }

    const heartbeat = setInterval(() => {
      raw.write(':heartbeat\n\n');
    }, 30_000);

    request.raw.on('close', () => {
      clearInterval(heartbeat);
      if (sub) {
        sub.unsubscribe().catch(() => {});
        sub.disconnect();
      }
    });

    await reply.hijack();
  });

  app.log.info('SSE 이벤트 엔드포인트 등록 완료: /api/events/exports, /api/events/notifications');
}
