/**
 * API 클라이언트 기본 설정
 * - JWT 토큰 자동 주입 (Authorization: Bearer ...)
 * - 토큰 만료 임박 시 자동 갱신
 * - 401 응답 시 refresh 시도 후 실패하면 /login 리디렉트
 */
import { getToken, setToken, clearToken, getRefreshToken, setRefreshToken, isTokenExpiringSoon } from '@/lib/authToken';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export interface ApiResponse<T> {
  ok: boolean;
  data: T;
  error?: string;
}

// Token refresh state (prevent concurrent refreshes)
let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  const keycloakEnabled = import.meta.env.VITE_KEYCLOAK_ENABLED === 'true';

  if (keycloakEnabled) {
    // Keycloak token refresh
    const base = import.meta.env.VITE_KEYCLOAK_URL || 'http://localhost:8080';
    const realm = import.meta.env.VITE_KEYCLOAK_REALM || 'labnote';
    const clientId = import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'labnote-frontend';
    const tokenUrl = `${base}/realms/${realm}/protocol/openid-connect/token`;

    try {
      const res = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: clientId,
        }).toString(),
      });
      if (!res.ok) return false;
      const data = await res.json();
      setToken(data.access_token);
      if (data.refresh_token) setRefreshToken(data.refresh_token);
      return true;
    } catch {
      return false;
    }
  } else {
    // Local JWT refresh via auth service
    try {
      const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      if (data.ok && data.data?.token) {
        setToken(data.data.token);
        if (data.data.refreshToken) setRefreshToken(data.data.refreshToken);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }
}

class ApiClient {
  private baseURL: string;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>
  ): Promise<ApiResponse<T>> {
    // Before making the request, check if token needs refresh
    if (isTokenExpiringSoon() && !path.includes('/auth/')) {
      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => { refreshPromise = null; });
      }
      await refreshPromise;
    }

    const token = getToken();
    const url = `${this.baseURL}${path}`;
    const config: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...extraHeaders,
      },
    };

    if (body && method !== 'GET') {
      config.body = JSON.stringify(body);
    }

    const response = await fetch(url, config);

    // 401 응답 시 refresh 시도 후 실패하면 로그아웃
    if (response.status === 401 && !path.includes('/auth/login') && !path.includes('/auth/refresh')) {
      // Try refreshing token before giving up
      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => { refreshPromise = null; });
      }
      const refreshed = await refreshPromise;
      if (refreshed) {
        // Retry the original request with new token
        const newToken = getToken();
        const retryConfig: RequestInit = {
          ...config,
          headers: {
            ...(config.headers as Record<string, string>),
            Authorization: `Bearer ${newToken}`,
          },
        };
        const retryResponse = await fetch(url, retryConfig);
        if (retryResponse.ok) {
          return await retryResponse.json();
        }
      }
      clearToken();
      window.location.href = '/login';
      throw new Error('인증이 만료되었습니다. 다시 로그인해주세요.');
    }

    const data = await response.json();

    if (!response.ok) {
      return { ok: false, data: data.data, error: data.error || '요청 실패' };
    }

    return data;
  }

  async get<T>(path: string, params?: Record<string, string>): Promise<ApiResponse<T>> {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.request<T>('GET', `${path}${query}`);
  }

  async post<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>('POST', path, body);
  }

  async put<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>('PUT', path, body);
  }

  async patch<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>('PATCH', path, body);
  }

  async delete<T>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>('DELETE', path);
  }
}

export const apiClient = new ApiClient(API_BASE_URL);
export default apiClient;
