import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  CircleDot,
} from 'lucide-react';
import GanttView from '@/components/GanttView';
import InitiativeDetailDialog, { QuarterFields } from '@/components/admin/InitiativeDetailDialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { AdminDataRow, AdminQuarterData, GeoCostSplit } from '@/lib/adminDataManager';
import {
  createEmptyQuarterData,
  getQuickFlowTimelineQuarterWarnings,
  getQuickFlowValidationIssues,
} from '@/lib/adminDataManager';
import { convertFromDB } from '@/lib/dataManager';
import { compareQuarters, filterQuartersInRange } from '@/lib/quarterUtils';
import { cn } from '@/lib/utils';

type DraftField =
  | 'initiative'
  | 'initiativeType'
  | 'stakeholdersList'
  | 'description'
  | 'documentationLink'
  | 'isTimelineStub';

type Props = {
  rows: AdminDataRow[];
  fillQuarters: string[];
  quartersCatalog: string[];
  exportQuarters: string[];
  unit: string;
  team: string;
  onQuarterDataChange: (
    id: string,
    quarter: string,
    field: keyof AdminQuarterData,
    value: string | number | boolean | GeoCostSplit | undefined
  ) => void;
  onInitiativeDraftChange?: (id: string, field: DraftField, value: string | string[] | boolean) => void;
};

function effortStatesForQuarters(
  quarterKeys: string[],
  rowList: AdminDataRow[],
  catalogQuarters: string[]
): { quarter: string; sum: number; valid: boolean; inCatalog: boolean }[] {
  return quarterKeys.map((targetQ) => {
    const sum = rowList.reduce((s, row) => s + (row.quarterlyData[targetQ]?.effortCoefficient ?? 0), 0);
    return {
      quarter: targetQ,
      sum,
      valid: sum <= 100,
      inCatalog: catalogQuarters.includes(targetQ),
    };
  });
}

