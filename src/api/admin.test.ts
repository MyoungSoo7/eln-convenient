import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as clientModule from '@/api/client';

describe('admin API', () => {
  let getSpy: ReturnType<typeof vi.spyOn>;
  let postSpy: ReturnType<typeof vi.spyOn>;
  let putSpy: ReturnType<typeof vi.spyOn>;
  let deleteSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    getSpy = vi.spyOn(clientModule.apiClient, 'get');
    postSpy = vi.spyOn(clientModule.apiClient, 'post');
    putSpy = vi.spyOn(clientModule.apiClient, 'put');
    deleteSpy = vi.spyOn(clientModule.apiClient, 'delete');
  });

  afterEach(() => { vi.restoreAllMocks(); });

  // ─── 사용자 ──────────────────────────────────────

  it('listUsers calls GET /auth/users', async () => {
    getSpy.mockResolvedValue({ ok: true, data: [] });
    const { listUsers } = await import('@/api/admin');
    await listUsers();
    expect(getSpy).toHaveBeenCalledWith('/auth/users');
  });

  it('createUser calls POST /auth/users with payload', async () => {
    postSpy.mockResolvedValue({ ok: true, data: {} });
    const { createUser } = await import('@/api/admin');
    const payload = { name: '홍길동', email: 'hong@lab.kr', password: 'pw', roleId: '' };
    await createUser(payload);
    expect(postSpy).toHaveBeenCalledWith('/auth/users', payload);
  });

  it('updateUser calls PUT /auth/users/:id', async () => {
    putSpy.mockResolvedValue({ ok: true, data: {} });
    const { updateUser } = await import('@/api/admin');
    await updateUser('u1', { name: '홍길동2' });
    expect(putSpy).toHaveBeenCalledWith('/auth/users/u1', { name: '홍길동2' });
  });

  it('deleteUser calls DELETE /auth/users/:id', async () => {
    deleteSpy.mockResolvedValue({ ok: true, data: undefined });
    const { deleteUser } = await import('@/api/admin');
    await deleteUser('u1');
    expect(deleteSpy).toHaveBeenCalledWith('/auth/users/u1');
  });

  // ─── 팀 ─────────────────────────────────────────

  it('listTeams calls GET /auth/teams', async () => {
    getSpy.mockResolvedValue({ ok: true, data: [] });
    const { listTeams } = await import('@/api/admin');
    await listTeams();
    expect(getSpy).toHaveBeenCalledWith('/auth/teams');
  });

  it('createTeam calls POST /auth/teams', async () => {
    postSpy.mockResolvedValue({ ok: true, data: {} });
    const { createTeam } = await import('@/api/admin');
    await createTeam({ orgId: 'org1', name: '신규팀' });
    expect(postSpy).toHaveBeenCalledWith('/auth/teams', { orgId: 'org1', name: '신규팀' });
  });

  it('updateTeam calls PUT /auth/teams/:id', async () => {
    putSpy.mockResolvedValue({ ok: true, data: {} });
    const { updateTeam } = await import('@/api/admin');
    await updateTeam('t1', { name: '수정팀' });
    expect(putSpy).toHaveBeenCalledWith('/auth/teams/t1', { name: '수정팀' });
  });

  it('deleteTeam calls DELETE /auth/teams/:id', async () => {
    deleteSpy.mockResolvedValue({ ok: true, data: undefined });
    const { deleteTeam } = await import('@/api/admin');
    await deleteTeam('t1');
    expect(deleteSpy).toHaveBeenCalledWith('/auth/teams/t1');
  });

  // ─── 조직 ────────────────────────────────────────

  it('listOrgs calls GET /auth/orgs', async () => {
    getSpy.mockResolvedValue({ ok: true, data: [] });
    const { listOrgs } = await import('@/api/admin');
    await listOrgs();
    expect(getSpy).toHaveBeenCalledWith('/auth/orgs');
  });

  it('createOrg calls POST /auth/orgs', async () => {
    postSpy.mockResolvedValue({ ok: true, data: {} });
    const { createOrg } = await import('@/api/admin');
    await createOrg({ name: '테스트조직', slug: 'test-org' });
    expect(postSpy).toHaveBeenCalledWith('/auth/orgs', { name: '테스트조직', slug: 'test-org' });
  });

  it('updateOrg calls PUT /auth/orgs/:id', async () => {
    putSpy.mockResolvedValue({ ok: true, data: {} });
    const { updateOrg } = await import('@/api/admin');
    await updateOrg('org1', { name: '수정조직' });
    expect(putSpy).toHaveBeenCalledWith('/auth/orgs/org1', { name: '수정조직' });
  });

  it('deleteOrg calls DELETE /auth/orgs/:id', async () => {
    deleteSpy.mockResolvedValue({ ok: true, data: undefined });
    const { deleteOrg } = await import('@/api/admin');
    await deleteOrg('org1');
    expect(deleteSpy).toHaveBeenCalledWith('/auth/orgs/org1');
  });

  // ─── 역할 ────────────────────────────────────────

  it('listRoles calls GET /auth/roles', async () => {
    getSpy.mockResolvedValue({ ok: true, data: [] });
    const { listRoles } = await import('@/api/admin');
    await listRoles();
    expect(getSpy).toHaveBeenCalledWith('/auth/roles');
  });
});
