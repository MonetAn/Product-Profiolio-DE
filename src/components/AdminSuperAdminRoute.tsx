import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAccess } from '@/hooks/useAccess';
import { LogoLoader } from '@/components/LogoLoader';

interface AdminSuperAdminRouteProps {
  children: ReactNode;
}

/** Инженерные разделы админки: только super_admin. */
export function AdminSuperAdminRoute({ children }: AdminSuperAdminRouteProps) {
  const { isSuperAdmin, accessLoading } = useAccess();

  if (accessLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <LogoLoader className="h-8 w-8" />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return <Navigate to="/admin" replace />;
  }

  return <>{children}</>;
}
