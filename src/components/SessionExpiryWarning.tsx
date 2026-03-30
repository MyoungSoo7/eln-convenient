import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getTokenExpiry, refreshSession, clearToken } from "@/lib/authToken";

const WARNING_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes before expiry
const CHECK_INTERVAL_MS = 10 * 1000; // check every 10 seconds

export function SessionExpiryWarning() {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [extending, setExtending] = useState(false);
  const countdownRef = useRef<ReturnType<typeof setInterval>>();
  const checkRef = useRef<ReturnType<typeof setInterval>>();

  const clearCountdown = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = undefined;
    }
  }, []);

  const startCountdown = useCallback((expiresAt: number) => {
    clearCountdown();
    setOpen(true);
    const update = () => {
      const left = Math.max(0, expiresAt - Date.now());
      setRemaining(Math.ceil(left / 1000));
      if (left <= 0) {
        clearCountdown();
        clearToken();
        navigate('/login', { replace: true });
      }
    };
    update();
    countdownRef.current = setInterval(update, 1000);
  }, [clearCountdown, navigate]);

  // Periodically check token expiry
  useEffect(() => {
    const check = () => {
      const exp = getTokenExpiry();
      if (exp === null) return;
      const expiresAt = exp * 1000;
      const timeLeft = expiresAt - Date.now();
      if (timeLeft <= 0) {
        clearToken();
        navigate('/login', { replace: true });
      } else if (timeLeft <= WARNING_THRESHOLD_MS && !open) {
        startCountdown(expiresAt);
      }
    };

    check();
    checkRef.current = setInterval(check, CHECK_INTERVAL_MS);

    return () => {
      if (checkRef.current) clearInterval(checkRef.current);
      clearCountdown();
    };
  }, [open, startCountdown, clearCountdown, navigate]);

  const handleExtend = async () => {
    setExtending(true);
    const ok = await refreshSession();
    setExtending(false);
    if (ok) {
      clearCountdown();
      setOpen(false);
    }
  };

  const handleLogout = () => {
    clearCountdown();
    setOpen(false);
    clearToken();
    navigate('/login', { replace: true });
  };

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  return (
    <Dialog open={open} onOpenChange={() => { /* prevent closing by clicking outside */ }}>
      <DialogContent className="sm:max-w-[400px]" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{t('session.expiryWarning.title')}</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <p className="text-sm text-muted-foreground">
            {t('session.expiryWarning.message', { minutes, seconds })}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleLogout}>
            {t('session.expiryWarning.logout')}
          </Button>
          <Button onClick={handleExtend} disabled={extending}>
            {extending ? t('processing') : t('session.expiryWarning.extend')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
