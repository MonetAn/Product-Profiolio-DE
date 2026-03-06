import { ReactNode, useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { LogoLoader } from '@/components/LogoLoader';
import { useAuth } from '@/hooks/useAuth';
import { useAccess } from '@/hooks/useAccess';
import { NoAccessStub } from '@/components/NoAccessStub';
import { ServerUnavailableStub } from '@/components/ServerUnavailableStub';
import Header from '@/components/Header';
import { INITIATIVES_QUERY_KEY, fetchInitiatives } from '@/hooks/useInitiatives';

const MIN_LOADING_DISPLAY_MS = 400;

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
        <LogoLoader className="h-8 w-8" />
      </div>
    </div>
  );
}

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading, isDodoEmployee } = useAuth();
  const { canAccess, accessLoading, accessError, retryAccess } = useAccess();
  const queryClient = useQueryClient();
  const loaderShownAtRef = useRef<number | null>(null);
  const [allowChildren, setAllowChildren] = useState(false);

  // Параллельно с проверкой доступа начинаем загрузку инициатив — к моменту входа данные уже в кэше
  useEffect(() => {
    if (!user || !isDodoEmployee) return;
    queryClient.prefetchQuery({ queryKey: INITIATIVES_QUERY_KEY, queryFn: fetchInitiatives });
  }, [user, isDodoEmployee, queryClient]);

  // Record when loader is first shown (do not reset when leaving, so we can measure min display time)
  useEffect(() => {
    if (loading || accessLoading) {
      if (loaderShownAtRef.current === null) loaderShownAtRef.current = Date.now();
    }
  }, [loading, accessLoading]);

  // When ready (auth + access done), keep showing loader at least MIN_LOADING_DISPLAY_MS
  const ready = !loading && !!user && isDodoEmployee && !accessLoading && canAccess;
  useEffect(() => {
    if (!ready) {
      setAllowChildren(false);
      return;
    }
    const start = loaderShownAtRef.current;
    if (start === null) {
      setAllowChildren(true);
      return;
    }
    const elapsed = Date.now() - start;
    if (elapsed >= MIN_LOADING_DISPLAY_MS) {
      loaderShownAtRef.current = null;
      setAllowChildren(true);
      return;
    }
    const remaining = MIN_LOADING_DISPLAY_MS - elapsed;
    const t = setTimeout(() => {
      loaderShownAtRef.current = null;
      setAllowChildren(true);
    }, remaining);
    return () => clearTimeout(t);
  }, [ready]);

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
    if (accessError) {
      return <ServerUnavailableStub onRetry={retryAccess} />;
    }
    return <NoAccessStub />;
  }

  if (ready && !allowChildren) {
    return <LoadingWithHeader />;
  }

  return <>{children}</>;
}
