export {
  AppError,
  setupProcessHandlers,
  buildErrorResponse,
  buildFastifyErrorHandler,
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
  requireAuthFastify,
  requireRoleFastify,
  requirePermissionFastify,
  requireOwnerOrAdminFastify,
  requireInternalSecretFastify,
  type MinimalRequest,
  type MinimalReply,
} from './middleware';

export {
  ServiceEventType,
  buildServiceEvent,
  type ServiceEvent,
  type UserDeletedPayload,
  type UserSuspendedPayload,
  type NoteDeletedPayload,
  type NoteSignedPayload,
} from './service-events';
