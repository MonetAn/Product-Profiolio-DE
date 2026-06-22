import { useCallback, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatBudget } from '@/lib/dataManager';
import type { HeroBarMarketSegment } from '@/lib/locationAllocationModel';
import { clusterTotalsFromSegments } from '@/lib/locationAllocationModel';
import { cn } from '@/lib/utils';

/** Базовые цвета кластеров; внутри кластера — оттенки одного hue. */
const CLUSTER_BASE_HEX: Record<string, string> = {
  Russia: '#4F7FD4',
  'Central Asia': '#2FA88A',
  MENA: '#9B6FDE',
  Turkey: '#E1942F',
  Europe: '#E85D6C',
  'Other Countries': '#6FBF4A',
  Drinkit: '#2FB8D4',
};

const FALLBACK_HEX = '#94A3B8';

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function mixHex(base: string, target: string, t: number): string {
  const a = hexToRgb(base);
  const b = hexToRgb(target);
  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const bl = Math.round(a.b + (b.b - a.b) * t);
  return `#${[r, g, bl].map((x) => x.toFixed(0).padStart(2, '0')).join('')}`;
}

/** Оттенки внутри кластера: от светлого к насыщенному базовому. */
export function marketShadeColor(
  clusterLabel: string,
  indexInCluster: number,
  countInCluster: number
): string {
  const base = CLUSTER_BASE_HEX[clusterLabel] ?? FALLBACK_HEX;
  if (countInCluster <= 1) return base;
  const t = indexInCluster / Math.max(1, countInCluster - 1);
  return mixHex('#ffffff', base, 0.35 + t * 0.65);
}

function formatPct(value: number, total: number): string {
  if (total <= 0) return '0%';
  return `${(Math.round((value / total) * 1000) / 10).toFixed(1)}%`;
}

type Props = {
  segments: HeroBarMarketSegment[];
  /** Полный total инженеринга за год — для % в тултипе */
  engineeringTotalRub: number;
  /** Total для ширины сегментов (при фильтре кластера = сумма кластера) */
  barTotalRub?: number;
  selectedCluster: string | null;
  onSelectCluster: (clusterLabel: string | null) => void;
  className?: string;
};

export function LocationHeroStackBar({
  segments,
  engineeringTotalRub,
  barTotalRub,
  selectedCluster,
  onSelectCluster,
  className,
}: Props) {
  const barRef = useRef<HTMLDivElement>(null);
  const [hoveredCluster, setHoveredCluster] = useState<string | null>(null);
  const [hoveredSegment, setHoveredSegment] = useState<HeroBarMarketSegment | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  const clusterTotals = useMemo(() => clusterTotalsFromSegments(segments), [segments]);

  const widthTotal = barTotalRub ?? engineeringTotalRub;

  const segmentsWithLayout = useMemo(() => {
    const byCluster = new Map<string, HeroBarMarketSegment[]>();
    for (const s of segments) {
      const arr = byCluster.get(s.clusterLabel) ?? [];
      arr.push(s);
      byCluster.set(s.clusterLabel, arr);
    }
    return segments.map((s) => {
      const group = byCluster.get(s.clusterLabel) ?? [s];
      const idx = group.findIndex((g) => g.segmentKey === s.segmentKey);
      const widthPct = widthTotal > 0 ? (s.rub / widthTotal) * 100 : 0;
      return {
        ...s,
        widthPct,
        color: marketShadeColor(s.clusterLabel, idx, group.length),
        clusterRub: clusterTotals.get(s.clusterLabel) ?? s.rub,
      };
    });
  }, [segments, widthTotal, clusterTotals]);

  const activeCluster = hoveredCluster ?? hoveredSegment?.clusterLabel ?? null;
  const tooltipSegment = hoveredSegment;

  const updateTooltipPos = useCallback((el: HTMLElement) => {
    const bar = barRef.current;
    if (!bar) return;
    const barRect = bar.getBoundingClientRect();
    const segRect = el.getBoundingClientRect();
    setTooltipPos({
      x: segRect.left + segRect.width / 2 - barRect.left,
      y: -8,
    });
  }, []);

  if (segments.length === 0 || widthTotal <= 0) {
    return (
      <div
        className={cn(
          'flex h-14 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground',
          className
        )}
      >
        Нет данных за выбранный год
      </div>
    );
  }

  const clusterRub = tooltipSegment
    ? (clusterTotals.get(tooltipSegment.clusterLabel) ?? 0)
    : 0;

  return (
    <div className={cn('relative w-full pt-10 pb-2', className)}>
      <div
        ref={barRef}
        className="relative flex h-14 w-full overflow-visible rounded-xl bg-muted/30 shadow-inner"
        onMouseLeave={() => {
          setHoveredCluster(null);
          setHoveredSegment(null);
          setTooltipPos(null);
        }}
      >
        {segmentsWithLayout.map((seg) => {
          const isClusterHovered = activeCluster === seg.clusterLabel;
          const isClusterSelected = selectedCluster === seg.clusterLabel;
          return (
            <motion.button
              key={seg.segmentKey}
              type="button"
              className={cn(
                'relative h-full min-w-0 border-r border-white/25 last:border-r-0',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                isClusterSelected && 'ring-2 ring-primary ring-inset'
              )}
              style={{
                width: `${seg.widthPct}%`,
                backgroundColor: seg.color,
              }}
              animate={{
                y: isClusterHovered ? -10 : 0,
                scaleY: isClusterHovered ? 1.06 : 1,
                zIndex: isClusterHovered ? 10 : 1,
              }}
              transition={{ type: 'spring', stiffness: 420, damping: 28 }}
              onMouseEnter={(e) => {
                setHoveredCluster(seg.clusterLabel);
                setHoveredSegment(seg);
                updateTooltipPos(e.currentTarget);
              }}
              onMouseMove={(e) => updateTooltipPos(e.currentTarget)}
              onClick={() => {
                onSelectCluster(
                  selectedCluster === seg.clusterLabel ? null : seg.clusterLabel
                );
              }}
              aria-label={`${seg.clusterLabel}, ${seg.marketLabel}, ${formatBudget(seg.rub)}`}
            />
          );
        })}
      </div>

      <AnimatePresence>
        {tooltipSegment && tooltipPos ? (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.12 }}
            className="pointer-events-none absolute z-20 min-w-[220px] max-w-[280px] rounded-lg border border-border bg-popover px-3 py-2.5 text-popover-foreground shadow-lg"
            style={{
              left: tooltipPos.x,
              top: tooltipPos.y,
              transform: 'translate(-50%, -100%)',
            }}
          >
            <p className="font-semibold text-sm leading-snug">{tooltipSegment.marketLabel}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{tooltipSegment.clusterLabel}</p>
            <dl className="mt-2 space-y-1 text-xs tabular-nums">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Рынок</dt>
                <dd className="font-medium">{formatBudget(tooltipSegment.rub)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">% инженеринга</dt>
                <dd>{formatPct(tooltipSegment.rub, engineeringTotalRub)}</dd>
              </div>
              <div className="border-t border-border/60 pt-1.5 mt-1.5 flex justify-between gap-4">
                <dt className="text-muted-foreground">Кластер всего</dt>
                <dd className="font-medium">{formatBudget(clusterRub)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">% инженеринга (кластер)</dt>
                <dd>{formatPct(clusterRub, engineeringTotalRub)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Доля рынка в кластере</dt>
                <dd>{formatPct(tooltipSegment.rub, clusterRub)}</dd>
              </div>
            </dl>
            <p className="text-[10px] text-muted-foreground mt-2">Клик — фильтр по кластеру</p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
