/**
 * Read-only «столбики усилий по кварталам» (как на бывшем шаге выбора кварталов),
 * без кликабельных чипов — только подписи кварталов снизу.
 */
import { useMemo, type ReactNode } from 'react';
import { AlertCircle, Check, Minus } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { AdminDataRow } from '@/lib/adminDataManager';
import {
  getInitiativeQuarterFillTone,
  getMissingInitiativeFields,
  isGeoCostSplitCompleteForCost,
  quarterRequiresPlanFact,
  type InitiativeQuarterFillTone,
} from '@/lib/adminDataManager';
import { compareQuarters, isMetricFactRequiredForQuarter } from '@/lib/quarterUtils';
import { cn } from '@/lib/utils';

const MIN_PCT_SHOW_EFFORT_LABEL = 12;

const TONE_CLASS: Record<InitiativeQuarterFillTone, string> = {
  stub: 'bg-slate-400/85 dark:bg-slate-500/80',
  blocker: 'bg-rose-500/90 dark:bg-rose-600/85',
  metrics: 'bg-amber-400/90 dark:bg-amber-500/85',
  ok: 'bg-emerald-600/90 dark:bg-emerald-500/85',
};

type Segment = {
  id: string;
  label: string;
  effort: number;
  tone: InitiativeQuarterFillTone;
};

function buildSegmentsForQuarter(rows: AdminDataRow[], quarter: string): { segments: Segment[]; sum: number } {
  const parts: Segment[] = [];
  let sum = 0;
  for (const row of rows) {
    const eff = Math.max(0, Number(row.quarterlyData[quarter]?.effortCoefficient ?? 0) || 0);
    if (eff <= 0) continue;
    sum += eff;
    parts.push({
      id: row.id,
      label: row.initiative || '—',
      effort: eff,
      tone: getInitiativeQuarterFillTone(row, quarter),
    });
  }
  parts.sort((a, b) => a.label.localeCompare(b.label, 'ru'));
  return { segments: parts, sum };
}

type StatusKind = 'ok' | 'warn' | 'na';

function StatusRow({ label, kind, detail }: { label: string; kind: StatusKind; detail?: string }) {
  return (
    <div className="flex items-start gap-2 text-xs leading-snug">
      {kind === 'ok' ? (
        <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-500 mt-0.5" aria-hidden />
      ) : kind === 'warn' ? (
        <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-500 mt-0.5" aria-hidden />
      ) : (
        <Minus className="h-3.5 w-3.5 shrink-0 text-muted-foreground mt-0.5" aria-hidden />
      )}
      <div className="min-w-0">
        <span className="font-medium text-foreground">{label}</span>
        {detail ? <span className="text-muted-foreground"> — {detail}</span> : null}
      </div>
    </div>
  );
}

