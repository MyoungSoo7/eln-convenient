import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '@/api/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FlaskConical } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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

        </CardContent>
      </Card>
    </div>
  );
}
