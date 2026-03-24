/**
 * 인증 서비스 API 클라이언트
 * 경로: /api/auth/*
 */
import apiClient, { type ApiResponse } from './client';
import { setToken, clearToken, setStoredUser, storeRefreshToken } from '@/lib/authToken';
import { currentUser } from '@/lib/types';

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  orgId?: string;
  teamId?: string;
  team?: string;
  org?: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

// ── Mock fallback ──
const mockFallback = {
  login: (): ApiResponse<LoginResponse> => ({
    ok: true,
    data: {
      token: 'mock-jwt-token',
      user: {
        id: currentUser.id,
        name: currentUser.name,
        email: currentUser.email,
        role: currentUser.role,
        orgId: 'org-001',
        team: currentUser.team,
        org: currentUser.org,
      },
    },
  }),
  me: (): ApiResponse<User> => ({
    ok: true,
    data: {
      id: currentUser.id,
      name: currentUser.name,
      email: currentUser.email,
      role: currentUser.role,
      orgId: 'org-001',
      teamId: 'team-001',
      team: currentUser.team,
      org: currentUser.org,
    },
  }),
};

// ── API 함수 ──

export async function login(email: string, password: string): Promise<ApiResponse<LoginResponse>> {
  try {
    const result = await apiClient.post<LoginResponse>('/auth/login', { email, password });
    if (result.ok && result.data.token) {
      setToken(result.data.token);
      if ((result.data as any).refreshToken) {
        storeRefreshToken((result.data as any).refreshToken);
      }
      setStoredUser({
        ...result.data.user,
        team: (result.data.user as Record<string, unknown>).team ?? '',
        org: (result.data.user as Record<string, unknown>).org ?? '',
      } as unknown as Record<string, unknown>);
    }
    return result;
  } catch {
    const mock = mockFallback.login();
    setToken(mock.data.token);
    setStoredUser({
      ...mock.data.user,
      team: mock.data.user.team ?? '',
      org: mock.data.user.org ?? '',
    } as unknown as Record<string, unknown>);
    return mock;
  }
}

export async function logout(): Promise<void> {
  try {
    await apiClient.post('/auth/logout');
  } catch {
    // 서버 오류 무시
  } finally {
    clearToken();
  }
}

export async function getMe(): Promise<ApiResponse<User>> {
  try {
    return await apiClient.get<User>('/auth/me');
  } catch {
    return mockFallback.me();
  }
}

export async function listUsers(): Promise<ApiResponse<User[]>> {
  try {
    return await apiClient.get<User[]>('/auth/users');
  } catch {
    return {
      ok: true,
      data: [
        { id: 'u1', name: '김연구', email: 'kim@biolab.kr', role: 'Researcher' },
        { id: 'u2', name: '박분석', email: 'park@biolab.kr', role: 'Researcher' },
        { id: 'u3', name: '이실험', email: 'lee@biolab.kr', role: 'Researcher' },
        { id: 'u4', name: '최약리', email: 'choi@biolab.kr', role: 'PI' },
        { id: 'u5', name: '정관리', email: 'jung@biolab.kr', role: 'Admin' },
      ],
    };
  }
}
