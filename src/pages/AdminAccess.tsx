import { useState, useEffect, useCallback } from 'react';
import { Loader2, UserPlus, Trash2, User, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import AdminHeader from '@/components/admin/AdminHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
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
import type { Database } from '@/integrations/supabase/types';

type AllowedUserRow = Database['public']['Tables']['allowed_users']['Row'];

type TeamPair = { unit: string; team: string };

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

export default function AdminAccess() {
  const { user } = useAuth();
  const { toast } = useToast();
  const currentEmail = user?.email?.toLowerCase() ?? '';

  const [list, setList] = useState<AllowedUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [addEmail, setAddEmail] = useState('');
  const [adding, setAdding] = useState(false);

  const [units, setUnits] = useState<string[]>([]);
  const [teamPairs, setTeamPairs] = useState<TeamPair[]>([]);
  const [scopeDialogUserId, setScopeDialogUserId] = useState<string | null>(null);
  const [scopeFullAccess, setScopeFullAccess] = useState(true);
  const [scopeSelectedUnits, setScopeSelectedUnits] = useState<string[]>([]);
  const [scopeSelectedPairs, setScopeSelectedPairs] = useState<TeamPair[]>([]);
  const [scopeSaving, setScopeSaving] = useState(false);
  const [deleteConfirmRow, setDeleteConfirmRow] = useState<AllowedUserRow | null>(null);

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
    const { data, error } = await supabase.from('allowed_users').select('*').order('created_at', { ascending: false });
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

  const adminCount = list.filter((r) => r.role === 'admin').length;
  const isSelf = (row: AllowedUserRow) => row.email.toLowerCase() === currentEmail;
  const isLastAdmin = (row: AllowedUserRow) => row.role === 'admin' && adminCount <= 1;
  const cannotDemoteSelf = (row: AllowedUserRow) => isSelf(row) && isLastAdmin(row);

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
    const { error } = await supabase.from('allowed_users').insert({ email, role: 'user' });
    if (error) {
      if (error.code === '23505') {
        toast({ title: 'Пользователь уже добавлен', description: email, variant: 'destructive' });
      } else {
        toast({ title: 'Ошибка добавления', description: error.message, variant: 'destructive' });
      }
      setAdding(false);
      return;
    }
    toast({ title: 'Добавлен', description: email });
    setAddEmail('');
    setAdding(false);
    fetchList();
  };

  const handleRoleChange = async (id: string, newRole: 'admin' | 'user') => {
    const row = list.find((r) => r.id === id);
    if (!row) return;
    if (cannotDemoteSelf(row)) {
      toast({ title: 'Вы последний админ', description: 'Назначьте другого админа перед сменой роли.', variant: 'destructive' });
      return;
    }
    const { error } = await supabase.from('allowed_users').update({ role: newRole }).eq('id', id);
    if (error) {
      toast({ title: 'Ошибка', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Роль обновлена', description: `${row.email} — ${newRole === 'admin' ? 'Admin' : 'User'}` });
    fetchList();
  };

  const handleDelete = async (id: string) => {
    const row = list.find((r) => r.id === id);
    if (!row) return;
    if (isSelf(row)) {
      toast({ title: 'Нельзя удалить себя', variant: 'destructive' });
      return;
    }
    if (row.role === 'admin' && adminCount <= 1) {
      toast({ title: 'Нельзя удалить последнего админа', variant: 'destructive' });
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
    if (row.role === 'admin' && adminCount <= 1) {
      toast({ title: 'Нельзя удалить последнего админа', variant: 'destructive' });
      return;
    }
    setDeleteConfirmRow(row);
  };

  const editingRow = scopeDialogUserId ? list.find((r) => r.id === scopeDialogUserId) : null;

  const selectUserForEditing = (row: AllowedUserRow) => {
    if (row.role === 'admin') {
      setScopeDialogUserId(row.id);
      setScopeFullAccess(true);
      setScopeSelectedUnits([]);
      setScopeSelectedPairs([]);
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

  const clearAllTeamsInUnit = (unit: string) => {
    setScopeSelectedPairs((prev) => prev.filter((p) => p.unit !== unit));
  };

  const teamsByUnit = teamPairs.reduce<Record<string, TeamPair[]>>((acc, p) => {
    if (!acc[p.unit]) acc[p.unit] = [];
    acc[p.unit].push(p);
    return acc;
  }, {});
  const unitKeysForTeams = Object.keys(teamsByUnit).sort();

  const handleSaveScope = async () => {
    if (!scopeDialogUserId) return;
    setScopeSaving(true);
    const allowed_units = scopeFullAccess ? [] : scopeSelectedUnits;
    const allowed_team_pairs = scopeFullAccess ? [] : scopeSelectedPairs;
    const { error } = await supabase
      .from('allowed_users')
      .update({ allowed_units, allowed_team_pairs })
      .eq('id', scopeDialogUserId);
    setScopeSaving(false);
    if (error) {
      toast({ title: 'Ошибка сохранения доступа', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Доступ обновлён' });
    closeScopeDialog();
    fetchList();
  };

  const scopeSummary = (row: AllowedUserRow) => {
    const u = parseUnits(row.allowed_units);
    const p = parseTeamPairs(row.allowed_team_pairs);
    if (u.length === 0 && p.length === 0) return 'Всё';
    const parts: string[] = [];
    if (u.length) parts.push(`Юниты: ${u.length}`);
    if (p.length) parts.push(`Команды: ${p.length}`);
    return parts.join(', ') || 'Ограничен';
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      <AdminHeader currentView="access" />

      <main className="flex-1 flex overflow-hidden p-6">
        {/* Левая колонка: добавить пользователя + таблица */}
        <div className="flex flex-col min-w-0 w-full max-w-md shrink-0 border-r border-border pr-6 overflow-hidden">
          <div className="space-y-2 shrink-0">
            <h2 className="text-lg font-semibold">Добавить пользователя</h2>
            <p className="text-sm text-muted-foreground">
              Введите корпоративный email @dodobrands.io. Пользователь получит доступ к дашборду.
            </p>
            <div className="flex gap-2 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <Label htmlFor="access-email" className="sr-only">Email</Label>
                <Input
                  id="access-email"
                  type="email"
                  placeholder="user@dodobrands.io"
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                  disabled={adding}
                />
              </div>
              <Button onClick={handleAdd} disabled={adding || !addEmail.trim()}>
                {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                <span className="ml-2">Добавить</span>
              </Button>
            </div>
          </div>

          <div className="flex-1 min-h-0 flex flex-col pt-6">
            <h2 className="text-lg font-semibold shrink-0">Пользователи с доступом</h2>
            {loading ? (
              <div className="flex items-center justify-center py-12 flex-1">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : list.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">Пока никого нет. Добавьте первого пользователя выше.</p>
            ) : (
              <ScrollArea className="flex-1 min-h-0 -mx-2">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Роль</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {list.map((row) => (
                      <TableRow
                        key={row.id}
                        className={`cursor-pointer ${scopeDialogUserId === row.id ? 'bg-muted/50' : ''} hover:bg-muted/30`}
                        onClick={() => selectUserForEditing(row)}
                      >
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2 w-full min-w-0">
                            <span className="truncate min-w-0">
                              {row.email}
                              {isSelf(row) && (
                                <span className="ml-2 text-xs text-muted-foreground">(вы)</span>
                              )}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 ml-auto"
                              onClick={(e) => requestDelete(row, e)}
                              disabled={isSelf(row) || (row.role === 'admin' && adminCount <= 1)}
                              title={isSelf(row) ? 'Нельзя удалить себя' : 'Удалить доступ'}
                              aria-label={isSelf(row) ? 'Нельзя удалить себя' : `Удалить доступ для ${row.email}`}
                            >
                              <Trash2 size={16} />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Select
                            value={row.role}
                            onValueChange={(v) => handleRoleChange(row.id, v as 'admin' | 'user')}
                            disabled={cannotDemoteSelf(row)}
                          >
                            <SelectTrigger
                              className="w-[140px]"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">
                                <span className="flex items-center gap-2">
                                  <ShieldCheck size={14} /> Admin
                                </span>
                              </SelectItem>
                              <SelectItem value="user">
                                <span className="flex items-center gap-2">
                                  <User size={14} /> User
                                </span>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          {cannotDemoteSelf(row) && (
                            <p className="text-xs text-amber-600 mt-1">Вы последний админ</p>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </div>
        </div>

        {/* Правая колонка: настройка доступа без затемнения */}
        <div className="flex-1 min-w-0 flex flex-col pl-6 overflow-hidden">
          {!editingRow ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              Выберите пользователя в списке слева
            </div>
          ) : editingRow.role === 'admin' ? (
            <div className="flex flex-col gap-2 py-4">
              <h3 className="text-lg font-semibold">Доступ: {editingRow.email}</h3>
              <p className="text-sm text-muted-foreground">У админа полный доступ ко всем данным.</p>
            </div>
          ) : (
            <>
              <div className="shrink-0 pb-4 border-b border-border">
                <h3 className="text-lg font-semibold">Доступ: {editingRow.email}</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Юнит — весь юнит со всеми командами. Команда — только выбранная пара. Пусто = полный доступ.
                </p>
              </div>
              <ScrollArea className="flex-1 min-h-0 mt-4">
                <div className="space-y-4 pr-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="scope-full"
                      checked={scopeFullAccess}
                      onCheckedChange={(c) => setScopeFullAccess(!!c)}
                    />
                    <Label htmlFor="scope-full" className="cursor-pointer font-medium">Полный доступ (все юниты и команды)</Label>
                  </div>
                  {units.length > 0 || unitKeysForTeams.length > 0 ? (
                    <div className={`space-y-2 ${scopeFullAccess ? 'opacity-50 pointer-events-none' : ''}`}>
                      <Label className="text-muted-foreground">Юниты и команды</Label>
                      <p className="text-xs text-muted-foreground">
                        Снимите галочку «Полный доступ» выше, чтобы выбрать отдельные юниты или команды.
                      </p>
                      <div className="rounded-md border p-3 space-y-4">
                        {units.map((unit) => {
                          const pairs = teamsByUnit[unit] ?? [];
                          const unitChecked = scopeSelectedUnits.includes(unit);
                          const selectedCount = pairs.filter((p) =>
                            scopeSelectedPairs.some((x) => x.unit === p.unit && x.team === p.team)
                          ).length;
                          const allTeamsSelected = pairs.length > 0 && selectedCount === pairs.length;
                          return (
                            <div key={unit} className="space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <label className="flex items-center gap-2 cursor-pointer text-sm font-medium">
                                  <Checkbox
                                    checked={unitChecked}
                                    onCheckedChange={() => {
                                      if (unitChecked) {
                                        setScopeSelectedUnits((prev) => prev.filter((x) => x !== unit));
                                        setScopeSelectedPairs((prev) => prev.filter((p) => p.unit !== unit));
                                      } else {
                                        setScopeSelectedUnits((prev) => [...prev, unit]);
                                        setScopeSelectedPairs((prev) => prev.filter((p) => p.unit !== unit));
                                      }
                                    }}
                                    disabled={scopeFullAccess}
                                  />
                                  {unit}
                                </label>
                                {pairs.length > 0 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs"
                                  disabled={scopeFullAccess}
                                  onClick={() => {
                                    if (unitChecked) {
                                      setScopeSelectedUnits((prev) => prev.filter((x) => x !== unit));
                                      setScopeSelectedPairs((prev) => prev.filter((p) => p.unit !== unit));
                                    } else if (allTeamsSelected) {
                                      setScopeSelectedPairs((prev) => prev.filter((p) => p.unit !== unit));
                                    } else {
                                      selectAllTeamsInUnit(unit);
                                    }
                                  }}
                                >
                                  {unitChecked ? 'Снять юнит' : allTeamsSelected ? 'Снять все' : 'Выбрать все'}
                                </Button>
                                )}
                              </div>
                              {pairs.length > 0 && (
                              <div className="flex flex-col gap-0.5 pl-6">
                                {pairs.map((p) => (
                                  <label
                                    key={`${p.unit}\0${p.team}`}
                                    className={`flex items-center gap-2 cursor-pointer text-sm ${unitChecked ? 'opacity-50 pointer-events-none' : ''}`}
                                  >
                                    <Checkbox
                                      checked={unitChecked || scopeSelectedPairs.some((x) => x.unit === p.unit && x.team === p.team)}
                                      onCheckedChange={() => toggleScopePair(p)}
                                      disabled={unitChecked || scopeFullAccess}
                                    />
                                    {p.team}
                                  </label>
                                ))}
                              </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {!scopeFullAccess && scopeSelectedUnits.length === 0 && scopeSelectedPairs.length === 0 && (
                        <p className="text-xs text-amber-600">Не выбрано ни юнитов, ни команд — пользователь не будет видеть данные.</p>
                      )}
                    </div>
                  ) : null}
                </div>
              </ScrollArea>
              <div className="shrink-0 flex gap-2 pt-4 border-t border-border mt-4">
                <Button variant="outline" onClick={closeScopeDialog} disabled={scopeSaving}>
                  Закрыть
                </Button>
                <Button onClick={handleSaveScope} disabled={scopeSaving}>
                  {scopeSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  <span className={scopeSaving ? 'ml-2' : ''}>Сохранить</span>
                </Button>
              </div>
            </>
          )}
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
