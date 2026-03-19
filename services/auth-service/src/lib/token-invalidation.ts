/**
 * 사용자 단위 토큰 무효화
 * Redis에 blacklist:{userId} 키로 무효화 시각을 저장
 * API Gateway에서 JWT의 iat < 무효화 시각이면 401 반환
 */
import redis from './redis';

const TOKEN_TTL = 28800; // 8시간 (JWT 기본 만료시간)

/**
 * 특정 사용자의 모든 기존 토큰을 무효화
 * 이 시각 이전에 발급된 토큰은 API Gateway에서 거부됨
 */
export async function invalidateUserTokens(userId: string): Promise<void> {
  try {
    const now = Math.floor(Date.now() / 1000);
    await redis.set(`blacklist:user:${userId}`, String(now), 'EX', TOKEN_TTL);
  } catch (err) {
    console.warn('[token-invalidation] 토큰 무효화 실패:', err);
  }
}