function SegmentHoverCardBody({ row, quarter, effort }: { row: AdminDataRow; quarter: string; effort: number }) {
  const missing = new Set(getMissingInitiativeFields(row));
  const qd = row.quarterlyData[quarter];

  return (
    <div className="space-y-3">
      <div>
        <p className="font-semibold text-foreground leading-snug pr-1">{row.initiative || '—'}</p>
        <p className="text-xs text-muted-foreground mt-1">
          Квартал <span className="font-medium text-foreground tabular-nums">{quarter}</span>
          <span className="text-muted-foreground"> · </span>
          <span className="tabular-nums">{effort}%</span> усилий команды
        </p>
      </div>

      {row.isTimelineStub ? (
        <p className="text-xs text-muted-foreground rounded-md bg-muted/50 px-2 py-1.5">
          Заглушка в таймлайне — часть полей ниже может быть неактуальна для визуала на графике.
        </p>
      ) : null}

      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Карточка инициативы</p>
        <StatusRow label="Тип" kind={missing.has('Тип') ? 'warn' : 'ok'} detail={missing.has('Тип') ? 'не указан' : undefined} />
        <StatusRow
          label="Стейкхолдеры"
          kind={missing.has('Стейкх.') ? 'warn' : 'ok'}
          detail={missing.has('Стейкх.') ? 'не заполнены' : undefined}
        />
        <StatusRow
          label="Описание"
          kind={missing.has('Описание') ? 'warn' : 'ok'}
          detail={missing.has('Описание') ? 'нет' : undefined}
        />
      </div>

      <div className="space-y-1.5 border-t border-border pt-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Метрики в этом квартале</p>
        {!qd ? (
          <StatusRow label="Данные квартала" kind="na" detail="нет записи" />
        ) : qd.support ? (
          <>
            <p className="text-xs text-muted-foreground rounded-md bg-muted/40 px-2 py-1.5 leading-relaxed">
              В этом квартале инициатива на <span className="font-medium text-foreground">поддержке</span>. По правилам портфеля план и факт метрик{' '}
              <span className="font-medium text-foreground">не обязательны</span>.
            </p>
            <StatusRow label="План метрики" kind="na" detail="не требуется — поддержка" />
            <StatusRow label="Факт метрики" kind="na" detail="не требуется — поддержка" />
          </>
        ) : !quarterRequiresPlanFact(qd) ? (
          <>
            <p className="text-xs text-muted-foreground rounded-md bg-muted/40 px-2 py-1.5 leading-relaxed">
              В квартале нет учётной стоимости (cost и прочие) — план и факт метрик по правилам{' '}
              <span className="font-medium text-foreground">не требуются</span>.
            </p>
            <StatusRow label="План метрики" kind="na" detail="не требуется — нет стоимости" />
            <StatusRow label="Факт метрики" kind="na" detail="не требуется — нет стоимости" />
          </>
        ) : (
          <>
            {!isMetricFactRequiredForQuarter(quarter) ? (
              <p className="text-xs text-muted-foreground rounded-md bg-muted/40 px-2 py-1.5 leading-relaxed">
                Квартал <span className="font-medium text-foreground">{quarter}</span> — текущий календарный или позже: факт метрики по правилам портфеля пока{' '}
                <span className="font-medium text-foreground">не обязателен</span>.
              </p>
            ) : null}
            <StatusRow
              label="План метрики"
              kind={qd.metricPlan?.trim() ? 'ok' : 'warn'}
              detail={qd.metricPlan?.trim() ? undefined : 'не заполнен'}
            />
            <StatusRow
              label="Факт метрики"
              kind={
                !isMetricFactRequiredForQuarter(quarter)
                  ? 'na'
                  : qd.metricFact?.trim()
                    ? 'ok'
                    : 'warn'
              }
              detail={
                !isMetricFactRequiredForQuarter(quarter)
                  ? 'не требуется — текущий или будущий квартал'
                  : qd.metricFact?.trim()
                    ? undefined
                    : 'не заполнен'
              }
            />
          </>
        )}
      </div>

      {qd && (qd.cost ?? 0) > 0 ? (
        <div className="space-y-1.5 border-t border-border pt-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Гео по рынкам</p>
          <StatusRow
            label="Распределение 100%"
            kind={isGeoCostSplitCompleteForCost(qd.cost ?? 0, qd.geoCostSplit) ? 'ok' : 'warn'}
            detail={
              isGeoCostSplitCompleteForCost(qd.cost ?? 0, qd.geoCostSplit) ? undefined : 'не закрыто на 100%'
            }
          />
        </div>
      ) : null}
    </div>
  );
}

const segmentClass = cn(
  'w-full shrink-0 flex items-center justify-center overflow-hidden rounded-[2px]',
  'transition-[box-shadow,filter] duration-200 ease-out',
  'hover:z-20 hover:shadow-lg hover:shadow-black/15 dark:hover:shadow-black/40',
  'hover:ring-2 hover:ring-background/95 dark:hover:ring-border',
  'hover:brightness-[1.07] dark:hover:brightness-110',
  'focus-visible:outline-none focus-visible:z-20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
  'motion-reduce:transition-none motion-reduce:hover:brightness-100 motion-reduce:hover:shadow-none'
);

function QuarterSegmentBlock({
  seg,
  quarter,
  sum,
  segmentIndex,
  teamRows,
  popoverSide,
}: {
  seg: Segment;
  quarter: string;
  sum: number;
  segmentIndex: number;
  teamRows: AdminDataRow[];
  popoverSide: 'left' | 'right';
}) {
  const row = teamRows.find((r) => r.id === seg.id);
  const pct = (seg.effort / sum) * 100;
  const showEffortLabel = pct >= MIN_PCT_SHOW_EFFORT_LABEL;

  const inner = (
    <>
      {showEffortLabel ? (
        <span
          className="pointer-events-none px-0.5 text-center text-[10px] font-bold tabular-nums text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.55)]"
          aria-hidden
        >
          {Math.round(seg.effort)}%
        </span>
      ) : null}
    </>
  );

  const blockClass = cn(
    segmentClass,
    segmentIndex > 0 && 'border-b-2 border-background dark:border-border',
    TONE_CLASS[seg.tone]
  );

  const style = {
    height: `${pct}%`,
    minHeight: showEffortLabel ? 22 : 4,
  } as const;

  if (!row) {
    return (
      <div className={blockClass} style={style} title={`${seg.label}: ${seg.effort}% усилий в квартале`}>
        {inner}
      </div>
    );
  }

  return (
    <Tooltip delayDuration={200} disableHoverableContent>
      <TooltipTrigger asChild>
        <div
          role="button"
          tabIndex={0}
          className={blockClass}
          style={style}
          aria-label={`${seg.label}, ${quarter}, ${seg.effort}% усилий`}
        >
          {inner}
        </div>
      </TooltipTrigger>
      <TooltipContent
        side={popoverSide}
        align="center"
        sideOffset={10}
        collisionPadding={16}
        className="w-72 max-w-[min(18rem,calc(100vw-1.5rem))] max-h-[min(60vh,22rem)] overflow-y-auto p-3 text-sm text-left border bg-popover shadow-lg"
      >
        <SegmentHoverCardBody row={row} quarter={quarter} effort={seg.effort} />
      </TooltipContent>
    </Tooltip>
  );
}

