import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, MessageSquareText } from 'lucide-react';
import type { AdminDataRow, GeoCostSplit } from '@/lib/adminDataManager';
import { getInitiativeDisplayName } from '@/lib/adminDataManager';
import type { Person, PersonAssignment } from '@/lib/peopleDataManager';
import type { MarketCountryRow } from '@/hooks/useMarketCountries';
import type {
  InitiativeRegionPayment,
  LocationHeadcountIndex,
} from '@/lib/locationAllocationPlanning';
import {
  buildInitiativeRegionPayments,
  buildInitiativesRegionPayments,
  calculateTeamRun,
  locationTeamKey,
  resolveTeamRunDisplay,
  sumTeamCostForYear,
} from '@/lib/locationAllocationPlanning';
import { initiativeYearCostRub } from '@/lib/locationAllocationModel';
import {
  TOP_REGION_SHORT_LABELS,
} from '@/lib/locationRegionModel';
import { formatLocationCompactM } from '@/lib/locationDisplayFormat';
import {
  useLocationAllocationTeamMetrics,
  type LocationAllocationTeamMetric,
} from '@/hooks/useLocationAllocationTeamMetrics';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { InitiativeAllocationComments } from '@/components/admin/location-allocation/InitiativeAllocationComments';
import { useLocationAllocationCommentSummary } from '@/hooks/useLocationAllocationCommentSummary';
import {
  EMPTY_LOCATION_COMMENT_COUNT,
  type LocationAllocationCommentCount,
} from '@/lib/locationAllocationCommentSummary';
import { LocationAllocationTreemapEditDialog } from '@/components/admin/location-allocation/LocationAllocationTreemapEditDialog';
import { resolveGeoEditTargetFromScope } from '@/lib/locationAllocationGeoEdit';
import type { InitiativeTag } from '@/lib/initiativeTags';

type Props = {
  initiatives: AdminDataRow[];
  scopedInitiatives: AdminDataRow[];
  selectedQuarters: string[];
  people: Person[];
  assignments: PersonAssignment[];
  headcount: LocationHeadcountIndex;
  countries: MarketCountryRow[];
  countryIdToClusterKey: Map<string, string>;
  teamMetrics?: LocationAllocationTeamMetric[];
  readOnly?: boolean;
  selectedUnit?: string | null;
  onGeoCostSplitSave: (id: string, split: GeoCostSplit | undefined) => Promise<void>;
  onInitiativeTagsSave: (id: string, tags: InitiativeTag[]) => Promise<void>;
};

type MetricKind =
  | 'fot2025Rub'
  | 'fot2026Rub'
  | 'peopleCountOverride'
  | 'runPercentOverride';

type MetricEditorState = {
  unit: string;
  team: string;
  kind: MetricKind;
  calculatedValue: number;
  value: number | null;
};

type TeamLabelEditorState = {
  unit: string;
  team: string;
  value: string;
};

type UnitLabelEditorState = {
  unit: string;
  teams: string[];
  value: string;
};

const FULL_2026 = ['2026-Q1', '2026-Q2', '2026-Q3', '2026-Q4'];

function MetricButton({
  value,
  secondary,
  onClick,
  disabled = false,
  title,
}: {
  value: string;
  secondary?: string;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className="group flex min-w-0 items-center rounded-lg px-2 py-2 text-left transition-colors enabled:hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
      onClick={onClick}
      title={title}
    >
      <span className="min-w-0 truncate text-sm tabular-nums text-foreground">
        <strong className="font-semibold">{value}</strong>
        {secondary ? (
          <span className="ml-1 font-normal text-muted-foreground">{secondary}</span>
        ) : null}
      </span>
    </button>
  );
}

