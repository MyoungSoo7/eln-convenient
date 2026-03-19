import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { buildErrorResponse } from './errors';

// ── Zod 스키마 기반 유효성 검증 미들웨어 ────────────────────
interface ValidateSchemas {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

export function validate(schemas: ValidateSchemas) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schemas.params) req.params = schemas.params.parse(req.params) as typeof req.params;
      if (schemas.query) req.query = schemas.query.parse(req.query) as typeof req.query;
      if (schemas.body) req.body = schemas.body.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const details = err.issues.map((e) => `${e.path.join('.')}: ${e.message}`);
        res.status(400).json(
          buildErrorResponse(
            400,
            err.issues.map((e) => e.message).join(', '),
            'ERR_VALIDATION',
            details,
          ),
        );
        return;
      }
      next(err);
    }
  };
}
