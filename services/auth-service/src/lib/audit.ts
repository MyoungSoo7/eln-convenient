/**
 * 감사 로그 기록 유틸리티
 * signature-audit-service의 내부 API를 호출하여 감사 로그 생성
 */

const AUDIT_SERVICE_URL = process.env.SIGNATURE_SERVICE_URL || 'http://signature-audit-service:8003';
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || '';

interface AuditLogParams {
  entityType: string;
  entityId: string;
  action: string;
  actorId: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}

/**
 * 감사 로그를 비동기로 기록 (실패 시 콘솔 경고, 메인 플로우 차단 안 함)
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
    });
    if (!res.ok) {
      console.warn('[audit] 감사 로그 기록 실패:', res.status, await res.text());
    }
  } catch (err) {
    console.warn('[audit] 감사 로그 전송 실패:', err);
  }
}
