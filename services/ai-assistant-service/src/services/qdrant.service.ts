import { QdrantClient } from '@qdrant/js-client-rest';

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION_NAME = 'labnote_docs';
const VECTOR_SIZE = 1536; // text-embedding-3-small

export const qdrant = new QdrantClient({ url: QDRANT_URL });

export interface DocPayload {
  documentId: string;
  title: string;
  contentChunk: string;
  chunkIndex: number;
  service: string;
  createdAt: string;
}

/** 컬렉션이 없으면 생성 */
export async function ensureCollection(): Promise<void> {
  const collections = await qdrant.getCollections();
  const exists = collections.collections.some((c: { name: string }) => c.name === COLLECTION_NAME);
  if (!exists) {
    await qdrant.createCollection(COLLECTION_NAME, {
      vectors: { size: VECTOR_SIZE, distance: 'Cosine' },
    });
    console.log(`[qdrant] 컬렉션 '${COLLECTION_NAME}' 생성됨`);
  }
}

/** 문서 청크들을 Qdrant에 upsert */
export async function upsertChunks(
  chunks: { id: string; vector: number[]; payload: DocPayload }[]
): Promise<void> {
  await qdrant.upsert(COLLECTION_NAME, {
    wait: true,
    points: chunks.map((c) => ({ id: c.id, vector: c.vector, payload: c.payload as unknown as Record<string, unknown> })),
  });
}

/** 유사 문서 검색 */
export async function searchSimilar(
  queryVector: number[],
  topK = 5
): Promise<{ documentId: string; title: string; contentChunk: string; score: number }[]> {
  const result = await qdrant.search(COLLECTION_NAME, {
    vector: queryVector,
    limit: topK,
    with_payload: true,
  });
  return result.map((r) => {
    const p = (r.payload ?? {}) as unknown as DocPayload;
    return { documentId: p.documentId, title: p.title, contentChunk: p.contentChunk, score: r.score };
  });
}

/** 특정 documentId의 모든 청크 삭제 */
export async function deleteDocument(documentId: string): Promise<void> {
  await qdrant.delete(COLLECTION_NAME, {
    wait: true,
    filter: { must: [{ key: 'documentId', match: { value: documentId } }] },
  });
}

/** 총 인덱싱된 문서 수 */
export async function getIndexedCount(): Promise<number> {
  try {
    const info = await qdrant.getCollection(COLLECTION_NAME);
    return info.points_count ?? 0;
  } catch {
    return 0;
  }
}
