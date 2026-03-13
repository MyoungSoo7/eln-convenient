import { Client } from '@opensearch-project/opensearch';

const OPENSEARCH_URL = process.env.OPENSEARCH_URL || 'http://localhost:9200';

export const osClient = new Client({ node: OPENSEARCH_URL });

// 인덱스 정의
export const INDICES = {
  notes: 'labnote-notes',
  templates: 'labnote-templates',
  inventory: 'labnote-inventory',
} as const;

/** 인덱스 매핑 (한국어 텍스트 + 키워드) */
const notesMapping = {
  mappings: {
    properties: {
      id: { type: 'keyword' },
      title: { type: 'text', analyzer: 'standard', fields: { keyword: { type: 'keyword' } } },
      content: { type: 'text', analyzer: 'standard' },
      status: { type: 'keyword' },
      authorId: { type: 'keyword' },
      tags: { type: 'keyword' },
      createdAt: { type: 'date' },
      updatedAt: { type: 'date' },
    },
  },
};

const templatesMapping = {
  mappings: {
    properties: {
      id: { type: 'keyword' },
      title: { type: 'text', analyzer: 'standard', fields: { keyword: { type: 'keyword' } } },
      description: { type: 'text', analyzer: 'standard' },
      category: { type: 'keyword' },
      tags: { type: 'keyword' },
      isPublic: { type: 'boolean' },
      createdAt: { type: 'date' },
    },
  },
};

const inventoryMapping = {
  mappings: {
    properties: {
      id: { type: 'keyword' },
      name: { type: 'text', analyzer: 'standard', fields: { keyword: { type: 'keyword' } } },
      type: { type: 'keyword' },
      category: { type: 'keyword' },
      location: { type: 'text' },
      status: { type: 'keyword' },
      tags: { type: 'keyword' },
    },
  },
};

/** 초기 인덱스 생성 (없을 때만) */
export async function ensureIndices(): Promise<void> {
  const mappings: Record<string, object> = {
    [INDICES.notes]: notesMapping,
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

/** 문서 인덱싱/업데이트 */
export async function indexDocument(
  index: string,
  id: string,
  doc: Record<string, unknown>
): Promise<void> {
  await osClient.index({ index, id, body: doc, refresh: 'wait_for' });
}

/** 문서 삭제 */
export async function deleteDocument(index: string, id: string): Promise<void> {
  try {
    await osClient.delete({ index, id });
  } catch {
    // 없는 문서 삭제 시 무시
  }
}
