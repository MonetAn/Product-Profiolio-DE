import { useMemo, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TreemapContainer } from '@/components/treemap';
import type { AdminDataRow } from '@/lib/adminDataManager';
import {
  applyEffortCompareToTreeChildren,
  buildEffortTreemapPreviewModel,
} from '@/lib/adminEffortTreemapPreviewModel';
import { PRELIMINARY_COST_USER_MESSAGE, type TreeNode } from '@/lib/dataManager';
import { compareQuarters } from '@/lib/quarterUtils';
import { cn } from '@/lib/utils';

const PREVIEW_ROOT = 'effort-compare-root';

type Props = {
  baselineRows: AdminDataRow[];
  currentRows: AdminDataRow[];
  previewQuarters: string[];
  /** Кнопка «Далее» и т.п. — справа в шапке панели. */
  headerAction?: ReactNode;
  /** Скрыть панель (кнопка у заголовка). */
  onCloseComparison?: () => void;
  /** Split с матрицей: без лишних рамок, максимум площади под treemap. */
  immersive?: boolean;
  className?: string;
};

function formatMoney(n: number): string {
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 0, minimumFractionDigits: 0 });
}

/** Показ выбранного в матрице диапазона (формат данных `YYYY-Qn`). */
function formatQuarterRangeForHint(sortedQs: string[]): string {
  if (sortedQs.length === 0) return '';
  if (sortedQs.length === 1) return sortedQs[0];
  return `${sortedQs[0]} — ${sortedQs[sortedQs.length - 1]}`;
}

