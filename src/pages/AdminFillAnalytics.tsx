import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import AdminHeader from '@/components/admin/AdminHeader';
import { AdminQuickFlowCountryAllocationsSummary } from '@/components/admin/AdminQuickFlowCountryAllocationsSummary';
import ScopeSelector from '@/components/admin/ScopeSelector';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAccess } from '@/hooks/useAccess';
import { useFilterParams } from '@/hooks/useFilterParams';
import { useInitiatives, useQuarters } from '@/hooks/useInitiatives';
import { useBudgetDepartmentAllocations } from '@/hooks/useBudgetDepartmentAllocations';
import { useMarketCountries, buildCountryIdToClusterMap } from '@/hooks/useMarketCountries';
import {
  getUniqueUnits,
  getTeamsForUnits,
  type AdminDataRow,
  type GeoCostSplitEntry,
  geoCostSplitPercentsTotal,
  marketClusterKeyLabel,
  rubleAmountsFromGeoPercents,
  stakeholderLabelToClusterKey,
  sortStakeholderLabels,
} from '@/lib/adminDataManager';
import { compareQuarters, getCurrentQuarter } from '@/lib/quarterUtils';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

const HUB_BLOCKS = ['coefficients', 'descriptions', 'planFact', 'geo'] as const;
type HubBlock = (typeof HUB_BLOCKS)[number];
const HUB_BLOCK_COUNT = HUB_BLOCKS.length;

const BLOCK_LABELS: Record<HubBlock, string> = {
  coefficients: 'Коэф.',
  descriptions: 'Описание',
  planFact: 'План/факт',
  geo: 'Гео',
};

const UNALLOCATED_LABEL = 'Не распределено';

type TeamRef = { unit: string; team: string };
type TeamFillStatus = {
  unit: string;
  team: string;
  doneCount: number;
  byBlock: Record<HubBlock, { done: boolean; at: string | null }>;
};

function teamKey(unit: string, team: string): string {
  return `${unit}\u0000${team}`;
}

function utcDay(iso: string): string {
  return iso.slice(0, 10);
}

function distributeToClusters(
  amountRub: number,
  entries: GeoCostSplitEntry[] | undefined,
  countryIdToClusterKey: Map<string, string>
): Map<string, number> {
  const out = new Map<string, number>();
  const amount = Math.round(Number(amountRub) || 0);
  if (amount <= 0) return out;
  if (!entries?.length) {
    out.set(UNALLOCATED_LABEL, amount);
    return out;
  }

  const totalPercents = geoCostSplitPercentsTotal(entries);
  const cappedPercents = Math.min(100, totalPercents);
  const unallocated = Math.round((amount * (100 - cappedPercents)) / 100);
  if (unallocated > 0) out.set(UNALLOCATED_LABEL, unallocated);
  if (cappedPercents <= 0 || totalPercents <= 0) return out;

  const effectiveAmount = Math.round((amount * cappedPercents) / 100);
  const scale = cappedPercents / totalPercents;
  const scaledPercents = entries.map((entry) => entry.percent * scale);
  const rubles = rubleAmountsFromGeoPercents(effectiveAmount, scaledPercents);

  entries.forEach((entry, index) => {
    const clusterKey =
      entry.kind === 'cluster'
        ? entry.clusterKey
        : countryIdToClusterKey.get(entry.countryId) ?? '—';
    const label = marketClusterKeyLabel(clusterKey);
    const rub = rubles[index] ?? 0;
    if (rub <= 0) return;
    out.set(label, (out.get(label) ?? 0) + rub);
  });

  return out;
}

