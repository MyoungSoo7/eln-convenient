/**
 * 감사 로그 기록 유틸리티
 * signature-audit-service의 내부 API를 호출하여 감사 로그 생성
 */
import { createLogger } from '@lab/shared';

const logger = createLogger('auth-audit');

const AUDIT_SERVICE_URL = process.env.SIGNATURE_SERVICE_URL || 'http://signature-audit-service:8003';
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || '';
const TIMEOUT_MS = 5_000;

export interface AuditLogParams {
  entityType: string;
  entityId: string;
  action: string;
  actorId: string;
  orgId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}

/**
 * 감사 로그를 비동기로 기록.
 * 실패 시 구조화 경고 로그를 남기되 메인 플로우는 차단하지 않는다.
 */
export async function writeAuditLog(params: AuditLogParams): Promise<void> {
  try {
    const res = await fetch(`${AUDIT_SERVICE_URL}/api/audit/internal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'x-internal-secret': INTERNAL_SECRET,
      },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      logger.warn({ status: res.status, body: await res.text(), event: params }, '[AUDIT_FAIL] 감사 로그 기록 실패');
    }
  } catch (err) {
    logger.warn({ err, event: params }, '[AUDIT_FAIL] 감사 로그 전송 실패');
  }
}
