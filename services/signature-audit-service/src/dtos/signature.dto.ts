import { z } from 'zod';

// ── Signature schemas ──

export const SignNoteParamsSchema = z.object({
  noteId: z.string().uuid('noteId must be a valid UUID'),
});

export const SignNoteBodySchema = z.object({
  password: z.string().min(1),
  comment: z.string().optional(),
});

export const RevokeSignatureParamsSchema = z.object({
  signatureId: z.string().uuid('signatureId must be a valid UUID'),
});

export const RevokeSignatureBodySchema = z.object({
  reason: z.string().min(1, 'reason is required'),
});

export const NoteIdParamsSchema = z.object({
  noteId: z.string().uuid('noteId must be a valid UUID'),
});

// ── Audit schemas ──

export const CreateAuditLogInternalSchema = z.object({
  entityType: z.string().min(1, 'entityType is required'),
  entityId: z.string().min(1, 'entityId is required'),
  action: z.string().min(1, 'action is required'),
  actorId: z.string().min(1, 'actorId is required'),
  details: z.record(z.string(), z.unknown()).optional(),
  ipAddress: z.string().optional(),
});

export const ListAuditLogsQuerySchema = z.object({
  entityId: z.string().optional(),
  entityType: z.string().optional(),
  actorId: z.string().optional(),
  action: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const AuditIdParamsSchema = z.object({
  id: z.string().min(1, 'id is required'),
});

// ── Export schemas ──

export const ExportPdfParamsSchema = z.object({
  noteId: z.string().min(1, 'noteId is required'),
});

export const ExportZipBodySchema = z.object({
  noteIds: z.array(z.string().min(1)).min(1, 'noteIds must contain at least one item'),
});

export const ExportReportBodySchema = z.object({
  noteIds: z.array(z.string().min(1)).min(1, 'noteIds must contain at least one item'),
});

export const ExportStatusParamsSchema = z.object({
  jobId: z.string().min(1, 'jobId is required'),
});

// ── Notification schemas ──

export const ListNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  isRead: z.enum(['true', 'false']).optional(),
});

export const NotificationIdParamsSchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
});

export const CreateNotificationInternalSchema = z.object({
  recipientId: z.string().min(1, 'recipientId is required'),
  type: z.enum(['NOTE_LOCKED', 'NOTE_SIGNED', 'NOTE_UNLOCKED', 'BOOKING_APPROVED']),
  entityType: z.string().min(1, 'entityType is required'),
  entityId: z.string().min(1, 'entityId is required'),
  title: z.string().min(1, 'title is required'),
  message: z.string().min(1, 'message is required'),
  actorId: z.string().min(1, 'actorId is required'),
  actorName: z.string().optional(),
  orgId: z.string().min(1, 'orgId is required'),
  idempotencyKey: z.string().min(1).optional(),
});

// ── Compliance schemas ──

export const ComplianceListQuerySchema = z.object({
  status: z.enum(['draft', 'in_progress', 'signed', 'locked']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
