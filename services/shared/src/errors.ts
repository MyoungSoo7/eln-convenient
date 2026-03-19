import { Request, Response, NextFunction } from 'express';

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

// ── async 핸들러 래퍼 (try-catch 누락 안전망) ────────────────
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

// ── 전역 에러 핸들러 ────────────────────────────────────────
export function globalErrorHandler(serviceName: string) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return (err: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AppError) {
      console.error(`[${serviceName}]`, { code: err.code, message: err.message });
      res.status(err.statusCode).json(
        buildErrorResponse(err.statusCode, err.message, err.code, err.details),
      );
      return;
    }

    console.error(`[${serviceName}] Unhandled error:`, err.stack ?? err);
    res.status(500).json(
      buildErrorResponse(500, '서버 내부 오류가 발생했습니다.', 'ERR_INTERNAL'),
    );
  };
}

// ── 프로세스 레벨 에러 핸들러 ───────────────────────────────
export function setupProcessHandlers(serviceName: string) {
  process.on('unhandledRejection', (reason) => {
    console.error(`[${serviceName}] Unhandled Rejection:`, reason);
  });

  process.on('uncaughtException', (err) => {
    console.error(`[${serviceName}] Uncaught Exception:`, err);
    process.exit(1);
  });
}
