const SIG_AUDIT_URL = process.env.SIGNATURE_AUDIT_SERVICE_URL || 'http://signature-audit-service:8003';
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || '';
const TIMEOUT_MS = 5000;
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 500; // 500ms → 1s → 2s

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
  /** 재시도 중복 방지 키 — 같은 키로 여러 번 POST 해도 알림은 1개만 생성됨 */
  idempotencyKey?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function postOnce(event: NotificationEvent): Promise<{ ok: boolean; status?: number; body?: string; err?: string }> {
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
      const body = await res.text().catch(() => '');
      return { ok: false, status: res.status, body };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, err: err?.message || String(err) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 알림 서비스 호출 (지수 백오프 재시도 3회).
 * idempotencyKey를 동봉해야 중복 알림이 생성되지 않음.
 */
export async function callNotification(event: NotificationEvent): Promise<void> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const result = await postOnce(event);
    if (result.ok) {
      if (attempt > 1) {
        console.info('[NOTIFICATION_OK] 재시도 성공', { attempt, idempotencyKey: event.idempotencyKey });
      }
      return;
    }

    // 4xx (검증 실패 등)는 재시도해도 의미 없음 — 즉시 종료
    if (result.status && result.status >= 400 && result.status < 500) {
      console.error('[NOTIFICATION_FAIL] 4xx 응답 — 재시도 중단', {
        status: result.status,
        body: result.body,
        idempotencyKey: event.idempotencyKey,
      });
      return;
    }

    if (attempt === MAX_ATTEMPTS) {
      console.error('[NOTIFICATION_FAIL] 재시도 모두 실패', {
        attempts: MAX_ATTEMPTS,
        lastStatus: result.status,
        lastErr: result.err,
        lastBody: result.body,
        idempotencyKey: event.idempotencyKey,
      });
      return;
    }

    const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt - 1); // 500 → 1000 → 2000
    console.warn('[NOTIFICATION_RETRY] 재시도 대기', {
      attempt,
      nextBackoffMs: backoff,
      lastStatus: result.status,
      lastErr: result.err,
    });
    await sleep(backoff);
  }
}
