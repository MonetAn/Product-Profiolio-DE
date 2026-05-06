import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Loader2,
  UserPlus,
  Trash2,
  User,
  ShieldCheck,
  ShieldAlert,
  Search,
  X,
  SlidersHorizontal,
  ChevronDown,
} from 'lucide-react';
import { LogoLoader } from '@/components/LogoLoader';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import AdminHeader from '@/components/admin/AdminHeader';
import { AntDayDatePicker } from '@/components/ui/AntDayDatePicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAccess } from '@/hooks/useAccess';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { Database, Json } from '@/integrations/supabase/types';
import { cn } from '@/lib/utils';

type AllowedUserRow = Database['public']['Tables']['allowed_users']['Row'];

type TeamPair = { unit: string; team: string };

/** Справочные строки юнит/команда в карточке пользователя (не путать с областью данных дашборда). */
type OrgAffiliationRow = { unit: string; team: string };

function orgAffiliationsFromRow(row: AllowedUserRow): OrgAffiliationRow[] {
  const raw = row.member_affiliations;
  if (raw != null && Array.isArray(raw) && raw.length > 0) {
    const out: OrgAffiliationRow[] = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const o = item as { unit?: unknown; team?: unknown };
      const unit = typeof o.unit === 'string' ? o.unit.trim() : '';
      if (!unit) continue;
      const team = typeof o.team === 'string' ? o.team.trim() : '';
      out.push({ unit, team });
    }
    if (out.length > 0) return out;
  }
  if (row.member_unit?.trim()) {
    return [{ unit: row.member_unit.trim(), team: row.member_team?.trim() ?? '' }];
  }
  return [];
}

function sameOrgAffiliation(a: OrgAffiliationRow, b: OrgAffiliationRow): boolean {
  return a.unit === b.unit && a.team === b.team;
}

function isCatalogPair(p: TeamPair, catalog: TeamPair[]): boolean {
  return catalog.some((c) => c.unit === p.unit && c.team === p.team);
}

const ALLOWED_USERS_SELECT_COLUMNS = [
  'id',
  'email',
  'role',
  'created_at',
  'display_name',
  'member_unit',
  'member_team',
  'allowed_units',
  'allowed_team_pairs',
  'can_view_money',
  'member_affiliations',
].join(', ');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NONE = '__none__';
const ALL = '__all__';
const EMPTY = '__empty__';

const PRIVILEGED_ROLES = new Set(['admin', 'super_admin']);

function isPrivilegedRole(role: string): boolean {
  return PRIVILEGED_ROLES.has(role);
}

function roleLabel(role: string): string {
  if (role === 'super_admin') return 'супер-админ';
  if (role === 'admin') return 'админ';
  return 'пользователь';
}

function isValidEmail(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  return EMAIL_REGEX.test(trimmed) && trimmed.endsWith('@dodobrands.io');
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function parseTeamPairs(value: unknown): TeamPair[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (p): p is TeamPair => p != null && typeof (p as TeamPair).unit === 'string' && typeof (p as TeamPair).team === 'string'
  );
}

function parseUnits(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((u): u is string => typeof u === 'string') : [];
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return '—';
  }
}

