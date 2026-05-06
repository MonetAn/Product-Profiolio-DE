import { useMemo, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { AdminDataRow } from '@/lib/adminDataManager';
import {
  type PortfolioHubBlock,
  usePortfolioHubMatrixToolbar,
} from '@/components/admin/AdminPortfolioHubPanels';
import { AdminQuickFlowCountryAllocationsSummary } from '@/components/admin/AdminQuickFlowCountryAllocationsSummary';
import type { MarketCountryRow } from '@/hooks/useMarketCountries';
import { isHubBlockAcked, type PortfolioHubAckByBlock } from '@/lib/portfolioHubAck';
import { portfolioHubBlockIncomplete } from '@/lib/portfolioHubCompletion';
import { getCurrentQuarter } from '@/lib/quarterUtils';

function formatQuarterRu(q: string): string {
  const m = q.match(/^(\d{4})-Q(\d)$/);
  if (!m) return q;
  return `Q${m[2]} ${m[1]}`;
}

type HubTileStatus = 'incomplete' | 'ok';

type TileContent = {
  status: HubTileStatus;
  title: string;
  detail: string;
};

function statusIcon(status: HubTileStatus): ReactNode {
  const wrap = 'flex size-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-border/60';
  if (status === 'ok') {
    return (
      <span className={cn(wrap, 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400')}>
        <CheckCircle2 className="size-4" aria-hidden />
      </span>
    );
  }
  return (
    <span className={cn(wrap, 'bg-destructive/10 text-destructive dark:text-destructive')}>
      <AlertTriangle className="size-4" aria-hidden />
    </span>
  );
}

type HubBlockTileButtonProps = {
  status: HubTileStatus;
  title: string;
  detail: string;
  onClick: () => void;
};

function HubBlockTileButton({ status, title, detail, onClick }: HubBlockTileButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex min-h-[5.5rem] w-full items-stretch gap-2 rounded-xl border border-border bg-card p-3 text-left shadow-sm transition-colors sm:p-4',
        'hover:border-primary/25 hover:bg-muted/30',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2'
      )}
    >
      {statusIcon(status)}
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-semibold leading-snug text-foreground">{title}</p>
        <p className="text-xs leading-snug text-muted-foreground">{detail}</p>
      </div>
      <ChevronRight
        className="ml-0.5 size-4 shrink-0 self-center text-muted-foreground opacity-60 group-hover:opacity-100"
        aria-hidden
      />
    </button>
  );
}

export type AdminPortfolioFillHubProps = {
  rows: AdminDataRow[];
  quartersCatalog: string[];
  selectedUnits: string[];
  selectedTeams: string[];
  ackByBlock: PortfolioHubAckByBlock;
  /** Кварталы интервала (как в панелях хаба) для сводки аллокаций. */
  fillQuarters: string[];
  marketCountries: MarketCountryRow[];
  onOpenRoster: () => void;
  onOpenBlock: (block: PortfolioHubBlock) => void;
};

function tileContent(
  block: PortfolioHubBlock,
  rows: AdminDataRow[],
  quartersCatalog: string[],
  ackByBlock: PortfolioHubAckByBlock
): TileContent {
  const incomplete = portfolioHubBlockIncomplete(block, rows, quartersCatalog);
  const acked = isHubBlockAcked(ackByBlock, block);

  let status: HubTileStatus;
  if (incomplete || !acked) status = 'incomplete';
  else status = 'ok';

  const titles: Record<PortfolioHubBlock, string> = {
    coefficients: 'Коэффициенты и распределение усилий',
    descriptions: 'Описание и документация',
    planFact: 'План и факт по кварталам',
    geo: 'Аллокации по рынкам',
  };

  let detail: string;
  if (status === 'incomplete') {
    if (!incomplete) {
      detail = 'Проверьте блок и нажмите «Сохранить и подтвердить». ';
    } else if (block === 'coefficients') {
      detail = 'Добавьте/уберите инициативы и актуализируйте их стоимость.';
    } else if (block === 'descriptions') {
      detail = 'Заполните описание во всех инициативах.';
    } else if (block === 'planFact') {
      detail = 'Заполните факт по прошедшим кварталам и план по будущим.';
    } else {
      detail = 'Распределите все инициативы на рынки.';
    }
  } else {
    if (block === 'coefficients') {
      detail = 'Инициативы обновлены и сохранены.';
    } else if (block === 'descriptions') {
      detail = 'Все инициативы имеют описание.';
    } else if (block === 'planFact') {
      detail = 'План и факт заполнены по всем кварталам.';
    } else {
      detail = 'Все инициативы аллоцированы на рынки.';
    }
  }

  return { status, title: titles[block], detail };
}

