import { useCallback, useEffect, useMemo, useState } from 'react';
import { Trash2, ShieldAlert, Loader2 } from 'lucide-react';
import AdminHeader from '@/components/admin/AdminHeader';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useAccess, parseAccessResponse } from '@/hooks/useAccess';
import { LogoLoader } from '@/components/LogoLoader';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { normalizeTeamName } from '@/lib/sensitiveScopes';
import { Navigate } from 'react-router-dom';

type SensitiveRow = Database['public']['Tables']['sensitive_scopes']['Row'];

type UnitTeamOption = { unit: string; team: string };

export default function AdminSensitive() {
  const { toast } = useToast();
  const { accessLoading } = useAccess();
  /** Свежая проверка из RPC: не полагаемся только на кэш sessionStorage (после смены роли на super_admin). */
  const [superGate, setSuperGate] = useState<'pending' | 'yes' | 'no'>('pending');

  const [rows, setRows] = useState<SensitiveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [options, setOptions] = useState<UnitTeamOption[]>([]);

  const [pickUnit, setPickUnit] = useState('');
  const [pickTeam, setPickTeam] = useState('');
  const [wholeUnit, setWholeUnit] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadScopes = useCallback(async () => {
    const { data, error } = await supabase
      .from('sensitive_scopes')
      .select('*')
      .order('unit')
      .order('team', { ascending: true, nullsFirst: true });
    if (error) {
      toast({ title: 'Ошибка загрузки', description: error.message, variant: 'destructive' });
      setRows([]);
    } else {
      setRows((data ?? []) as SensitiveRow[]);
    }
  }, [toast]);

  const loadOptions = useCallback(async () => {
    const { data, error } = await supabase.from('initiatives').select('unit, team');
    if (error) {
      toast({ title: 'Ошибка загрузки юнитов', description: error.message, variant: 'destructive' });
      setOptions([]);
      return;
    }
    const seen = new Set<string>();
    const list: UnitTeamOption[] = [];
    (data ?? []).forEach((r) => {
      const u = r.unit?.trim();
      if (!u) return;
      const t = normalizeTeamName(r.team);
      const key = `${u}\0${t}`;
      if (!seen.has(key)) {
        seen.add(key);
        list.push({ unit: u, team: t });
      }
    });
    list.sort((a, b) => a.unit.localeCompare(b.unit) || a.team.localeCompare(b.team));
    setOptions(list);
  }, [toast]);

  useEffect(() => {
    let cancelled = false;
    void supabase.rpc('get_my_access').then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        setSuperGate('no');
        return;
      }
      setSuperGate(parseAccessResponse(data).isSuperAdmin ? 'yes' : 'no');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (superGate !== 'yes') return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      await Promise.all([loadScopes(), loadOptions()]);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [superGate, loadScopes, loadOptions]);

  const units = useMemo(() => [...new Set(options.map((o) => o.unit))].sort(), [options]);

  const teamsForPickUnit = useMemo(() => {
    const s = new Set<string>();
    options.forEach((o) => {
      if (o.unit === pickUnit) s.add(o.team);
    });
    return Array.from(s).sort();
  }, [options, pickUnit]);

  useEffect(() => {
    if (!pickUnit) {
      setPickTeam('');
      return;
    }
    if (wholeUnit) {
      setPickTeam('');
      return;
    }
    if (!teamsForPickUnit.includes(pickTeam)) {
      setPickTeam(teamsForPickUnit[0] ?? '');
    }
  }, [pickUnit, pickTeam, teamsForPickUnit, wholeUnit]);

  const handleAdd = async () => {
    if (!pickUnit.trim()) {
      toast({ title: 'Выберите юнит', variant: 'destructive' });
      return;
    }
    const unit = pickUnit.trim();
    const team = wholeUnit ? null : normalizeTeamName(pickTeam);

    const duplicate = rows.some((r) => r.unit === unit && (r.team === null ? team === null : r.team === team));
    if (duplicate) {
      toast({ title: 'Уже в списке', variant: 'destructive' });
      return;
    }

    setSaving(true);
    const { error } = await supabase.from('sensitive_scopes').insert({ unit, team });
    setSaving(false);
    if (error) {
      toast({ title: 'Не удалось добавить', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Добавлено в sensitive' });
    await loadScopes();
  };

  const handleDelete = async (id: string) => {
    setSaving(true);
    const { error } = await supabase.from('sensitive_scopes').delete().eq('id', id);
    setSaving(false);
    if (error) {
      toast({ title: 'Ошибка удаления', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Удалено' });
    await loadScopes();
  };

  if (accessLoading || superGate === 'pending') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <LogoLoader className="h-8 w-8" />
      </div>
    );
  }

  if (superGate === 'no') {
    return <Navigate to="/admin" replace />;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AdminHeader currentView="sensitive" hasData={false} />
      <div className="flex-1 overflow-auto p-4 md:p-6 max-w-3xl mx-auto w-full space-y-6">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-600" aria-hidden />
            Sensitive — скрытые юниты и команды
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Для обычных админов и пользователей строки с этими юнитами/командами не попадают в выборку. Супер-админ
            на дашборде по умолчанию тоже не видит их, пока не включит галочку «Sensitive».
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="rounded-lg border border-border bg-card p-4 space-y-4">
              <p className="text-sm font-medium">Добавить область</p>
              <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                <div className="space-y-1.5 flex-1 min-w-0">
                  <Label className="text-xs text-muted-foreground">Юнит</Label>
                  <Select value={pickUnit || undefined} onValueChange={setPickUnit}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Выберите юнит" />
                    </SelectTrigger>
                    <SelectContent>
                      {units.map((u) => (
                        <SelectItem key={u} value={u}>
                          {u}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2 pb-0.5">
                  <Checkbox id="whole-unit" checked={wholeUnit} onCheckedChange={(c) => setWholeUnit(!!c)} />
                  <Label htmlFor="whole-unit" className="text-sm cursor-pointer">
                    Весь юнит
                  </Label>
                </div>
                {!wholeUnit && (
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <Label className="text-xs text-muted-foreground">Команда</Label>
                    <Select value={pickTeam} onValueChange={setPickTeam} disabled={!pickUnit}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Команда" />
                      </SelectTrigger>
                      <SelectContent>
                        {teamsForPickUnit.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <Button type="button" onClick={() => void handleAdd()} disabled={saving || !pickUnit}>
                  Добавить
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="px-3 py-2 border-b border-border text-sm font-medium">Текущий список ({rows.length})</div>
              <ScrollArea className="h-[min(50vh,360px)]">
                {rows.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">Пока ничего не скрыто.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {rows.map((r) => (
                      <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                        <span>
                          <span className="font-medium">{r.unit}</span>
                          {r.team === null ? (
                            <span className="text-muted-foreground"> — весь юнит</span>
                          ) : (
                            <span className="text-muted-foreground"> — {r.team}</span>
                          )}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                          disabled={saving}
                          onClick={() => void handleDelete(r.id)}
                          aria-label="Удалить"
                        >
                          <Trash2 size={15} />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </ScrollArea>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
