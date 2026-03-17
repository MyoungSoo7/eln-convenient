import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as clientModule from '@/api/client';

describe('admin API', () => {
  let getSpy: ReturnType<typeof vi.spyOn>;
  let postSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    getSpy = vi.spyOn(clientModule.apiClient, 'get');
    postSpy = vi.spyOn(clientModule.apiClient, 'post');
  });

  afterEach(() => { vi.restoreAllMocks(); });

  it('listUsers calls GET /api/admin/users', async () => {
    getSpy.mockResolvedValue({ ok: true, data: [] });
    const { listUsers } = await import('@/api/admin');
    await listUsers();
    expect(getSpy).toHaveBeenCalledWith('/admin/users');
  });

  it('createUser calls POST /api/admin/users with payload', async () => {
    postSpy.mockResolvedValue({ ok: true, data: {} });
    const { createUser } = await import('@/api/admin');
    const payload = { name: '홍길동', email: 'hong@lab.kr', role: 'Researcher', team: '연구팀' };
    await createUser(payload);
    expect(postSpy).toHaveBeenCalledWith('/admin/users', payload);
  });

  it('listTeams calls GET /api/admin/teams', async () => {
    getSpy.mockResolvedValue({ ok: true, data: [] });
    const { listTeams } = await import('@/api/admin');
    await listTeams();
    expect(getSpy).toHaveBeenCalledWith('/admin/teams');
  });

  it('listRoles calls GET /api/admin/roles', async () => {
    getSpy.mockResolvedValue({ ok: true, data: [] });
    const { listRoles } = await import('@/api/admin');
    await listRoles();
    expect(getSpy).toHaveBeenCalledWith('/admin/roles');
  });
});
