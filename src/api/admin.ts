/**
 * 관리자 API 클라이언트
 * 경로: /api/admin/*
 */
import apiClient, { type ApiResponse } from './client';

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  team: string;
  status: string;
}

export interface AdminTeam {
  id: string;
  name: string;
  memberCount: number;
  lead: string;
}

export interface AdminRole {
  id?: string;
  name: string;
  permissions: string[];
  userCount: number;
}

export interface CreateUserPayload {
  name: string;
  email: string;
  role: string;
  team: string;
}

export async function listUsers(): Promise<ApiResponse<AdminUser[]>> {
  try {
    return await apiClient.get<AdminUser[]>('/admin/users');
  } catch {
    return { ok: false, data: [] as AdminUser[], error: '사용자 목록 조회에 실패했습니다.' };
  }
}

export async function createUser(payload: CreateUserPayload): Promise<ApiResponse<AdminUser>> {
  try {
    return await apiClient.post<AdminUser>('/admin/users', payload);
  } catch {
    return { ok: false, data: null as unknown as AdminUser, error: '사용자 추가에 실패했습니다.' };
  }
}

export async function listTeams(): Promise<ApiResponse<AdminTeam[]>> {
  try {
    return await apiClient.get<AdminTeam[]>('/admin/teams');
  } catch {
    return { ok: false, data: [] as AdminTeam[], error: '팀 목록 조회에 실패했습니다.' };
  }
}

export async function listRoles(): Promise<ApiResponse<AdminRole[]>> {
  try {
    return await apiClient.get<AdminRole[]>('/admin/roles');
  } catch {
    return { ok: false, data: [] as AdminRole[], error: '역할 목록 조회에 실패했습니다.' };
  }
}
