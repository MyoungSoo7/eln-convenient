import { ZodSchema, ZodError } from 'zod';
import { buildErrorResponse } from './errors';
import type { MinimalRequest, MinimalReply } from './middleware';

// ── Zod 스키마 기반 유효성 검증 preHandler ────────────────────
interface ValidateSchemas {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

interface ParseableRequest extends MinimalRequest {
  body?: unknown;
  query?: unknown;
  params?: unknown;
}

export function validate(schemas: ValidateSchemas) {
  return async (request: ParseableRequest, reply: MinimalReply): Promise<void> => {
    try {
      if (schemas.params) request.params = schemas.params.parse(request.params);
      if (schemas.query) request.query = schemas.query.parse(request.query);
      if (schemas.body) request.body = schemas.body.parse(request.body);
    } catch (err) {
      if (err instanceof ZodError) {
        const details = err.issues.map((e) => `${e.path.join('.')}: ${e.message}`);
        reply.code(400).send(
          buildErrorResponse(
            400,
            err.issues.map((e) => e.message).join(', '),
            'ERR_VALIDATION',
            details,
          ),
        );
      } else {
        throw err;
      }
    }
  };
}
