import { ReactNode, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useAccess } from '@/hooks/useAccess';
import { NoAccessStub } from '@/components/NoAccessStub';
import Header from '@/components/Header';
import { INITIATIVES_QUERY_KEY, fetchInitiatives } from '@/hooks/useInitiatives';

function LoadingWithHeader() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header
        currentView="budget"
        onViewChange={() => {}}
        onSearchClick={() => {}}
        isAdmin={false}
      />
      <div className="flex-1 flex items-center justify-center pt-14">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    </div>
  );
}

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
    return <LoadingWithHeader />;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (!isDodoEmployee) {
    return <Navigate to="/auth" replace />;
  }

  if (accessLoading) {
    return <LoadingWithHeader />;
  }

  if (!canAccess) {
    return <NoAccessStub />;
  }

  return <>{children}</>;
}
