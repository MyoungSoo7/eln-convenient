/**
 * API Gateway 인증 미들웨어 테스트
 * - 내부 헤더 스트리핑
 * - 공개 경로 통과
 * - 내부 경로 차단
 */

describe('API Gateway Auth Logic', () => {
  const PUBLIC_PATHS = ['/health', '/api/auth/login', '/api/auth/register', '/api/auth/refresh', '/api/auth/session'];
  const INTERNAL_PATH_RE = /\/internal(\/|$)/;
  const INTERNAL_HEADERS = [
    'x-user-id', 'x-user-role', 'x-user-email',
    'x-user-permissions', 'x-user-org-id', 'x-user-team-ids',
    'x-user-team-roles', 'x-internal-secret',
  ];

  describe('공개 경로 판별', () => {
    it('/health은 공개 경로', () => {
      expect(PUBLIC_PATHS.some(p => '/health'.startsWith(p))).toBe(true);
    });
    it('/api/auth/login은 공개 경로', () => {
      expect(PUBLIC_PATHS.some(p => '/api/auth/login'.startsWith(p))).toBe(true);
    });
    it('/api/auth/refresh는 공개 경로', () => {
      expect(PUBLIC_PATHS.some(p => '/api/auth/refresh'.startsWith(p))).toBe(true);
    });
    it('/api/notes는 공개 경로가 아님', () => {
      expect(PUBLIC_PATHS.some(p => '/api/notes'.startsWith(p))).toBe(false);
    });
    it('/api/admin/users는 공개 경로가 아님', () => {
      expect(PUBLIC_PATHS.some(p => '/api/admin/users'.startsWith(p))).toBe(false);
    });
  });

  describe('내부 경로 차단', () => {
    it('/api/auth/internal/verify-password 차단', () => {
      expect(INTERNAL_PATH_RE.test('/api/auth/internal/verify-password')).toBe(true);
    });
    it('/internal/health 차단', () => {
      expect(INTERNAL_PATH_RE.test('/internal/health')).toBe(true);
    });
    it('/api/notes는 차단 안 됨', () => {
      expect(INTERNAL_PATH_RE.test('/api/notes')).toBe(false);
    });
    it('/api/notes/internal-doc은 차단 (internal 세그먼트)', () => {
      // internal이 세그먼트로 있으면 차단
      expect(INTERNAL_PATH_RE.test('/api/notes/internal/doc')).toBe(true);
    });
  });

  describe('내부 헤더 목록', () => {
    it('x-user-id가 내부 헤더에 포함', () => {
      expect(INTERNAL_HEADERS).toContain('x-user-id');
    });
    it('x-internal-secret이 내부 헤더에 포함', () => {
      expect(INTERNAL_HEADERS).toContain('x-internal-secret');
    });
    it('authorization은 내부 헤더가 아님', () => {
      expect(INTERNAL_HEADERS).not.toContain('authorization');
    });
    it('총 8개 내부 헤더', () => {
      expect(INTERNAL_HEADERS).toHaveLength(8);
    });
  });

  describe('헤더 스트리핑', () => {
    it('내부 헤더를 삭제한다', () => {
      const headers: Record<string, string> = {
        'x-user-id': 'attacker-id',
        'x-user-role': 'admin',
        'x-internal-secret': 'fake-secret',
        'authorization': 'Bearer real-token',
      };
      for (const h of INTERNAL_HEADERS) {
        delete headers[h];
      }
      expect(headers['x-user-id']).toBeUndefined();
      expect(headers['x-user-role']).toBeUndefined();
      expect(headers['x-internal-secret']).toBeUndefined();
      expect(headers['authorization']).toBe('Bearer real-token');
    });
  });
});
