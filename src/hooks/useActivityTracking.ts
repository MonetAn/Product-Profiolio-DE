import { useEffect, useRef, useCallback, useContext } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { ActivityContext } from '@/contexts/ActivityContext';
import { supabase } from '@/integrations/supabase/client';

const HEARTBEAT_INTERVAL_MS = 60_000;
const CLICK_THROTTLE_MS = 500;
const MAX_CLICK_PAYLOAD_TEXT = 150;

function getSessionId(): string {
  try {
    return crypto.randomUUID?.() ?? `s-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  } catch {
    return `s-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }
}

function getClickPayload(target: EventTarget | null): Record<string, unknown> {
  if (!target || !(target instanceof Element)) return {};
  const el = target as HTMLElement;
  const tag = el.tagName?.toLowerCase() ?? '';
  const id = el.id ? String(el.id) : undefined;
  const dataAttrs: Record<string, string> = {};
  if (el.dataset) {
    for (const [k, v] of Object.entries(el.dataset)) {
      if (v !== undefined) dataAttrs[`data-${k}`] = String(v).slice(0, 80);
    }
  }
  let text: string | undefined;
  const raw = (el.closest('button, a, [role="button"]') ?? el).textContent?.trim();
  if (raw) text = raw.slice(0, MAX_CLICK_PAYLOAD_TEXT);
  return {
    tag,
    ...(id && { id }),
    ...(Object.keys(dataAttrs).length > 0 && { data: dataAttrs }),
    ...(text && { text }),
  };
}

export function useActivityTracking() {
  const { user } = useAuth();
  const location = useLocation();
  const activityContext = useContext(ActivityContext);
  const sessionIdRef = useRef<string | null>(null);
  const lastClickRef = useRef(0);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const send = useCallback(
    (eventType: string, payload: Record<string, unknown> = {}) => {
      if (!user) return;
      const path = window.location.pathname + window.location.search;
      const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
      const authPath = base ? `${base}/auth` : '/auth';
      if (path === authPath || path.startsWith(`${authPath}/`) || path === '/auth') return;

      const adminPath = base ? `${base}/admin` : '/admin';
      if (path === adminPath || path.startsWith(`${adminPath}/`)) return;

      const sessionId = sessionIdRef.current ?? getSessionId();
      if (!sessionIdRef.current) sessionIdRef.current = sessionId;

      const merged: Record<string, unknown> = { ...payload };
      if (eventType === 'page_view' || eventType === 'heartbeat') {
        if (activityContext?.view != null) merged.view = activityContext.view;
        if (activityContext?.zoomPath?.length) merged.zoomPath = activityContext.zoomPath;
      }
      if (eventType === 'click' && activityContext?.view != null) {
        merged.view = activityContext.view;
      }

      supabase
        .from('activity_events')
        .insert({
          user_id: user.id,
          user_email: user.email ?? null,
          session_id: sessionId,
          event_type: eventType,
          path: path || null,
          payload: merged as Record<string, unknown>,
        })
        .then(({ error }) => {
          if (error && import.meta.env.DEV) {
            console.warn('[activity] insert failed:', error.message);
          }
        });
    },
    [user, activityContext?.view, activityContext?.zoomPath]
  );

  // Page view on mount and route change
  useEffect(() => {
    if (!user) return;
    send('page_view', { from: location.pathname });
  }, [user, location.pathname, location.search, send]);

  // Heartbeat every 60s only when tab is visible (Page Visibility API)
  useEffect(() => {
    if (!user) return;
    const tick = () => send('heartbeat', {});

    const startHeartbeat = () => {
      if (heartbeatRef.current) return;
      heartbeatRef.current = setInterval(tick, HEARTBEAT_INTERVAL_MS);
    };
    const stopHeartbeat = () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') startHeartbeat();
      else stopHeartbeat();
    };

    if (document.visibilityState === 'visible') startHeartbeat();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      stopHeartbeat();
    };
  }, [user, send]);

  // Global click tracking (throttled)
  useEffect(() => {
    if (!user) return;
    const onClick = (e: MouseEvent) => {
      const now = Date.now();
      if (now - lastClickRef.current < CLICK_THROTTLE_MS) return;
      lastClickRef.current = now;
      const payload = getClickPayload(e.target);
      send('click', payload);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [user, send]);
  return { send };
}