export function AdminQuickFlowEffortComparePanel({
  baselineRows,
  currentRows,
  previewQuarters,
  headerAction,
  onCloseComparison,
  immersive = false,
  className,
}: Props) {
  const qs = useMemo(
    () => [...previewQuarters].filter(Boolean).sort(compareQuarters),
    [previewQuarters]
  );

  const beforeModel = useMemo(
    () => buildEffortTreemapPreviewModel(baselineRows, qs),
    [baselineRows, qs]
  );
  const afterModel = useMemo(
    () => buildEffortTreemapPreviewModel(currentRows, qs),
    [currentRows, qs]
  );

  const { beforeChildren, afterChildren } = useMemo(
    () => applyEffortCompareToTreeChildren(beforeModel, afterModel),
    [beforeModel, afterModel]
  );

  const treeBefore: TreeNode = useMemo(
    () => ({ name: PREVIEW_ROOT, isRoot: true, children: beforeChildren }),
    [beforeChildren]
  );
  const treeAfter: TreeNode = useMemo(
    () => ({ name: PREVIEW_ROOT, isRoot: true, children: afterChildren }),
    [afterChildren]
  );

  return (
    <div
      className={cn(
        'flex min-h-0 min-w-0 flex-1 flex-col',
        immersive
          ? 'gap-0 rounded-none border-0 bg-muted p-0 shadow-none dark:bg-muted/40'
          : 'gap-3 rounded-xl border border-border/80 bg-card p-3 shadow-sm',
        className
      )}
    >
      <div
        className={cn(
          'flex shrink-0 flex-col gap-1',
          immersive
            ? 'border-b border-border/60 bg-muted/30 px-3 pb-2 pt-0 dark:bg-muted/20'
            : 'gap-1.5'
        )}
      >
        <div
          className={cn('flex flex-wrap items-center justify-between gap-2', immersive && 'pt-2')}
        >
          <div className="flex min-w-0 max-w-full items-center gap-0.5 sm:gap-1">
            <h2
              className={cn(
                'min-w-0 truncate font-semibold text-foreground',
                immersive ? 'text-xs sm:text-sm' : 'text-sm'
              )}
            >
              Сравнение treemap
            </h2>
            {onCloseComparison ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn(
                  'h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground',
                  immersive && 'h-7 w-7'
                )}
                onClick={onCloseComparison}
                aria-label="Скрыть сравнение treemap"
              >
                <X className="h-4 w-4" aria-hidden />
              </Button>
            ) : null}
          </div>
          {headerAction ? <div className="flex shrink-0 items-center gap-2">{headerAction}</div> : null}
        </div>
        {immersive && qs.length > 0 ? (
          <p className="text-[11px] leading-snug text-muted-foreground">
            <span className="font-medium tabular-nums text-foreground/85">
              {formatQuarterRangeForHint(qs)}
            </span>
            <span>
              {' '}
              · Общая стоимость{' '}
              <span className="tabular-nums text-foreground/90">{formatMoney(beforeModel.effectiveTotal)}</span>
            </span>
          </p>
        ) : null}
      </div>

      {qs.length === 0 ? (
        <p className={cn('text-sm text-muted-foreground', immersive && 'px-3 py-2')}>
          Выберите кварталы в матрице слева.
        </p>
      ) : beforeModel.effectiveTotal <= 0 && afterModel.effectiveTotal <= 0 ? (
        <p className={cn('text-xs text-muted-foreground leading-relaxed', immersive && 'px-3 py-2')}>
          Нет суммы стоимости (cost + прочие) за выбранный период — treemap не строится. Проверьте данные по
          кварталам.
        </p>
      ) : immersive ? (
        <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 [grid-template-rows:minmax(0,1fr)_minmax(0,1fr)]">
          <section className="flex min-h-0 min-w-0 flex-col overflow-hidden border-b border-border/55">
            <p className="shrink-0 border-b border-border/45 bg-muted/25 px-2.5 py-1 text-[11px] font-semibold text-foreground dark:bg-muted/30">
              До изменений
            </p>
            <div className="flex min-h-0 h-full min-w-0 flex-1 flex-col overflow-hidden">
              {beforeModel.effectiveTotal > 0 && beforeChildren.length > 0 ? (
                <TreemapContainer
                  data={treeBefore}
                  showTeams={false}
                  showInitiatives={true}
                  hasData={true}
                  selectedQuarters={qs}
                  selectedUnitsCount={1}
                  getColor={beforeModel.getPreviewColor}
                  showDistributionInTooltip={false}
                  contentKey={`bef-${beforeModel.contentKey}`}
                  emptyStateTitle="Нет долей"
                  emptyStateSubtitle="Задайте коэффициенты"
                  showMoney={true}
                  nodeCursor="default"
                />
              ) : (
                <p className="p-3 text-xs text-muted-foreground">Нет долей для отображения.</p>
              )}
            </div>
          </section>
          <section className="flex min-h-0 min-w-0 flex-col overflow-hidden">
            <div className="shrink-0 border-b border-border/45 bg-muted/25 px-2.5 py-1 dark:bg-muted/30">
              <p
                className="m-0 min-w-0 text-left text-[11px] leading-snug text-foreground"
                title={`После изменений — ${PRELIMINARY_COST_USER_MESSAGE}`}
              >
                <span className="font-semibold">После изменений</span>
                <span className="text-[10px] font-medium leading-snug text-amber-900 dark:text-amber-100">
                  {' '}
                  {PRELIMINARY_COST_USER_MESSAGE}.
                </span>
              </p>
            </div>
            <div className="flex min-h-0 h-full min-w-0 flex-1 flex-col overflow-hidden">
              {afterModel.effectiveTotal > 0 && afterChildren.length > 0 ? (
                <TreemapContainer
                  data={treeAfter}
                  showTeams={false}
                  showInitiatives={true}
                  hasData={true}
                  selectedQuarters={qs}
                  selectedUnitsCount={1}
                  getColor={afterModel.getPreviewColor}
                  showDistributionInTooltip={false}
                  contentKey={`aft-${afterModel.contentKey}`}
                  emptyStateTitle="Нет долей"
                  emptyStateSubtitle="Задайте коэффициенты"
                  showMoney={true}
                  nodeCursor="default"
                />
              ) : (
                <p className="p-3 text-xs text-muted-foreground">Нет долей для отображения.</p>
              )}
            </div>
          </section>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <section className="flex min-h-[220px] flex-1 flex-col gap-1 rounded-lg border border-border bg-muted/10 p-2 lg:min-h-[280px]">
            <p className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground px-1">
              Общая стоимость {formatMoney(beforeModel.effectiveTotal)}
            </p>
            <div className="min-h-[200px] flex-1 w-full min-w-0">
              {beforeModel.effectiveTotal > 0 && beforeChildren.length > 0 ? (
                <TreemapContainer
                  data={treeBefore}
                  showTeams={false}
                  showInitiatives={true}
                  hasData={true}
                  selectedQuarters={qs}
                  selectedUnitsCount={1}
                  getColor={beforeModel.getPreviewColor}
                  showDistributionInTooltip={false}
                  contentKey={`bef-${beforeModel.contentKey}`}
                  emptyStateTitle="Нет долей"
                  emptyStateSubtitle="Задайте коэффициенты"
                  showMoney={true}
                  nodeCursor="default"
                />
              ) : (
                <p className="p-3 text-xs text-muted-foreground">Нет долей для отображения.</p>
              )}
            </div>
          </section>
          <section className="flex min-h-[220px] flex-1 flex-col gap-1 rounded-lg border border-border bg-muted/10 p-2 lg:min-h-[280px]">
            <p
              className="shrink-0 rounded-md border border-amber-500/45 bg-amber-500/18 px-2 py-1.5 text-[11px] font-semibold leading-tight text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/25 dark:text-amber-50"
              title={PRELIMINARY_COST_USER_MESSAGE}
            >
              <span className="block min-w-0 truncate">{PRELIMINARY_COST_USER_MESSAGE}</span>
            </p>
            <div className="min-h-0 flex-1 w-full min-w-0">
              {afterModel.effectiveTotal > 0 && afterChildren.length > 0 ? (
                <TreemapContainer
                  data={treeAfter}
                  showTeams={false}
                  showInitiatives={true}
                  hasData={true}
                  selectedQuarters={qs}
                  selectedUnitsCount={1}
                  getColor={afterModel.getPreviewColor}
                  showDistributionInTooltip={false}
                  contentKey={`aft-${afterModel.contentKey}`}
                  emptyStateTitle="Нет долей"
                  emptyStateSubtitle="Задайте коэффициенты"
                  showMoney={true}
                  nodeCursor="default"
                />
              ) : (
                <p className="p-3 text-xs text-muted-foreground">Нет долей для отображения.</p>
              )}
            </div>
          </section>
        </div>
      )}

      {(beforeModel.note || afterModel.note) && (beforeModel.overflowPct || afterModel.overflowPct) ? (
        <p
          className={cn(
            'text-[11px] text-blue-700 dark:text-blue-400',
            immersive && 'border-t border-border/50 bg-blue-500/5 px-2.5 py-1.5 dark:bg-blue-500/10'
          )}
        >
          {beforeModel.note ?? afterModel.note}
        </p>
      ) : null}
    </div>
  );
}
