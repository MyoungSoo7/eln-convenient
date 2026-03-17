// services/eln-service/src/lib/audit.ts
import http from 'http';
import https from 'https';

const SIG_AUDIT_URL = process.env.SIGNATURE_AUDIT_SERVICE_URL || 'http://signature-audit-service:8003';
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || '';
const TIMEOUT_MS = 5000;

export class AuditServiceError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'AuditServiceError';
  }
}

export interface AuditEvent {
  entityType: string;
  entityId: string;
  action: string;
  actorId: string;
  details?: object;
  ipAddress?: string;
}

export async function callAuditLog(event: AuditEvent): Promise<void> {
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
          'Content-Type': 'application/json',
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
