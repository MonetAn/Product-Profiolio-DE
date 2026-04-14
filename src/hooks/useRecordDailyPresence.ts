import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type PresenceSurface = 'portfolio' | 'admin';

function storageKey(surface: PresenceSurface): string {
  const utcDay = new Date().toISOString().slice(0, 10);
  return `presence:${surface}:${utcDay}`;
}

/**
 * At most one RPC per surface per UTC calendar day per browser tab (sessionStorage).
 * Server dedupes with UNIQUE(user_id, surface, day).
 */
export function useRecordDailyPresence(surface: PresenceSurface, enabled: boolean) {
  const sentRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const k = storageKey(surface);
    if (sessionStorage.getItem(k)) return;
    if (sentRef.current) return;
    sentRef.current = true;
    sessionStorage.setItem(k, '1');

    void supabase.rpc('record_presence', { p_surface: surface }).then(({ error }) => {
      if (error && import.meta.env.DEV) {
        console.warn('[presence] record_presence failed:', error.message);
      }
    });
  }, [surface, enabled]);
}
