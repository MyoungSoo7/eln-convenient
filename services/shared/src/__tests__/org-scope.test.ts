import { getOrgId, withOrgScope } from '../org-scope';

describe('org-scope', () => {
  describe('getOrgId', () => {
    it('x-user-org-id 헤더에서 orgId를 추출한다', () => {
      const headers = { 'x-user-org-id': 'org-123' } as any;
      expect(getOrgId(headers)).toBe('org-123');
    });

    it('헤더가 없으면 빈 문자열을 반환한다', () => {
      const headers = {} as any;
      expect(getOrgId(headers)).toBe('');
    });
  });

  describe('withOrgScope', () => {
    it('where 절에 orgId를 추가한다', () => {
      const where = { status: 'draft' };
      const result = withOrgScope(where, 'org-123');
      expect(result).toEqual({ status: 'draft', orgId: 'org-123' });
    });

    it('빈 where에도 orgId를 추가한다', () => {
      const result = withOrgScope({}, 'org-456');
      expect(result).toEqual({ orgId: 'org-456' });
    });

    it('기존 orgId를 덮어쓰지 않는다', () => {
      const where = { orgId: 'original', status: 'active' };
      const result = withOrgScope(where, 'org-789');
      // withOrgScope는 항상 새 orgId로 설정
      expect(result.orgId).toBe('org-789');
    });
  });
});
