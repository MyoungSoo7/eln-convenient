import { embeddingClient, EMBEDDING_MODEL, EMBEDDING_DIM, EMBEDDING_ENABLED } from '../providers/llm';

/** 텍스트를 벡터로 변환 */
export async function embed(text: string): Promise<number[]> {
  if (embeddingClient) {
    const res = await embeddingClient.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text.slice(0, 8191),
    });
    return res.data[0].embedding;
  }
  return deterministicVector(text, EMBEDDING_DIM);
}

/** 여러 텍스트 배치 임베딩 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (embeddingClient) {
    const res = await embeddingClient.embeddings.create({
      model: EMBEDDING_MODEL,
      input: texts.map((t) => t.slice(0, 8191)),
    });
    return res.data.map((d: { embedding: number[] }) => d.embedding);
  }
  return texts.map((t) => deterministicVector(t, EMBEDDING_DIM));
}

/** 텍스트를 N개 청크로 분할 (최대 800자, 100자 오버랩) */
export function chunkText(text: string, chunkSize = 800, overlap = 100): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    chunks.push(text.slice(start, start + chunkSize));
    start += chunkSize - overlap;
  }
  return chunks.filter((c) => c.trim().length > 20);
}

/** 임베딩 클라이언트 없을 때 결정적 해시 벡터 (테스트/폴백용) */
function deterministicVector(text: string, dim: number): number[] {
  const vec = new Array<number>(dim).fill(0);
  for (let i = 0; i < text.length; i++) {
    vec[i % dim] += text.charCodeAt(i) / 1000;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

export { EMBEDDING_ENABLED as OPENAI_ENABLED };