export function AdminQuickFlowTimelineFillStep({
  rows,
  fillQuarters,
  quartersCatalog,
  exportQuarters,
  unit,
  team,
  onQuarterDataChange,
  onInitiativeDraftChange,
}: Props) {
  const [previewSelectedQuarters, setPreviewSelectedQuarters] = useState<string[]>([]);
  const [rangeAnchor, setRangeAnchor] = useState<string | null>(null);
  const [hoverQuarter, setHoverQuarter] = useState<string | null>(null);

  const [quarterEdit, setQuarterEdit] = useState<{ id: string; quarter: string } | null>(null);
  const [editCardId, setEditCardId] = useState<string | null>(null);

  const catalogKey = quartersCatalog.join('|');
  const fillSortedKey = useMemo(
    () => [...fillQuarters].filter(Boolean).sort(compareQuarters).join('|'),
    [fillQuarters]
  );

  useEffect(() => {
    setRangeAnchor(null);
    setHoverQuarter(null);
    const fromScenario = [...fillQuarters]
      .filter((q) => quartersCatalog.includes(q))
      .sort(compareQuarters);
    if (fromScenario.length > 0) {
      setPreviewSelectedQuarters(fromScenario);
    } else if (quartersCatalog.length > 0) {
      setPreviewSelectedQuarters([...quartersCatalog].sort(compareQuarters));
    } else {
      setPreviewSelectedQuarters([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogKey, fillSortedKey]);

  const previewSortedQs = useMemo(
    () => [...previewSelectedQuarters].filter(Boolean).sort(compareQuarters),
    [previewSelectedQuarters]
  );

  const previewQuartersBand = useMemo(() => {
    if (!rangeAnchor || !hoverQuarter) return null;
    return filterQuartersInRange(rangeAnchor, hoverQuarter, quartersCatalog);
  }, [rangeAnchor, hoverQuarter, quartersCatalog]);

  const handleQuarterClick = useCallback(
    (q: string) => {
      if (rangeAnchor == null) {
        setRangeAnchor(q);
        setPreviewSelectedQuarters([q]);
      } else {
        setPreviewSelectedQuarters(filterQuartersInRange(rangeAnchor, q, quartersCatalog));
        setRangeAnchor(null);
      }
      setHoverQuarter(null);
    },
    [rangeAnchor, quartersCatalog]
  );

  const chipStates = useMemo(
    () => effortStatesForQuarters(quartersCatalog, rows, exportQuarters),
    [quartersCatalog, rows, exportQuarters]
  );

  const fieldIssuesByQuarter = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const q of quartersCatalog) {
      m.set(q, getQuickFlowValidationIssues(rows, q).length > 0);
    }
    return m;
  }, [rows, quartersCatalog]);

  const rawData = useMemo(() => convertFromDB(rows).rawData, [rows]);

  const adminTimelineQuarterWarnings = useCallback(
    (adminRowId: string, quarter: string) => {
      const row = rows.find((r) => r.id === adminRowId);
      if (!row) return [];
      return getQuickFlowTimelineQuarterWarnings(row, quarter);
    },
    [rows]
  );

  const selectedUnits = unit.trim() ? [unit.trim()] : [];
  const selectedTeams = team.trim() ? [team.trim()] : [];

  const quarterEditRow = useMemo(
    () => (quarterEdit ? rows.find((r) => r.id === quarterEdit.id) ?? null : null),
    [quarterEdit, rows]
  );

  const editCardRow = useMemo(
    () => (editCardId ? rows.find((r) => r.id === editCardId) ?? null : null),
    [editCardId, rows]
  );

  const qDataForEdit: AdminQuarterData | null = useMemo(() => {
    if (!quarterEdit || !quarterEditRow) return null;
    return {
      ...createEmptyQuarterData(),
      ...quarterEditRow.quarterlyData[quarterEdit.quarter],
    };
  }, [quarterEdit, quarterEditRow]);

  /** Период для вопроса «с какого квартала поддержка» — сначала интервал сценария, иначе выбранные на таймлайне чипы. */
  const scenarioQuartersForSupport = useMemo(() => {
    const fromFill = [...fillQuarters].filter(Boolean).sort(compareQuarters);
    if (fromFill.length > 0) return fromFill;
    return [...previewSortedQs];
  }, [fillQuarters, previewSortedQs]);

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <h2 className="text-lg font-semibold">Заполнение таймлайна по кварталам</h2>

      {quartersCatalog.length > 0 ? (
        <div className="flex flex-col gap-1 rounded-xl border border-border/80 bg-muted/10 p-2 dark:bg-muted/5">
          <div
            className="flex min-w-0 flex-col gap-1"
            role="group"
            aria-label="Период таймлайна: первое нажатие — начало диапазона, второе — конец"
          >
            <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto overflow-y-hidden py-0.5 [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5">
              {quartersCatalog.map((q) => {
                const on = previewSelectedQuarters.includes(q);
                const inBand = previewQuartersBand != null && previewQuartersBand.includes(q);
                const isRangeAnchor = rangeAnchor === q;
                const st = chipStates.find((s) => s.quarter === q);
                const sum = st?.sum ?? 0;
                const inCat = st?.inCatalog ?? false;
                const valid = st?.valid ?? true;
                const baseline = inCat && valid && sum === 100;
                const overflow = inCat && !valid;
                const missingCol = Boolean(st && !inCat);
                const needsAttention = !baseline;
                const hasFieldIssues = fieldIssuesByQuarter.get(q) ?? false;

                let statusIcon: ReactNode = null;
                let statusLabel: string;
                if (missingCol) {
                  statusIcon = (
                    <AlertTriangle
                      className={cn('h-3 w-3 shrink-0', on ? 'text-primary-foreground' : 'text-primary')}
                      aria-hidden
                    />
                  );
                  statusLabel = 'Нет колонки в выгрузке';
                } else if (overflow) {
                  statusIcon = (
                    <AlertCircle
                      className={cn('h-3 w-3 shrink-0', on ? 'text-primary-foreground' : 'text-primary')}
                      aria-hidden
                    />
                  );
                  statusLabel = `Сумма ${sum}% — больше 100%`;
                } else if (baseline) {
                  statusLabel = 'Сумма 100%';
                } else {
                  statusIcon = (
                    <CircleDot
                      className={cn('h-3 w-3 shrink-0', on ? 'text-primary-foreground' : 'text-primary')}
                      aria-hidden
                    />
                  );
                  statusLabel =
                    sum === 0
                      ? 'Сумма 0% — распределите усилия'
                      : `Сумма ${sum}% — нужно довести до 100%`;
                }

                const quarterTitle = hasFieldIssues
                  ? `${q}: замечания по полям. ${statusLabel}.`
                  : `${q}: ${statusLabel}. Два клика — диапазон.`;

                return (
                  <Button
                    key={q}
                    type="button"
                    size="sm"
                    variant={on ? 'default' : 'outline'}
                    title={quarterTitle}
                    onClick={() => handleQuarterClick(q)}
                    onMouseEnter={() => setHoverQuarter(q)}
                    onMouseLeave={() => setHoverQuarter(null)}
                    aria-pressed={on}
                    className={cn(
                      'h-auto min-h-[2.85rem] min-w-[5.25rem] shrink-0 flex-col justify-center gap-0.5 py-1.5 tabular-nums',
                      isRangeAnchor && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
                      inBand && !on && 'bg-primary/15 ring-1 ring-primary/40 dark:bg-primary/20',
                      needsAttention &&
                        !on &&
                        !inBand &&
                        !hasFieldIssues &&
                        'border-primary/45 bg-primary/[0.07] ring-1 ring-primary/30 dark:bg-primary/10 dark:ring-primary/25',
                      needsAttention && on && !hasFieldIssues && 'ring-2 ring-primary-foreground/40',
                      overflow &&
                        !on &&
                        !inBand &&
                        'border-primary/55 bg-primary/[0.12] ring-2 ring-primary/35 dark:bg-primary/40',
                      missingCol &&
                        !on &&
                        !inBand &&
                        'border-dashed border-primary/50 bg-primary/[0.04] ring-1 ring-primary/25'
                    )}
                  >
                    <span className="flex items-center justify-center gap-0.5 text-[11px] font-semibold leading-none">
                      {q}
                      {hasFieldIssues ? (
                        <AlertTriangle
                          className={cn(
                            'h-3.5 w-3.5 shrink-0',
                            on ? 'text-primary-foreground' : 'text-blue-700 dark:text-blue-400'
                          )}
                          aria-hidden
                        />
                      ) : baseline && inCat ? (
                        <CheckCircle2
                          className={cn(
                            'h-3.5 w-3.5 shrink-0',
                            on ? 'text-primary-foreground/90' : 'text-emerald-600 dark:text-emerald-500'
                          )}
                          aria-hidden
                        />
                      ) : null}
                    </span>
                    {baseline ? (
                      <span
                        className={cn(
                          'text-[9px] font-normal tabular-nums leading-none',
                          on ? 'text-primary-foreground/65' : 'text-muted-foreground/55'
                        )}
                      >
                        100%
                      </span>
                    ) : (
                      <span
                        className={cn(
                          'flex items-center justify-center gap-0.5 text-[9px] font-semibold leading-none',
                          on ? 'text-primary-foreground' : 'text-primary'
                        )}
                      >
                        <span className="tabular-nums">{sum}%</span>
                        {statusIcon}
                      </span>
                    )}
                  </Button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      <div className="min-h-0 min-h-[min(20rem,45vh)] w-full min-w-0 flex-1 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {previewSortedQs.length === 0 || rawData.length === 0 ? (
          <div className="flex h-full min-h-[12rem] flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
            <p>Нет данных для таймлайна в выбранном периоде.</p>
          </div>
        ) : (
          <div className="h-full min-h-[18rem] overflow-auto">
            <GanttView
              rawData={rawData}
              selectedQuarters={previewSortedQs}
              supportFilter="all"
              showOnlyOfftrack={false}
              hideStubs={false}
              selectedUnits={selectedUnits}
              selectedTeams={selectedTeams}
              selectedStakeholders={[]}
              showMoney
              adminOnEditQuarter={(adminRowId, quarter) => setQuarterEdit({ id: adminRowId, quarter })}
              adminOnEditInitiativeCard={
                onInitiativeDraftChange ? (adminRowId) => setEditCardId(adminRowId) : undefined
              }
              adminTimelineQuarterWarnings={adminTimelineQuarterWarnings}
            />
          </div>
        )}
      </div>

      <Dialog open={quarterEdit != null && quarterEditRow != null && qDataForEdit != null} onOpenChange={(o) => !o && setQuarterEdit(null)}>
        <DialogContent
          className="flex max-h-[min(92vh,920px)] w-[min(100vw-1.25rem,52rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(100vw-2rem,52rem)]"
          aria-describedby={undefined}
        >
          {quarterEdit && quarterEditRow && qDataForEdit ? (
            <>
              <DialogHeader className="shrink-0 space-y-2 border-b border-border/60 px-5 pb-4 pr-12 pt-5 sm:px-6 sm:pr-14">
                <DialogTitle className="text-left text-lg leading-snug sm:text-xl">
                  {quarterEditRow.initiative || 'Инициатива'}{' '}
                  <span className="text-muted-foreground">· {quarterEdit.quarter}</span>
                </DialogTitle>
                <DialogDescription className="sr-only">
                  Редактирование данных квартала {quarterEdit.quarter}
                </DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5">
                <QuarterFields
                  initiativeId={quarterEdit.id}
                  quarter={quarterEdit.quarter}
                  qData={qDataForEdit}
                  allData={rows}
                  initiative={quarterEditRow}
                  onQuarterDataChange={onQuarterDataChange}
                  variant="quickTimeline"
                  scenarioQuarters={scenarioQuartersForSupport}
                />
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {onInitiativeDraftChange ? (
        <InitiativeDetailDialog
          initiative={editCardRow}
          allData={rows}
          quarters={previewSortedQs}
          open={editCardId != null && editCardRow != null}
          onOpenChange={(open) => !open && setEditCardId(null)}
          onDataChange={(id, field, value) =>
            onInitiativeDraftChange(id, field as DraftField, value as string | string[] | boolean)
          }
          onQuarterDataChange={onQuarterDataChange}
          showQuarterSection={false}
        />
      ) : null}
    </section>
  );
}
