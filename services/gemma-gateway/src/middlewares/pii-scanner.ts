import { FastifyReply, FastifyRequest } from 'fastify';
import { createLogger, maskPII } from '@lab/shared';

const logger = createLogger('gemma-gateway');

/**
 * PII 스캐너 미들웨어
 *
 * 사내 데이터가 외부 백엔드(AWS vLLM, OpenAI)로 나가기 전에
 * 메시지 내용에서 PII 패턴을 검출해 경고 로그를 남긴다.
 *
 * 현재는 **감지 + 로그** 모드 (차단은 향후 정책에 따라 활성화).
 * PII_SCANNER_MODE=block 으로 설정하면 PII 포함 요청을 차단한다.
 */

// 한국 개인정보 패턴
const PII_PATTERNS = [
  { name: 'email', pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  { name: 'phone_kr', pattern: /01[016789]-?\d{3,4}-?\d{4}/g },
  { name: 'rrn_kr', pattern: /\d{6}-?[1-4]\d{6}/g }, // 주민등록번호
  { name: 'card_number', pattern: /\d{4}-?\d{4}-?\d{4}-?\d{4}/g },
];

interface ChatMessage {
  role: string;
  content?: string;
}

function scanForPII(text: string): { name: string; count: number }[] {
  const findings: { name: string; count: number }[] = [];
  for (const { name, pattern } of PII_PATTERNS) {
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      findings.push({ name, count: matches.length });
    }
  }
  return findings;
}

export async function piiScannerHook(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const body = request.body as Record<string, unknown> | undefined;
  if (!body) return;

  // chat/completions 메시지 스캔
  const messages = body.messages as ChatMessage[] | undefined;
  const input = body.input as string | string[] | undefined;

  let textToScan = '';

  if (messages) {
    textToScan = messages
      .filter((m) => typeof m.content === 'string')
      .map((m) => m.content)
      .join('\n');
  } else if (typeof input === 'string') {
    textToScan = input;
  } else if (Array.isArray(input)) {
    textToScan = input.join('\n');
  }

  if (!textToScan) return;

  const findings = scanForPII(textToScan);
  if (findings.length === 0) return;

  const mode = process.env.PII_SCANNER_MODE || 'warn';

  logger.warn(
    {
      findings,
      model: body.model,
      userId: request.headers['x-user-id'],
      mode,
    },
    'PII detected in outbound request',
  );

  if (mode === 'block') {
    reply.code(422).send({
      ok: false,
      error: '요청에 개인정보(PII)가 포함되어 있습니다. 마스킹 후 재시도해주세요.',
      code: 'PII_DETECTED',
      findings: findings.map((f) => f.name),
    });
  }
}
