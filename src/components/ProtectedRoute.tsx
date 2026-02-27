import { ReactNode, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useAccess } from '@/hooks/useAccess';
import { Loader2 } from 'lucide-react';
import { NoAccessStub } from '@/components/NoAccessStub';
import { INITIATIVES_QUERY_KEY, fetchInitiatives } from '@/hooks/useInitiatives';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading, isDodoEmployee } = useAuth();
  const { canAccess, accessLoading } = useAccess();
  const queryClient = useQueryClient();

  // Параллельно с проверкой доступа начинаем загрузку инициатив — к моменту входа данные уже в кэше
  useEffect(() => {
    if (!user || !isDodoEmployee) return;
    queryClient.prefetchQuery({ queryKey: INITIATIVES_QUERY_KEY, queryFn: fetchInitiatives });
  }, [user, isDodoEmployee, queryClient]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="text-muted-foreground text-sm">Загрузка...</span>
        </div>
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
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="text-muted-foreground text-sm">Проверка доступа...</span>
        </div>
      </div>
    );
  }

  if (!canAccess) {
    return <NoAccessStub />;
  }

  return <>{children}</>;
}
