import { z } from 'zod';

// ─── Enums ───────────────────────────────────────
export const DomainTypeEnum = z.enum(['NOTE', 'PROTOCOL', 'TEMPLATE', 'INVENTORY']);
export type DomainType = z.infer<typeof DomainTypeEnum>;

export const DocTypeEnum = z.enum(['notes', 'templates', 'inventory']);
export type DocType = z.infer<typeof DocTypeEnum>;

// ─── 검색 ────────────────────────────────────────
export const SearchQuerySchema = z.object({
  q: z.string().default(''),
  domainTypes: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(100).default(20),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export const SuggestQuerySchema = z.object({
  q: z.string().default(''),
});

// ─── 색인 관리 ───────────────────────────────────
export const IndexDocBodySchema = z.object({
  id: z.string().min(1, 'id, doc 필드가 필요합니다.'),
  doc: z.object({
    domainType: DomainTypeEnum,
  }).passthrough(),
});

export const BulkIndexBodySchema = z.object({
  docs: z.array(z.object({
    id: z.string().min(1),
    doc: z.record(z.string(), z.unknown()),
  })).min(1, 'docs(배열) 필드가 필요합니다.'),
});

// ─── 검색 히스토리 ───────────────────────────────
export const SaveHistoryBodySchema = z.object({
  query: z.string().min(1, 'query는 필수입니다.'),
});

// ─── 즐겨찾기 ────────────────────────────────────
export const AddFavoriteBodySchema = z.object({
  docType: DocTypeEnum,
  docId: z.string().min(1, 'docType, docId, title은 필수입니다.'),
  title: z.string().min(1, 'docType, docId, title은 필수입니다.'),
});

export const GetFavoritesQuerySchema = z.object({
  docType: DocTypeEnum.optional(),
});

// ─── 검색어 즐겨찾기 ────────────────────────────
export const AddKeywordFavoriteBodySchema = z.object({
  keyword: z.string().min(1, 'keyword는 필수입니다.'),
});

// ─── 공통 파라미터 ──────────────────────────────
export const IdParamsSchema = z.object({
  id: z.string().uuid(),
});
