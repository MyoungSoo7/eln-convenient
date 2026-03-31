/**
 * 검색 캐시 TTL 로직 테스트
 */

interface CacheEntry<T> {
  data: T;
  cachedAt: number;
}

const CACHE_TTL_MS = 3 * 60 * 1000; // 3분

function isCacheValid<T>(entry: CacheEntry<T> | null, now: number = Date.now()): boolean {
  if (!entry) return false;
  return now - entry.cachedAt < CACHE_TTL_MS;
}

describe('Search Cache', () => {
  it('캐시 유효', () => {
    const entry: CacheEntry<string[]> = { data: ['result1'], cachedAt: Date.now() };
    expect(isCacheValid(entry)).toBe(true);
  });

  it('캐시 만료 (3분 후)', () => {
    const entry: CacheEntry<string[]> = { data: ['result1'], cachedAt: Date.now() - 4 * 60 * 1000 };
    expect(isCacheValid(entry)).toBe(false);
  });

  it('null 엔트리', () => {
    expect(isCacheValid(null)).toBe(false);
  });

  it('정확히 3분은 유효', () => {
    const now = Date.now();
    const entry: CacheEntry<string[]> = { data: [], cachedAt: now - CACHE_TTL_MS + 1 };
    expect(isCacheValid(entry, now)).toBe(true);
  });

  it('3분 1ms 후 만료', () => {
    const now = Date.now();
    const entry: CacheEntry<string[]> = { data: [], cachedAt: now - CACHE_TTL_MS };
    expect(isCacheValid(entry, now)).toBe(false);
  });
});