export default function AdminAccess() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { isAdmin } = useAccess();
  const currentEmail = user?.email?.toLowerCase() ?? '';

  const [list, setList] = useState<AllowedUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [addEmail, setAddEmail] = useState('');
  const [addRole, setAddRole] = useState<'admin' | 'user' | 'super_admin'>('user');
  const [adding, setAdding] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterUnit, setFilterUnit] = useState<string>(ALL);
  const [filterTeam, setFilterTeam] = useState<string>(ALL);

  const [units, setUnits] = useState<string[]>([]);
  const [teamPairs, setTeamPairs] = useState<TeamPair[]>([]);
  const [scopeDialogUserId, setScopeDialogUserId] = useState<string | null>(null);
  const [scopeFullAccess, setScopeFullAccess] = useState(true);
  const [scopeSelectedUnits, setScopeSelectedUnits] = useState<string[]>([]);
  const [scopeSelectedPairs, setScopeSelectedPairs] = useState<TeamPair[]>([]);
  const [scopeCanViewMoney, setScopeCanViewMoney] = useState(true);
  const [scopeSaving, setScopeSaving] = useState(false);

  const [orgDisplayName, setOrgDisplayName] = useState('');
  const [orgAffiliations, setOrgAffiliations] = useState<OrgAffiliationRow[]>([]);
  const [orgAffPopoverOpen, setOrgAffPopoverOpen] = useState(false);
  const [orgPairFilter, setOrgPairFilter] = useState('');

  const [deleteConfirmRow, setDeleteConfirmRow] = useState<AllowedUserRow | null>(null);

  const [wideLayout, setWideLayout] = useState(
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : false
  );
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const apply = () => setWideLayout(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const fetchOptions = useCallback(async () => {
    const [initRes, peopleRes] = await Promise.all([
      supabase.from('initiatives').select('unit, team'),
      supabase.from('people').select('unit, team'),
    ]);
    const rows: { unit: string | null; team: string | null }[] = [
      ...(initRes.data ?? []),
      ...(peopleRes.data ?? []).filter((r) => r.unit != null || r.team != null),
    ];
    const unitSet = new Set<string>();
    const pairKeySet = new Set<string>();
    const pairs: TeamPair[] = [];
    rows.forEach((r) => {
      const u = r.unit ?? '';
      const t = r.team ?? '';
      if (u) unitSet.add(u);
      if (u && t) {
        const key = `${u}\0${t}`;
        if (!pairKeySet.has(key)) {
          pairKeySet.add(key);
          pairs.push({ unit: u, team: t });
        }
      }
    });
    setUnits(Array.from(unitSet).sort());
    setTeamPairs(pairs.sort((a, b) => a.unit.localeCompare(b.unit) || a.team.localeCompare(b.team)));
  }, []);

  const fetchList = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('allowed_users')
      .select(ALLOWED_USERS_SELECT_COLUMNS)
      .order('created_at', { ascending: false });
    if (error) {
      toast({ title: 'Ошибка загрузки', description: error.message, variant: 'destructive' });
      setList([]);
    } else {
      setList(data ?? []);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchList();
    fetchOptions();
  }, [fetchList, fetchOptions]);

  const unitsForFilters = useMemo(() => {
    const s = new Set(units);
    list.forEach((r) => {
      if (r.member_unit?.trim()) s.add(r.member_unit.trim());
    });
    return Array.from(s).sort();
  }, [units, list]);

  const teamsForFilterDropdown = useMemo(() => {
    if (filterUnit === EMPTY) return [];
    if (filterUnit !== ALL) {
      return teamPairs.filter((p) => p.unit === filterUnit).map((p) => p.team);
    }
    const s = new Set<string>();
    teamPairs.forEach((p) => s.add(p.team));
    list.forEach((r) => {
      if (r.member_team?.trim()) s.add(r.member_team.trim());
    });
    return Array.from(s).sort();
  }, [filterUnit, teamPairs, list]);

  const filteredList = useMemo(() => {
    let rows = list;
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (r) =>
          r.email.toLowerCase().includes(q) ||
          (r.display_name && r.display_name.toLowerCase().includes(q))
      );
    }
    if (dateFrom) {
      const t = new Date(`${dateFrom}T00:00:00`).getTime();
      rows = rows.filter((r) => new Date(r.created_at).getTime() >= t);
    }
    if (dateTo) {
      const t = new Date(`${dateTo}T23:59:59.999`).getTime();
      rows = rows.filter((r) => new Date(r.created_at).getTime() <= t);
    }
    if (filterUnit === EMPTY) {
      rows = rows.filter((r) => !r.member_unit?.trim());
    } else if (filterUnit !== ALL) {
      rows = rows.filter((r) => r.member_unit === filterUnit);
    }
    if (filterTeam === EMPTY) {
      rows = rows.filter((r) => !r.member_team?.trim());
    } else if (filterTeam !== ALL) {
      rows = rows.filter((r) => r.member_team === filterTeam);
    }
    return rows;
  }, [list, searchQuery, dateFrom, dateTo, filterUnit, filterTeam]);

  const privilegedCount = list.filter((r) => isPrivilegedRole(r.role)).length;
  const isSelf = (row: AllowedUserRow) => row.email.toLowerCase() === currentEmail;
  const isLastPrivileged = (row: AllowedUserRow) => isPrivilegedRole(row.role) && privilegedCount <= 1;
  const cannotDemoteSelf = (row: AllowedUserRow) => isSelf(row) && isLastPrivileged(row);

  const loadOrgFromRow = (row: AllowedUserRow) => {
    setOrgDisplayName(row.display_name ?? '');
    setOrgAffiliations(orgAffiliationsFromRow(row));
    setOrgPairFilter('');
  };

  const extraOrgAffiliations = useMemo(() => {
    return orgAffiliations.filter((o) => {
      if (!o.unit.trim()) return false;
      if (!o.team.trim()) return true;
      return !isCatalogPair({ unit: o.unit, team: o.team }, teamPairs);
    });
  }, [orgAffiliations, teamPairs]);

  const filteredOrgCatalogPairs = useMemo(() => {
    const q = orgPairFilter.trim().toLowerCase();
    if (!q) return teamPairs;
    return teamPairs.filter((p) => `${p.unit} ${p.team}`.toLowerCase().includes(q));
  }, [teamPairs, orgPairFilter]);

  const orgPairsByUnit = useMemo(() => {
    const m = new Map<string, TeamPair[]>();
    for (const p of filteredOrgCatalogPairs) {
      if (!m.has(p.unit)) m.set(p.unit, []);
      m.get(p.unit)!.push(p);
    }
    return m;
  }, [filteredOrgCatalogPairs]);

  const orgAffiliationTriggerLabel = useMemo(() => {
    const filled = orgAffiliations.filter((o) => o.unit.trim());
    if (filled.length === 0) return 'Выбрать юниты и команды';
    if (filled.length <= 2) {
      return filled
        .map((o) => (o.team.trim() ? `${o.unit} · ${o.team}` : o.unit))
        .join(', ');
    }
    return `${filled.length} выбрано`;
  }, [orgAffiliations]);

  const toggleOrgCatalogPair = useCallback((p: TeamPair) => {
    setOrgAffiliations((prev) => {
      const row: OrgAffiliationRow = { unit: p.unit, team: p.team };
      const exists = prev.some((x) => sameOrgAffiliation(x, row));
      if (exists) return prev.filter((x) => !sameOrgAffiliation(x, row));
      return [...prev, row];
    });
  }, []);

  const removeOrgAffiliation = useCallback((row: OrgAffiliationRow) => {
    setOrgAffiliations((prev) => prev.filter((x) => !sameOrgAffiliation(x, row)));
  }, []);

  const toggleAllOrgPairsInUnit = useCallback(
    (unit: string, selectAll: boolean) => {
      const inUnit = teamPairs.filter((p) => p.unit === unit);
      setOrgAffiliations((prev) => {
        if (selectAll) {
          const next = [...prev];
          for (const p of inUnit) {
            const row = { unit: p.unit, team: p.team };
            if (!next.some((x) => sameOrgAffiliation(x, row))) next.push(row);
          }
          return next;
        }
        return prev.filter((x) => {
          if (x.unit !== unit) return true;
          if (!x.team.trim()) return true;
          return !inUnit.some((p) => p.team === x.team);
        });
      });
    },
    [teamPairs]
  );

  const handleAdd = async () => {
    const email = normalizeEmail(addEmail);
    if (!email) {
      toast({ title: 'Введите email', variant: 'destructive' });
      return;
    }
    if (!isValidEmail(addEmail)) {
      toast({ title: 'Некорректный email', description: 'Используйте корпоративный @dodobrands.io', variant: 'destructive' });
      return;
    }
    setAdding(true);
    const { error } = await supabase.from('allowed_users').insert({ email, role: addRole });
    if (error) {
      if (error.code === '23505') {
        toast({ title: 'Пользователь уже добавлен', description: email, variant: 'destructive' });
      } else {
        toast({ title: 'Ошибка добавления', description: error.message, variant: 'destructive' });
      }
      setAdding(false);
      return;
    }
    toast({ title: 'Добавлен', description: `${email} — ${roleLabel(addRole)}` });
    setAddEmail('');
    setAddRole('user');
    setAdding(false);
    fetchList();
  };

  const handleRoleChange = async (id: string, newRole: 'admin' | 'user' | 'super_admin') => {
    const row = list.find((r) => r.id === id);
    if (!row) return;
    if (cannotDemoteSelf(row)) {
      toast({
        title: 'Вы единственный с правами администратора',
        description: 'Назначьте другого админа или супер-админа перед сменой роли.',
        variant: 'destructive',
      });
      return;
    }
    const { error } = await supabase.from('allowed_users').update({ role: newRole }).eq('id', id);
    if (error) {
      toast({ title: 'Ошибка', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Роль обновлена', description: `${row.email} — ${roleLabel(newRole)}` });
    if (scopeDialogUserId === id) {
      const { data: fresh } = await supabase
        .from('allowed_users')
        .select(ALLOWED_USERS_SELECT_COLUMNS)
        .eq('id', id)
        .maybeSingle();
      if (fresh) {
        if (fresh.role === 'admin' || fresh.role === 'super_admin') {
          setScopeFullAccess(true);
          setScopeSelectedUnits([]);
          setScopeSelectedPairs([]);
          setScopeCanViewMoney(true);
        } else {
          openScopeDialog(fresh);
        }
      }
    }
    fetchList();
  };

  const handleDelete = async (id: string) => {
    const row = list.find((r) => r.id === id);
    if (!row) return;
    if (isSelf(row)) {
      toast({ title: 'Нельзя удалить себя', variant: 'destructive' });
      return;
    }
    if (isPrivilegedRole(row.role) && privilegedCount <= 1) {
      toast({ title: 'Нельзя удалить последнего админа или супер-админа', variant: 'destructive' });
      return;
    }
    const { error } = await supabase.from('allowed_users').delete().eq('id', id);
    if (error) {
      toast({ title: 'Ошибка удаления', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Доступ удалён', description: row.email });
    if (scopeDialogUserId === id) closeScopeDialog();
    fetchList();
  };

  const requestDelete = (row: AllowedUserRow, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSelf(row)) {
      toast({ title: 'Нельзя удалить себя', variant: 'destructive' });
      return;
    }
    if (isPrivilegedRole(row.role) && privilegedCount <= 1) {
      toast({ title: 'Нельзя удалить последнего админа или супер-админа', variant: 'destructive' });
      return;
    }
    setDeleteConfirmRow(row);
  };

  const editingRow = scopeDialogUserId ? list.find((r) => r.id === scopeDialogUserId) : null;

  const selectUserForEditing = (row: AllowedUserRow) => {
    loadOrgFromRow(row);
    if (isPrivilegedRole(row.role)) {
      setScopeDialogUserId(row.id);
      setScopeFullAccess(true);
      setScopeSelectedUnits([]);
      setScopeSelectedPairs([]);
      setScopeCanViewMoney(true);
      return;
    }
    openScopeDialog(row);
  };

  const openScopeDialog = (row: AllowedUserRow) => {
    setScopeDialogUserId(row.id);
    const u = parseUnits(row.allowed_units);
    const p = parseTeamPairs(row.allowed_team_pairs);
    setScopeFullAccess(u.length === 0 && p.length === 0);
    setScopeSelectedUnits(u);
    setScopeSelectedPairs(p);
    setScopeCanViewMoney(row.can_view_money !== false);
  };

  const closeScopeDialog = () => {
    setScopeDialogUserId(null);
  };

  const toggleScopeUnit = (unit: string) => {
    setScopeSelectedUnits((prev) =>
      prev.includes(unit) ? prev.filter((x) => x !== unit) : [...prev, unit]
    );
  };

  const toggleScopePair = (pair: TeamPair) => {
    setScopeSelectedPairs((prev) => {
      const exists = prev.some((x) => x.unit === pair.unit && x.team === pair.team);
      return exists ? prev.filter((x) => !(x.unit === pair.unit && x.team === pair.team)) : [...prev, pair];
    });
  };

  const selectAllTeamsInUnit = (unit: string) => {
    const pairsInUnit = teamPairs.filter((p) => p.unit === unit);
    setScopeSelectedPairs((prev) => {
      const rest = prev.filter((p) => p.unit !== unit);
      const added = pairsInUnit.filter((p) => !rest.some((x) => x.unit === p.unit && x.team === p.team));
      return [...rest, ...added];
    });
  };

  const teamsByUnit = teamPairs.reduce<Record<string, TeamPair[]>>((acc, p) => {
    if (!acc[p.unit]) acc[p.unit] = [];
    acc[p.unit].push(p);
    return acc;
  }, {});
  const unitKeysForTeams = Object.keys(teamsByUnit).sort();

  const buildProfilePayload = (): {
    display_name: string | null;
    member_unit: string | null;
    member_team: string | null;
    member_affiliations: Json;
  } => {
    const cleaned = orgAffiliations
      .map((r) => ({
        unit: r.unit.trim(),
        team: r.team.trim() ? r.team.trim() : null,
      }))
      .filter((r) => r.unit.length > 0);
    const first = cleaned[0];
    return {
      display_name: orgDisplayName.trim() || null,
      member_affiliations: cleaned as unknown as Json,
      member_unit: first?.unit ?? null,
      member_team: first?.team ?? null,
    };
  };

  const handleSaveAll = async () => {
    if (!scopeDialogUserId || !editingRow) return;
    setScopeSaving(true);
    const profile = buildProfilePayload();
    if (isPrivilegedRole(editingRow.role)) {
      const { error } = await supabase.from('allowed_users').update(profile).eq('id', scopeDialogUserId);
      setScopeSaving(false);
      if (error) {
        toast({ title: 'Ошибка сохранения', description: error.message, variant: 'destructive' });
        return;
      }
      toast({ title: 'Сохранено' });
      closeScopeDialog();
      fetchList();
      return;
    }
    const allowed_units = scopeFullAccess ? [] : scopeSelectedUnits;
    const allowed_team_pairs = scopeFullAccess ? [] : scopeSelectedPairs;
    const { error } = await supabase
      .from('allowed_users')
      .update({
        ...profile,
        allowed_units,
        allowed_team_pairs,
        can_view_money: scopeCanViewMoney,
      })
      .eq('id', scopeDialogUserId);
    setScopeSaving(false);
    if (error) {
      toast({ title: 'Ошибка сохранения', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Сохранено' });
    closeScopeDialog();
    fetchList();
  };

  const resetFilters = () => {
    setSearchQuery('');
    setDateFrom('');
    setDateTo('');
    setFilterUnit(ALL);
    setFilterTeam(ALL);
  };

  const renderOrgForm = () => (
    <div className="space-y-4 rounded-md border border-border p-4 bg-muted/20">
      <h4 className="text-sm font-semibold">Организационные привязки (справочно)</h4>
      <p className="text-xs text-muted-foreground">
        Одно окно: отметьте пары из каталога. Доступ к строкам портфеля — только в блоке «Доступ к данным дашборда» ниже.
      </p>
      <div className="space-y-2">
        <Label htmlFor="org-name">Имя (для поиска)</Label>
        <Input
          id="org-name"
          placeholder="Как отображать в списке"
          value={orgDisplayName}
          onChange={(e) => setOrgDisplayName(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="org-aff-trigger">Юниты и команды</Label>
        <Popover
          open={orgAffPopoverOpen}
          onOpenChange={(o) => {
            setOrgAffPopoverOpen(o);
            if (!o) setOrgPairFilter('');
          }}
        >
          <PopoverTrigger asChild>
            <button
              id="org-aff-trigger"
              type="button"
              className={cn(
                'flex h-9 w-full max-w-xl items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm shadow-sm',
                'ring-offset-background hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
              )}
            >
              <span className="min-w-0 flex-1 truncate text-left">
                {orgAffiliationTriggerLabel}
              </span>
              <ChevronDown className="size-4 shrink-0 opacity-60" aria-hidden />
            </button>
          </PopoverTrigger>
          <PopoverContent className="z-[95] w-[min(100vw-1.5rem,22rem)] p-0" align="start" collisionPadding={8}>
            <div className="border-b border-border p-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  className="h-8 pl-8 text-sm"
                  placeholder="Поиск по юниту или команде…"
                  value={orgPairFilter}
                  onChange={(e) => setOrgPairFilter(e.target.value)}
                />
              </div>
            </div>
            <ScrollArea className="h-[min(55vh,280px)]">
              {teamPairs.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">
                  В выгрузке нет пар юнит–команда. Добавьте инициативы или людей с юнитом и командой.
                </p>
              ) : filteredOrgCatalogPairs.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">Ничего не найдено.</p>
              ) : (
                <div className="p-1">
                  {[...orgPairsByUnit.keys()].sort((a, b) => a.localeCompare(b)).map((unit) => {
                    const pairs = orgPairsByUnit.get(unit) ?? [];
                    const inFull = teamPairs.filter((p) => p.unit === unit);
                    const selectedInUnit = inFull.filter((p) =>
                      orgAffiliations.some((x) => x.unit === p.unit && x.team === p.team)
                    ).length;
                    const allOn = inFull.length > 0 && selectedInUnit === inFull.length;
                    const someOn = selectedInUnit > 0 && !allOn;
                    return (
                      <div key={unit} className="mb-2 last:mb-0">
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent"
                          title={
                            allOn
                              ? 'Снять выбор со всех команд этого юнита'
                              : 'Выбрать все команды этого юнита'
                          }
                          onClick={() => toggleAllOrgPairsInUnit(unit, !allOn)}
                        >
                          <span className="text-xs font-semibold text-foreground">{unit}</span>
                          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                            {allOn ? (
                              <span className="text-primary">все</span>
                            ) : someOn ? (
                              `${selectedInUnit}/${inFull.length}`
                            ) : (
                              ''
                            )}
                          </span>
                        </button>
                        <div className="flex flex-col gap-0.5">
                          {pairs.map((p) => {
                            const checked = orgAffiliations.some(
                              (x) => x.unit === p.unit && x.team === p.team
                            );
                            return (
                              <label
                                key={`${p.unit}\0${p.team}`}
                                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                              >
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={() => toggleOrgCatalogPair(p)}
                                  className="shrink-0"
                                />
                                <span className="min-w-0 truncate">{p.team}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </PopoverContent>
        </Popover>
        {extraOrgAffiliations.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-[11px] text-muted-foreground">
              Не в каталоге (остались из старых данных) — снимите или сохраните как есть:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {extraOrgAffiliations.map((o) => (
                <Badge
                  key={`extra-${o.unit}-${o.team}`}
                  variant="secondary"
                  className="gap-1 pr-1 font-normal"
                >
                  <span className="max-w-[200px] truncate">
                    {o.team.trim() ? `${o.unit} · ${o.team}` : o.unit}
                  </span>
                  <button
                    type="button"
                    className="rounded-sm p-0.5 hover:bg-muted"
                    aria-label="Убрать"
                    onClick={() => removeOrgAffiliation(o)}
                  >
                    <X className="size-3.5" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-screen bg-background">
      <AdminHeader currentView="access" />

      <main className="flex-1 flex flex-col min-h-0 p-3 md:p-6 gap-2 md:gap-4">
        <div className="shrink-0 rounded-lg border border-border bg-card p-3 flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[min(100%,200px)]">
            <Label htmlFor="access-email-top" className="sr-only">
              Email @dodobrands.io
            </Label>
            <Input
              id="access-email-top"
              type="email"
              placeholder="Email @dodobrands.io"
              value={addEmail}
              onChange={(e) => setAddEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              disabled={adding}
              className="h-9"
            />
          </div>
          <div className="w-[min(100%,9rem)] sm:w-36">
            <Label htmlFor="add-role" className="sr-only">
              Роль при добавлении
            </Label>
            <Select value={addRole} onValueChange={(v) => setAddRole(v as 'admin' | 'user' | 'super_admin')} disabled={adding}>
              <SelectTrigger id="add-role" className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">
                  <span className="flex items-center gap-2">
                    <User size={14} /> Пользователь
                  </span>
                </SelectItem>
                <SelectItem value="admin">
                  <span className="flex items-center gap-2">
                    <ShieldCheck size={14} /> Админ
                  </span>
                </SelectItem>
                {isAdmin && (
                  <SelectItem value="super_admin">
                    <span className="flex items-center gap-2">
                      <ShieldAlert size={14} className="text-amber-600" /> Супер-админ
                    </span>
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleAdd} disabled={adding || !addEmail.trim()} size="sm" className="h-9 shrink-0">
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            <span className="ml-1.5 hidden sm:inline">Добавить</span>
          </Button>
        </div>

        <div className="shrink-0 space-y-2">
          {!wideLayout && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full justify-between h-9"
              onClick={() => setFiltersOpen((o) => !o)}
            >
              <span className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 shrink-0" />
                Фильтры и поиск
              </span>
              <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', filtersOpen && 'rotate-180')} />
            </Button>
          )}
          {(wideLayout || filtersOpen) && (
            <div className="rounded-lg border border-border bg-card p-2">
              <div className="flex flex-wrap items-end gap-x-2 gap-y-2">
                <div className="w-full min-[520px]:w-[min(100%,18rem)] min-[520px]:max-w-xs min-[520px]:shrink-0">
                  <Label className="text-[11px] text-muted-foreground leading-none">Поиск</Label>
                  <div className="relative mt-1">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    <Input
                      className="pl-8 h-9 text-sm w-full"
                      placeholder="Email или имя…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>
                <div className="w-full min-[420px]:w-[calc(50%-0.25rem)] min-[560px]:w-[12.5rem] shrink-0 min-w-0">
                  <Label className="text-[11px] text-muted-foreground leading-none">Дата с</Label>
                  <div className="mt-1 w-full min-w-[10.5rem] [&_.ant-picker]:h-9 [&_.ant-picker]:w-full [&_.ant-picker-input>input]:text-sm">
                    <AntDayDatePicker value={dateFrom} onChange={setDateFrom} className="w-full" size="middle" />
                  </div>
                </div>
                <div className="w-full min-[420px]:w-[calc(50%-0.25rem)] min-[560px]:w-[12.5rem] shrink-0 min-w-0">
                  <Label className="text-[11px] text-muted-foreground leading-none">Дата по</Label>
                  <div className="mt-1 w-full min-w-[10.5rem] [&_.ant-picker]:h-9 [&_.ant-picker]:w-full [&_.ant-picker-input>input]:text-sm">
                    <AntDayDatePicker value={dateTo} onChange={setDateTo} className="w-full" size="middle" />
                  </div>
                </div>
                <div className="w-[calc(50%-0.25rem)] min-[520px]:w-[9.5rem] shrink-0">
                  <Label className="text-[11px] text-muted-foreground leading-none">Юнит</Label>
                  <Select
                    value={filterUnit}
                    onValueChange={(v) => {
                      setFilterUnit(v);
                      setFilterTeam(ALL);
                    }}
                  >
                    <SelectTrigger className="mt-1 h-9 w-full text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>Все</SelectItem>
                      <SelectItem value={EMPTY}>Без юнита</SelectItem>
                      {unitsForFilters.map((u) => (
                        <SelectItem key={u} value={u}>
                          {u}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-[calc(50%-0.25rem)] min-[520px]:w-[9.5rem] shrink-0">
                  <Label className="text-[11px] text-muted-foreground leading-none">Команда</Label>
                  <Select value={filterTeam} onValueChange={setFilterTeam} disabled={filterUnit === EMPTY}>
                    <SelectTrigger className="mt-1 h-9 w-full text-sm">
                      <SelectValue placeholder={filterUnit === EMPTY ? '—' : undefined} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>Все</SelectItem>
                      <SelectItem value={EMPTY}>Без команды</SelectItem>
                      {teamsForFilterDropdown.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 shrink-0"
                  onClick={resetFilters}
                  title="Сбросить фильтры"
                >
                  <X className="h-4 w-4 mr-1.5" />
                  Сбросить
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 flex min-h-0 gap-2 md:gap-4 flex-col lg:flex-row overflow-hidden min-h-[min(50vh,24rem)]">
          <div className="flex flex-col min-w-0 lg:w-[min(40%,420px)] lg:max-w-[420px] shrink-0 border border-border rounded-lg overflow-hidden bg-card">
            <div className="px-2.5 py-1.5 border-b border-border shrink-0 flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground truncate">
                Список · {filteredList.length}/{list.length}
              </span>
            </div>
            <div className="flex-1 min-h-0 flex flex-col px-1 pb-1">
              {loading ? (
                <div className="flex items-center justify-center py-12 flex-1">
                  <LogoLoader className="h-8 w-8" />
                </div>
              ) : list.length === 0 ? (
                <p className="text-sm text-muted-foreground p-3">Пока никого нет.</p>
              ) : filteredList.length === 0 ? (
                <p className="text-sm text-muted-foreground p-3">Никто не подходит под фильтры.</p>
              ) : (
                <ScrollArea className="flex-1 min-h-0 h-[min(40vh,280px)] lg:h-full">
                  <ul className="divide-y divide-border">
                    {filteredList.map((row) => (
                      <li key={row.id}>
                        <div
                          role="button"
                          tabIndex={0}
                          aria-label={`${row.email}, ${roleLabel(row.role)}`}
                          className={cn(
                            'flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-sm cursor-pointer outline-none',
                            'hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                            scopeDialogUserId === row.id && 'bg-muted/50'
                          )}
                          onClick={() => selectUserForEditing(row)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              selectUserForEditing(row);
                            }
                          }}
                        >
                          <span
                            className="shrink-0 flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background"
                            title={
                              row.role === 'super_admin'
                                ? 'Супер-администратор'
                                : row.role === 'admin'
                                  ? 'Администратор'
                                  : 'Пользователь'
                            }
                          >
                            {row.role === 'super_admin' ? (
                              <ShieldAlert className="h-4 w-4 text-amber-600" aria-hidden />
                            ) : row.role === 'admin' ? (
                              <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
                            ) : (
                              <User className="h-4 w-4 text-muted-foreground" aria-hidden />
                            )}
                          </span>
                          <span className="min-w-0 flex-1 font-medium text-sm truncate">
                            {row.email}
                            {isSelf(row) ? <span className="text-muted-foreground font-normal"> · вы</span> : null}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                            onClick={(e) => requestDelete(row, e)}
                            disabled={isSelf(row) || (isPrivilegedRole(row.role) && privilegedCount <= 1)}
                            aria-label={`Удалить ${row.email}`}
                          >
                            <Trash2 size={15} />
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              )}
            </div>
          </div>

          <div className="flex-1 min-w-0 flex flex-col border border-border rounded-lg overflow-hidden bg-card">
            {!editingRow ? (
              <div className="flex items-center justify-center flex-1 text-muted-foreground text-sm p-8">
                Выберите пользователя в списке слева
              </div>
            ) : (
              <>
                <div className="shrink-0 px-4 py-3 border-b border-border">
                  <h3 className="text-base sm:text-lg font-semibold break-all leading-tight">{editingRow.email}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Добавлен: {formatDate(editingRow.created_at)}</p>
                </div>
                <ScrollArea className="flex-1 min-h-0">
                  <div className="p-4 space-y-6">
                    <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3">
                      <Label htmlFor="detail-role" className="text-sm font-medium">
                        Роль
                      </Label>
                      <Select
                        value={editingRow.role}
                        onValueChange={(v) => handleRoleChange(editingRow.id, v as 'admin' | 'user' | 'super_admin')}
                        disabled={cannotDemoteSelf(editingRow)}
                      >
                        <SelectTrigger id="detail-role" className="h-9 w-full max-w-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">
                            <span className="flex items-center gap-2">
                              <ShieldCheck size={14} /> Админ
                            </span>
                          </SelectItem>
                          <SelectItem value="user">
                            <span className="flex items-center gap-2">
                              <User size={14} /> Пользователь
                            </span>
                          </SelectItem>
                          {(isAdmin || editingRow.role === 'super_admin') && (
                            <SelectItem value="super_admin">
                              <span className="flex items-center gap-2">
                                <ShieldAlert size={14} className="text-amber-600" /> Супер-админ
                              </span>
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    {renderOrgForm()}
                    {isPrivilegedRole(editingRow.role) ? (
                      <p className="text-sm text-muted-foreground">
                        {editingRow.role === 'super_admin'
                          ? 'Супер-админ: полный доступ к данным, вкладка Sensitive, галочка Sensitive на дашборде.'
                          : 'У админа полный доступ к данным дашборда (без скрытых sensitive-областей).'}
                      </p>
                    ) : (
                      <>
                        <div className="border-t border-border pt-4">
                          <h4 className="font-juneau font-medium text-sm mb-2">Доступ к данным дашборда</h4>
                          <p className="text-xs text-muted-foreground mb-4">
                            Не супер-админ видит в данных только то, что разрешено здесь (в БД — <strong>allowed_units</strong> и{' '}
                            <strong>allowed_team_pairs</strong>). По каждому юниту: либо все команды, либо несколько команд галочками; можно
                            несколько юнитов. Справочные привязки выше на видимость строк не влияют.
                          </p>
                          <div className="space-y-4">
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="scope-can-view-money"
                                checked={scopeCanViewMoney}
                                onCheckedChange={(c) => setScopeCanViewMoney(!!c)}
                              />
                              <Label htmlFor="scope-can-view-money" className="cursor-pointer font-medium">
                                Показывать суммы (деньги)
                              </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="scope-full"
                                checked={scopeFullAccess}
                                onCheckedChange={(c) => setScopeFullAccess(!!c)}
                              />
                              <Label htmlFor="scope-full" className="cursor-pointer font-medium">
                                Полный доступ (все юниты и команды)
                              </Label>
                            </div>
                            {units.length > 0 || unitKeysForTeams.length > 0 ? (
                              <div className={`space-y-2 ${scopeFullAccess ? 'opacity-50 pointer-events-none' : ''}`}>
                                <Label className="text-muted-foreground">Ограничение по данным</Label>
                                <div className="rounded-md border p-3 space-y-4 max-h-[320px] overflow-y-auto">
                                  {units.map((unit) => {
                                    const pairs = teamsByUnit[unit] ?? [];
                                    const unitEntire = scopeSelectedUnits.includes(unit);
                                    const unitMode = unitEntire ? 'entire' : 'pick';
                                    const selectedCount = pairs.filter((p) =>
                                      scopeSelectedPairs.some((x) => x.unit === p.unit && x.team === p.team)
                                    ).length;
                                    const allTeamsSelected = pairs.length > 0 && selectedCount === pairs.length;
                                    return (
                                      <div key={unit} className="space-y-2 rounded-lg border border-border/60 bg-muted/10 p-2.5">
                                        <div className="text-sm font-medium text-foreground">{unit}</div>
                                        <RadioGroup
                                          value={unitMode}
                                          onValueChange={(v) => {
                                            if (v === 'entire') {
                                              setScopeSelectedUnits((prev) =>
                                                prev.includes(unit) ? prev : [...prev, unit]
                                              );
                                              setScopeSelectedPairs((prev) => prev.filter((p) => p.unit !== unit));
                                            } else {
                                              setScopeSelectedUnits((prev) => prev.filter((x) => x !== unit));
                                            }
                                          }}
                                          disabled={scopeFullAccess}
                                          className="gap-2 pl-0.5"
                                        >
                                          <div className="flex items-start gap-2">
                                            <RadioGroupItem value="entire" id={`scope-${unit}-entire`} className="mt-0.5" />
                                            <Label htmlFor={`scope-${unit}-entire`} className="cursor-pointer font-normal leading-snug">
                                              Все команды юнита
                                            </Label>
                                          </div>
                                          <div className="flex items-start gap-2">
                                            <RadioGroupItem value="pick" id={`scope-${unit}-pick`} className="mt-0.5" />
                                            <Label htmlFor={`scope-${unit}-pick`} className="cursor-pointer font-normal leading-snug">
                                              Только выбранные команды
                                              <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                                                можно отметить несколько
                                              </span>
                                            </Label>
                                          </div>
                                        </RadioGroup>
                                        {!unitEntire && pairs.length > 0 ? (
                                          <div className="flex flex-col gap-1 border-l-2 border-primary/25 pl-3 pt-1">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                              <span className="text-[11px] text-muted-foreground">Команды</span>
                                              <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 text-xs"
                                                disabled={scopeFullAccess}
                                                onClick={() => {
                                                  if (allTeamsSelected) {
                                                    setScopeSelectedPairs((prev) => prev.filter((p) => p.unit !== unit));
                                                  } else {
                                                    selectAllTeamsInUnit(unit);
                                                  }
                                                }}
                                              >
                                                {allTeamsSelected ? 'Снять все' : 'Выбрать все команды'}
                                              </Button>
                                            </div>
                                            <div className="flex flex-col gap-0.5">
                                              {pairs.map((p) => (
                                                <label
                                                  key={`${p.unit}\0${p.team}`}
                                                  className="flex items-center gap-2 cursor-pointer text-sm"
                                                >
                                                  <Checkbox
                                                    checked={scopeSelectedPairs.some(
                                                      (x) => x.unit === p.unit && x.team === p.team
                                                    )}
                                                    onCheckedChange={() => toggleScopePair(p)}
                                                    disabled={scopeFullAccess}
                                                  />
                                                  {p.team}
                                                </label>
                                              ))}
                                            </div>
                                          </div>
                                        ) : null}
                                        {unitEntire ? (
                                          <p className="text-[11px] text-muted-foreground pl-0.5">
                                            Доступ ко всем командам этого юнита в данных.
                                          </p>
                                        ) : pairs.length === 0 ? (
                                          <p className="text-[11px] text-muted-foreground pl-0.5">
                                            Нет пар юнит–команда в выгрузке для этого юнита.
                                          </p>
                                        ) : null}
                                      </div>
                                    );
                                  })}
                                </div>
                                {!scopeFullAccess && scopeSelectedUnits.length === 0 && scopeSelectedPairs.length === 0 && (
                                  <p className="text-xs text-primary">
                                    Не выбрано — пользователь не увидит данные дашборда.
                                  </p>
                                )}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </ScrollArea>
                <div className="shrink-0 flex gap-2 p-4 border-t border-border">
                  <Button variant="outline" onClick={closeScopeDialog} disabled={scopeSaving}>
                    Закрыть
                  </Button>
                  <Button onClick={handleSaveAll} disabled={scopeSaving}>
                    {scopeSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    <span className={scopeSaving ? 'ml-2' : ''}>Сохранить</span>
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </main>

      <AlertDialog open={!!deleteConfirmRow} onOpenChange={(open) => !open && setDeleteConfirmRow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить доступ?</AlertDialogTitle>
            <AlertDialogDescription>
              Пользователь {deleteConfirmRow?.email} потеряет доступ к дашборду. Вы сможете снова добавить его позже.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deleteConfirmRow) return;
                const id = deleteConfirmRow.id;
                setDeleteConfirmRow(null);
                await handleDelete(id);
              }}
            >
              Удалить доступ
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
