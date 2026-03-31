/**
 * 검색 권한 필터 테스트 — visibility 기반 OpenSearch 쿼리 필터
 */

type Visibility = 'public' | 'private' | 'lab' | 'project';

function buildPermissionFilter(userId: string, orgId: string, teamIds: string[]): Record<string, unknown>[] {
  const shouldMatch: Record<string, unknown>[] = [];

  // 자신이 생성한 문서
  shouldMatch.push({ term: { ownerId: userId } });

  // 공개 문서
  shouldMatch.push({ term: { visibility: 'public' } });

  // 같은 조직 문서 (lab)
  if (orgId) {
    shouldMatch.push({
      bool: {
        must: [
          { term: { orgId } },
          { terms: { visibility: ['lab', 'project'] } },
        ],
      },
    });
  }

  // 팀 문서
  if (teamIds.length > 0) {
    shouldMatch.push({ terms: { teamId: teamIds } });
  }

  return shouldMatch;
}

describe('Permission Filter', () => {
  it('항상 자신의 문서와 공개 문서 포함', () => {
    const filters = buildPermissionFilter('user-1', '', []);
    expect(filters).toHaveLength(2);
    expect(filters[0]).toEqual({ term: { ownerId: 'user-1' } });
    expect(filters[1]).toEqual({ term: { visibility: 'public' } });
  });

  it('orgId 있으면 조직 문서 필터 추가', () => {
    const filters = buildPermissionFilter('user-1', 'org-1', []);
    expect(filters).toHaveLength(3);
    expect(filters[2]).toEqual({
      bool: {
        must: [
          { term: { orgId: 'org-1' } },
          { terms: { visibility: ['lab', 'project'] } },
        ],
      },
    });
  });

  it('팀 있으면 팀 필터 추가', () => {
    const filters = buildPermissionFilter('user-1', 'org-1', ['team-1', 'team-2']);
    expect(filters).toHaveLength(4);
    expect(filters[3]).toEqual({ terms: { teamId: ['team-1', 'team-2'] } });
  });

  it('팀 없으면 팀 필터 미포함', () => {
    const filters = buildPermissionFilter('user-1', 'org-1', []);
    expect(filters).toHaveLength(3);
  });
});
