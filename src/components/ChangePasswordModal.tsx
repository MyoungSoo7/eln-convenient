import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslation } from "react-i18next";
import { changeMyPassword } from "@/api/auth";
import { toast } from "@/hooks/use-toast";

type PasswordStrength = 'weak' | 'medium' | 'strong' | null;

function getPasswordStrength(password: string): PasswordStrength {
  if (!password) return null;
  const hasNumber = /\d/.test(password);
  const hasSpecial = /[^a-zA-Z0-9]/.test(password);
  if (password.length >= 8 && hasNumber && hasSpecial) return 'strong';
  if (password.length >= 8 && hasNumber) return 'medium';
  return 'weak';
}

const strengthConfig = {
  weak: { color: 'bg-red-500', bars: 1, textColor: 'text-red-500' },
  medium: { color: 'bg-orange-500', bars: 2, textColor: 'text-orange-500' },
  strong: { color: 'bg-green-500', bars: 3, textColor: 'text-green-500' },
} as const;

interface ChangePasswordModalProps {
  open: boolean;
  onClose: () => void;
}

export function ChangePasswordModal({ open, onClose }: ChangePasswordModalProps) {
  const { t } = useTranslation('common');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
    setLoading(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    setError('');

    if (newPassword !== confirmPassword) {
      setError(t('password.mismatch'));
      return;
    }

    setLoading(true);
    try {
      const res = await changeMyPassword(currentPassword, newPassword);
      if (res.ok) {
        toast({ title: t('password.changed') });
        handleClose();
      } else {
        setError(res.error ?? t('password.changeFailed'));
      }
    } catch {
      setError(t('password.changeFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>{t('password.changeTitle')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <label className="text-sm font-medium">{t('password.currentPassword')}</label>
            <Input
              type="password"
              placeholder={t('password.currentPlaceholder')}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium">{t('password.newPassword')}</label>
            <Input
              type="password"
              placeholder={t('password.newPlaceholder')}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            {newPassword && (() => {
              const strength = getPasswordStrength(newPassword);
              if (!strength) return null;
              const config = strengthConfig[strength];
              return (
                <div className="mt-1.5 space-y-1">
                  <div className="flex gap-1">
                    {[1, 2, 3].map((bar) => (
                      <div
                        key={bar}
                        className={`h-1.5 flex-1 rounded-full ${bar <= config.bars ? config.color : 'bg-gray-200 dark:bg-gray-700'}`}
                      />
                    ))}
                  </div>
                  <p className={`text-xs ${config.textColor}`}>
                    {t(`password.strength.${strength}`)}
                  </p>
                </div>
              );
            })()}
          </div>
          <div>
            <label className="text-sm font-medium">{t('password.confirmPassword')}</label>
            <Input
              type="password"
              placeholder={t('password.confirmPlaceholder')}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>{t('cancel')}</Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || !currentPassword || !newPassword || !confirmPassword}
          >
            {loading ? t('password.changing') : t('password.change')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
