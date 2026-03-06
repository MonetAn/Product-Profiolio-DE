import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

export interface AccessScope {
  seeAll: boolean;
  allowedUnits: string[];
  allowedTeamPairs: { unit: string; team: string }[];
}

export type AccessErrorType = 'timeout' | 'network';

export interface AccessState {
  canAccess: boolean;
  isAdmin: boolean;
  /** If false, user must not see money anywhere and has no money toggle */
  canViewMoney: boolean;
  scope: AccessScope;
  accessLoading: boolean;
  /** Set when access check failed due to timeout/network (Supabase cold), so UI can show "Повторить" */
  accessError: AccessErrorType | null;
  retryAccess: () => void;
}

const DEFAULT_SCOPE: AccessScope = { seeAll: true, allowedUnits: [], allowedTeamPairs: [] };

const ACCESS_CACHE_KEY = 'app_access';

function getCachedAccess(userId: string): { canAccess: boolean; isAdmin: boolean; canViewMoney: boolean; scope: AccessScope } | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(ACCESS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { userId: string; canAccess: boolean; isAdmin: boolean; canViewMoney?: boolean; scope: AccessScope };
    if (parsed.userId !== userId) return null;
    return {
      canAccess: Boolean(parsed.canAccess),
      isAdmin: Boolean(parsed.isAdmin),
      canViewMoney: parsed.canViewMoney !== false,
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

function setCachedAccess(userId: string, access: { canAccess: boolean; isAdmin: boolean; canViewMoney: boolean; scope: AccessScope }) {
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

/** RPC returns { can_access, is_admin, can_view_money?, scope?: { see_all, allowed_units?, allowed_team_pairs? } }.
 *  Supabase/PostgREST may wrap single-row RPC result in an array [row]. */
function parseAccessResponse(data: unknown): {
  canAccess: boolean;
  isAdmin: boolean;
  canViewMoney: boolean;
  scope: AccessScope;
} {
  const raw = Array.isArray(data) && data.length > 0 ? data[0] : data;
  if (!raw || typeof raw !== 'object' || !('can_access' in raw) || !('is_admin' in raw)) {
    devLogNoAccess('parse_invalid_shape', { dataType: typeof data, isArray: Array.isArray(data), data });
    return { canAccess: false, isAdmin: false, canViewMoney: true, scope: DEFAULT_SCOPE };
  }
  const obj = raw as { can_access: boolean; is_admin: boolean; can_view_money?: boolean; scope?: unknown };
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
    canViewMoney: obj.can_view_money !== false,
    scope,
  };
}

function isNetworkOrTimeoutError(reason: string, extra?: unknown): AccessErrorType | null {
  if (reason === 'timeout_exhausted') return 'timeout';
  if (reason === 'rpc_error' || reason === 'rpc_throw') {
    const msg = String((extra as { message?: string })?.message ?? '');
    if (/failed to fetch|timeout|network/i.test(msg)) return 'network';
  }
  return null;
}

const noAccessState: AccessState = {
  canAccess: false,
  isAdmin: false,
  canViewMoney: true,
  scope: DEFAULT_SCOPE,
  accessLoading: false,
  accessError: null,
  retryAccess: () => {},
};

export function useAccess(): AccessState {
  const { user, loading: authLoading, isDodoEmployee } = useAuth();
  const [access, setAccess] = useState<{
    canAccess: boolean;
    isAdmin: boolean;
    canViewMoney: boolean;
    scope: AccessScope;
  } | null>(null);
  const [accessError, setAccessError] = useState<AccessErrorType | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const fetchedRef = useRef(false);

  const shouldFetch = Boolean(user && isDodoEmployee && !authLoading);

  const retryAccess = useCallback(() => {
    fetchedRef.current = false;
    setAccess(null);
    setAccessError(null);
    setRetryKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!shouldFetch) {
      setAccess(null);
      setAccessError(null);
      fetchedRef.current = false;
      return;
    }
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    setAccessError(null);
    let cancelled = false;
    let retryCount = 0;
    const maxRetries = 3; // 4 attempts total (cold Supabase can take 1–2 min)
    const timeoutMs = 30000; // 30s per attempt

    const setFailed = (reason: string, extra?: unknown) => {
      devLogNoAccess(reason, extra);
      const errType = isNetworkOrTimeoutError(reason, extra);
      if (!cancelled) {
        setAccess({ canAccess: false, isAdmin: false, canViewMoney: true, scope: DEFAULT_SCOPE });
        setAccessError(errType);
      }
    };

    const run = () => {
      const timeoutId = setTimeout(() => {
        if (cancelled) return;
        if (retryCount < maxRetries) {
          retryCount++;
          setTimeout(run, 2000);
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
              setTimeout(run, 2000);
              return;
            }
            setFailed('rpc_error', { message: error.message, code: error.code, details: error.details });
            return;
          }
          const result = parseAccessResponse(data);
          setAccess(result);
          setAccessError(null);
          if (result.canAccess && user) setCachedAccess(user.id, result);
        })
        .catch((err) => {
          if (cancelled) return;
          clearTimeout(timeoutId);
          if (retryCount < maxRetries) {
            retryCount++;
            setTimeout(run, 2000);
            return;
          }
          setFailed('rpc_throw', err);
        });
    };

    const cached = user ? getCachedAccess(user.id) : null;
    if (cached?.canAccess) {
      setAccess(cached);
      setAccessError(null);
    }
    run();
    return () => { cancelled = true; };
  }, [shouldFetch, user?.id, isDodoEmployee, retryKey]);

  useEffect(() => {
    if (!user) fetchedRef.current = false;
  }, [user]);

  if (!user || !isDodoEmployee) {
    return { ...noAccessState, retryAccess };
  }
  if (authLoading) {
    return { ...noAccessState, retryAccess };
  }
  if (!shouldFetch) {
    return { ...noAccessState, retryAccess };
  }
  if (access === null) {
    return { ...noAccessState, accessLoading: true, retryAccess };
  }
  return {
    canAccess: access.canAccess,
    isAdmin: access.isAdmin,
    canViewMoney: access.canViewMoney,
    scope: access.scope,
    accessLoading: false,
    accessError,
    retryAccess,
  };
}
