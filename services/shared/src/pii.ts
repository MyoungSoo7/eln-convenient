/**
 * PII / 민감정보 마스킹 헬퍼.
 *
 * 분류 정책: .claude/rules/11-pii.md 참조.
 *
 * - L2(인증): 키 자체를 결과에서 제거
 * - L1(식별자): email/phone은 부분 마스킹, 그 외는 그대로
 * - L0(공개): 그대로 통과
 */

/** L2 — 결과에서 통째로 제거할 키 (대소문자 무시, 부분 일치) */
const REDACT_KEY_PATTERNS: RegExp[] = [
  /password/i,
  /passwd/i,
  /secret/i,
  /token/i,
  /apikey/i,
  /api_key/i,
  /authorization/i,
  /cookie/i,
  /privatekey/i,
  /private_key/i,
  /jwt/i,
  /refresh/i,
];

/** 이 키들은 부분 마스킹을 적용 */
const PARTIAL_MASK_KEYS = new Set(['email', 'phone', 'mobile', 'tel']);

/** 이메일 부분 마스킹: `john.doe@example.com` → `jo***@example.com` */
export function maskEmail(email: string): string {
  if (!email || typeof email !== 'string') return email;
  const at = email.indexOf('@');
  if (at < 0) return '***';
  const local = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length <= 2) return `**${domain}`;
  return `${local.slice(0, 2)}***${domain}`;
}

/** 전화번호 부분 마스킹: `01012341234` 또는 `010-1234-1234` → `010-****-1234` */
export function maskPhone(phone: string): string {
  if (!phone || typeof phone !== 'string') return phone;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) return '***';
  const head = digits.slice(0, 3);
  const tail = digits.slice(-4);
  return `${head}-****-${tail}`;
}

/**
 * 객체를 재귀적으로 순회하며 PII 마스킹 적용.
 * - 원본 객체를 변경하지 않고 새 객체를 반환
 * - 순환 참조는 처리하지 않음 (감사로그 details 용도이므로 평면 객체 가정)
 */
export function maskPII<T = unknown>(input: T): T {
  return _mask(input) as T;
}

function _mask(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(_mask);
  if (typeof value !== 'object') return value;

  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    // L2 — 키 자체를 통째로 제거
    if (REDACT_KEY_PATTERNS.some((re) => re.test(key))) {
      out[key] = '[REDACTED]';
      continue;
    }
    // L1 — 알려진 키는 부분 마스킹
    const lk = key.toLowerCase();
    if (PARTIAL_MASK_KEYS.has(lk) && typeof raw === 'string') {
      out[key] = lk === 'email' ? maskEmail(raw) : maskPhone(raw);
      continue;
    }
    // 중첩 객체/배열은 재귀
    out[key] = _mask(raw);
  }
  return out;
}