function CommentBadge({
  count,
}: {
  count: LocationAllocationCommentCount;
}) {
  const openLabel = `${count.openCount} нерешённых комментариев команды`;
  const title =
    count.openCount > 0 && count.unreadCount > 0
      ? `${openLabel} · ${count.unreadCount} новых сообщений`
      : count.openCount > 0
        ? openLabel
        : count.unreadCount > 0
          ? `${count.unreadCount} новых сообщений`
          : 'Открыть комментарии';
  return (
    <span
      className="relative ml-auto inline-flex h-7 min-w-7 shrink-0 items-center justify-center gap-1 rounded-md px-1.5 text-muted-foreground transition-colors group-hover:bg-muted group-hover:text-foreground"
      title={title}
    >
      {count.unreadCount > 0 ? (
        <span className="absolute -left-0.5 -top-0.5 h-2 w-2 rounded-full bg-sky-500 ring-2 ring-background" />
      ) : null}
      <MessageSquareText className="h-4 w-4" strokeWidth={2.1} />
      {count.openCount > 0 ? (
        <span className="text-[10px] font-semibold tabular-nums">
          {count.openCount}
        </span>
      ) : null}
    </span>
  );
}

function teamCountLabel(count: number): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${count} команд`;
  if (mod10 === 1) return `${count} команда`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} команды`;
  return `${count} команд`;
}

function formatRunPercent(value: number): string {
  return new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 1,
  }).format(value);
}

function RegionPaymentSummary({
  payments,
  prominent = false,
}: {
  payments: InitiativeRegionPayment[];
  prominent?: boolean;
}) {
  if (payments.length === 0) {
    return (
      <span className="text-[10px] text-muted-foreground">
        Нет распределения
      </span>
    );
  }

  return (
    <div
      className={`flex flex-wrap gap-x-2 gap-y-0.5 ${
        prominent ? 'text-xs' : 'text-[10px]'
      }`}
    >
      {payments.map((payment) => (
        <span key={payment.region} className="whitespace-nowrap tabular-nums">
          <span className="font-medium text-foreground/80">
            {TOP_REGION_SHORT_LABELS[payment.region]}{' '}
            {formatLocationCompactM(payment.rub)}
          </span>{' '}
          <span className="text-muted-foreground">
            ({Math.round(payment.percent)}%)
          </span>
        </span>
      ))}
    </div>
  );
}

