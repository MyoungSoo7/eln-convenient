import { useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationBell } from "@/components/NotificationBell";
import { ChangePasswordModal } from "@/components/ChangePasswordModal";
import { SessionExpiryWarning } from "@/components/SessionExpiryWarning";
import { LogOut, KeyRound } from "lucide-react";
import { getStoredUser } from "@/lib/authToken";
import { logout } from "@/api/auth";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "react-i18next";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation('common');
  const storedUser = getStoredUser();
  const userName = (storedUser?.name as string) || '사용자';
  const userRole = (storedUser?.role as string) || '';
  const [pwModalOpen, setPwModalOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const toggleLanguage = () => {
    i18n.changeLanguage(i18n.language === 'ko' ? 'en' : 'ko');
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center justify-between border-b bg-card px-4 shrink-0">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs font-medium px-2 h-7"
                onClick={toggleLanguage}
              >
                {i18n.language === 'ko' ? 'EN' : '한국어'}
              </Button>
              <ThemeToggle />
              <NotificationBell />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-8 w-8 rounded-full p-0 bg-primary/10 text-xs font-medium text-primary">
                    {userName[0] || '?'}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <div className="px-2 py-1.5">
                    <p className="text-sm font-medium">{userName}</p>
                    <p className="text-xs text-muted-foreground">{userRole}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setPwModalOpen(true)} className="cursor-pointer">
                    <KeyRound className="mr-2 h-4 w-4" />
                    {t('password.change')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleLogout} className="text-destructive cursor-pointer">
                    <LogOut className="mr-2 h-4 w-4" />
                    {t('logout')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <ChangePasswordModal open={pwModalOpen} onClose={() => setPwModalOpen(false)} />
              <SessionExpiryWarning />
            </div>
          </header>
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
