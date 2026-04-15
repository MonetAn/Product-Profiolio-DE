import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import GanttView from '@/components/GanttView';
import { QuarterFields } from '@/components/admin/InitiativeDetailDialog';
import { AdminQuickFlowMatrixPeriodPicker } from '@/components/admin/AdminQuickFlowMatrixPeriodPicker';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import type { AdminDataRow, AdminQuarterData, GeoCostSplit } from '@/lib/adminDataManager';
import { createEmptyQuarterData, getQuickFlowTimelineQuarterWarnings } from '@/lib/adminDataManager';

/** Квартал имеет смысл открывать в карточке, если есть затраты или ненулевые усилия. */
function quarterHasMoneyOrEffort(row: AdminDataRow, q: string): boolean {
  const qd = row.quarterlyData[q] ?? createEmptyQuarterData();
  const money = Math.round(Number(qd.cost) || 0) + Math.round(Number(qd.otherCosts) || 0);
  const eff = Math.round(Number(qd.effortCoefficient) || 0);
  return money > 0 || eff > 0;
}
import { convertFromDB } from '@/lib/dataManager';
import { compareQuarters } from '@/lib/quarterUtils';
import { cn } from '@/lib/utils';

type Props = {
  rows: AdminDataRow[];
  fillQuarters: string[];
  quartersCatalog: string[];
  visibleQuarters: string[];
  previewQuarters: string[] | null;
  rangeAnchor: string | null;
  onQuarterClick: (q: string) => void;
  onQuarterHover: (q: string | null) => void;
  onReplaceSelectedQuarters: (quarters: string[]) => void;
  onDismissTransientRangeUI: () => void;
  unit: string;
  team: string;
  onQuarterDataChange: (
    id: string,
    quarter: string,
    field: keyof AdminQuarterData,
    value: string | number | boolean | GeoCostSplit | undefined
  ) => void;
};

