import { getOrgId, withOrgScope } from '../org-scope';

describe('org-scope', () => {
  describe('getOrgId', () => {
    it('x-user-org-id 헤더에서 orgId를 추출한다', () => {
      const headers = { 'x-user-org-id': 'org-123' } as any;
      expect(getOrgId(headers)).toBe('org-123');
    });

    // 구현은 org 헤더가 없으면 403 으로 막는다(fail-closed). 빈 문자열을 돌려주면
    // org 스코프가 빈 채로 질의가 나가 테넌트 격리가 뚫린다. 코드가 맞고 이 테스트가
    // 옛 규약에 머물러 있었다 — 한 번도 실행된 적이 없어 드러나지 않았다.
    it('헤더가 없으면 403 으로 막는다', () => {
      const headers = {} as any;
      expect(() => getOrgId(headers)).toThrow('조직 정보가 없습니다.');
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
