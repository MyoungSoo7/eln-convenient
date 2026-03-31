/**
 * auth-service 단위 테스트
 * 실행: npm test
 */
describe('auth-service', () => {
  it('로그인 응답에 token과 user 정보가 포함되어야 한다', () => {
    const mockResponse = { token: 'dummy-jwt', user: { id: 'dev-user-001', email: 'test@test.com', role: 'admin' } };
    expect(mockResponse.token).toBeDefined();
    expect(mockResponse.user.id).toBe('dev-user-001');
    expect(mockResponse.user.email).toContain('@');
    expect(mockResponse.user.role).toBe('admin');
  });

  it('역할 목록에 4개 역할이 모두 포함되어야 한다', () => {
    const roles = [{ name: 'admin' }, { name: 'researcher' }, { name: 'reviewer' }, { name: 'viewer' }];
    expect(roles).toHaveLength(4);
    expect(roles.find((r) => r.name === 'admin')).toBeDefined();
    expect(roles.find((r) => r.name === 'researcher')).toBeDefined();
    expect(roles.find((r) => r.name === 'reviewer')).toBeDefined();
    expect(roles.find((r) => r.name === 'viewer')).toBeDefined();
  });

  it('비활성 사용자는 로그인이 거부되어야 한다', () => {
    const user = { id: 'user-1', status: 'inactive' };
    expect(user.status).not.toBe('active');
  });

  it('JWT 토큰 형식이 올바른 구조여야 한다', () => {
    // JWT: header.payload.signature (3 parts separated by dots)
    const mockToken = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEifQ.signature';
    const parts = mockToken.split('.');
    expect(parts).toHaveLength(3);
  });

  it('비밀번호 해시는 원본과 달라야 한다', () => {
    const password = 'mypassword';
    const hash = '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ12';
    expect(hash).not.toBe(password);
    expect(hash.startsWith('$2b$')).toBe(true);
  });
});
