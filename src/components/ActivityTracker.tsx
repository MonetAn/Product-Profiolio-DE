import { useEffect, useContext } from 'react';
import { useActivityTracking } from '@/hooks/useActivityTracking';
import { ActivityContext } from '@/contexts/ActivityContext';

/**
 * Renders nothing. When mounted inside AuthProvider, ActivityProvider and BrowserRouter,
 * tracks page views, heartbeats, and clicks for authenticated users (except on /auth).
 * Registers send in ActivityContext so Index/treemap can emit view_switch and treemap_zoom/treemap_click.
 */
export function ActivityTracker() {
  const ctx = useContext(ActivityContext);
  const { send } = useActivityTracking();
  useEffect(() => {
    if (ctx?.setSend && send) ctx.setSend(send);
  }, [ctx?.setSend, send]);
  return null;
}
