import { Navigate } from 'react-router-dom';
import { getStoredUser } from '@/lib/authToken';

interface AdminRouteProps {
  children: React.ReactNode;
}

export function AdminRoute({ children }: AdminRouteProps) {
  const user = getStoredUser();
  if (user?.role !== 'admin') {
    return <Navigate to="/forbidden" replace />;
  }
  return <>{children}</>;
}

interface RoleRouteProps {
  children: React.ReactNode;
  roles: string[];
}

export function RoleRoute({ children, roles }: RoleRouteProps) {
  const user = getStoredUser();
  if (!user?.role || !roles.includes(user.role as string)) {
    return <Navigate to="/forbidden" replace />;
  }
  return <>{children}</>;
}
