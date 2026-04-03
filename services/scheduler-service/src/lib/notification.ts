const SIG_AUDIT_URL = process.env.SIGNATURE_AUDIT_SERVICE_URL || 'http://signature-audit-service:8003';
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || '';
const TIMEOUT_MS = 5000;

export interface NotificationEvent {
  recipientId: string;
  orgId: string;
  type: 'NOTE_LOCKED' | 'NOTE_SIGNED' | 'NOTE_UNLOCKED' | 'BOOKING_APPROVED';
  entityType: string;
  entityId: string;
  title: string;
  message: string;
  actorId: string;
  actorName?: string;
}

export async function callNotification(event: NotificationEvent): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${SIG_AUDIT_URL}/api/notifications/internal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'x-internal-secret': INTERNAL_SECRET,
      },
      body: JSON.stringify(event),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text();
      console.error('[NOTIFICATION_FAIL] 알림 서비스 응답 오류', { status: res.status, body });
    }
  } catch (err: any) {
    console.error('[NOTIFICATION_FAIL] 알림 서비스 연결 실패', { err: err.message });
  } finally {
    clearTimeout(timer);
  }
}
