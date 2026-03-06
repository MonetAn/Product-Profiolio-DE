import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAccess } from '@/hooks/useAccess';
import { Loader2 } from 'lucide-react';

interface AdminRouteProps {
  children: ReactNode;
}

/** Renders children only if current user is admin; otherwise redirects to home. Use inside ProtectedRoute. */
export function AdminRoute({ children }: AdminRouteProps) {
  const { isAdmin, accessLoading } = useAccess();

  if (accessLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
