import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

export interface AccessScope {
  seeAll: boolean;
  allowedUnits: string[];
  allowedTeamPairs: { unit: string; team: string }[];
}

export interface AccessState {
  canAccess: boolean;
  isAdmin: boolean;
  scope: AccessScope;
  accessLoading: boolean;
}

const DEFAULT_SCOPE: AccessScope = { seeAll: true, allowedUnits: [], allowedTeamPairs: [] };

/** RPC returns { can_access, is_admin, scope?: { see_all, allowed_units?, allowed_team_pairs? } }. */
function parseAccessResponse(data: unknown): {
  canAccess: boolean;
  isAdmin: boolean;
  scope: AccessScope;
} {
  if (!data || typeof data !== 'object' || !('can_access' in data) || !('is_admin' in data)) {
    return { canAccess: false, isAdmin: false, scope: DEFAULT_SCOPE };
  }
  const obj = data as { can_access: boolean; is_admin: boolean; scope?: unknown };
  let scope: AccessScope = DEFAULT_SCOPE;
  if (obj.scope && typeof obj.scope === 'object' && obj.scope !== null) {
    const s = obj.scope as { see_all?: boolean; allowed_units?: string[]; allowed_team_pairs?: { unit: string; team: string }[] };
    scope = {
      seeAll: Boolean(s.see_all),
      allowedUnits: Array.isArray(s.allowed_units) ? s.allowed_units : [],
      allowedTeamPairs: Array.isArray(s.allowed_team_pairs)
        ? s.allowed_team_pairs.filter((p): p is { unit: string; team: string } => typeof p?.unit === 'string' && typeof p?.team === 'string')
        : [],
    };
  }
  return {
    canAccess: Boolean(obj.can_access),
    isAdmin: Boolean(obj.is_admin),
    scope,
  };
}

export function useAccess(): AccessState {
  const { user, loading: authLoading, isDodoEmployee } = useAuth();
  const [access, setAccess] = useState<{
    canAccess: boolean;
    isAdmin: boolean;
    scope: AccessScope;
  } | null>(null);
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
    let cancelled = false;
    let retryCount = 0;
    const maxRetries = 1;

    const setFailed = () => {
      if (!cancelled) setAccess({ canAccess: false, isAdmin: false, scope: DEFAULT_SCOPE });
    };

    const run = () => {
      const timeoutId = setTimeout(setFailed, 10000);

      supabase
        .rpc('get_my_access')
        .then(({ data, error }) => {
          if (cancelled) return;
          clearTimeout(timeoutId);
          if (error) {
            if (retryCount < maxRetries) {
              retryCount++;
              setTimeout(run, 1500);
              return;
            }
            setAccess({ canAccess: false, isAdmin: false, scope: DEFAULT_SCOPE });
            return;
          }
          setAccess(parseAccessResponse(data));
        })
        .catch(() => {
          if (cancelled) return;
          clearTimeout(timeoutId);
          if (retryCount < maxRetries) {
            retryCount++;
            setTimeout(run, 1500);
            return;
          }
          setFailed();
        });
    };

    run();
    return () => { cancelled = true; };
  }, [shouldFetch, user?.id, isDodoEmployee]);

  useEffect(() => {
    if (!user) fetchedRef.current = false;
  }, [user]);

  if (!user || !isDodoEmployee) {
    return { canAccess: false, isAdmin: false, scope: DEFAULT_SCOPE, accessLoading: false };
  }
  if (authLoading) {
    return { canAccess: false, isAdmin: false, scope: DEFAULT_SCOPE, accessLoading: false };
  }
  if (!shouldFetch) {
    return { canAccess: false, isAdmin: false, scope: DEFAULT_SCOPE, accessLoading: false };
  }
  if (access === null) {
    return { canAccess: false, isAdmin: false, scope: DEFAULT_SCOPE, accessLoading: true };
  }
  return {
    canAccess: access.canAccess,
    isAdmin: access.isAdmin,
    scope: access.scope,
    accessLoading: false,
  };
}
