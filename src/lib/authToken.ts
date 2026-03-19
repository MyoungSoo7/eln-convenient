/** JWT 토큰 관리 — access token은 메모리, refresh token은 httpOnly 쿠키 */
const USER_KEY = 'labnote_user';
const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

// Access token은 메모리에만 보관 (XSS 방어)
let accessToken: string | null = null;

export function getToken(): string | null {
  return accessToken;
}

export function setToken(token: string): void {
  accessToken = token;
}

export function clearToken(): void {
  accessToken = null;
  localStorage.removeItem(USER_KEY);
  // httpOnly 쿠키 삭제는 서버에서 처리
  fetch(`${API_BASE}/auth/session`, { method: 'DELETE', credentials: 'include' }).catch(() => {});
}

/**
 * Refresh token을 httpOnly 쿠키로 저장 (API Gateway에 위임)
 */
export async function storeRefreshToken(refreshToken: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/auth/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    // 실패해도 access token은 유지
  }
}

/**
 * httpOnly 쿠키의 refresh token으로 access token 갱신
 * 페이지 로드 시 또는 토큰 만료 시 호출
 */
export async function refreshSession(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/auth/session/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (data.ok && data.data?.token) {
      accessToken = data.data.token;
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** JWT payload에서 exp 타임스탬프(초) 반환 */
export function getTokenExpiry(): number | null {
  if (!accessToken) return null;
  try {
    const parts = accessToken.split('.');
    if (parts.length < 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.exp ?? null;
  } catch {
    return null;
  }
}

/** 토큰이 threshold(ms) 이내에 만료되는지 확인 */
export function isTokenExpiringSoon(thresholdMs = 60000): boolean {
  const exp = getTokenExpiry();
  if (exp === null) return false;
  return exp * 1000 - Date.now() < thresholdMs;
}

export function isAuthenticated(): boolean {
  if (!accessToken) return false;
  try {
    const parts = accessToken.split('.');
    if (parts.length < 3) return true;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.exp ? payload.exp * 1000 > Date.now() : true;
  } catch {
    return true;
  }
}

export function getStoredUser(): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredUser(user: Record<string, unknown>): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

// Backward compat — these are no-ops now (refresh token is in httpOnly cookie)
export function getRefreshToken(): string | null { return null; }
export function setRefreshToken(_token: string): void { /* no-op, use storeRefreshToken() */ }
export function clearRefreshToken(): void { /* no-op */ }
