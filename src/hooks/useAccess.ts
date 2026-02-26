import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

export interface AccessState {
  canAccess: boolean;
  isAdmin: boolean;
  accessLoading: boolean;
}

/** RPC returns { can_access: boolean, is_admin: boolean }. */
function parseAccessResponse(data: unknown): { canAccess: boolean; isAdmin: boolean } {
  if (data && typeof data === 'object' && 'can_access' in data && 'is_admin' in data) {
    return {
      canAccess: Boolean((data as { can_access: boolean }).can_access),
      isAdmin: Boolean((data as { is_admin: boolean }).is_admin),
    };
  }
  return { canAccess: false, isAdmin: false };
}

export function useAccess(): AccessState {
  const { user, loading: authLoading, isDodoEmployee } = useAuth();
  const [access, setAccess] = useState<{ canAccess: boolean; isAdmin: boolean } | null>(null);
  const fetchedRef = useRef(false);

  const shouldFetch = Boolean(user && isDodoEmployee && !authLoading);

  useEffect(() => {
    if (!shouldFetch) {
      setAccess(null);
      fetchedRef.current = false;
      return;
    }
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    supabase.rpc('get_my_access').then(({ data, error }) => {
      if (error) {
        setAccess({ canAccess: false, isAdmin: false });
        return;
      }
      setAccess(parseAccessResponse(data));
    });
  }, [shouldFetch, user?.id, isDodoEmployee]);

  useEffect(() => {
    if (!user) fetchedRef.current = false;
  }, [user]);

  if (!user || !isDodoEmployee) {
    return { canAccess: false, isAdmin: false, accessLoading: false };
  }
  if (authLoading) {
    return { canAccess: false, isAdmin: false, accessLoading: false };
  }
  if (!shouldFetch) {
    return { canAccess: false, isAdmin: false, accessLoading: false };
  }
  if (access === null) {
    return { canAccess: false, isAdmin: false, accessLoading: true };
  }
  return {
    canAccess: access.canAccess,
    isAdmin: access.isAdmin,
    accessLoading: false,
  };
}
