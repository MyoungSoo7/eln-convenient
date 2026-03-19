import { z } from 'zod';

// ─── Enums ───────────────────────────────────────
export const ItemTypeEnum = z.enum([
  'reagent', 'sample', 'equipment', 'consumable',
  'antibody', 'plasmid', 'cell_line',
  'output', 'license', 'infrastructure', 'other',
]);
export type ItemType = z.infer<typeof ItemTypeEnum>;
/** @deprecated Use ItemTypeEnum.options instead */
export const VALID_ITEM_TYPES = ItemTypeEnum.options;

export const ItemStatusEnum = z.enum(['available', 'in_use', 'depleted', 'expired', 'disposed', 'maintenance']);
export type ItemStatus = z.infer<typeof ItemStatusEnum>;

export const ChangeTypeEnum = z.enum(['in', 'out', 'adjust', 'status_change']);
export type ChangeType = z.infer<typeof ChangeTypeEnum>;

export const SortFieldEnum = z.enum(['name', 'createdAt', 'updatedAt', 'quantity', 'expiryDate']);
export type SortField = z.infer<typeof SortFieldEnum>;

export const SortOrderEnum = z.enum(['asc', 'desc']);
export type SortOrder = z.infer<typeof SortOrderEnum>;

// ─── 아이템 CRUD ─────────────────────────────────
export const CreateItemSchema = z.object({
  name: z.string().min(1, 'name과 type은 필수입니다.'),
  type: ItemTypeEnum,
  category: z.string().optional(),
  quantity: z.number().optional(),
  unit: z.string().optional(),
  location: z.string().optional(),
  barcode: z.string().optional(),
  minQuantity: z.number().optional(),
  expiryDate: z.string().optional(),
  expiryWarningDays: z.number().int().positive().optional(),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type CreateItemDto = z.infer<typeof CreateItemSchema>;

export const UpdateItemSchema = z.object({
  name: z.string().min(1).optional(),
  type: ItemTypeEnum.optional(),
  status: ItemStatusEnum.optional(),
  category: z.string().nullable().optional(),
  quantity: z.number().optional(),
  unit: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  barcode: z.string().nullable().optional(),
  minQuantity: z.number().nullable().optional(),
  expiryDate: z.string().nullable().optional(),
  expiryWarningDays: z.number().int().positive().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  reason: z.string().optional(),
});
export type UpdateItemDto = z.infer<typeof UpdateItemSchema>;

export const AdjustQuantitySchema = z.object({
  changeType: z.enum(['in', 'out', 'adjust'], {
    message: 'changeType은 in | out | adjust 중 하나여야 합니다.',
  }),
  quantity: z.number().min(0, 'quantity는 0 이상의 숫자여야 합니다.'),
  reason: z.string().optional(),
});
export type AdjustQuantityDto = z.infer<typeof AdjustQuantitySchema>;

export const CreateCategorySchema = z.object({
  name: z.string().min(1, 'name은 필수입니다.'),
});
export type CreateCategoryDto = z.infer<typeof CreateCategorySchema>;

// ─── 쿼리 스키마 ────────────────────────────────
export const UuidParamsSchema = z.object({
  id: z.string().uuid(),
});

export const GetItemsQuerySchema = z.object({
  type: ItemTypeEnum.optional(),
  status: ItemStatusEnum.optional(),
  category: z.string().optional(),
  q: z.string().optional(),
  tag: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: SortFieldEnum.default('createdAt'),
  sortOrder: SortOrderEnum.default('desc'),
});

export const ExpiringQuerySchema = z.object({
  days: z.coerce.number().int().positive().default(90),
});
