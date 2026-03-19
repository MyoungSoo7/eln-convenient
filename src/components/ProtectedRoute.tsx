import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { isAuthenticated, getToken, refreshSession } from '@/lib/authToken';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const [ready, setReady] = useState(() => !!getToken());
  const [authenticated, setAuthenticated] = useState(() => isAuthenticated());

  useEffect(() => {
    // 메모리에 access token이 없으면 httpOnly 쿠키로 세션 복원 시도
    if (!getToken()) {
      refreshSession().then((ok) => {
        setAuthenticated(ok);
        setReady(true);
      });
    } else {
      setReady(true);
    }
  }, []);

  if (!ready) {
    // 세션 복원 중 — 로딩 표시
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground text-sm">세션 복원 중...</p>
      </div>
    );
  }

  if (!authenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
