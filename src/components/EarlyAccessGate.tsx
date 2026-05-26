import { ReactNode } from 'react';
import { useAccess } from '@/hooks/useAccess';

interface EarlyAccessGateProps {
  children: ReactNode;
  /** Что показать остальным (по умолчанию ничего). */
  fallback?: ReactNode;
}

/** Оборачивает UI-блоки, видимые только с ранним доступом. */
export function EarlyAccessGate({ children, fallback = null }: EarlyAccessGateProps) {
  const { hasEarlyAccess, accessLoading } = useAccess();
  if (accessLoading) return null;
  if (!hasEarlyAccess) return <>{fallback}</>;
  return <>{children}</>;
}
