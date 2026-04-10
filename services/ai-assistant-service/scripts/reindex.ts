/**
 * 임베딩 Provider 전환 시 Qdrant 재인덱싱 스크립트
 *
 * 시나리오: OpenAI(text-embedding-3-small, 1536) → Ollama(bge-m3, 1024)
 *
 * 수행:
 *   1) 기존 컬렉션 `labnote_docs_1536`은 그대로 두고 (롤백용)
 *   2) 새 컬렉션 `labnote_docs_1024`을 자동 생성 (ensureCollection)
 *   3) eln-service / inventory-service의 모든 문서를 다시 읽어서
 *      POST /api/ai/index 큐에 재투입
 *
 * 실행:
 *   docker exec -it labnote-ai npx ts-node scripts/reindex.ts
 *
 * 또는 환경변수로 특정 서비스만:
 *   docker exec -e RESOURCES=notes labnote-ai npx ts-node scripts/reindex.ts
 */
import 'dotenv/config';
import { Queue } from 'bullmq';

const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379';
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || 'dev-internal-secret';
const ELN_URL = process.env.ELN_SERVICE_URL || 'http://eln-service:8002';

const resources = (process.env.RESOURCES || 'notes').split(',');

async function fetchAllNotes(): Promise<Array<{ id: string; title: string; content: string }>> {
  // 페이지네이션 — eln-service가 limit=2000이면 충분하지만 안전하게 cursor로 순회
  const all: Array<{ id: string; title: string; content: string }> = [];
  let cursor: string | null = null;
  while (true) {
    const url = new URL(`${ELN_URL}/api/notes/internal/all`);
    url.searchParams.set('limit', '1000');
    if (cursor) url.searchParams.set('cursor', cursor);
    const res = await fetch(url.toString(), {
      headers: { 'x-internal-secret': INTERNAL_SECRET },
    });
    if (!res.ok) throw new Error(`eln-service fetch failed: ${res.status}`);
    const data = (await res.json()) as {
      ok: boolean;
      data: Array<{ id: string; title: string; content: string }>;
      nextCursor: string | null;
    };
    all.push(...data.data);
    if (!data.nextCursor) break;
    cursor = data.nextCursor;
  }
  return all;
}

async function main() {
  console.log(`[reindex] 시작 — resources=${resources.join(',')}`);

  const queue = new Queue('ai-index', { connection: { url: REDIS_URL } as any });

  let total = 0;
  for (const resource of resources) {
    if (resource === 'notes') {
      const notes = await fetchAllNotes();
      console.log(`[reindex] notes: ${notes.length}건`);
      for (const n of notes) {
        await queue.add('index-doc', {
          documentId: n.id,
          title: n.title,
          content: n.content,
          service: 'eln',
        });
        total++;
      }
    }
    // TODO: templates, protocols, inventory items 등 필요 시 추가
  }

  console.log(`[reindex] 큐 투입 완료: ${total}건. Worker가 처리합니다.`);
  await queue.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('[reindex] 실패:', err);
  process.exit(1);
});