export function AdminPortfolioFillHub({
  rows,
  quartersCatalog,
  selectedUnits,
  selectedTeams,
  ackByBlock,
  fillQuarters,
  marketCountries,
  onOpenRoster,
  onOpenBlock,
}: AdminPortfolioFillHubProps) {
  const scopeReady = selectedUnits.length > 0;

  const currentQ = getCurrentQuarter();
  const quarterTitle = formatQuarterRu(currentQ);

  const { matrixCatalogQuarters, matrixVisibleQuarters, chipToolbar } = usePortfolioHubMatrixToolbar(
    rows,
    quartersCatalog,
    fillQuarters
  );

  /** В scope только заглушки и ни одной реальной инициативы — нужно подсказать команде добавить настоящие. */
  const onlyStubsInScope = useMemo(() => {
    if (rows.length === 0) return false;
    return rows.every((r) => r.isTimelineStub);
  }, [rows]);

  const tiles = useMemo(() => {
    const blocks: PortfolioHubBlock[] = ['coefficients', 'descriptions', 'planFact', 'geo'];
    return Object.fromEntries(
      blocks.map((b) => [
        b,
        tileContent(b, rows, quartersCatalog, ackByBlock),
      ])
    ) as Record<PortfolioHubBlock, TileContent>;
  }, [rows, quartersCatalog, ackByBlock]);

  return (
    <section className="shrink-0 border-b border-border bg-gradient-to-b from-muted/35 via-background to-background px-4 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-4">
        <p className="font-juneau text-lg font-medium tracking-tight text-foreground sm:text-xl">
          Квартальное обновление · {quarterTitle}
        </p>

        {scopeReady ? (
          <Card className="border-primary/15 shadow-sm">
            <CardHeader className="space-y-2 pb-3 sm:flex sm:flex-row sm:items-start sm:justify-between sm:space-y-0 sm:gap-4">
              {onlyStubsInScope ? (
                <div
                  role="status"
                  className="min-w-0 max-w-3xl rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm leading-snug text-amber-900 dark:text-amber-200 sm:text-[15px]"
                >
                  <p className="font-medium">У команды только заглушка.</p>
                  <p className="mt-0.5 text-amber-900/90 dark:text-amber-200/90">
                    Добавьте инициативы, которые уже известны, и распределите по ним стоимость и усилия.
                  </p>
                </div>
              ) : (
                <p className="min-w-0 max-w-3xl text-sm leading-snug text-foreground sm:text-[15px]">
                  По каждому блоку проверьте данные, при необходимости обновите и подтвердите актуальность на
                  текущий момент.
                </p>
              )}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={onOpenRoster}
              >
                Состав команды
              </Button>
            </CardHeader>
            <CardContent className="space-y-4 pt-0">
              <div className="grid gap-3 sm:grid-cols-2">
                <HubBlockTileButton
                  {...tiles.coefficients}
                  onClick={() => onOpenBlock('coefficients')}
                />
                <HubBlockTileButton
                  {...tiles.descriptions}
                  onClick={() => onOpenBlock('descriptions')}
                />
                <HubBlockTileButton
                  {...tiles.planFact}
                  onClick={() => onOpenBlock('planFact')}
                />
                <HubBlockTileButton
                  {...tiles.geo}
                  onClick={() => onOpenBlock('geo')}
                />
              </div>

              <div className="border-t border-border/60 pt-5">
                <div className="mb-4 space-y-0.5">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Итог по команде
                  </p>
                  <h2 className="text-lg font-semibold leading-snug text-foreground">
                    Сводка аллокаций по рынкам
                  </h2>
                </div>
                {marketCountries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Загрузка справочника стран…</p>
                ) : (
                  <AdminQuickFlowCountryAllocationsSummary
                    rows={rows}
                    fillQuarters={fillQuarters}
                    quartersCatalog={matrixCatalogQuarters}
                    countries={marketCountries}
                    visibleQuarters={matrixVisibleQuarters}
                    previewQuarters={chipToolbar.previewQuarters}
                    rangeAnchor={chipToolbar.rangeAnchor}
                    onQuarterClick={chipToolbar.onQuarterClick}
                    onQuarterHover={chipToolbar.onQuarterHover}
                    onReplaceSelectedQuarters={chipToolbar.onReplaceSelectedQuarters}
                    onDismissTransientRangeUI={chipToolbar.onDismissTransientRangeUI}
                    compactChrome
                  />
                )}
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </section>
  );
}
