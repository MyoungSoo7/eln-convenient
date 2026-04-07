/**
 * 검색 인덱스 동기화 클라이언트 (Redis Stream 기반)
 *
 * eln-service의 searchClient와 동일한 패턴 — 자세한 설명은 그쪽 주석 참고.
 * labnote:events 스트림에 SEARCH_INDEX / SEARCH_DELETE 이벤트를 발행하고,
 * search-service가 consumer group으로 구독하여 OpenSearch에 반영한다.
 */
import Redis from 'ioredis';

const EVENT_STREAM = 'labnote:events';
const STREAM_MAXLEN = 10000;

interface IndexPayload {
  id: string;
  doc: Record<string, unknown>;
}

let redis: Redis | null = null;
function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      enableReadyCheck: false,
      lazyConnect: false,
    });
    redis.on('error', (err: Error) => {
      console.error('[searchClient] Redis 연결 오류:', err.message);
    });
  }
  return redis;
}

async function publish(type: 'SEARCH_INDEX' | 'SEARCH_DELETE', data: Record<string, string>): Promise<void> {
  try {
    await getRedis().xadd(
      EVENT_STREAM,
      'MAXLEN', '~', String(STREAM_MAXLEN),
      '*',
      'type', type,
      ...Object.entries(data).flat(),
    );
  } catch (err: any) {
    console.error(`[searchClient] ${type} 발행 실패:`, err.message);
  }
}

export const searchClient = {
  index(payload: IndexPayload): void {
    void publish('SEARCH_INDEX', {
      id: payload.id,
      doc: JSON.stringify(payload.doc),
    });
  },
  delete(id: string): void {
    void publish('SEARCH_DELETE', { id });
  },
};
