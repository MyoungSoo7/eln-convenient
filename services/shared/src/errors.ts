import type { Logger } from './logger';
import type { MinimalReply } from './middleware';

// ── 통일된 에러 응답 인터페이스 ─────────────────────────────
export interface ErrorResponse {
  ok: false;
  error: string;
  code: string;
  details?: string[];
}

// ── 커스텀 에러 클래스 ──────────────────────────────────────
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: string[];

  constructor(statusCode: number, message: string, code?: string, details?: string[]) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code ?? `ERR_${statusCode}`;
    this.details = details;
  }
}

// ── 에러 응답 빌더 ──────────────────────────────────────────
export function buildErrorResponse(
  statusCode: number,
  message: string,
  code?: string,
  details?: string[],
): ErrorResponse {
  const resp: ErrorResponse = {
    ok: false,
    error: message,
    code: code ?? `ERR_${statusCode}`,
  };
  if (details && details.length > 0) {
    resp.details = details;
  }
  return resp;
}

// ── Fastify 전역 에러 핸들러 빌더 ───────────────────────────
interface FastifyLikeError extends Error {
  statusCode?: number;
  validation?: { message?: string }[];
}

export function buildFastifyErrorHandler(logger?: Logger) {
  return (error: FastifyLikeError, _request: unknown, reply: MinimalReply) => {
    const statusCode = error.statusCode ?? 500;

    // AppError (비즈니스 로직 에러)
    if (error instanceof AppError) {
      if (logger) {
        logger.warn({ code: error.code, details: error.details }, error.message);
      }
      return reply.code(error.statusCode).send(
        buildErrorResponse(error.statusCode, error.message, error.code, error.details),
      );
    }

    // Fastify 스키마 검증 실패 (400)
    if (error.validation) {
      const details = error.validation.map((v) => v.message ?? String(v));
      return reply.code(400).send(
        buildErrorResponse(400, '요청 데이터가 올바르지 않습니다.', 'ERR_VALIDATION', details),
      );
    }

    if (logger) {
      logger.error({ err: error }, 'Unhandled error');
    }
    return reply.code(statusCode).send(
      buildErrorResponse(statusCode, statusCode === 500 ? '서버 내부 오류가 발생했습니다.' : error.message, `ERR_${statusCode}`),
    );
  };
}

// ── 프로세스 레벨 에러 핸들러 ───────────────────────────────

interface SetupProcessOptions {
  /** prisma.$disconnect 등 정리 함수 — SIGTERM/SIGINT 시 호출 */
  onShutdown?: () => Promise<void>;
}

export function setupProcessHandlers(serviceName: string, logger?: Logger, opts?: SetupProcessOptions) {
  process.on('unhandledRejection', (reason) => {
    if (logger) {
      logger.fatal({ reason }, 'Unhandled Rejection');
    } else {
      console.error(`[${serviceName}] Unhandled Rejection:`, reason);
    }
  });

  process.on('uncaughtException', (err) => {
    if (logger) {
      logger.fatal({ err }, 'Uncaught Exception');
    } else {
      console.error(`[${serviceName}] Uncaught Exception:`, err);
    }
    process.exit(1);
  });

  // ── Graceful Shutdown ──
  if (opts?.onShutdown) {
    const shutdown = async (signal: string) => {
      if (logger) {
        logger.info({ signal }, 'Graceful shutdown 시작');
      } else {
        console.log(`[${serviceName}] ${signal} 수신 — shutdown 시작`);
      }
      try {
        await opts.onShutdown!();
      } catch (err) {
        if (logger) {
          logger.error({ err }, 'Shutdown 중 오류');
        } else {
          console.error(`[${serviceName}] Shutdown 오류:`, err);
        }
      }
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }
}
