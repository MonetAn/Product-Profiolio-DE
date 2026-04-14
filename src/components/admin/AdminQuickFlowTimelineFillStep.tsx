import { useCallback, useMemo, useState } from 'react';
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
import type { AdminDataRow, AdminQuarterData, GeoCostSplit } from '@/lib/adminDataManager';
import { createEmptyQuarterData, getQuickFlowTimelineQuarterWarnings } from '@/lib/adminDataManager';
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

  const quarterEditNavIndex = useMemo(() => {
    if (!quarterEdit || previewPeriodQuarters.length === 0) return -1;
    return previewPeriodQuarters.indexOf(quarterEdit.quarter);
  }, [quarterEdit, previewPeriodQuarters]);

  const scenarioQuartersForSupport = useMemo(() => {
    const fromFill = [...fillQuarters].filter(Boolean).sort(compareQuarters);
    if (fromFill.length > 0) return fromFill;
    return [...previewPeriodQuarters];
  }, [fillQuarters, previewPeriodQuarters]);

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

      <Dialog open={quarterEdit != null && quarterEditRow != null && qDataForEdit != null} onOpenChange={(o) => !o && setQuarterEdit(null)}>
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
                    disabled={quarterEditNavIndex <= 0}
                    aria-label="Предыдущий квартал"
                    onClick={() => {
                      if (quarterEditNavIndex <= 0) return;
                      setQuarterEdit({
                        id: quarterEdit.id,
                        quarter: previewPeriodQuarters[quarterEditNavIndex - 1],
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
                    disabled={
                      quarterEditNavIndex < 0 ||
                      quarterEditNavIndex >= previewPeriodQuarters.length - 1
                    }
                    aria-label="Следующий квартал"
                    onClick={() => {
                      if (
                        quarterEditNavIndex < 0 ||
                        quarterEditNavIndex >= previewPeriodQuarters.length - 1
                      ) {
                        return;
                      }
                      setQuarterEdit({
                        id: quarterEdit.id,
                        quarter: previewPeriodQuarters[quarterEditNavIndex + 1],
                      });
                    }}
                  >
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
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
    </section>
  );
}
