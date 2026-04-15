import { useMemo, useRef, useState, useLayoutEffect, useCallback } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { scaleBand, scaleLinear } from 'd3';
import { cn } from '@/lib/utils';

type MonthlyRow = Record<string, number | string> & {
  monthKey: string;
  monthLabel: string;
  totalRub: number;
};

type Segment = {
  id: string;
  monthKey: string;
  key: string;
  value: number;
  monthLabel: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
};

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, size };
}

function rubTickFormat(v: number): string {
  const x = Math.abs(v);
  if (x >= 1_000_000) return `${(v / 1_000_000).toFixed(1)} млн`;
  if (x >= 1000) return `${Math.round(v / 1000)} тыс`;
  return `${Math.round(v)}`;
}

function segmentOpacity(
  id: string,
  key: string,
  hoverLegendKey: string | null | undefined,
  hoverSegmentId: string | null
): number {
  if (hoverLegendKey != null && key !== hoverLegendKey) return 0.26;
  if (hoverSegmentId != null && hoverSegmentId !== id && hoverLegendKey == null) return 0.26;
  return 1;
}

const BAR_MOTION_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** Помесячный stacked bar: SVG + d3; геометрия анимируется только через FM (tween), без привязки к каждому mousemove. */
export function MonthlyMorphStackedChart({
  rows,
  seriesKeys,
  getSeriesColor,
  xLabelInterval,
  hoverLegendKey,
  className,
}: {
  rows: MonthlyRow[];
  seriesKeys: string[];
  getSeriesColor: (key: string, idx: number) => string;
  xLabelInterval: number;
  hoverLegendKey?: string | null;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  /** Пока ширина графика не измерена, не анимируем геометрию — иначе колонки «едут» слева при первом показе вкладки. */
  const [layoutAnimFrozen, setLayoutAnimFrozen] = useState(true);
  const [hoverSegmentId, setHoverSegmentId] = useState<string | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const { ref, size } = useElementSize<HTMLDivElement>();

  const barTransition = useMemo(() => {
    if (reduceMotion) {
      return { duration: 0 } as const;
    }
    return {
      x: { type: 'tween' as const, duration: 0.44, ease: BAR_MOTION_EASE },
      y: { type: 'tween' as const, duration: 0.44, ease: BAR_MOTION_EASE },
      width: { type: 'tween' as const, duration: 0.44, ease: BAR_MOTION_EASE },
      height: { type: 'tween' as const, duration: 0.44, ease: BAR_MOTION_EASE },
      fill: { type: 'tween' as const, duration: 0.32, ease: 'easeInOut' as const },
      opacity: { type: 'tween' as const, duration: 0.18, ease: 'easeOut' as const },
    };
  }, [reduceMotion]);

  const barMotionTransition = useMemo(() => {
    if (reduceMotion || layoutAnimFrozen) return { duration: 0 } as const;
    return barTransition;
  }, [reduceMotion, layoutAnimFrozen, barTransition]);

  /** Только для уходящих сегментов (смена набора кластеров). */
  const segmentExitTransition = useMemo(() => {
    if (reduceMotion) return { duration: 0 } as const;
    return { duration: 0.3, ease: BAR_MOTION_EASE };
  }, [reduceMotion]);

  const positionTooltip = useCallback((clientX: number, clientY: number) => {
    lastPointerRef.current = { x: clientX, y: clientY };
    const el = tooltipRef.current;
    if (el) {
      el.style.left = `${clientX + 12}px`;
      el.style.top = `${clientY + 10}px`;
    }
  }, []);

  useLayoutEffect(() => {
    if (!hoverSegmentId) return;
    const { x, y } = lastPointerRef.current;
    positionTooltip(x, y);
  }, [hoverSegmentId, positionTooltip]);

  const margin = { top: 16, right: 12, bottom: 34, left: 64 };
  const svgW = Math.max(0, size.width);
  const svgH = Math.max(0, size.height);
  const plotW = Math.max(0, svgW - margin.left - margin.right);
  const plotH = Math.max(0, svgH - margin.top - margin.bottom);

  useLayoutEffect(() => {
    if (plotW > 24) setLayoutAnimFrozen(false);
    else setLayoutAnimFrozen(true);
  }, [plotW]);

  const yMax = useMemo(() => Math.max(1, ...rows.map((r) => Number(r.totalRub) || 0)) * 1.12, [rows]);

  const xScale = useMemo(() => {
    return scaleBand<string>()
      .domain(rows.map((r) => r.monthKey))
      .range([0, plotW])
      .paddingInner(0.16)
      .paddingOuter(0.05);
  }, [rows, plotW]);

  const yScale = useMemo(() => {
    return scaleLinear().domain([0, yMax]).range([plotH, 0]);
  }, [yMax, plotH]);

  const yTicks = useMemo(() => yScale.ticks(4), [yScale]);

  const segments = useMemo(() => {
    const out: Segment[] = [];
    rows.forEach((row) => {
      const monthKey = String(row.monthKey);
      const monthLabel = String(row.monthLabel);
      const x = xScale(monthKey) ?? 0;
      const width = Math.max(1, xScale.bandwidth());
      let acc = 0;
      seriesKeys.forEach((k, idx) => {
        const v = Number(row[k] ?? 0);
        if (!Number.isFinite(v) || v <= 0) return;
        const y0 = yScale(acc);
        const y1 = yScale(acc + v);
        const y = Math.min(y0, y1);
        const h = Math.max(0.5, Math.abs(y1 - y0));
        out.push({
          id: `${monthKey}::${k}`,
          monthKey,
          key: k,
          value: v,
          monthLabel,
          x,
          y,
          width,
          height: h,
          color: getSeriesColor(k, idx),
        });
        acc += v;
      });
    });
    return out;
  }, [rows, seriesKeys, xScale, yScale, getSeriesColor]);

  const segmentsById = useMemo(() => new Map(segments.map((s) => [s.id, s])), [segments]);

  return (
    <div className={cn('relative h-full w-full min-w-0', className)} ref={ref}>
      <svg width={svgW} height={svgH} className="block overflow-visible">
        <g transform={`translate(${margin.left}, ${margin.top})`}>
          {yTicks.map((t) => {
            const y = yScale(t);
            return (
              <g key={t} transform={`translate(0, ${y})`}>
                <line x1={0} x2={plotW} y1={0} y2={0} stroke="hsl(var(--border) / 0.45)" strokeDasharray="3 3" />
                <text x={-10} y={3} textAnchor="end" fontSize={10} fill="hsl(var(--muted-foreground))">
                  {rubTickFormat(t)} ₽
                </text>
              </g>
            );
          })}

          <AnimatePresence initial={false} mode="sync">
            {segments.map((seg) => {
              const op = segmentOpacity(seg.id, seg.key, hoverLegendKey ?? null, hoverSegmentId);
              const bottomY = seg.y + seg.height;
              return (
                <motion.rect
                  key={seg.id}
                  initial={false}
                  animate={{
                    x: seg.x,
                    y: seg.y,
                    width: seg.width,
                    height: seg.height,
                    fill: seg.color,
                    opacity: op,
                  }}
                  exit={{
                    opacity: 0,
                    height: 0,
                    y: bottomY,
                    transition: segmentExitTransition,
                  }}
                  transition={barMotionTransition}
                  rx={1.5}
                  style={{ cursor: 'default' }}
                  onMouseEnter={(e) => {
                    positionTooltip(e.clientX, e.clientY);
                    setHoverSegmentId(seg.id);
                  }}
                  onMouseMove={(e) => positionTooltip(e.clientX, e.clientY)}
                  onMouseLeave={() => setHoverSegmentId(null)}
                />
              );
            })}
          </AnimatePresence>

          {rows.map((row, i) => {
            if (xLabelInterval > 0 && i % (xLabelInterval + 1) !== 0) return null;
            const x = xScale(String(row.monthKey)) ?? 0;
            const cx = x + xScale.bandwidth() / 2;
            return (
              <text key={row.monthKey} x={cx} y={plotH + 16} textAnchor="middle" fontSize={10} fill="hsl(var(--muted-foreground))">
                {String(row.monthLabel)}
              </text>
            );
          })}
        </g>
      </svg>

      {hoverSegmentId ? (
        (() => {
          const seg = segmentsById.get(hoverSegmentId);
          if (!seg) return null;
          return (
            <div
              ref={tooltipRef}
              className="pointer-events-none fixed z-[80] rounded-md border border-border bg-popover px-2.5 py-2 text-xs text-popover-foreground shadow-md"
              style={{ left: 0, top: 0 }}
            >
              <p className="font-medium leading-snug">{seg.monthLabel}</p>
              <p className="mt-1 text-muted-foreground">{seg.key}</p>
              <p className="mt-1 tabular-nums">{Math.round(seg.value).toLocaleString('ru-RU')} ₽</p>
            </div>
          );
        })()
      ) : null}
    </div>
  );
}