export function LocationAllocationTeamView({
  initiatives,
  scopedInitiatives,
  selectedQuarters,
  people,
  assignments,
  headcount,
  countries,
  countryIdToClusterKey,
  teamMetrics = [],
  readOnly = false,
  selectedUnit = null,
  onGeoCostSplitSave,
  onInitiativeTagsSave,
}: Props) {
  const {
    byTeam: liveMetricByTeam,
    saveMetric,
    saveUnitDisplayName,
    isSaving,
  } = useLocationAllocationTeamMetrics({ enabled: !readOnly });
  const metricByTeam = useMemo(
    () =>
      readOnly
        ? new Map(
            teamMetrics.map((metric) => [
              locationTeamKey(metric.unit, metric.team),
              metric,
            ])
          )
        : liveMetricByTeam,
    [liveMetricByTeam, readOnly, teamMetrics]
  );
  const commentSummaryQuery =
    useLocationAllocationCommentSummary(initiatives, {
      enabled: !readOnly,
    });
  const commentSummary = readOnly ? undefined : commentSummaryQuery.data;
  const [metricEditor, setMetricEditor] = useState<MetricEditorState | null>(null);
  const [metricDraft, setMetricDraft] = useState('');
  const [teamLabelEditor, setTeamLabelEditor] = useState<TeamLabelEditorState | null>(null);
  const [teamLabelDraft, setTeamLabelDraft] = useState('');
  const [unitLabelEditor, setUnitLabelEditor] = useState<UnitLabelEditorState | null>(null);
  const [unitLabelDraft, setUnitLabelDraft] = useState('');
  const [selectedInitiativeId, setSelectedInitiativeId] = useState<string | null>(null);
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(
    () => new Set(selectedUnit ? [selectedUnit] : [])
  );

  const allRowsByTeam = useMemo(() => {
    const map = new Map<string, AdminDataRow[]>();
    for (const row of initiatives) {
      const key = locationTeamKey(row.unit, row.team);
      const bucket = map.get(key) ?? [];
      bucket.push(row);
      map.set(key, bucket);
    }
    return map;
  }, [initiatives]);

  const groups = useMemo(() => {
    const unitMap = new Map<
      string,
      Map<string, { team: string; visibleRows: AdminDataRow[] }>
    >();
    for (const row of scopedInitiatives) {
      const unit = row.unit.trim() || 'Без юнита';
      const team = row.team.trim() || 'Без команды';
      const teams = unitMap.get(unit) ?? new Map();
      const current = teams.get(team) ?? { team, visibleRows: [] };
      current.visibleRows.push(row);
      teams.set(team, current);
      unitMap.set(unit, teams);
    }
    return [...unitMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'ru'))
      .map(([unit, teams]) => ({
        unit,
        teams: [...teams.values()].sort((a, b) => a.team.localeCompare(b.team, 'ru')),
      }));
  }, [scopedInitiatives]);

  const selectedInitiative =
    initiatives.find((row) => row.id === selectedInitiativeId) ?? null;
  const selectedInitiativeTarget = useMemo(
    () =>
      selectedInitiative
        ? resolveGeoEditTargetFromScope(
            {
              type: 'initiative',
              initiativeId: selectedInitiative.id,
            },
            initiatives,
            selectedQuarters,
            countries,
            countryIdToClusterKey
          )
        : null,
    [
      countries,
      countryIdToClusterKey,
      initiatives,
      selectedInitiative,
      selectedQuarters,
    ]
  );

  useEffect(() => {
    if (!selectedUnit) return;
    setExpandedUnits((current) => {
      if (current.has(selectedUnit)) return current;
      const next = new Set(current);
      next.add(selectedUnit);
      return next;
    });
  }, [selectedUnit]);

  const openMetricEditor = (
    unit: string,
    team: string,
    kind: MetricKind,
    calculatedValue: number,
    value: number | null
  ) => {
    if (readOnly) return;
    setMetricEditor({ unit, team, kind, calculatedValue, value });
    setMetricDraft(String(value ?? calculatedValue));
  };

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
        Нет команд для выбранных фильтров.
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {groups.map((group) => (
          (() => {
            const unitTeamNames = [
              ...new Set(
                initiatives
                  .filter((row) => (row.unit.trim() || 'Без юнита') === group.unit)
                  .map((row) => row.team.trim() || 'Без команды')
              ),
            ];
            const unitDisplayName =
              unitTeamNames
                .map((team) => metricByTeam.get(locationTeamKey(group.unit, team))?.unitDisplayName)
                .find((value): value is string => Boolean(value)) ?? group.unit;
            const unitCostForYear = (costYear: number) =>
              unitTeamNames.reduce((sum, team) => {
                const key = locationTeamKey(group.unit, team);
                const rows =
                  allRowsByTeam.get(key) ??
                  initiatives.filter(
                    (row) =>
                      (row.unit.trim() || 'Без юнита') === group.unit &&
                      (row.team.trim() || 'Без команды') === team
                  );
                const metric = metricByTeam.get(key);
                const override =
                  costYear === 2025 ? metric?.fot2025Rub : metric?.fot2026Rub;
                return sum + (override ?? sumTeamCostForYear(rows, costYear));
              }, 0);
            const unitFot2025 = unitCostForYear(2025);
            const unitFot2026 = unitCostForYear(2026);
            const unitRegionPayments = buildInitiativesRegionPayments(
              group.teams.flatMap(({ visibleRows }) => visibleRows),
              selectedQuarters,
              countries,
              countryIdToClusterKey
            );
            const isCollapsed = !expandedUnits.has(group.unit);
            return (
          <section
            key={group.unit}
            className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/25 px-3 py-3">
              <div className="flex min-w-[260px] flex-1 items-start gap-1.5">
                <button
                  type="button"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-expanded={!isCollapsed}
                  aria-label={
                    isCollapsed
                      ? `Развернуть юнит ${unitDisplayName}`
                      : `Свернуть юнит ${unitDisplayName}`
                  }
                  title={isCollapsed ? 'Развернуть юнит' : 'Свернуть юнит'}
                  onClick={() =>
                    setExpandedUnits((current) => {
                      const next = new Set(current);
                      if (next.has(group.unit)) next.delete(group.unit);
                      else next.add(group.unit);
                      return next;
                    })
                  }
                >
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${
                      isCollapsed ? '-rotate-90' : ''
                    }`}
                    aria-hidden
                  />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Юнит · {teamCountLabel(group.teams.length)}
                  </p>
                  <button
                    type="button"
                    disabled={readOnly}
                    className="group mt-0.5 inline-flex max-w-full items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
                    onClick={() => {
                      if (readOnly) return;
                      setUnitLabelEditor({
                        unit: group.unit,
                        teams: unitTeamNames,
                        value: unitDisplayName,
                      });
                      setUnitLabelDraft(unitDisplayName);
                    }}
                  >
                    <h3 className="truncate text-lg font-semibold tracking-tight">
                      {unitDisplayName}
                    </h3>
                  </button>
                  <div className="mt-1">
                    <RegionPaymentSummary
                      payments={unitRegionPayments}
                      prominent
                    />
                  </div>
                </div>
              </div>
              <div className="flex max-w-full shrink-0 flex-wrap items-end justify-end gap-x-5 gap-y-2 text-right">
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                    ФОТ 2025
                  </p>
                  <p className="text-sm font-semibold tabular-nums">
                    {unitFot2025 > 0 ? formatLocationCompactM(unitFot2025) : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                    ФОТ 2026
                  </p>
                  <p className="text-sm font-semibold tabular-nums">
                    {unitFot2026 > 0 ? formatLocationCompactM(unitFot2026) : '—'}
                  </p>
                </div>
              </div>
            </div>

            {!isCollapsed ? (
              <>
                <div className="hidden grid-cols-[minmax(240px,1fr)_120px_120px_110px_130px_minmax(340px,1.8fr)] gap-2 border-b border-border/70 bg-muted/15 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground xl:grid">
                  <span>Команда · распределение по регионам</span>
                  <span>ФОТ 2025</span>
                  <span>ФОТ 2026</span>
                  <span>Люди</span>
                  <span>RUN</span>
                  <span>Инициативы · стоимость · регионы</span>
                </div>

                <div className="divide-y divide-border/70">
              {group.teams.map(({ team, visibleRows }) => {
                const key = locationTeamKey(group.unit, team);
                const allTeamRows =
                  allRowsByTeam.get(key) ??
                  initiatives.filter(
                    (row) =>
                      (row.unit.trim() || 'Без юнита') === group.unit &&
                      (row.team.trim() || 'Без команды') === team
                  );
                const metric = metricByTeam.get(key);
                const calculatedFot2025 = sumTeamCostForYear(allTeamRows, 2025);
                const calculatedFot2026 = sumTeamCostForYear(allTeamRows, 2026);
                const fot2025 = metric?.fot2025Rub ?? calculatedFot2025;
                const fot2026 = metric?.fot2026Rub ?? calculatedFot2026;
                const calculatedPeople = headcount.byTeam.get(key) ?? 0;
                const peopleCount =
                  metric?.peopleCountOverride ?? calculatedPeople;
                const teamPeople = people.filter(
                  (person) =>
                    !person.terminated_at &&
                    person.unit?.trim() === group.unit &&
                    person.team?.trim() === team
                );
                const teamPersonIds = new Set(teamPeople.map((person) => person.id));
                const teamAssignments = assignments.filter((assignment) =>
                  teamPersonIds.has(assignment.person_id)
                );
                const calculatedRun = calculateTeamRun(
                  allTeamRows,
                  teamPeople,
                  teamAssignments,
                  FULL_2026,
                  fot2026,
                  peopleCount
                );
                const run = resolveTeamRunDisplay(
                  calculatedRun,
                  fot2026,
                  metric?.runPercentOverride ?? null
                );
                const initiativeRows = visibleRows.filter((row) => !row.isTimelineStub);
                const teamCommentCount =
                  commentSummary?.byTeamDirect.get(key) ??
                  EMPTY_LOCATION_COMMENT_COUNT;
                const teamRegionPayments = buildInitiativesRegionPayments(
                  visibleRows,
                  selectedQuarters,
                  countries,
                  countryIdToClusterKey
                );

                return (
                  <div
                    key={key}
                    className="grid grid-cols-1 gap-2 px-3 py-3 xl:grid-cols-[minmax(240px,1fr)_120px_120px_110px_130px_minmax(340px,1.8fr)] xl:items-start"
                  >
                    <div className="min-w-0 px-2 py-1">
                      <button
                        type="button"
                        disabled={readOnly}
                        className="group flex w-full min-w-0 items-center rounded-lg py-1 text-left transition-colors enabled:hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
                        onClick={() => {
                          if (readOnly) return;
                          const value = metric?.teamDisplayName ?? team;
                          setTeamLabelEditor({ unit: group.unit, team, value });
                          setTeamLabelDraft(value);
                        }}
                      >
                        <span className="truncate text-sm font-semibold">
                          {metric?.teamDisplayName ?? team}
                        </span>
                        {!readOnly ? (
                          <CommentBadge count={teamCommentCount} />
                        ) : null}
                      </button>
                      <RegionPaymentSummary payments={teamRegionPayments} />
                    </div>

                    <MetricButton
                      value={fot2025 > 0 ? formatLocationCompactM(fot2025) : '—'}
                      onClick={() =>
                        openMetricEditor(
                          group.unit,
                          team,
                          'fot2025Rub',
                          calculatedFot2025,
                          metric?.fot2025Rub ?? null
                        )
                      }
                      disabled={readOnly}
                    />

                    <MetricButton
                      value={fot2026 > 0 ? formatLocationCompactM(fot2026) : '—'}
                      onClick={() =>
                        openMetricEditor(
                          group.unit,
                          team,
                          'fot2026Rub',
                          calculatedFot2026,
                          metric?.fot2026Rub ?? null
                        )
                      }
                      disabled={readOnly}
                    />

                    <MetricButton
                      value={peopleCount > 0 ? String(peopleCount) : '—'}
                      onClick={() =>
                        openMetricEditor(
                          group.unit,
                          team,
                          'peopleCountOverride',
                          calculatedPeople,
                          metric?.peopleCountOverride ?? null
                        )
                      }
                      disabled={readOnly}
                    />

                    <MetricButton
                      value={`${formatRunPercent(run.percent)}%`}
                      secondary={`(${formatLocationCompactM(run.runRub)})`}
                      title={
                        readOnly
                          ? run.isManual
                            ? 'RUN задан вручную'
                            : 'RUN рассчитан автоматически'
                          : run.isManual
                            ? 'RUN задан вручную. Нажмите, чтобы изменить или вернуть авторасчёт'
                            : 'RUN рассчитан автоматически. Нажмите, чтобы задать вручную'
                      }
                      onClick={() =>
                        openMetricEditor(
                          group.unit,
                          team,
                          'runPercentOverride',
                          calculatedRun.supportShare * 100,
                          metric?.runPercentOverride ?? null
                        )
                      }
                      disabled={readOnly}
                    />

                    <div className="min-w-0 space-y-1.5 px-1 py-1">
                      {initiativeRows.length > 0 ? (
                        initiativeRows.map((row) => {
                          const periodCost = initiativeYearCostRub(row, selectedQuarters);
                          const payments = buildInitiativeRegionPayments(
                            row,
                            selectedQuarters,
                            countries,
                            countryIdToClusterKey
                          );
                          return (
                            <button
                              key={row.id}
                              type="button"
                              disabled={readOnly}
                              className="group w-full rounded-lg border border-border/60 bg-muted/20 px-2.5 py-2 text-left transition-colors enabled:hover:border-primary/35 enabled:hover:bg-primary/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
                              onClick={() => setSelectedInitiativeId(row.id)}
                            >
                              <div className="flex min-w-0 items-center justify-between gap-2">
                                <span className="truncate text-xs font-semibold">
                                  {getInitiativeDisplayName(row)}
                                </span>
                                <span className="shrink-0 text-[11px] font-semibold tabular-nums">
                                  {periodCost > 0
                                    ? formatLocationCompactM(periodCost)
                                    : '—'}
                                </span>
                              </div>
                              <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                                {payments.length > 0 ? (
                                  payments.map((payment) => (
                                    <span key={payment.region} className="tabular-nums">
                                      {TOP_REGION_SHORT_LABELS[payment.region]}{' '}
                                      {formatLocationCompactM(payment.rub)} (
                                      {Math.round(payment.percent)}%)
                                    </span>
                                  ))
                                ) : (
                                  <span>Нет регионального распределения</span>
                                )}
                              </div>
                            </button>
                          );
                        })
                      ) : (
                        <p className="px-2 py-2 text-xs text-muted-foreground">
                          Нет инициатив в выбранном срезе.
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
                </div>
              </>
            ) : null}
          </section>
            );
          })()
        ))}
      </div>

      <Dialog
        open={metricEditor != null}
        onOpenChange={(open) => {
          if (!open) setMetricEditor(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {metricEditor?.kind === 'fot2025Rub'
                ? 'ФОТ за 2025'
                : metricEditor?.kind === 'fot2026Rub'
                  ? 'ФОТ за 2026'
                  : metricEditor?.kind === 'peopleCountOverride'
                    ? 'Количество людей'
                    : 'RUN, %'}
            </DialogTitle>
            <DialogDescription>
              {metricEditor?.unit} › {metricEditor?.team}. Можно задать ручное
              значение или вернуться к автоматическому расчёту.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Input
              type="number"
              min={0}
              max={metricEditor?.kind === 'runPercentOverride' ? 100 : undefined}
              step={
                metricEditor?.kind === 'peopleCountOverride'
                  ? 1
                  : metricEditor?.kind === 'runPercentOverride'
                    ? 0.1
                    : 100000
              }
              value={metricDraft}
              onChange={(event) => setMetricDraft(event.target.value)}
              className="[appearance:textfield] [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Автоматический расчёт:{' '}
              <span className="font-medium text-foreground">
                {metricEditor?.kind === 'peopleCountOverride'
                  ? `${metricEditor?.calculatedValue ?? 0} чел.`
                  : metricEditor?.kind === 'runPercentOverride'
                    ? `${formatRunPercent(
                        metricEditor?.calculatedValue ?? 0
                      )}%`
                  : formatLocationCompactM(metricEditor?.calculatedValue ?? 0)}
              </span>
            </p>
          </div>

          <DialogFooter className="gap-2 sm:justify-between sm:space-x-0">
            <Button
              type="button"
              variant="outline"
              disabled={!metricEditor || isSaving}
              onClick={async () => {
                if (!metricEditor) return;
                await saveMetric({
                  unit: metricEditor.unit,
                  team: metricEditor.team,
                  [metricEditor.kind]: null,
                });
                setMetricEditor(null);
              }}
            >
              Использовать расчёт
            </Button>
            <Button
              type="button"
              disabled={!metricEditor || metricDraft === '' || isSaving}
              onClick={async () => {
                if (!metricEditor) return;
                const raw = Math.max(0, Number(metricDraft) || 0);
                const value =
                  metricEditor.kind === 'runPercentOverride'
                    ? Math.round(Math.min(100, raw) * 10) / 10
                    : Math.round(raw);
                await saveMetric({
                  unit: metricEditor.unit,
                  team: metricEditor.team,
                  [metricEditor.kind]: value,
                });
                setMetricEditor(null);
              }}
            >
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={teamLabelEditor != null}
        onOpenChange={(open) => {
          if (!open) setTeamLabelEditor(null);
        }}
      >
        <DialogContent className="max-h-[85dvh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Название команды в представлении</DialogTitle>
            <DialogDescription>
              Это подпись только для командного вида. Исходное название команды в данных
              останется «{teamLabelEditor?.team}».
            </DialogDescription>
          </DialogHeader>
          <Input
            value={teamLabelDraft}
            onChange={(event) => setTeamLabelDraft(event.target.value)}
            placeholder="Название команды"
            autoFocus
          />
          {teamLabelEditor ? (
            <div className="border-t border-border/60 pt-4">
              <InitiativeAllocationComments
                scope={{
                  type: 'team',
                  unit: teamLabelEditor.unit,
                  team: teamLabelEditor.team,
                }}
                compact
              />
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:justify-between sm:space-x-0">
            <Button
              type="button"
              variant="outline"
              disabled={!teamLabelEditor || isSaving}
              onClick={async () => {
                if (!teamLabelEditor) return;
                await saveMetric({
                  unit: teamLabelEditor.unit,
                  team: teamLabelEditor.team,
                  teamDisplayName: null,
                });
                setTeamLabelEditor(null);
              }}
            >
              Исходное название
            </Button>
            <Button
              type="button"
              disabled={!teamLabelEditor || !teamLabelDraft.trim() || isSaving}
              onClick={async () => {
                if (!teamLabelEditor) return;
                await saveMetric({
                  unit: teamLabelEditor.unit,
                  team: teamLabelEditor.team,
                  teamDisplayName: teamLabelDraft.trim(),
                });
                setTeamLabelEditor(null);
              }}
            >
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={unitLabelEditor != null}
        onOpenChange={(open) => {
          if (!open) setUnitLabelEditor(null);
        }}
      >
        <DialogContent className="max-h-[85dvh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Название юнита в представлении</DialogTitle>
            <DialogDescription>
              Это подпись только для командного вида. Исходное название в данных
              останется «{unitLabelEditor?.unit}».
            </DialogDescription>
          </DialogHeader>
          <Input
            value={unitLabelDraft}
            onChange={(event) => setUnitLabelDraft(event.target.value)}
            placeholder="Название юнита"
            autoFocus
          />
          <DialogFooter className="gap-2 sm:justify-between sm:space-x-0">
            <Button
              type="button"
              variant="outline"
              disabled={!unitLabelEditor || isSaving}
              onClick={async () => {
                if (!unitLabelEditor) return;
                await saveUnitDisplayName({
                  unit: unitLabelEditor.unit,
                  teams: unitLabelEditor.teams,
                  displayName: null,
                });
                setUnitLabelEditor(null);
              }}
            >
              Исходное название
            </Button>
            <Button
              type="button"
              disabled={!unitLabelEditor || !unitLabelDraft.trim() || isSaving}
              onClick={async () => {
                if (!unitLabelEditor) return;
                await saveUnitDisplayName({
                  unit: unitLabelEditor.unit,
                  teams: unitLabelEditor.teams,
                  displayName: unitLabelDraft.trim(),
                });
                setUnitLabelEditor(null);
              }}
            >
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LocationAllocationTreemapEditDialog
        open={selectedInitiativeTarget != null}
        onOpenChange={(open) => {
          if (!open) setSelectedInitiativeId(null);
        }}
        target={selectedInitiativeTarget}
        countries={countries}
        countryIdToClusterKey={countryIdToClusterKey}
        onGeoCostSplitSave={onGeoCostSplitSave}
        onInitiativeTagsSave={onInitiativeTagsSave}
        readOnly={readOnly}
      />
    </>
  );
}
