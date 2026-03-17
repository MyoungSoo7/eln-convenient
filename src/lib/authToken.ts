/** JWT 토큰 localStorage 헬퍼 */
const TOKEN_KEY = 'labnote_jwt';
const USER_KEY = 'labnote_user';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
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
