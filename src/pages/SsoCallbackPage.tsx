import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { setToken, storeRefreshToken, setStoredUser } from '@/lib/authToken';
import { FlaskConical } from 'lucide-react';

/**
 * /sso-callback
 *
 * Keycloak Authorization Code + PKCE 흐름의 두 번째 단계.
 * 1. URL에서 ?code= 추출
 * 2. sessionStorage의 pkce_verifier로 Keycloak 토큰 엔드포인트에 교환 요청
 * 3. access_token 저장 → 대시보드 이동
 */
export default function SsoCallbackPage() {
  const navigate = useNavigate();
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const error = params.get('error');

    if (error) {
      console.error('[sso-callback] Keycloak 오류:', error, params.get('error_description'));
      navigate('/login?error=sso_failed', { replace: true });
      return;
    }

    if (!code) {
      navigate('/login?error=no_code', { replace: true });
      return;
    }

    const verifier = sessionStorage.getItem('pkce_verifier');
    if (!verifier) {
      navigate('/login?error=no_verifier', { replace: true });
      return;
    }
    sessionStorage.removeItem('pkce_verifier');

    const base = import.meta.env.VITE_KEYCLOAK_URL || 'http://localhost:8080';
    const realm = import.meta.env.VITE_KEYCLOAK_REALM || 'labnote';
    const clientId = import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'labnote-frontend';
    const redirectUri = window.location.origin + '/sso-callback';
    const tokenUrl = `${base}/realms/${realm}/protocol/openid-connect/token`;

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: verifier,
    });

    fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
      .then(async (res) => {
        if (!res.ok) {
          const detail = await res.text();
          throw new Error(`토큰 교환 실패 (${res.status}): ${detail}`);
        }
        return res.json() as Promise<{
          access_token: string;
          refresh_token?: string;
          expires_in: number;
        }>;
      })
      .then(async (tokens) => {
        setToken(tokens.access_token);
        if (tokens.refresh_token) await storeRefreshToken(tokens.refresh_token);

        // 서버에서 검증된 사용자 정보 조회 (/api/auth/me)
        try {
          const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';
          const meRes = await fetch(`${API_BASE}/auth/me`, {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
            credentials: 'include',
          });
          if (meRes.ok) {
            const meData = await meRes.json();
            if (meData.ok && meData.data) {
              setStoredUser({
                id: meData.data.id ?? '',
                email: meData.data.email ?? '',
                name: meData.data.name ?? '',
                role: meData.data.role ?? 'viewer',
                team: meData.data.team ?? '',
                org: meData.data.org ?? '',
              });
            }
          }
        } catch {
          // /api/auth/me 실패해도 토큰은 저장됐으므로 계속 진행
          // JWT 디코딩 폴백
          try {
            const payload = JSON.parse(atob(tokens.access_token.split('.')[1]));
            setStoredUser({
              id: payload.sub ?? '',
              email: payload.email ?? '',
              name: payload.name ?? payload.preferred_username ?? '',
              role: payload.realm_access?.roles?.includes('admin')
                ? 'admin'
                : payload.realm_access?.roles?.includes('researcher')
                  ? 'researcher'
                  : 'viewer',
              team: payload.team ?? '',
              org: payload.org ?? '',
            });
          } catch {
            // 파싱 실패해도 토큰은 저장됐으므로 계속 진행
          }
        }

        navigate('/', { replace: true });
      })
      .catch((err) => {
        console.error('[sso-callback]', err);
        navigate('/login?error=token_exchange_failed', { replace: true });
      });
  }, [navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background">
      <FlaskConical className="h-10 w-10 text-primary animate-pulse" />
      <p className="text-muted-foreground text-sm">SSO 인증 처리 중...</p>
    </div>
  );
}
