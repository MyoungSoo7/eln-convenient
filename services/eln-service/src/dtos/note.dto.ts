/**
 * 연구노트 서비스 DTO (Zod schemas)
 *
 * 노트/템플릿 상태 흐름:
 *   draft ↔ in_progress → signed (서명)
 *                       → locked  (잠금)
 *   locked → draft  (관리자 잠금 해제)
 */
import { z } from 'zod';

// ─── Enums ───────────────────────────────────────
export const NoteTypeEnum = z.enum(['note', 'template']);
export type NoteType = z.infer<typeof NoteTypeEnum>;

export const NoteStatusEnum = z.enum(['draft', 'in_progress', 'signed', 'locked']);
export type NoteStatus = z.infer<typeof NoteStatusEnum>;

// ─── 섹션 ────────────────────────────────────────
export const SectionSchema = z.object({
  type: z.string().min(1),
  title: z.string().min(1),
  content: z.string(),
  order: z.number().int().optional(),
});
export type SectionDto = z.infer<typeof SectionSchema>;

// ─── 노트 CRUD ──────────────────────────────────
export const CreateNoteSchema = z.object({
  title: z.string().min(1),
  type: NoteTypeEnum.optional(),
  content: z.string().optional(),
  sections: z.array(SectionSchema).optional(),
  templateId: z.string().optional(),
  tags: z.array(z.string()).default([]),
});
export type CreateNoteDto = z.infer<typeof CreateNoteSchema>;

export const UpdateNoteSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().optional(),
  sections: z.array(SectionSchema).optional(),
  tags: z.array(z.string()).optional(),
  changeSummary: z.string().optional(),
});
export type UpdateNoteDto = z.infer<typeof UpdateNoteSchema>;

// ─── 상태 관리 ───────────────────────────────────
export const ChangeStatusSchema = z.object({
  status: NoteStatusEnum,
});
export type ChangeStatusDto = z.infer<typeof ChangeStatusSchema>;

export const AdminUnlockSchema = z.object({
  adminPassword: z.string().min(1),
  reason: z.string().optional(),
});
export type AdminUnlockDto = z.infer<typeof AdminUnlockSchema>;

// ─── 링크 ────────────────────────────────────────
export const AddLinkSchema = z.object({
  targetType: z.enum(['inventory', 'equipment', 'template', 'note']),
  targetId: z.string().min(1),
  label: z.string().optional(),
});
export type AddLinkDto = z.infer<typeof AddLinkSchema>;

// ─── 템플릿 ──────────────────────────────────────
export const CreateTemplateSchema = z.object({
  title: z.string().min(1),
  category: z.string().optional(),
  description: z.string().optional(),
  content: z.string().optional(),
  sections: z.array(SectionSchema).optional(),
  tags: z.array(z.string()).default([]),
  isPublic: z.boolean().default(false),
});
export type CreateTemplateDto = z.infer<typeof CreateTemplateSchema>;

export const UpdateTemplateSchema = z.object({
  title: z.string().min(1).optional(),
  category: z.string().optional(),
  description: z.string().optional(),
  content: z.string().optional(),
  sections: z.array(SectionSchema).optional(),
  tags: z.array(z.string()).optional(),
  isPublic: z.boolean().optional(),
});
export type UpdateTemplateDto = z.infer<typeof UpdateTemplateSchema>;

// ─── 쿼리 스키마 ────────────────────────────────
export const NoteIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const NotesBatchBodySchema = z.object({
  ids: z.array(z.string()).min(1).max(500),
});

export const NoteStatsQuerySchema = z.object({
  type: NoteTypeEnum.default('note'),
});

export const GetTagsQuerySchema = z.object({
  type: NoteTypeEnum.default('note'),
});

/**
 * 허용 상태 전환 맵
 * in_progress → signed: 서명 서비스가 PATCH /notes/:id/status 호출
 */
export const ALLOWED_STATUS_TRANSITIONS: Record<NoteStatus, NoteStatus[]> = {
  draft:       ['in_progress'],
  in_progress: ['draft', 'locked'],
  signed:      [],              // 서명 완료는 불변
  locked:      [],              // 관리자 잠금 해제는 별도 엔드포인트
};

// 서명 서비스 내부 호출 전용 전환 (x-user-role: 'system' 필요)
export const SYSTEM_STATUS_TRANSITIONS: Record<NoteStatus, NoteStatus[]> = {
  draft:       ['in_progress'],
  in_progress: ['draft', 'signed', 'locked'],
  signed:      [],
  locked:      [],
};
