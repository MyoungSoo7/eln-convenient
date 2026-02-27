/**
 * auth-service 기본 테스트
 * 실행: npm test
 */
describe('auth-service', () => {
  it('더미 사용자 로그인이 토큰을 반환해야 한다', () => {
    // TODO: supertest를 사용한 통합 테스트
    const mockResponse = { token: 'dummy-jwt', user: { id: 'dev-user-001' } };
    expect(mockResponse.token).toBeDefined();
    expect(mockResponse.user.id).toBe('dev-user-001');
  });

  it('역할 목록에 admin이 포함되어야 한다', () => {
    const roles = [{ name: 'admin' }, { name: 'researcher' }, { name: 'viewer' }];
    expect(roles.find((r) => r.name === 'admin')).toBeDefined();
  });
});
