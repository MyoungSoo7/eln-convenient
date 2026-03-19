import Redis from 'ioredis';

let redis: Redis | null = null;

try {
  redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  redis.on('error', (err) => {
    console.error('[inventory-service] Redis 연결 오류:', err.message);
  });
} catch {
  redis = null;
}

export default redis;