function buildAggregatedRowsForAllocations(
  byDimension: Map<string, Map<string, number>>,
  quarter: string
): AdminDataRow[] {
  return [...byDimension.entries()]
    .map(([dimensionName, byCluster], idx) => {
      const clusters = [...byCluster.entries()]
        .filter(([, value]) => value > 0)
        .sort((a, b) => b[1] - a[1]);
      const total = clusters.reduce((sum, [, value]) => sum + value, 0);
      if (total <= 0) return null;
      const entries = clusters.map(([clusterLabel, value]) => ({
        kind: 'cluster' as const,
        clusterKey: stakeholderLabelToClusterKey(clusterLabel),
        percent: (value / total) * 100,
      }));

      return {
        id: `alloc-${quarter}-${idx}-${dimensionName}`,
        unit: 'Аналитика',
        team: dimensionName,
        initiative: dimensionName,
        stakeholdersList: sortStakeholderLabels(clusters.map(([name]) => name)),
        description: '',
        documentationLink: '',
        stakeholders: sortStakeholderLabels(clusters.map(([name]) => name)).join(', '),
        isTimelineStub: false,
        initiativeGeoCostSplit: { entries },
        quarterlyData: {
          [quarter]: {
            cost: total,
            otherCosts: 0,
            support: false,
            onTrack: true,
            metricPlan: '',
            metricFact: '',
            comment: '',
            effortCoefficient: 0,
            costFinanceConfirmed: true,
          },
        },
      } satisfies AdminDataRow;
    })
    .filter((row): row is AdminDataRow => row !== null)
    .sort((a, b) => (b.quarterlyData[quarter]?.cost ?? 0) - (a.quarterlyData[quarter]?.cost ?? 0));
}

function StatusCell({ done }: { done: boolean }) {
  return done ? (
    <CheckCircle2 className="h-4 w-4 text-primary" aria-label="заполнено" />
  ) : (
    <XCircle className="h-4 w-4 text-muted-foreground" aria-label="не заполнено" />
  );
}

function blockBadgeClass(done: boolean): string {
  return done
    ? 'border-primary/30 bg-primary/10 text-primary'
    : 'border-border bg-muted/35 text-muted-foreground';
}

