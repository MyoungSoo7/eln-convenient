import Redis from 'ioredis';

let redis: Redis | null = null;

try {
  redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  redis.on('error', (err) => {
    console.error('[search-service] Redis 연결 오류:', err.message);
  });
} catch {
  redis = null;
}

export default redis;

/** 검색 캐시 무효화 — 색인/삭제 시 호출 */
export async function invalidateSearchCache(): Promise<void> {
  if (!redis) return;
  try {
    const keys = await redis.keys('cache:search:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch {
    // Redis 오류 무시 — 캐시 무효화 실패는 치명적이지 않음
  }
}
