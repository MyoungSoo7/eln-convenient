/**
 * API 클라이언트 기본 설정
 * - JWT 토큰 자동 주입 (Authorization: Bearer ...)
 * - 401 응답 시 토큰 삭제 후 /login 리디렉트
 */
import { getToken, clearToken } from '@/lib/authToken';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export interface ApiResponse<T> {
  ok: boolean;
  data: T;
  error?: string;
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
    const token = getToken();
    const url = `${this.baseURL}${path}`;
    const config: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...extraHeaders,
      },
    };

    if (body && method !== 'GET') {
      config.body = JSON.stringify(body);
    }

    const response = await fetch(url, config);

    if (response.status === 401) {
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
