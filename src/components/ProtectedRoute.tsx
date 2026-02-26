import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useAccess } from '@/hooks/useAccess';
import { Loader2 } from 'lucide-react';
import { NoAccessStub } from '@/components/NoAccessStub';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading, isDodoEmployee } = useAuth();
  const { canAccess, accessLoading } = useAccess();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (!isDodoEmployee) {
    return <Navigate to="/auth" replace />;
  }

  if (accessLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!canAccess) {
    return <NoAccessStub />;
  }

  return <>{children}</>;
}
