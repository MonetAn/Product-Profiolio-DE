import { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  readPersonalDynamicTreemap,
  writePersonalDynamicTreemap,
  TREEMAP_PERSONAL_PREF_EVENT,
  TREEMAP_GLOBAL_PREF_EVENT,
} from '@/lib/treemapViewPreference';

export function AdminTreemapLayoutSettings() {
  const { toast } = useToast();
  const [personalDynamic, setPersonalDynamic] = useState(readPersonalDynamicTreemap);
  const [globalDynamic, setGlobalDynamic] = useState(false);
  const [globalLoading, setGlobalLoading] = useState(true);
  const [globalSaving, setGlobalSaving] = useState(false);

  const loadGlobal = async () => {
    setGlobalLoading(true);
    const { data, error } = await supabase
      .from('dashboard_treemap_layout_config')
      .select('dynamic_for_all')
      .eq('id', 1)
      .maybeSingle();
    setGlobalLoading(false);
    if (error) {
      toast({ title: 'Не удалось загрузить настройку', description: error.message, variant: 'destructive' });
      return;
    }
    setGlobalDynamic(Boolean(data?.dynamic_for_all));
  };

  useEffect(() => {
    void loadGlobal();
    const syncPersonal = () => setPersonalDynamic(readPersonalDynamicTreemap());
    window.addEventListener(TREEMAP_PERSONAL_PREF_EVENT, syncPersonal);
    return () => window.removeEventListener(TREEMAP_PERSONAL_PREF_EVENT, syncPersonal);
  }, []);

  const handlePersonalChange = (on: boolean) => {
    setPersonalDynamic(on);
    writePersonalDynamicTreemap(on);
    toast({
      title: on ? 'Динамический вью (вы)' : 'Статичный вью (вы)',
      description: 'Только ваш браузер. Обновите «Бюджет».',
    });
  };

  const handleGlobalChange = async (on: boolean) => {
    setGlobalSaving(true);
    const { error } = await supabase
      .from('dashboard_treemap_layout_config')
      .update({ dynamic_for_all: on, updated_at: new Date().toISOString() })
      .eq('id', 1);
    setGlobalSaving(false);
    if (error) {
      toast({ title: 'Не удалось сохранить', description: error.message, variant: 'destructive' });
      return;
    }
    setGlobalDynamic(on);
    window.dispatchEvent(new CustomEvent(TREEMAP_GLOBAL_PREF_EVENT));
    toast({
      title: on ? 'Динамический вью для всех' : 'Статичный вью для всех',
      description: 'Действует для всех пользователей после обновления страницы.',
    });
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      <p className="text-sm font-medium">Тремап «Бюджет»</p>
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="treemap-dynamic-personal" className="text-sm cursor-pointer">
          Динамический вью (только я)
        </Label>
        <Switch
          id="treemap-dynamic-personal"
          checked={personalDynamic}
          onCheckedChange={handlePersonalChange}
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="treemap-dynamic-global" className="text-sm cursor-pointer">
          Динамический вью (все)
        </Label>
        <Switch
          id="treemap-dynamic-global"
          checked={globalDynamic}
          disabled={globalLoading || globalSaving}
          onCheckedChange={(on) => void handleGlobalChange(on)}
        />
      </div>
    </div>
  );
}
