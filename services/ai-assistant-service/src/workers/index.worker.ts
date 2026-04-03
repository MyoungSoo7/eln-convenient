import { Worker, Queue, Job } from 'bullmq';
// ioredis imported via require below
import { v4 as uuidv4 } from 'uuid';
import { embed, chunkText } from '../services/embedding.service';
import { upsertChunks, deleteDocument, ensureCollection, DocPayload } from '../services/qdrant.service';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const QUEUE_NAME = 'ai-index';

export interface IndexJobData {
  documentId: string;
  title: string;
  content: string;
  service: string;
}

const connection = new (require('ioredis'))(REDIS_URL, { maxRetriesPerRequest: null });

export const indexQueue = new Queue<IndexJobData>(QUEUE_NAME, { connection });

/** 문서 인덱싱 작업 추가 */
export async function enqueueIndex(data: IndexJobData): Promise<string> {
  const job = await indexQueue.add('index-doc', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  });
  return job.id ?? uuidv4();
}

/** Worker 시작 */
export function startIndexWorker(): Worker {
  const worker = new Worker<IndexJobData>(
    QUEUE_NAME,
    async (job: Job<IndexJobData>) => {
      const { documentId, title, content, service } = job.data;
      console.log(`[index-worker] 인덱싱 시작: ${documentId} (${title})`);

      await ensureCollection();

      // 기존 청크 삭제 (재인덱싱)
      await deleteDocument(documentId);

      // 텍스트 청크 분할
      const chunks = chunkText(`${title}\n\n${content}`);
      if (chunks.length === 0) {
        console.warn(`[index-worker] 청크 없음, 스킵: ${documentId}`);
        return;
      }

      // 배치 임베딩
      const { embedBatch } = await import('../services/embedding.service');
      const vectors = await embedBatch(chunks);

      // Qdrant upsert
      const points = chunks.map((chunk, i) => ({
        // UUID v5 스타일 대신 결정적 ID 생성
        id: uuidv4(),
        vector: vectors[i],
        payload: {
          documentId,
          title,
          contentChunk: chunk,
          chunkIndex: i,
          service,
          createdAt: new Date().toISOString(),
        } as DocPayload,
      }));

      await upsertChunks(points);
      console.log(`[index-worker] 완료: ${documentId}, ${chunks.length}개 청크`);
    },
    { connection }
  );

  worker.on('failed', (job: { id?: string } | undefined, err: Error) => {
    console.error(`[index-worker] 실패 jobId=${job?.id}:`, err.message);
  });

  return worker;
}
