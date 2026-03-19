import Redis from 'ioredis';

let redis: Redis | null = null;

try {
  redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  redis.on('error', () => { /* Redis 없어도 운영 가능 */ });
} catch {
  redis = null;
}

export default redis;
