import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '@/api/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { FlaskConical } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// Keycloak OIDC Authorization Code + PKCE 리다이렉트
function redirectToKeycloak() {
  const base = import.meta.env.VITE_KEYCLOAK_URL || 'http://localhost:8080';
  const realm = import.meta.env.VITE_KEYCLOAK_REALM || 'labnote';
  const clientId = import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'labnote-frontend';
  const redirectUri = encodeURIComponent(window.location.origin + '/sso-callback');

  // PKCE code_verifier / code_challenge 생성
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const verifier = btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  sessionStorage.setItem('pkce_verifier', verifier);

  crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)).then((hash) => {
    const challenge = btoa(String.fromCharCode(...new Uint8Array(hash)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const url = `${base}/realms/${realm}/protocol/openid-connect/auth`
      + `?client_id=${clientId}`
      + `&redirect_uri=${redirectUri}`
      + `&response_type=code`
      + `&scope=openid+profile+email+roles`
      + `&code_challenge=${challenge}`
      + `&code_challenge_method=S256`;
    window.location.href = url;
  });
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation('auth');
  const [email, setEmail] = useState('admin@labnote.local');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await login(email, password);
      if (result.ok) {
        navigate('/', { replace: true });
      } else {
        setError(result.error || t('error.loginFailed'));
      }
    } catch {
      setError(t('error.serverError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <FlaskConical className="h-10 w-10 text-blue-600" />
          </div>
          <CardTitle className="text-2xl">{t('title')}</CardTitle>
          <CardDescription>{t('subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t('email')}</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('emailPlaceholder')}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t('password')}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('passwordPlaceholder')}
                required
                autoComplete="current-password"
              />
            </div>
            {error && (
              <p className="text-sm text-red-500 bg-red-50 dark:bg-red-950 p-2 rounded">{error}</p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t('loggingIn') : t('loginButton')}
            </Button>
          </form>
          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{t('defaultHint')}</p>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-6 px-2"
              onClick={() => i18n.changeLanguage(i18n.language === 'ko' ? 'en' : 'ko')}
            >
              {i18n.language === 'ko' ? 'EN' : '한국어'}
            </Button>
          </div>

          {import.meta.env.VITE_KEYCLOAK_ENABLED === 'true' && (
            <>
              <div className="my-4 flex items-center gap-2">
                <Separator className="flex-1" />
                <span className="text-xs text-muted-foreground">또는</span>
                <Separator className="flex-1" />
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2"
                onClick={redirectToKeycloak}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
                </svg>
                {t('ssoLogin', { defaultValue: 'SSO 로그인 (Keycloak)' })}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