type Props = {
  quartersCatalog: string[];
  teamRows: AdminDataRow[];
  /** Заголовок над блоком (опционально) */
  title?: ReactNode;
  className?: string;
};

export function AdminQuickFlowQuarterEffortOverview({ quartersCatalog, teamRows, title, className }: Props) {
  const sortedQuarters = useMemo(() => [...quartersCatalog].sort(compareQuarters), [quartersCatalog]);

  const columns = useMemo(() => {
    return sortedQuarters.map((q) => {
      const { segments, sum } = buildSegmentsForQuarter(teamRows, q);
      return { quarter: q, segments, sum };
    });
  }, [sortedQuarters, teamRows]);

  if (sortedQuarters.length === 0) {
    return null;
  }

  return (
    <div className={cn('flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm', className)}>
      {title ? <div className="shrink-0 text-sm font-medium text-foreground">{title}</div> : null}

      <div className="shrink-0 space-y-1.5 rounded-lg border border-border bg-muted/20 px-3 py-2.5">
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Легенда</p>
        <ul className="flex flex-col gap-1.5 text-[11px] text-muted-foreground">
          <li className="flex items-center gap-2">
            <span className={cn('h-3 w-3 rounded-sm shrink-0', TONE_CLASS.ok)} />
            Обязательные поля заполнены
          </li>
          <li className="flex items-center gap-2">
            <span className={cn('h-3 w-3 rounded-sm shrink-0', TONE_CLASS.metrics)} />
            Не заполнен план-факт
          </li>
          <li className="flex items-center gap-2">
            <span className={cn('h-3 w-3 rounded-sm shrink-0', TONE_CLASS.blocker)} />
            Карточка или гео по рынкам (при стоимости квартала)
          </li>
          <li className="flex items-center gap-2">
            <span className={cn('h-3 w-3 rounded-sm shrink-0', TONE_CLASS.stub)} />
            Заглушка стоимости команды, нет инициатив
          </li>
        </ul>
      </div>

      <div
        className="flex min-h-[min(10rem,28vh)] flex-1 flex-wrap content-stretch items-stretch justify-start gap-2 overflow-x-auto overflow-y-auto pb-1 sm:gap-3"
        aria-label="Заполнение по кварталам (все кварталы выгрузки)"
      >
        {columns.map(({ quarter, segments, sum }, colIdx) => (
          <div
            key={quarter}
            className="flex min-h-0 min-w-[3rem] max-w-[7rem] flex-1 basis-[3rem] flex-col items-stretch gap-2 self-stretch"
          >
            <div className="flex min-h-[6rem] flex-1 flex-col justify-end overflow-visible rounded-lg border border-border/40 bg-muted/25 dark:border-border/35 dark:bg-muted/20">
              {sum <= 0 ? (
                <div className="w-full flex-1 min-h-[2rem] bg-muted/60 flex items-center justify-center px-1 rounded-lg overflow-hidden">
                  <span className="text-[10px] text-muted-foreground text-center leading-tight">0%</span>
                </div>
              ) : (
                <div className="flex flex-col-reverse w-full h-full min-h-0 overflow-visible rounded-lg">
                  {segments.map((seg, i) => (
                    <QuarterSegmentBlock
                      key={seg.id}
                      seg={seg}
                      quarter={quarter}
                      sum={sum}
                      segmentIndex={i}
                      teamRows={teamRows}
                      popoverSide={colIdx < columns.length / 2 ? 'right' : 'left'}
                    />
                  ))}
                </div>
              )}
            </div>
            <div className="text-center text-xs font-semibold tabular-nums text-foreground px-0.5">{quarter}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