export default function AdminFillAnalytics() {
  const { isSuperAdmin, accessLoading } = useAccess();
  const { selectedUnits, selectedTeams } = useFilterParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [allocationMode, setAllocationMode] = useState<'unit' | 'de'>('unit');
  const [selectedAllocationGroups, setSelectedAllocationGroups] = useState<string[]>([]);

  const analyticsQuarter = searchParams.get('fillAnalyticsQuarter')?.trim() ?? '';

  const { data: catalogInitiativesData = [] } = useInitiatives({ units: [], teams: [] });
  const { data: initiativesData = [], isPending: initiativesLoading, error } = useInitiatives({
    units: selectedUnits,
    teams: selectedTeams,
  });
  const { data: budgetDepartmentAllocations = [] } = useBudgetDepartmentAllocations();
  const { data: marketCountries = [] } = useMarketCountries({ includeInactive: false });

  const quarters = useQuarters(catalogInitiativesData);
  const sortedQuarters = useMemo(
    () => [...quarters].filter(Boolean).sort(compareQuarters),
    [quarters]
  );

  useEffect(() => {
    if (sortedQuarters.length === 0) return;
    if (analyticsQuarter && sortedQuarters.includes(analyticsQuarter)) return;
    const current = getCurrentQuarter();
    const fallback = sortedQuarters.includes(current)
      ? current
      : sortedQuarters[sortedQuarters.length - 1];
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('fillAnalyticsQuarter', fallback);
        return next;
      },
      { replace: true }
    );
  }, [analyticsQuarter, sortedQuarters, setSearchParams]);

  const selectedQuarter = useMemo(() => {
    if (analyticsQuarter && sortedQuarters.includes(analyticsQuarter)) return analyticsQuarter;
    return sortedQuarters[sortedQuarters.length - 1] ?? getCurrentQuarter();
  }, [analyticsQuarter, sortedQuarters]);

  const scopeOnUnitsChange = useCallback(
    (next: string[]) => {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next.length > 0) p.set('units', next.join(','));
          else p.delete('units');
          p.delete('teams');
          return p;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const scopeOnTeamsChange = useCallback(
    (next: string[]) => {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next.length > 0) p.set('teams', next.join(','));
          else p.delete('teams');
          return p;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const scopeOnFiltersChange = useCallback(
    (nextUnits: string[], nextTeams: string[]) => {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (nextUnits.length > 0) p.set('units', nextUnits.join(','));
          else p.delete('units');
          if (nextTeams.length > 0) p.set('teams', nextTeams.join(','));
          else p.delete('teams');
          return p;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const setQuarter = useCallback(
    (q: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('fillAnalyticsQuarter', q);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const fillUnitOptions = useMemo(() => getUniqueUnits(catalogInitiativesData), [catalogInitiativesData]);
  const selectAllUnitsForIT = useCallback(() => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (fillUnitOptions.length > 0) p.set('units', fillUnitOptions.join(','));
        else p.delete('units');
        p.delete('teams');
        return p;
      },
      { replace: true }
    );
  }, [setSearchParams, fillUnitOptions]);

  const fillResolveTeamsForUnit = useCallback(
    (unit: string) => getTeamsForUnits(catalogInitiativesData, [unit]),
    [catalogInitiativesData]
  );

  const fillScopeTeamOptions = useMemo(() => {
    if (selectedUnits.length === 0) return getTeamsForUnits(catalogInitiativesData, []);
    const set = new Set<string>();
    for (const unit of selectedUnits) {
      for (const team of fillResolveTeamsForUnit(unit)) set.add(team);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [selectedUnits, catalogInitiativesData, fillResolveTeamsForUnit]);

  const { data: ackRows = [] } = useQuery({
    queryKey: ['fill-analytics-acks', selectedQuarter, selectedUnits, selectedTeams],
    queryFn: async () => {
      let query = supabase
        .from('portfolio_hub_block_acks')
        .select('unit, team, block, confirmed_at')
        .eq('quarter', selectedQuarter);
      if (selectedUnits.length > 0) query = query.in('unit', selectedUnits);
      if (selectedTeams.length > 0) query = query.in('team', selectedTeams);
      const { data, error: qError } = await query;
      if (qError) throw qError;
      return data ?? [];
    },
    enabled: Boolean(selectedQuarter),
    staleTime: 60_000,
  });

  const teamUniverse = useMemo(() => {
    const out = new Map<string, TeamRef>();
    for (const row of initiativesData) {
      if (row.isTimelineStub) continue;
      if (!row.unit.trim() || !row.team.trim()) continue;
      if (!row.quarterlyData[selectedQuarter]) continue;
      out.set(teamKey(row.unit, row.team), { unit: row.unit, team: row.team });
    }
    return out;
  }, [initiativesData, selectedQuarter]);

  const teamStatuses = useMemo<TeamFillStatus[]>(() => {
    const ackByTeam = new Map<string, Map<HubBlock, { at: string | null }>>();
    for (const row of ackRows) {
      const block = String(row.block) as HubBlock;
      if (!HUB_BLOCKS.includes(block)) continue;
      const key = teamKey(String(row.unit), String(row.team));
      const teamMap = ackByTeam.get(key) ?? new Map<HubBlock, { at: string | null }>();
      teamMap.set(block, {
        at: (row.confirmed_at as string | null) ?? null,
      });
      ackByTeam.set(key, teamMap);
    }

    return [...teamUniverse.values()]
      .map((team) => {
        const key = teamKey(team.unit, team.team);
        const ackMap = ackByTeam.get(key) ?? new Map<HubBlock, { at: string | null }>();
        const byBlock: TeamFillStatus['byBlock'] = {
          coefficients: {
            done: Boolean(ackMap.get('coefficients')?.at),
            at: ackMap.get('coefficients')?.at ?? null,
          },
          descriptions: {
            done: Boolean(ackMap.get('descriptions')?.at),
            at: ackMap.get('descriptions')?.at ?? null,
          },
          planFact: {
            done: Boolean(ackMap.get('planFact')?.at),
            at: ackMap.get('planFact')?.at ?? null,
          },
          geo: {
            done: Boolean(ackMap.get('geo')?.at),
            at: ackMap.get('geo')?.at ?? null,
          },
        };
        const doneCount = HUB_BLOCKS.filter((b) => byBlock[b].done).length;
        return { unit: team.unit, team: team.team, doneCount, byBlock };
      })
      .sort((a, b) => {
        const byUnit = a.unit.localeCompare(b.unit);
        if (byUnit !== 0) return byUnit;
        return a.team.localeCompare(b.team);
      });
  }, [ackRows, teamUniverse]);

  const summaryKpis = useMemo(() => {
    const totalTeams = teamStatuses.length;
    const fullTeams = teamStatuses.filter((team) => team.doneCount === HUB_BLOCK_COUNT).length;
    const totalDoneBlocks = teamStatuses.reduce((sum, team) => sum + team.doneCount, 0);

    const byUnitMap = new Map<string, { total: number; full: number; blocksDone: number }>();
    for (const team of teamStatuses) {
      const row = byUnitMap.get(team.unit) ?? { total: 0, full: 0, blocksDone: 0 };
      row.total += 1;
      row.blocksDone += team.doneCount;
      if (team.doneCount === HUB_BLOCK_COUNT) row.full += 1;
      byUnitMap.set(team.unit, row);
    }
    const byUnit = [...byUnitMap.entries()]
      .map(([unit, value]) => ({ unit, ...value }))
      .sort((a, b) => a.unit.localeCompare(b.unit));

    return { totalTeams, fullTeams, totalDoneBlocks, byUnit };
  }, [teamStatuses]);

  const paceSeries = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const team of teamStatuses) {
      for (const block of HUB_BLOCKS) {
        const at = team.byBlock[block].at;
        if (!at) continue;
        const day = utcDay(at);
        byDay.set(day, (byDay.get(day) ?? 0) + 1);
      }
    }
    const days = [...byDay.keys()].sort((a, b) => a.localeCompare(b));
    let cumulative = 0;
    return days.map((day) => {
      const daily = byDay.get(day) ?? 0;
      cumulative += daily;
      return { day, daily, cumulative };
    });
  }, [teamStatuses]);

  const countryIdToClusterKey = useMemo(
    () => buildCountryIdToClusterMap(marketCountries),
    [marketCountries]
  );

  const allocationCharts = useMemo(() => {
    const rowById = new Map<string, AdminDataRow>();
    for (const row of initiativesData) {
      rowById.set(row.id, row);
    }

    const unitToClusters = new Map<string, Map<string, number>>();
    const deToClusters = new Map<string, Map<string, number>>();
    for (const alloc of budgetDepartmentAllocations) {
      const row = rowById.get(alloc.initiativeId);
      if (!row || row.isTimelineStub) continue;
      const amount = Number(alloc.quarterlyBudget[selectedQuarter] ?? 0);
      if (!Number.isFinite(amount) || amount <= 0) continue;

      const split = distributeToClusters(amount, row.initiativeGeoCostSplit?.entries, countryIdToClusterKey);
      if (split.size === 0) continue;

      const unitMap = unitToClusters.get(row.unit) ?? new Map<string, number>();
      const deKey = alloc.budgetDepartment?.trim() || 'Без DE';
      const deMap = deToClusters.get(deKey) ?? new Map<string, number>();

      for (const [cluster, rub] of split.entries()) {
        unitMap.set(cluster, (unitMap.get(cluster) ?? 0) + rub);
        deMap.set(cluster, (deMap.get(cluster) ?? 0) + rub);
      }
      unitToClusters.set(row.unit, unitMap);
      deToClusters.set(deKey, deMap);
    }

    return {
      unitToClusters,
      deToClusters,
    };
  }, [initiativesData, budgetDepartmentAllocations, selectedQuarter, countryIdToClusterKey]);
  const unitAllocationRows = useMemo(
    () => buildAggregatedRowsForAllocations(allocationCharts.unitToClusters, selectedQuarter),
    [allocationCharts.unitToClusters, selectedQuarter]
  );
  const deAllocationRows = useMemo(
    () => buildAggregatedRowsForAllocations(allocationCharts.deToClusters, selectedQuarter),
    [allocationCharts.deToClusters, selectedQuarter]
  );
  const allocationVisibleQuarters = useMemo(
    () => (selectedQuarter ? [selectedQuarter] : []),
    [selectedQuarter]
  );
  const allocationRows = allocationMode === 'unit' ? unitAllocationRows : deAllocationRows;
  const allocationGroups = useMemo(
    () => allocationRows.map((row) => row.team).filter(Boolean),
    [allocationRows]
  );
  useEffect(() => {
    setSelectedAllocationGroups((prev) => prev.filter((name) => allocationGroups.includes(name)));
  }, [allocationGroups]);
  const filteredAllocationRows = useMemo(() => {
    if (selectedAllocationGroups.length === 0) return allocationRows;
    const selected = new Set(selectedAllocationGroups);
    return allocationRows.filter((row) => selected.has(row.team));
  }, [allocationRows, selectedAllocationGroups]);
  const toggleAllocationGroup = useCallback((name: string) => {
    setSelectedAllocationGroups((prev) =>
      prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]
    );
  }, []);
  const clearAllocationGroupFilter = useCallback(() => setSelectedAllocationGroups([]), []);
  const replaceAllocationQuarters = useCallback(
    (qs: string[]) => {
      const next = [...qs].filter(Boolean).sort(compareQuarters).at(-1);
      if (next) setQuarter(next);
    },
    [setQuarter]
  );

  if (accessLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="h-screen bg-background flex flex-col">
        <AdminHeader currentView="initiatives" />
        <main className="flex-1 flex items-center justify-center p-6">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle>Недостаточно прав</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Вкладка аналитики заполнения доступна только супер-админам.
              </p>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen bg-background flex flex-col">
        <AdminHeader currentView="fillAnalytics" />
        <main className="flex-1 flex items-center justify-center p-6">
          <Card className="w-full max-w-xl">
            <CardHeader>
              <CardTitle>Ошибка загрузки</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {error instanceof Error ? error.message : 'Не удалось загрузить данные'}
              </p>
              <Button onClick={() => window.location.reload()}>Обновить страницу</Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <AdminHeader currentView="fillAnalytics" />

      <main className="flex-1 min-h-0 overflow-auto p-4 sm:p-6">
        <div className="mx-auto flex w-full max-w-[1400px] min-h-0 flex-col gap-4">
          <div className="rounded-xl border border-border bg-muted/20 p-3 sm:p-4">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <div className="min-w-0 flex-1">
                <ScopeSelector
                  units={fillUnitOptions}
                  teams={fillScopeTeamOptions}
                  selectedUnits={selectedUnits}
                  selectedTeams={selectedTeams}
                  onUnitsChange={scopeOnUnitsChange}
                  onTeamsChange={scopeOnTeamsChange}
                  onFiltersChange={scopeOnFiltersChange}
                  allData={catalogInitiativesData}
                />
              </div>
              <Button type="button" variant="outline" size="sm" className="h-8" onClick={selectAllUnitsForIT}>
                Все юниты (ИТ)
              </Button>
              <div className="inline-flex shrink-0 items-center gap-2 rounded-md border border-input bg-background px-2 py-1.5">
                <span className="text-xs text-muted-foreground">Квартал</span>
                <select
                  value={selectedQuarter}
                  onChange={(e) => setQuarter(e.target.value)}
                  className="h-7 rounded border border-input bg-background px-2 text-sm"
                >
                  {sortedQuarters.map((q) => (
                    <option key={q} value={q}>
                      {q}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Команд в скоупе</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold tabular-nums">
                {summaryKpis.totalTeams.toLocaleString('ru-RU')}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Полностью заполнено ({HUB_BLOCK_COUNT}/{HUB_BLOCK_COUNT})
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold tabular-nums">
                {summaryKpis.fullTeams.toLocaleString('ru-RU')}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Подтверждено блоков</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold tabular-nums">
                {summaryKpis.totalDoneBlocks.toLocaleString('ru-RU')}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle>Статус по командам</CardTitle>
              </CardHeader>
              <CardContent className="min-h-0">
                {initiativesLoading ? (
                  <div className="flex h-24 items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : teamStatuses.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Нет команд с инициативами в выбранном квартале.</p>
                ) : (
                  <div className="max-h-[420px] overflow-auto rounded-md border border-border">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 z-10 bg-card">
                        <tr className="border-b border-border">
                          <th className="px-3 py-2 text-left font-medium">Unit</th>
                          <th className="px-3 py-2 text-left font-medium">Команда</th>
                          <th className="px-3 py-2 text-left font-medium">Прогресс</th>
                          {HUB_BLOCKS.map((block) => (
                            <th key={block} className="px-2 py-2 text-center font-medium">
                              {BLOCK_LABELS[block]}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {teamStatuses.map((row) => (
                          <tr key={teamKey(row.unit, row.team)} className="border-b border-border/70">
                            <td className="px-3 py-2">{row.unit}</td>
                            <td className="px-3 py-2">{row.team}</td>
                            <td className="px-3 py-2">
                              <span className="tabular-nums">
                                {row.doneCount}/{HUB_BLOCK_COUNT}
                              </span>
                            </td>
                            {HUB_BLOCKS.map((block) => (
                              <td key={block} className="px-2 py-2">
                                <div className="flex justify-center">
                                  <StatusCell done={row.byBlock[block].done} />
                                </div>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>По юнитам</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {summaryKpis.byUnit.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Нет данных.</p>
                ) : (
                  summaryKpis.byUnit.map((row) => (
                    <div key={row.unit} className="rounded-md border border-border p-2.5">
                      <div className="mb-1 text-sm font-medium">{row.unit}</div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Команд полностью</span>
                        <span className="tabular-nums">{row.full}/{row.total}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <span className="rounded border border-border bg-muted/30 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                          Блоков подтверждено: <span className="tabular-nums text-foreground">{row.blocksDone}</span>
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Скорость подтверждений по дням</CardTitle>
            </CardHeader>
            <CardContent>
              {paceSeries.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Пока нет подтвержденных блоков в выбранном квартале.
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Дней с активностью: {paceSeries.length}. Всего подтверждений:{' '}
                    {paceSeries[paceSeries.length - 1]?.cumulative ?? 0}.
                  </p>
                  <div className="space-y-1.5 rounded-md border border-border/70 p-2">
                    {paceSeries.map((row) => {
                      const max = Math.max(...paceSeries.map((x) => x.daily), 1);
                      const widthPct = Math.max(4, Math.round((row.daily / max) * 100));
                      return (
                        <div key={row.day} className="grid grid-cols-[8rem,1fr,6rem,6rem] items-center gap-2 text-xs">
                          <span className="tabular-nums text-muted-foreground">{row.day}</span>
                          <div className="h-2 rounded bg-muted">
                            <div className="h-2 rounded bg-primary/80" style={{ width: `${widthPct}%` }} />
                          </div>
                          <span className="tabular-nums text-right">{row.daily}</span>
                          <span className="tabular-nums text-right text-muted-foreground">{row.cumulative}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Аллокации по кластерам</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">Группировка</span>
                <Button
                  type="button"
                  size="sm"
                  variant={allocationMode === 'unit' ? 'default' : 'outline'}
                  className="h-7"
                  onClick={() => setAllocationMode('unit')}
                >
                  Unit × Cluster
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={allocationMode === 'de' ? 'default' : 'outline'}
                  className="h-7"
                  onClick={() => setAllocationMode('de')}
                >
                  DE × Cluster
                </Button>
                {selectedAllocationGroups.length > 0 ? (
                  <Button type="button" size="sm" variant="ghost" className="h-7" onClick={clearAllocationGroupFilter}>
                    Показать все
                  </Button>
                ) : null}
              </div>

              {allocationRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">Нет данных по выбранному кварталу.</p>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    {allocationMode === 'unit' ? 'Юнитов' : 'DE'}: {allocationRows.length}. Показано:{' '}
                    {filteredAllocationRows.length}.
                  </p>

                  <div className="max-h-28 overflow-auto rounded-md border border-border/70 bg-muted/15 p-2">
                    <div className="flex flex-wrap gap-1.5">
                      {allocationGroups.map((name) => {
                        const selected = selectedAllocationGroups.includes(name);
                        return (
                          <button
                            key={name}
                            type="button"
                            onClick={() => toggleAllocationGroup(name)}
                            className={cn(
                              'rounded border px-2 py-1 text-xs transition-colors',
                              selected
                                ? 'border-primary/40 bg-primary/10 text-primary'
                                : 'border-border bg-background text-muted-foreground hover:text-foreground'
                            )}
                          >
                            {name}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {filteredAllocationRows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      По выбранным группам нет данных. Сбросьте фильтр.
                    </p>
                  ) : (
                    <div className="rounded-md border border-border/70 p-2">
                      <AdminQuickFlowCountryAllocationsSummary
                        rows={filteredAllocationRows}
                        fillQuarters={allocationVisibleQuarters}
                        quartersCatalog={sortedQuarters}
                        countries={marketCountries}
                        visibleQuarters={allocationVisibleQuarters}
                        previewQuarters={null}
                        rangeAnchor={null}
                        onQuarterClick={setQuarter}
                        onQuarterHover={() => {}}
                        onReplaceSelectedQuarters={replaceAllocationQuarters}
                        onDismissTransientRangeUI={() => {}}
                        compactChrome
                      />
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Легенда прогресса</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {HUB_BLOCKS.map((block) => (
                <span
                  key={block}
                  className={cn(
                    'inline-flex items-center gap-1 rounded border px-2 py-1 text-xs',
                    blockBadgeClass(true)
                  )}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {BLOCK_LABELS[block]}
                </span>
              ))}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
