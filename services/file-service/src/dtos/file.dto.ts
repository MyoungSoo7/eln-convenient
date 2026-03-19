import { z } from 'zod';

// ─── Enums ───────────────────────────────────────
export const LinkedEntityTypeEnum = z.enum(['note', 'protocol', 'inventory']);
export type LinkedEntityType = z.infer<typeof LinkedEntityTypeEnum>;

// ─── 업로드 ──────────────────────────────────────
export const UploadFileBodySchema = z.object({
  linkedEntityType: LinkedEntityTypeEnum.optional(),
  linkedEntityId: z.string().optional(),
});
export type UploadFileDto = z.infer<typeof UploadFileBodySchema>;

export const PresignedUploadQuerySchema = z.object({
  filename: z.string().min(1, 'filename과 contentType 쿼리 파라미터가 필요합니다.'),
  contentType: z.string().min(1, 'filename과 contentType 쿼리 파라미터가 필요합니다.'),
  linkedEntityType: LinkedEntityTypeEnum.optional(),
  linkedEntityId: z.string().optional(),
});

// ─── 파일 조회/삭제 ──────────────────────────────
export const FileIdParamsSchema = z.object({
  id: z.string().uuid(),
});

// ─── Export ──────────────────────────────────────
export const ExportTypeEnum = z.enum(['pdf', 'zip']);

export const CreatePdfExportSchema = z.object({
  type: z.literal('pdf'),
  noteId: z.string().min(1, 'noteId가 필요합니다.'),
});

export const CreateZipExportSchema = z.object({
  type: z.literal('zip'),
  scope: z.enum(['all', 'project', 'selected'], {
    message: 'scope는 all | project | selected 중 하나입니다.',
  }),
  projectId: z.string().optional(),
  noteIds: z.array(z.string()).optional(),
});

export const ExportStatusEnum = z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']);

export const ListExportsQuerySchema = z.object({
  status: ExportStatusEnum.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const JobIdParamsSchema = z.object({
  jobId: z.string().uuid(),
});

export interface PresignedUploadResponseDto {
  fileId: string;
  key: string;
  uploadUrl: string;
  expiresAt: string;
}
