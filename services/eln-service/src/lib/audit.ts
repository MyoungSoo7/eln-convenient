// services/eln-service/src/lib/audit.ts
import http from 'http';
import https from 'https';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';

const SIG_AUDIT_URL = process.env.SIGNATURE_AUDIT_SERVICE_URL || 'http://signature-audit-service:8003';
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || '';
const TIMEOUT_MS = 5000;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 200;

// ── Redis Stream dual-write (감사로그 0건 손실 보장) ──
const AUDIT_STREAM = 'audit:events';
const STREAM_MAXLEN = 10000;
let auditRedis: Redis | null = null;
function getAuditRedis(): Redis | null {
  if (auditRedis) return auditRedis;
  try {
    auditRedis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: false,
    });
    auditRedis.on('error', (err) => {
      console.error('[audit-stream] Redis 오류:', err.message);
    });
    return auditRedis;
  } catch (err) {
    console.error('[audit-stream] Redis 초기화 실패:', err);
    return null;
  }
}

/** Redis Stream에 audit 이벤트 발행 — 실패해도 throw 안 함 (HTTP 경로가 fallback) */
async function publishAuditStream(event: AuditEvent): Promise<void> {
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
    console.error('[audit-stream] XADD 실패:', err?.message);
  }
}

export class AuditServiceError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'AuditServiceError';
  }
}

export interface AuditEvent {
  eventId?: string;        // 멱등성 키 — 미지정 시 자동 생성
  entityType: string;
  entityId: string;
  action: string;
  actorId: string;
  orgId?: string;
  details?: object;
  ipAddress?: string;
}

/**
 * 감사 로그 호출 — dual-write:
 *  1) Redis Stream `audit:events`에 발행 (durable backbone — 손실 0건 보장)
 *  2) HTTP /api/audit/internal 호출 (low-latency fast path, 실패 시 3회 재시도)
 *
 * 두 경로 모두 동일 eventId 사용 → consumer가 UNIQUE로 중복 차단.
 * Stream은 fire-and-forget이고 throw하지 않으며, HTTP 최종 실패 시에만 예외 전파.
 */
export async function callAuditLog(event: AuditEvent): Promise<void> {
  const eventWithId: AuditEvent = { ...event, eventId: event.eventId ?? randomUUID() };

  // 1) Stream 발행 — 실패해도 throw 없음
  await publishAuditStream(eventWithId);

  // 2) HTTP fast path — 재시도 후 최종 실패 시 throw (호출 측이 catch하여 .catch(console.error)로 흡수)
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      await callAuditLogOnce(eventWithId);
      return;
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, RETRY_BASE_MS * Math.pow(2, attempt)));
      }
    }
  }
  // HTTP 실패해도 Stream이 backbone이므로 audit-consumer가 결국 처리한다.
  console.error('[AUDIT_HTTP_FAIL] HTTP 경로 최종 실패 — Stream consumer가 처리 예정', { event: eventWithId, err: String(lastErr) });
}

function callAuditLogOnce(event: AuditEvent): Promise<void> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(event);
    const url = new URL(`${SIG_AUDIT_URL}/api/audit/internal`);
    const lib = url.protocol === 'https:' ? https : http;

    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Length': Buffer.byteLength(body),
          'x-internal-secret': INTERNAL_SECRET, // 빈 문자열 포함 항상 전송 (수신측이 미설정 여부 판단)
        },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            console.error('[AUDIT_FAIL] audit 서비스 응답 오류', {
              status: res.statusCode,
              body: data,
              event,
            });
            reject(new AuditServiceError(`audit 서비스 응답 오류: ${res.statusCode}`));
          }
        });
      },
    );

    req.on('timeout', () => {
      req.destroy();
      console.error('[AUDIT_FAIL] audit 서비스 타임아웃', { event });
      reject(new AuditServiceError('audit 서비스 타임아웃'));
    });

    req.on('error', (err) => {
      console.error('[AUDIT_FAIL] audit 서비스 연결 실패', { err: err.message, event });
      reject(new AuditServiceError(`audit 서비스 연결 실패: ${err.message}`));
    });

    req.write(body);
    req.end();
  });
}
