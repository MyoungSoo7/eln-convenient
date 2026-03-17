import { Client } from '@opensearch-project/opensearch';

const OPENSEARCH_URL = process.env.OPENSEARCH_URL || 'http://localhost:9200';

export const osClient = new Client({ node: OPENSEARCH_URL });

// 인덱스 정의 (내부 키 → 실제 OpenSearch 인덱스명)
export const INDICES = {
  notes: 'labnote-notes',
  templates: 'labnote-templates',
  inventory: 'labnote-inventory',
} as const;

export type IndexKey = keyof typeof INDICES;

// 외부 타입명 → 내부 키 alias (API 쿼리 파라미터 호환용)
export const TYPE_ALIASES: Record<string, IndexKey> = {
  note: 'notes',
  notes: 'notes',
  template: 'templates',
  templates: 'templates',
  protocol: 'templates',   // 프로토콜은 templates 인덱스에 저장
  protocols: 'templates',
  inventory: 'inventory',
};

/** 타입 문자열(콤마 구분 가능) → 인덱스명 배열 */
export function resolveIndices(type?: string): string[] {
  if (!type) return Object.values(INDICES);
  return type
    .split(',')
    .map((t) => {
      const key = TYPE_ALIASES[t.trim()];
      return key ? INDICES[key] : null;
    })
    .filter((v): v is string => v !== null);
}

/** 인덱스명 → 타입 레이블 */
export function indexToType(indexName: string): string {
  const entry = Object.entries(INDICES).find(([, v]) => v === indexName);
  return entry ? entry[0] : 'unknown';
}

/** 인덱스 매핑 */
const notesMapping = {
  mappings: {
    properties: {
      id:        { type: 'keyword' },
      title:     { type: 'text', analyzer: 'standard', fields: { keyword: { type: 'keyword' } } },
      content:   { type: 'text', analyzer: 'standard' },
      status:    { type: 'keyword' },
      authorId:  { type: 'keyword' },
      tags:      { type: 'keyword' },
      createdAt: { type: 'date' },
      updatedAt: { type: 'date' },
    },
  },
};

const templatesMapping = {
  mappings: {
    properties: {
      id:          { type: 'keyword' },
      title:       { type: 'text', analyzer: 'standard', fields: { keyword: { type: 'keyword' } } },
      description: { type: 'text', analyzer: 'standard' },
      category:    { type: 'keyword' },
      tags:        { type: 'keyword' },
      isPublic:    { type: 'boolean' },
      createdAt:   { type: 'date' },
    },
  },
};

const inventoryMapping = {
  mappings: {
    properties: {
      id:        { type: 'keyword' },
      name:      { type: 'text', analyzer: 'standard', fields: { keyword: { type: 'keyword' } } },
      type:      { type: 'keyword' },
      category:  { type: 'keyword' },
      location:  { type: 'text' },
      barcode:   { type: 'keyword' },
      status:    { type: 'keyword' },
      tags:      { type: 'keyword' },
      createdAt: { type: 'date' },
    },
  },
};

/** 초기 인덱스 생성 (없을 때만) */
export async function ensureIndices(): Promise<void> {
  const mappings: Record<string, object> = {
    [INDICES.notes]:     notesMapping,
    [INDICES.templates]: templatesMapping,
    [INDICES.inventory]: inventoryMapping,
  };

  for (const [indexName, body] of Object.entries(mappings)) {
    try {
      const exists = await osClient.indices.exists({ index: indexName });
      if (!exists.body) {
        await osClient.indices.create({ index: indexName, body });
        console.log(`[search-service] 인덱스 생성: ${indexName}`);
      }
    } catch (err) {
      console.error(`[search-service] 인덱스 생성 실패 (${indexName}):`, err);
    }
  }
}

/** 단일 문서 인덱싱/업데이트 */
export async function indexDocument(
  index: string,
  id: string,
  doc: Record<string, unknown>
): Promise<void> {
  await osClient.index({ index, id, body: doc, refresh: 'wait_for' });
}

/** 벌크 인덱싱 */
export async function bulkIndexDocuments(
  index: string,
  docs: Array<{ id: string; doc: Record<string, unknown> }>
): Promise<{ indexed: number; errors: number }> {
  if (docs.length === 0) return { indexed: 0, errors: 0 };

  const body = docs.flatMap(({ id, doc }) => [
    { index: { _index: index, _id: id } },
    doc,
  ]);

  const response = await osClient.bulk({ body, refresh: 'wait_for' });
  const items = response.body.items as Array<{ index: { error?: unknown } }>;
  const errors = items.filter((item) => item.index?.error).length;
  return { indexed: docs.length - errors, errors };
}

/** 문서 삭제 */
export async function deleteDocument(index: string, id: string): Promise<void> {
  try {
    await osClient.delete({ index, id });
  } catch {
    // 없는 문서 삭제 시 무시
  }
}

/** 인덱스 통계 조회 */
export async function getIndexStats(): Promise<Record<string, { count: number; size: string }>> {
  const result: Record<string, { count: number; size: string }> = {};

  for (const [key, indexName] of Object.entries(INDICES)) {
    try {
      const countRes = await osClient.count({ index: indexName });
      const statsRes = await osClient.indices.stats({ index: indexName });
      const sizeBytes: number = statsRes.body._all?.total?.store?.size_in_bytes ?? 0;
      result[key] = {
        count: countRes.body.count,
        size: `${(sizeBytes / 1024).toFixed(1)} KB`,
      };
    } catch {
      result[key] = { count: 0, size: '0 KB' };
    }
  }

  return result;
}
