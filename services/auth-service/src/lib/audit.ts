/**
 * 감사 로그 기록 유틸리티
 * dual-write: Redis Stream `audit:events` (durable) + HTTP fast path.
 * 두 경로 모두 동일 eventId를 사용하여 consumer에서 멱등 처리됨.
 */
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { createLogger } from '@lab/shared';

const logger = createLogger('auth-audit');

const AUDIT_SERVICE_URL = process.env.SIGNATURE_SERVICE_URL || 'http://signature-audit-service:8003';
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || '';
const TIMEOUT_MS = 5_000;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 200;

// ── Redis Stream dual-write ──
const AUDIT_STREAM = 'audit:events';
const STREAM_MAXLEN = 10000;
let auditRedis: Redis | null = null;
function getAuditRedis(): Redis | null {
  if (auditRedis) return auditRedis;
  try {
    auditRedis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
    auditRedis.on('error', (err) => logger.error({ err: err.message }, '[audit-stream] Redis 오류'));
    return auditRedis;
  } catch (err) {
    logger.error({ err }, '[audit-stream] Redis 초기화 실패');
    return null;
  }
}
async function publishAuditStream(event: AuditLogParams): Promise<void> {
  const r = getAuditRedis();
  if (!r) return;
  try {
    const fields: string[] = [
      'eventId', String(event.eventId),
      'entityType', event.entityType,
      'entityId', event.entityId,
      'action', event.action,
      'actorId', event.actorId,
    ];
    if (event.orgId) fields.push('orgId', event.orgId);
    if (event.details) fields.push('details', JSON.stringify(event.details));
    if (event.ipAddress) fields.push('ipAddress', event.ipAddress);
    await r.xadd(AUDIT_STREAM, 'MAXLEN', '~', String(STREAM_MAXLEN), '*', ...fields);
  } catch (err: any) {
    logger.error({ err: err?.message }, '[audit-stream] XADD 실패');
  }
}

export interface AuditLogParams {
  eventId?: string;        // 멱등성 키 — 미지정 시 자동 생성
  entityType: string;
  entityId: string;
  action: string;
  actorId: string;
  orgId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}

/**
 * 감사 로그를 비동기로 기록 — dual-write:
 *   1) Redis Stream `audit:events` (durable backbone)
 *   2) HTTP /api/audit/internal (fast path, 3회 재시도)
 * 두 경로 모두 동일 eventId 사용 → consumer가 UNIQUE로 중복 차단.
 */
export async function writeAuditLog(params: AuditLogParams): Promise<void> {
  const event: AuditLogParams = { ...params, eventId: params.eventId ?? randomUUID() };

  // 1) Stream 발행 (실패해도 진행)
  await publishAuditStream(event);

  // 2) HTTP fast path
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${AUDIT_SERVICE_URL}/api/audit/internal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'x-internal-secret': INTERNAL_SECRET,
        },
        body: JSON.stringify(event),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.ok) return;
      lastErr = new Error(`HTTP ${res.status}: ${await res.text()}`);
    } catch (err) {
      lastErr = err;
    }
    if (attempt < MAX_RETRIES - 1) {
      await new Promise((r) => setTimeout(r, RETRY_BASE_MS * Math.pow(2, attempt)));
    }
  }
  // HTTP 최종 실패 — Stream consumer가 backbone이므로 손실은 아님
  logger.warn({ err: lastErr, event }, '[AUDIT_HTTP_FAIL] HTTP 경로 최종 실패 — Stream consumer가 처리 예정');
}
