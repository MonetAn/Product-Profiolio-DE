import { ReactNode, useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { LogoLoader } from '@/components/LogoLoader';
import { useAuth } from '@/hooks/useAuth';
import { useAccess } from '@/hooks/useAccess';
import { NoAccessStub } from '@/components/NoAccessStub';
import { ServerUnavailableStub } from '@/components/ServerUnavailableStub';
import Header from '@/components/Header';

/** Show loader only after this many ms of loading (avoids flash when load is fast). */
const LOADER_DELAY_MS = 300;

function LoadingWithHeader({ showSpinner = true }: { showSpinner?: boolean }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header
        currentView="budget"
        onViewChange={() => {}}
        onSearchClick={() => {}}
        isAdmin={false}
      />
      <div className="flex-1 flex items-center justify-center pt-14">
        {showSpinner ? <LogoLoader className="h-8 w-8" /> : null}
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
  const [showLoader, setShowLoader] = useState(false);
  const delayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Delayed loader: show spinner only if loading takes longer than LOADER_DELAY_MS
  useEffect(() => {
    if (loading || accessLoading) {
      const t = setTimeout(() => setShowLoader(true), LOADER_DELAY_MS);
      delayTimeoutRef.current = t;
      return () => {
        clearTimeout(t);
        delayTimeoutRef.current = null;
      };
    } else {
      setShowLoader(false);
      if (delayTimeoutRef.current) {
        clearTimeout(delayTimeoutRef.current);
        delayTimeoutRef.current = null;
      }
    }
  }, [loading, accessLoading]);

  if (loading) {
    return <LoadingWithHeader showSpinner={showLoader} />;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (!isDodoEmployee) {
    return <Navigate to="/auth" replace />;
  }

  if (accessLoading) {
    return <LoadingWithHeader showSpinner={showLoader} />;
  }

  if (!canAccess) {
    if (accessError) {
      return <ServerUnavailableStub onRetry={retryAccess} />;
    }
    return <NoAccessStub />;
  }

  return <>{children}</>;
}
