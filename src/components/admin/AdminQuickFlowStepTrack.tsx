import { Fragment, type ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Props = {
  current: number;
  /** Если не задано — показываем только «Шаг n» (до выбора числа команд). */
  total?: number;
  className?: string;
  /** Шаг назад по сценарию (не на дашборд). */
  onStepBack?: () => void;
  /** Компактная строка контекста (quick flow): юнит → команда → очередь → шаг. */
  unit?: string;
  team?: string;
  queueCurrent?: number;
  queueTotal?: number;
};

export function AdminQuickFlowStepTrack({
  current,
  total,
  className,
  onStepBack,
  unit,
  team,
  queueCurrent,
  queueTotal,
}: Props) {
  const hasTotal = total != null && total > 0;
  const hasQueue =
    queueTotal != null && queueTotal > 0 && queueCurrent != null && queueCurrent > 0;
  const unitTrim = unit?.trim();
  const teamTrim = team?.trim();
  const showUnit = Boolean(unitTrim);
  const showTeam = Boolean(teamTrim);
  const showContextStrip = showUnit || showTeam || hasQueue;

  const stepLabel = hasTotal ? `Шаг ${current} из ${total}` : `Шаг ${current}`;

  const backBtn = onStepBack ? (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn(
        'h-8 shrink-0 gap-1.5 px-2 text-muted-foreground hover:text-foreground',
        !showContextStrip && '-ml-2'
      )}
      onClick={onStepBack}
    >
      <ArrowLeft className="h-4 w-4 shrink-0" />
      Назад
    </Button>
  ) : null;

  const stepCrumb = (
    <span className="text-xs font-medium tabular-nums text-foreground">{stepLabel}</span>
  );

  const contextSegments: { key: string; node: ReactNode }[] = [];
  if (backBtn) contextSegments.push({ key: 'back', node: backBtn });
  if (showUnit) {
    contextSegments.push({
      key: 'unit',
      node: (
        <span
          className="max-w-[min(11rem,46vw)] truncate font-semibold text-foreground sm:max-w-[14rem] md:max-w-xs"
          title={unitTrim}
        >
          {unitTrim}
        </span>
      ),
    });
  }
  if (showTeam) {
    contextSegments.push({
      key: 'team',
      node: (
        <span
          className="max-w-[min(10rem,40vw)] truncate font-medium text-foreground sm:max-w-[12rem] md:max-w-[16rem]"
          title={teamTrim}
        >
          {teamTrim}
        </span>
      ),
    });
  }
  if (hasQueue) {
    contextSegments.push({
      key: 'queue',
      node: (
        <span className="text-xs tabular-nums text-muted-foreground">
          Команда {queueCurrent} из {queueTotal}
        </span>
      ),
    });
  }
  contextSegments.push({ key: 'step', node: stepCrumb });

  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      {showContextStrip ? (
        <nav
          className="flex min-w-0 flex-wrap items-center gap-y-1"
          aria-label="Контекст и шаг сценария"
        >
          {contextSegments.map((seg, i) => (
            <Fragment key={seg.key}>
              {i > 0 ? (
                <span
                  className="mx-1 shrink-0 select-none text-muted-foreground/40 sm:mx-1.5"
                  aria-hidden
                >
                  ·
                </span>
              ) : null}
              {seg.node}
            </Fragment>
          ))}
        </nav>
      ) : (
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          {backBtn}
          <p className="min-w-0 flex-1 basis-[12rem] text-xs text-muted-foreground tabular-nums">
            <span className="font-medium text-foreground">{stepLabel}</span>
          </p>
        </div>
      )}
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
        {hasTotal ? (
          <div
            className="h-full rounded-full bg-primary/85 transition-[width] duration-300 ease-out"
            style={{ width: `${Math.min(100, (current / total!) * 100)}%` }}
          />
        ) : null}
      </div>
    </div>
  );
}
