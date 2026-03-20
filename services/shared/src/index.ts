export {
  AppError,
  asyncHandler,
  globalErrorHandler,
  setupProcessHandlers,
  buildErrorResponse,
  type ErrorResponse,
} from './errors';

export { ErrorCode, type ErrorCodeValue } from './error-codes';

export { validate } from './validate';

export { createLogger, createHttpLogger, type Logger } from './logger';

export {
  Permission,
  RoleName,
  RolePermissions,
  type PermissionValue,
  type RoleNameValue,
} from './permissions';

export { getOrgId, withOrgScope } from './org-scope';

export {
  requireAuth,
  requireRole,
  requirePermission,
  requireOwnerOrAdmin,
  requireInternalSecret,
} from './middleware-express';

export {
  requireAuthFastify,
  requireRoleFastify,
  requirePermissionFastify,
} from './middleware-fastify';

export {
  ServiceEventType,
  buildServiceEvent,
  type ServiceEvent,
  type UserDeletedPayload,
  type UserSuspendedPayload,
  type NoteDeletedPayload,
  type NoteSignedPayload,
} from './service-events';
