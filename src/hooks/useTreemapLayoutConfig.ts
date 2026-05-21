import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { TREEMAP_GLOBAL_PREF_EVENT } from '@/lib/treemapViewPreference';

export function useTreemapLayoutConfig() {
  const [dynamicForAll, setDynamicForAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const { data, error: qErr } = await supabase
      .from('dashboard_treemap_layout_config')
      .select('dynamic_for_all')
      .eq('id', 1)
      .maybeSingle();

    if (qErr) {
      setError(qErr.message);
      setDynamicForAll(false);
    } else {
      setError(null);
      setDynamicForAll(Boolean(data?.dynamic_for_all));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const onGlobal = () => void refresh();
    window.addEventListener(TREEMAP_GLOBAL_PREF_EVENT, onGlobal);
    return () => window.removeEventListener(TREEMAP_GLOBAL_PREF_EVENT, onGlobal);
  }, [refresh]);

  return { dynamicForAll, loading, error, refresh };
}
