/**
 * 검색 인덱스 동기화 클라이언트 (Redis Stream 기반)
 *
 * 기존 HTTP fire-and-forget 방식(search-service 직접 호출)의 한계:
 *   - 요청 실패 시 재시도 없음 → 검색 인덱스 drift 발생
 *   - search-service 일시 다운 시 색인 이벤트 영구 손실
 *
 * 개선: Redis Stream `labnote:events`에 SEARCH_INDEX / SEARCH_DELETE 이벤트를 발행한다.
 *   - search-service가 Consumer Group으로 구독하여 OpenSearch에 반영
 *   - Stream이 버퍼 역할 → search-service 다운 중에도 이벤트 보존
 *   - 미처리 메시지는 XPENDING/XCLAIM으로 자동 재시도 (search-service 쪽 로직)
 *   - XADD 실패(Redis 다운) 시에만 색인 손실 가능 → 에러 로깅 후 계속
 *
 * 호출 측 API(searchClient.index/delete)는 기존과 동일하므로 컨트롤러 변경 불필요.
 */
import Redis from 'ioredis';

const EVENT_STREAM = 'labnote:events';
const STREAM_MAXLEN = 10000; // 최근 10k개 이벤트 유지 (검색 동기화는 일시 지연 허용)

interface IndexPayload {
  id: string;
  doc: Record<string, unknown>;
}

// lazy 초기화 — 앱 기동 시점이 아니라 첫 호출 때 연결
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

/**
 * Stream에 이벤트 발행.
 * - doc 전체를 JSON 문자열로 직렬화하여 단일 필드에 저장
 *   (Redis Stream field-value는 flat string이라 중첩 객체를 쓸 수 없음)
 */
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
    // Redis 다운 등 — 여기서만 색인 손실 가능
    console.error(`[searchClient] ${type} 발행 실패:`, err.message);
  }
}

export const searchClient = {
  /** 생성/수정 시 호출. 컨트롤러는 await 불필요 (기존 시그니처 유지). */
  index(payload: IndexPayload): void {
    void publish('SEARCH_INDEX', {
      id: payload.id,
      doc: JSON.stringify(payload.doc),
    });
  },
  /** 삭제 시 호출. search-service에서 softDeleteDocument 처리. */
  delete(id: string): void {
    void publish('SEARCH_DELETE', { id });
  },
};
