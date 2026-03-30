import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '@/api/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FlaskConical } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const MAX_FAIL_COUNT = 5;
const LOCK_DURATION_SEC = 30;

export default function LoginPage() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation('auth');
  const [email, setEmail] = useState('admin@labnote.local');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [failCount, setFailCount] = useState(0);
  const [lockUntil, setLockUntil] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isLocked = lockUntil !== null && Date.now() < lockUntil;

  // Countdown timer for login lockout
  useEffect(() => {
    if (lockUntil === null) {
      setRemainingSeconds(0);
      return;
    }

    const tick = () => {
      const diff = Math.ceil((lockUntil - Date.now()) / 1000);
      if (diff <= 0) {
        setLockUntil(null);
        setFailCount(0);
        setRemainingSeconds(0);
        if (timerRef.current) clearInterval(timerRef.current);
      } else {
        setRemainingSeconds(diff);
      }
    };

    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [lockUntil]);

  const handleCapsLockDetect = useCallback((e: React.KeyboardEvent) => {
    setCapsLockOn(e.getModifierState('CapsLock'));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked) return;
    setError('');
    setLoading(true);
    try {
      const result = await login(email, password);
      if (result.ok) {
        setFailCount(0);
        navigate('/', { replace: true });
      } else {
        const newCount = failCount + 1;
        setFailCount(newCount);
        if (newCount >= MAX_FAIL_COUNT) {
          setLockUntil(Date.now() + LOCK_DURATION_SEC * 1000);
          setError(t('loginLocked'));
        } else {
          setError(result.error || t('error.loginFailed'));
        }
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
                onKeyDown={handleCapsLockDetect}
                onKeyUp={handleCapsLockDetect}
                placeholder={t('passwordPlaceholder')}
                required
                autoComplete="current-password"
              />
              {capsLockOn && (
                <p className="text-sm text-orange-500">{t('capsLockOn')}</p>
              )}
            </div>
            {error && (
              <p className="text-sm text-red-500 bg-red-50 dark:bg-red-950 p-2 rounded">{error}</p>
            )}
            {isLocked && remainingSeconds > 0 && (
              <p className="text-sm text-orange-500 text-center">
                {t('retryIn', { seconds: remainingSeconds })}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={loading || isLocked}>
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
