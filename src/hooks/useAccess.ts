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

const ACCESS_CACHE_KEY = 'app_access';

function getCachedAccess(userId: string): { canAccess: boolean; isAdmin: boolean; scope: AccessScope } | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(ACCESS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { userId: string; canAccess: boolean; isAdmin: boolean; scope: AccessScope };
    if (parsed.userId !== userId) return null;
    return {
      canAccess: Boolean(parsed.canAccess),
      isAdmin: Boolean(parsed.isAdmin),
      scope: {
        seeAll: Boolean(parsed.scope?.seeAll),
        allowedUnits: Array.isArray(parsed.scope?.allowedUnits) ? parsed.scope.allowedUnits : [],
        allowedTeamPairs: Array.isArray(parsed.scope?.allowedTeamPairs) ? parsed.scope.allowedTeamPairs : [],
      },
    };
  } catch {
    return null;
  }
}

function setCachedAccess(userId: string, access: { canAccess: boolean; isAdmin: boolean; scope: AccessScope }) {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(ACCESS_CACHE_KEY, JSON.stringify({ userId, ...access }));
  } catch {}
}

/** In dev: log why we showed "no access" so you can debug if it happens again. */
function devLogNoAccess(reason: string, extra?: unknown) {
  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
    console.warn('[useAccess] Showing no access:', reason, extra != null ? extra : '');
  }
}

/** RPC returns { can_access, is_admin, scope?: { see_all, allowed_units?, allowed_team_pairs? } }.
 *  Supabase/PostgREST may wrap single-row RPC result in an array [row]. */
function parseAccessResponse(data: unknown): {
  canAccess: boolean;
  isAdmin: boolean;
  scope: AccessScope;
} {
  const raw = Array.isArray(data) && data.length > 0 ? data[0] : data;
  if (!raw || typeof raw !== 'object' || !('can_access' in raw) || !('is_admin' in raw)) {
    devLogNoAccess('parse_invalid_shape', { dataType: typeof data, isArray: Array.isArray(data), data });
    return { canAccess: false, isAdmin: false, scope: DEFAULT_SCOPE };
  }
  const obj = raw as { can_access: boolean; is_admin: boolean; scope?: unknown };
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
  const canAccess = Boolean(obj.can_access);
  if (!canAccess) devLogNoAccess('rpc_returned_can_access_false', { raw });
  return {
    canAccess,
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
    const maxRetries = 2; // 3 attempts total: initial + 2 retries
    const timeoutMs = 15000; // 15s per attempt (slow networks / cold start)

    const setFailed = (reason: string, extra?: unknown) => {
      devLogNoAccess(reason, extra);
      if (!cancelled) setAccess({ canAccess: false, isAdmin: false, scope: DEFAULT_SCOPE });
    };

    const run = () => {
      const timeoutId = setTimeout(() => {
        if (cancelled) return;
        if (retryCount < maxRetries) {
          retryCount++;
          setTimeout(run, 1500);
          return;
        }
        setFailed('timeout_exhausted', { retryCount });
      }, timeoutMs);

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
            setFailed('rpc_error', { message: error.message, code: error.code, details: error.details });
            return;
          }
          const result = parseAccessResponse(data);
          setAccess(result);
          if (result.canAccess && user) setCachedAccess(user.id, result);
        })
        .catch((err) => {
          if (cancelled) return;
          clearTimeout(timeoutId);
          if (retryCount < maxRetries) {
            retryCount++;
            setTimeout(run, 1500);
            return;
          }
          setFailed('rpc_throw', err);
        });
    };

    const cached = user ? getCachedAccess(user.id) : null;
    if (cached?.canAccess) setAccess(cached);
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
