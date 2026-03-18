import { Client } from '@opensearch-project/opensearch';
// DomainType canonical definition is in search.interface.ts — re-export only here
export type { DomainType } from '../interfaces/search.interface';
import type { DomainType } from '../interfaces/search.interface';

const OPENSEARCH_URL = process.env.OPENSEARCH_URL || 'http://localhost:9200';

export const osClient = new Client({ node: OPENSEARCH_URL });

export const UNIFIED_INDEX = 'lab_search_v1';
export const UNIFIED_ALIAS = 'lab_search';

export const DOMAIN_TYPES: DomainType[] = ['NOTE', 'PROTOCOL', 'TEMPLATE', 'INVENTORY'];

/** 외부 type 파라미터 → DomainType[] 변환 */
export function parseDomainTypes(param?: string): DomainType[] | undefined {
  if (!param) return undefined;
  const valid = new Set<string>(DOMAIN_TYPES);
  const parsed = param.toUpperCase().split(',')
    .map(t => t.trim())
    .filter(t => valid.has(t)) as DomainType[];
  return parsed.length > 0 ? parsed : undefined;
}

const unifiedMapping = {
  settings: {
    number_of_shards: 1,
    number_of_replicas: 0,
  },
  mappings: {
    properties: {
      docId:       { type: 'keyword' },
      domainType:  { type: 'keyword' },
      title: {
        type: 'text',
        analyzer: 'standard',
        fields: { keyword: { type: 'keyword', ignore_above: 256 } },
      },
      content:   { type: 'text', analyzer: 'standard' },
      summary:   { type: 'text', analyzer: 'standard' },
      tags: {
        type: 'text',
        analyzer: 'standard',
        fields: { keyword: { type: 'keyword' } },
      },
      ownerId:    { type: 'keyword' },
      labId:      { type: 'keyword' },
      projectId:  { type: 'keyword' },
      visibility: { type: 'keyword' },
      docStatus:  { type: 'keyword' },
      createdAt:  { type: 'date' },
      updatedAt:  { type: 'date' },
    },
  },
};

export async function ensureIndices(): Promise<void> {
  try {
    const exists = await osClient.indices.exists({ index: UNIFIED_INDEX });
    if (!exists.body) {
      await osClient.indices.create({ index: UNIFIED_INDEX, body: unifiedMapping });
      console.log(`[search-service] 인덱스 생성: ${UNIFIED_INDEX}`);
    }
    try {
      await osClient.indices.putAlias({ index: UNIFIED_INDEX, name: UNIFIED_ALIAS });
      console.log(`[search-service] alias 설정: ${UNIFIED_ALIAS} → ${UNIFIED_INDEX}`);
    } catch {
      // alias already exists
    }
  } catch (err) {
    console.error(`[search-service] 인덱스 초기화 실패:`, err);
  }
}

export async function indexDocument(id: string, doc: Record<string, unknown>): Promise<void> {
  await osClient.index({
    index: UNIFIED_ALIAS,
    id,
    body: doc,
    refresh: 'wait_for',
  });
}

export async function softDeleteDocument(id: string): Promise<void> {
  try {
    await osClient.update({
      index: UNIFIED_ALIAS,
      id,
      body: { doc: { docStatus: 'deleted', updatedAt: new Date().toISOString() } },
      refresh: 'wait_for',
    });
  } catch (err) {
    console.warn('[opensearch] softDelete 무시 (문서 없음):', (err as Error).message);
  }
}

export async function deleteDocument(id: string): Promise<void> {
  try {
    await osClient.delete({ index: UNIFIED_ALIAS, id, refresh: 'wait_for' } as any);
  } catch (err) {
    console.warn('[opensearch] delete 무시 (문서 없음):', (err as Error).message);
  }
}

export async function bulkIndexDocuments(
  docs: Array<{ id: string; doc: Record<string, unknown> }>
): Promise<{ indexed: number; errors: number }> {
  if (docs.length === 0) return { indexed: 0, errors: 0 };

  const body = docs.flatMap(({ id, doc }) => [
    { index: { _index: UNIFIED_INDEX, _id: id } },
    doc,
  ]);

  const response = await osClient.bulk({ body, refresh: 'wait_for' });
  const items = response.body.items as Array<{ index: { error?: unknown } }>;
  const errors = items.filter((item) => item.index?.error).length;
  return { indexed: docs.length - errors, errors };
}

export async function getIndexStats(): Promise<{ count: number; size: string }> {
  try {
    const countRes = await osClient.count({ index: UNIFIED_ALIAS });
    const statsRes = await osClient.indices.stats({ index: UNIFIED_INDEX });
    const sizeBytes: number = statsRes.body._all?.total?.store?.size_in_bytes ?? 0;
    return {
      count: countRes.body.count,
      size: `${(sizeBytes / 1024).toFixed(1)} KB`,
    };
  } catch {
    return { count: 0, size: '0 KB' };
  }
}
