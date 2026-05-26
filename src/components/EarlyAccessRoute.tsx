import { ReactNode, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { LogoLoader } from '@/components/LogoLoader';
import { useAccess, parseAccessResponse } from '@/hooks/useAccess';
import { supabase } from '@/integrations/supabase/client';

interface EarlyAccessRouteProps {
  children: ReactNode;
  /** Куда отправить, если нет раннего доступа (по умолчанию — дашборд). */
  redirectTo?: string;
}

/**
 * Маршрут только для раннего доступа. Дополнительно сверяет RPC, чтобы не полагаться
 * только на кэш sessionStorage после смены флага super_admin.
 */
export function EarlyAccessRoute({ children, redirectTo = '/' }: EarlyAccessRouteProps) {
  const { accessLoading, hasEarlyAccess } = useAccess();
  const [gate, setGate] = useState<'pending' | 'yes' | 'no'>('pending');

  useEffect(() => {
    let cancelled = false;
    void supabase.rpc('get_my_access').then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        setGate('no');
        return;
      }
      setGate(parseAccessResponse(data).hasEarlyAccess ? 'yes' : 'no');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (accessLoading || gate === 'pending') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <LogoLoader className="h-8 w-8" />
      </div>
    );
  }

  if (gate === 'no' || !hasEarlyAccess) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}
