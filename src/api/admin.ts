/**
 * 관리자 API 클라이언트
 * 경로: /api/auth/* (auth-service)
 */
import apiClient, { type ApiResponse } from './client';

export interface AdminOrg {
  id: string;
  name: string;
  slug: string;
  createdAt?: string;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  roleId?: string;
  role?: string;
  teamId?: string;
  team?: string;
  status: string;
  orgId?: string;
}

export interface AdminTeam {
  id: string;
  name: string;
  memberCount: number;
  lead?: string;
}

export interface AdminRole {
  id?: string;
  name: string;
  permissions: string[];
  userCount?: number;
}

export interface CreateUserPayload {
  name: string;
  email: string;
  password: string;
  roleId?: string;
  orgId?: string;
}

export interface UpdateUserPayload {
  name?: string;
  roleId?: string;
  status?: string;
}

export interface AdminTeamMember {
  userId: string;
  name: string;
  email: string;
  role?: string;
}

// ─── 조직 ────────────────────────────────────────

export async function listOrgs(): Promise<ApiResponse<AdminOrg[]>> {
  try {
    return await apiClient.get<AdminOrg[]>('/auth/orgs');
  } catch {
    return { ok: false, data: [] as AdminOrg[], error: '조직 목록 조회에 실패했습니다.' };
  }
}

export async function createOrg(payload: { name: string; slug: string }): Promise<ApiResponse<AdminOrg>> {
  try {
    return await apiClient.post<AdminOrg>('/auth/orgs', payload);
  } catch {
    return { ok: false, data: null as unknown as AdminOrg, error: '조직 생성에 실패했습니다.' };
  }
}

export async function updateOrg(id: string, payload: { name?: string; slug?: string }): Promise<ApiResponse<AdminOrg>> {
  try {
    return await apiClient.put<AdminOrg>(`/auth/orgs/${id}`, payload);
  } catch {
    return { ok: false, data: null as unknown as AdminOrg, error: '조직 수정에 실패했습니다.' };
  }
}

export async function deleteOrg(id: string): Promise<ApiResponse<void>> {
  try {
    return await apiClient.delete<void>(`/auth/orgs/${id}`);
  } catch {
    return { ok: false, data: undefined as unknown as void, error: '조직 삭제에 실패했습니다.' };
  }
}

// ─── 팀 ─────────────────────────────────────────

export async function listTeams(orgId?: string): Promise<ApiResponse<AdminTeam[]>> {
  try {
    const params = orgId ? { orgId } : undefined;
    return await apiClient.get<AdminTeam[]>('/auth/teams', params);
  } catch {
    return { ok: false, data: [] as AdminTeam[], error: '팀 목록 조회에 실패했습니다.' };
  }
}

export async function createTeam(payload: { orgId: string; name: string }): Promise<ApiResponse<AdminTeam>> {
  try {
    return await apiClient.post<AdminTeam>('/auth/teams', payload);
  } catch {
    return { ok: false, data: null as unknown as AdminTeam, error: '팀 생성에 실패했습니다.' };
  }
}

export async function updateTeam(id: string, payload: { name: string }): Promise<ApiResponse<AdminTeam>> {
  try {
    return await apiClient.put<AdminTeam>(`/auth/teams/${id}`, payload);
  } catch {
    return { ok: false, data: null as unknown as AdminTeam, error: '팀 수정에 실패했습니다.' };
  }
}

export async function deleteTeam(id: string): Promise<ApiResponse<void>> {
  try {
    return await apiClient.delete<void>(`/auth/teams/${id}`);
  } catch {
    return { ok: false, data: undefined as unknown as void, error: '팀 삭제에 실패했습니다.' };
  }
}

// ─── 사용자 ──────────────────────────────────────

export async function listUsers(): Promise<ApiResponse<AdminUser[]>> {
  try {
    return await apiClient.get<AdminUser[]>('/auth/users');
  } catch {
    return { ok: false, data: [] as AdminUser[], error: '사용자 목록 조회에 실패했습니다.' };
  }
}

export async function createUser(payload: CreateUserPayload): Promise<ApiResponse<AdminUser>> {
  try {
    return await apiClient.post<AdminUser>('/auth/users', payload);
  } catch {
    return { ok: false, data: null as unknown as AdminUser, error: '사용자 추가에 실패했습니다.' };
  }
}

export async function updateUser(id: string, payload: UpdateUserPayload): Promise<ApiResponse<AdminUser>> {
  try {
    return await apiClient.put<AdminUser>(`/auth/users/${id}`, payload);
  } catch {
    return { ok: false, data: null as unknown as AdminUser, error: '사용자 수정에 실패했습니다.' };
  }
}

export async function deleteUser(id: string): Promise<ApiResponse<void>> {
  try {
    return await apiClient.delete<void>(`/auth/users/${id}`);
  } catch {
    return { ok: false, data: undefined as unknown as void, error: '사용자 삭제에 실패했습니다.' };
  }
}

// ─── 팀 멤버 ──────────────────────────────────────

export async function listTeamMembers(teamId: string): Promise<ApiResponse<AdminTeamMember[]>> {
  try {
    return await apiClient.get<AdminTeamMember[]>(`/auth/teams/${teamId}/members`);
  } catch {
    return { ok: false, data: [], error: '팀원 목록 조회에 실패했습니다.' };
  }
}

export async function addTeamMember(teamId: string, userId: string): Promise<ApiResponse<void>> {
  try {
    return await apiClient.post<void>(`/auth/teams/${teamId}/members`, { userId });
  } catch {
    return { ok: false, data: undefined as unknown as void, error: '팀원 추가에 실패했습니다.' };
  }
}

export async function removeTeamMember(teamId: string, userId: string): Promise<ApiResponse<void>> {
  try {
    return await apiClient.delete<void>(`/auth/teams/${teamId}/members/${userId}`);
  } catch {
    return { ok: false, data: undefined as unknown as void, error: '팀원 제거에 실패했습니다.' };
  }
}

// ─── 역할 ────────────────────────────────────────

export async function listRoles(): Promise<ApiResponse<AdminRole[]>> {
  try {
    return await apiClient.get<AdminRole[]>('/auth/roles');
  } catch {
    return { ok: false, data: [] as AdminRole[], error: '역할 목록 조회에 실패했습니다.' };
  }
}

export async function createRole(payload: { orgId: string; name: string; permissions: string[] }): Promise<ApiResponse<AdminRole>> {
  try {
    return await apiClient.post<AdminRole>('/auth/roles', payload);
  } catch {
    return { ok: false, data: null as unknown as AdminRole, error: '역할 생성에 실패했습니다.' };
  }
}

export async function updateRolePermissions(id: string, permissions: string[]): Promise<ApiResponse<AdminRole>> {
  try {
    return await apiClient.put<AdminRole>(`/auth/roles/${id}/permissions`, { permissions });
  } catch {
    return { ok: false, data: null as unknown as AdminRole, error: '권한 수정에 실패했습니다.' };
  }
}

export async function deleteRole(id: string): Promise<ApiResponse<void>> {
  try {
    return await apiClient.delete<void>(`/auth/roles/${id}`);
  } catch {
    return { ok: false, data: undefined as unknown as void, error: '역할 삭제에 실패했습니다.' };
  }
}

