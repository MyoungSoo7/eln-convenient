/** JWT 토큰 localStorage 헬퍼 */
const TOKEN_KEY = 'labnote_jwt';
const USER_KEY = 'labnote_user';
const REFRESH_TOKEN_KEY = 'labnote_refresh';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setRefreshToken(token: string): void {
  localStorage.setItem(REFRESH_TOKEN_KEY, token);
}

export function clearRefreshToken(): void {
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

/** JWT payload에서 exp 타임스탬프(초) 반환 */
export function getTokenExpiry(): number | null {
  const token = getToken();
  if (!token) return null;
  try {
    const parts = token.split('.');
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
  const token = getToken();
  if (!token) return false;
  try {
    const parts = token.split('.');
    // JWT 형식이 아닌 토큰 (mock 등) → 존재 자체로 인증 처리 (실제 검증은 API 요청 시)
    if (parts.length < 3) return true;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.exp ? payload.exp * 1000 > Date.now() : true;
  } catch {
    // 파싱 실패해도 토큰이 있으면 일단 통과 (서버가 검증)
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
