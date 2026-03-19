import http from 'http';
import https from 'https';

const SIG_AUDIT_URL = process.env.SIGNATURE_AUDIT_SERVICE_URL || 'http://signature-audit-service:8003';
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || '';
const TIMEOUT_MS = 5000;

export interface NotificationEvent {
  recipientId: string;
  type: 'NOTE_LOCKED' | 'NOTE_SIGNED' | 'NOTE_UNLOCKED' | 'BOOKING_APPROVED';
  entityType: string;
  entityId: string;
  title: string;
  message: string;
  actorId: string;
  actorName?: string;
}

export async function callNotification(event: NotificationEvent): Promise<void> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(event);
    const url = new URL(`${SIG_AUDIT_URL}/api/notifications/internal`);
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
          'x-internal-secret': INTERNAL_SECRET,
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
            console.error('[NOTIFICATION_FAIL] 알림 서비스 응답 오류', {
              status: res.statusCode, body: data, event,
            });
            reject(new Error(`알림 서비스 응답 오류: ${res.statusCode}`));
          }
        });
      },
    );

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('알림 서비스 타임아웃'));
    });

    req.on('error', (err) => {
      console.error('[NOTIFICATION_FAIL] 알림 서비스 연결 실패', { err: err.message });
      reject(new Error(`알림 서비스 연결 실패: ${err.message}`));
    });

    req.write(body);
    req.end();
  });
}