export function AdminQuickFlowTimelineFillStep({
  rows,
  fillQuarters,
  quartersCatalog,
  visibleQuarters,
  previewQuarters,
  rangeAnchor,
  onQuarterClick,
  onQuarterHover,
  onReplaceSelectedQuarters,
  onDismissTransientRangeUI,
  unit,
  team,
  onQuarterDataChange,
}: Props) {
  const [quarterEdit, setQuarterEdit] = useState<{ id: string; quarter: string } | null>(null);
  const [quarterDialogDirty, setQuarterDialogDirty] = useState(false);
  const [discardPrompt, setDiscardPrompt] = useState<
    null | { kind: 'close' } | { kind: 'nav'; target: { id: string; quarter: string } }
  >(null);

  useEffect(() => {
    if (!quarterEdit) setQuarterDialogDirty(false);
  }, [quarterEdit]);

  const previewPeriodQuarters = useMemo(() => {
    const sel = new Set(visibleQuarters);
    return quartersCatalog.filter((q) => sel.has(q));
  }, [quartersCatalog, visibleQuarters]);

  const rawData = useMemo(() => convertFromDB(rows).rawData, [rows]);

  const rowById = useMemo(() => new Map(rows.map((r) => [r.id, r] as const)), [rows]);

  const adminTimelineQuarterWarnings = useCallback(
    (adminRowId: string, quarter: string) => {
      const row = rowById.get(adminRowId);
      if (!row) return [];
      return getQuickFlowTimelineQuarterWarnings(row, quarter);
    },
    [rowById]
  );

  const selectedUnits = unit.trim() ? [unit.trim()] : [];
  const selectedTeams = team.trim() ? [team.trim()] : [];

  const quarterEditRow = useMemo(
    () => (quarterEdit ? rows.find((r) => r.id === quarterEdit.id) ?? null : null),
    [quarterEdit, rows]
  );

  const qDataForEdit: AdminQuarterData | null = useMemo(() => {
    if (!quarterEdit || !quarterEditRow) return null;
    return {
      ...createEmptyQuarterData(),
      ...quarterEditRow.quarterlyData[quarterEdit.quarter],
    };
  }, [quarterEdit, quarterEditRow]);

  /** Соседние по списку кварталы, где у этой инициативы есть деньги или усилия (пустые пропускаем). */
  const quarterDialogNav = useMemo(() => {
    if (!quarterEdit || !quarterEditRow) {
      return { prevQuarter: null as string | null, nextQuarter: null as string | null };
    }
    const qs = previewPeriodQuarters;
    const cur = quarterEdit.quarter;
    const i = qs.indexOf(cur);
    if (i < 0) return { prevQuarter: null, nextQuarter: null };

    let prevQuarter: string | null = null;
    for (let j = i - 1; j >= 0; j--) {
      if (quarterHasMoneyOrEffort(quarterEditRow, qs[j])) {
        prevQuarter = qs[j];
        break;
      }
    }
    let nextQuarter: string | null = null;
    for (let j = i + 1; j < qs.length; j++) {
      if (quarterHasMoneyOrEffort(quarterEditRow, qs[j])) {
        nextQuarter = qs[j];
        break;
      }
    }
    return { prevQuarter, nextQuarter };
  }, [quarterEdit, quarterEditRow, previewPeriodQuarters]);

  const scenarioQuartersForSupport = useMemo(() => {
    const fromFill = [...fillQuarters].filter(Boolean).sort(compareQuarters);
    if (fromFill.length > 0) return fromFill;
    return [...previewPeriodQuarters];
  }, [fillQuarters, previewPeriodQuarters]);

  const dialogOpen = quarterEdit != null && quarterEditRow != null && qDataForEdit != null;

  const requestCloseDialog = useCallback(() => {
    if (quarterDialogDirty) setDiscardPrompt({ kind: 'close' });
    else setQuarterEdit(null);
  }, [quarterDialogDirty]);

  const requestNavigateQuarter = useCallback(
    (target: { id: string; quarter: string }) => {
      if (quarterDialogDirty) setDiscardPrompt({ kind: 'nav', target });
      else setQuarterEdit(target);
    },
    [quarterDialogDirty]
  );

  const confirmDiscard = useCallback(() => {
    if (!discardPrompt) return;
    if (discardPrompt.kind === 'close') setQuarterEdit(null);
    else setQuarterEdit(discardPrompt.target);
    setDiscardPrompt(null);
  }, [discardPrompt]);

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <div>
        <h2 className="text-lg font-semibold">Заполни информацию по кварталам</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Внеси план-факт, on-track по каждому кварталу и когда инициатива переходит на поддержку. В красных блоках не
          хватает информации.
        </p>
      </div>

      {quartersCatalog.length > 0 ? (
        <div
          className={cn(
            'overflow-visible rounded-xl border border-border/80 bg-card/90 shadow-sm',
            'animate-in fade-in slide-in-from-top-1 duration-200 motion-reduce:animate-none motion-reduce:opacity-100'
          )}
        >
          <AdminQuickFlowMatrixPeriodPicker
            catalogQuarters={quartersCatalog}
            visibleQuarters={previewPeriodQuarters}
            previewQuarters={previewQuarters}
            rangeAnchor={rangeAnchor}
            onQuarterClick={onQuarterClick}
            onQuarterHover={onQuarterHover}
            onReplaceSelectedQuarters={onReplaceSelectedQuarters}
            onDismissTransientRangeUI={onDismissTransientRangeUI}
            hideAddInitiativeButton
            splitImmersive={false}
            compactPeriodPicker={false}
          />
        </div>
      ) : null}

      <div className="min-h-0 min-h-[min(20rem,45vh)] w-full min-w-0 flex-1 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {previewPeriodQuarters.length === 0 || rawData.length === 0 ? (
          <div className="flex h-full min-h-[12rem] flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
            <p>Нет данных для таймлайна в выбранном периоде.</p>
          </div>
        ) : (
          <div className="flex h-full min-h-[18rem] min-w-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0 min-w-0 flex-1">
              <GanttView
                rawData={rawData}
                selectedQuarters={previewPeriodQuarters}
                supportFilter="all"
                showOnlyOfftrack={false}
                hideStubs={false}
                selectedUnits={selectedUnits}
                selectedTeams={selectedTeams}
                selectedStakeholders={[]}
                showMoney
                adminOnEditQuarter={(adminRowId, quarter) => setQuarterEdit({ id: adminRowId, quarter })}
                adminTimelineQuarterWarnings={adminTimelineQuarterWarnings}
              />
            </div>
          </div>
        )}
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (open) return;
          requestCloseDialog();
        }}
      >
        <DialogContent
          className="flex max-h-[min(92vh,920px)] w-[min(100vw-1.25rem,52rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(100vw-2rem,52rem)]"
          aria-describedby={undefined}
        >
          {quarterEdit && quarterEditRow && qDataForEdit ? (
            <>
              <DialogHeader className="shrink-0 space-y-2 border-b border-border/60 px-5 pb-4 pr-12 pt-5 sm:px-6 sm:pr-14">
                <div className="flex items-center gap-2 sm:gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    disabled={!quarterDialogNav.prevQuarter}
                    aria-label="Предыдущий квартал с затратами или усилиями"
                    onClick={() => {
                      if (!quarterDialogNav.prevQuarter) return;
                      requestNavigateQuarter({
                        id: quarterEdit.id,
                        quarter: quarterDialogNav.prevQuarter,
                      });
                    }}
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden />
                  </Button>
                  <div className="min-w-0 flex-1">
                    <DialogTitle className="text-left text-lg leading-snug sm:text-xl">
                      {quarterEditRow.initiative || 'Инициатива'}{' '}
                      <span className="text-muted-foreground">· {quarterEdit.quarter}</span>
                    </DialogTitle>
                    <DialogDescription className="sr-only">
                      Редактирование данных квартала {quarterEdit.quarter}
                    </DialogDescription>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    disabled={!quarterDialogNav.nextQuarter}
                    aria-label="Следующий квартал с затратами или усилиями"
                    onClick={() => {
                      if (!quarterDialogNav.nextQuarter) return;
                      requestNavigateQuarter({
                        id: quarterEdit.id,
                        quarter: quarterDialogNav.nextQuarter,
                      });
                    }}
                  >
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              </DialogHeader>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 pb-4 pt-0 sm:px-6 sm:pb-5">
                <QuarterFields
                  key={`${quarterEdit.id}-${quarterEdit.quarter}`}
                  initiativeId={quarterEdit.id}
                  quarter={quarterEdit.quarter}
                  qData={qDataForEdit}
                  allData={rows}
                  initiative={quarterEditRow}
                  onQuarterDataChange={onQuarterDataChange}
                  variant="quickTimeline"
                  scenarioQuarters={scenarioQuartersForSupport}
                  persistMode="explicitSave"
                  onDirtyChange={setQuarterDialogDirty}
                />
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={discardPrompt != null}
        onOpenChange={(open) => {
          if (!open) setDiscardPrompt(null);
        }}
      >
        <AlertDialogContent className="z-[100]">
          <AlertDialogHeader>
            <AlertDialogTitle>Несохранённые изменения</AlertDialogTitle>
            <AlertDialogDescription>
              {discardPrompt?.kind === 'nav'
                ? 'Перейти к другому кварталу без сохранения? Введённые данные будут потеряны.'
                : 'Закрыть окно без сохранения? Введённые данные будут потеряны.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Остаться</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDiscard}
            >
              {discardPrompt?.kind === 'nav' ? 'Перейти без сохранения' : 'Закрыть без сохранения'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
