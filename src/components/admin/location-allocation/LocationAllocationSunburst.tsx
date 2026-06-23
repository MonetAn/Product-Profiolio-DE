import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import type { AdminDataRow } from '@/lib/adminDataManager';
import type { MarketCountryRow } from '@/hooks/useMarketCountries';
import { getUnitColor } from '@/lib/dataManager';
import {
  buildLocationAllocationSunburstTree,
  layoutLocationAllocationSunburst,
  sunburstArcPath,
  type SunburstLayoutNode,
} from '@/lib/locationAllocationSunburst';
import {
  filterLocationTimelineInitiatives,
  type LocationTeamFilter,
} from '@/lib/locationRegionModel';
import { quartersForYear } from '@/lib/locationAllocationModel';
import { formatLocationCompactM, formatLocationFullAmount } from '@/lib/locationDisplayFormat';
import { useAccess } from '@/hooks/useAccess';
import { cn } from '@/lib/utils';

function NestingToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer px-1.5 py-1 rounded hover:bg-secondary">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="hidden" />
      <span
        className={cn(
          'w-3.5 h-3.5 border rounded flex items-center justify-center',
          checked ? 'bg-primary border-primary text-primary-foreground' : 'border-border'
        )}
      >
        {checked && <Check size={10} />}
      </span>
      <span>{label}</span>
    </label>
  );
}

function levelLabel(node: SunburstLayoutNode): string {
  if (node.isUnit) return 'Юнит';
  if (node.isTeam) return 'Команда';
  if (node.isInitiative) return 'Инициатива';
  if (node.isLocationRegion) return 'Регион';
  return '';
}

function pct(part: number, whole: number): string {
  if (whole <= 0) return '0%';
  return `${((part / whole) * 100).toFixed(1)}%`;
}

const SunburstArc = memo(function SunburstArc({
  node,
  showMoney,
  showLabels,
  onHover,
  onLeave,
}: {
  node: SunburstLayoutNode;
  showMoney: boolean;
  showLabels: boolean;
  onHover: (node: SunburstLayoutNode, event: React.MouseEvent) => void;
  onLeave: () => void;
}) {
  const arcSpan = node.x1 - node.x0;
  const midAngle = (node.x0 + node.x1) / 2;
  const midRadius = (node.y0 + node.y1) / 2;
  const labelX = midRadius * Math.sin(midAngle);
  const labelY = -midRadius * Math.cos(midAngle);
  const rotateDeg = (midAngle * 180) / Math.PI;
  const flip = rotateDeg > 90 && rotateDeg < 270;
  const labelText = showMoney ? formatLocationCompactM(node.value) : node.name;
  const showArcLabel = showLabels && arcSpan > 0.05 && labelText.length > 0;

  return (
    <g
      className="cursor-pointer"
      onMouseEnter={(e) => onHover(node, e)}
      onMouseMove={(e) => onHover(node, e)}
      onMouseLeave={onLeave}
    >
      <path
        d={sunburstArcPath(node)}
        fill={node.color}
        stroke="hsl(var(--background))"
        strokeWidth={1}
        className="transition-opacity hover:opacity-90"
      />
      {showArcLabel ? (
        <text
          x={labelX}
          y={labelY}
          transform={`rotate(${flip ? rotateDeg + 180 : rotateDeg - 90}, ${labelX}, ${labelY})`}
          textAnchor="middle"
          dominantBaseline="middle"
          className="pointer-events-none fill-white text-[9px] font-medium"
          style={{ textShadow: '0 1px 2px rgba(0,0,0,0.45)' }}
        >
          {labelText.length > 14 ? `${labelText.slice(0, 12)}…` : labelText}
        </text>
      ) : null}
    </g>
  );
});

type Props = {
  initiatives: AdminDataRow[];
  year: number;
  unitFilter: string | null;
  teamFilter: LocationTeamFilter | null;
  countries: MarketCountryRow[];
  countryIdToClusterKey: Map<string, string>;
};

export function LocationAllocationSunburst({
  initiatives,
  year,
  unitFilter,
  teamFilter,
  countries,
  countryIdToClusterKey,
}: Props) {
  const { canViewMoney } = useAccess();
  const [showMoney, setShowMoney] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(0);
  const [tooltip, setTooltip] = useState<{
    node: SunburstLayoutNode;
    x: number;
    y: number;
  } | null>(null);

  const filteredInitiatives = useMemo(
    () =>
      filterLocationTimelineInitiatives(initiatives, {
        year,
        region: null,
        unit: unitFilter,
        team: teamFilter,
        countries,
        countryIdToClusterKey,
      }),
    [initiatives, year, unitFilter, teamFilter, countries, countryIdToClusterKey]
  );

  const yearQuarters = useMemo(
    () => quartersForYear(filteredInitiatives, year),
    [filteredInitiatives, year]
  );

  const tree = useMemo(
    () =>
      buildLocationAllocationSunburstTree(
        filteredInitiatives,
        yearQuarters,
        countries,
        countryIdToClusterKey
      ),
    [filteredInitiatives, yearQuarters, countries, countryIdToClusterKey]
  );

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      const rect = el.getBoundingClientRect();
      setSize(Math.min(rect.width, rect.height));
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const innerRadius = Math.max(48, size * 0.12);
  const ringWidth = Math.max(28, (size / 2 - innerRadius - 8) / 4);

  const { nodes, totalValue } = useMemo(
    () =>
      layoutLocationAllocationSunburst(tree, size, innerRadius, ringWidth, getUnitColor),
    [tree, size, innerRadius, ringWidth]
  );

  const handleHover = useCallback((node: SunburstLayoutNode, event: React.MouseEvent) => {
    setTooltip({ node, x: event.clientX, y: event.clientY });
  }, []);

  const handleLeave = useCallback(() => setTooltip(null), []);

  const moneyVisible = canViewMoney && showMoney;

  if (yearQuarters.length === 0) return null;

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-1 border-b border-border bg-header px-3 py-2 rounded-t-xl">
        {canViewMoney ? (
          <NestingToggle label="Деньги" checked={showMoney} onChange={setShowMoney} />
        ) : null}
        <NestingToggle label="Подписи" checked={showLabels} onChange={setShowLabels} />
        <p className="ml-auto text-[10px] text-muted-foreground hidden sm:block">
          Центр — юниты → команды → инициативы → регионы
        </p>
      </div>

      <div
        ref={containerRef}
        className="relative flex h-[calc(100dvh-10rem)] min-h-[560px] items-center justify-center p-4"
      >
        {totalValue > 0 && size > 0 ? (
          <>
            <svg
              width={size}
              height={size}
              viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`}
              className="max-h-full max-w-full"
              role="img"
              aria-label="Круговой тримап аллокаций"
            >
              {nodes.map((node) => (
                <SunburstArc
                  key={node.key}
                  node={node}
                  showMoney={moneyVisible}
                  showLabels={showLabels}
                  onHover={handleHover}
                  onLeave={handleLeave}
                />
              ))}
            </svg>

            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div
                className="flex flex-col items-center justify-center rounded-full bg-background/90 text-center shadow-sm ring-1 ring-border/60"
                style={{
                  width: innerRadius * 2 - 8,
                  height: innerRadius * 2 - 8,
                }}
              >
                <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Итого
                </span>
                {moneyVisible ? (
                  <>
                    <span className="text-sm font-semibold tabular-nums">
                      {formatLocationCompactM(totalValue)}
                    </span>
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {formatLocationFullAmount(totalValue)} ₽
                    </span>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">{year}</span>
                )}
              </div>
            </div>

            {tooltip ? (
              <div
                className="pointer-events-none fixed z-[9999] max-w-[280px] rounded-lg border border-border bg-popover p-3 shadow-lg"
                style={{
                  left: tooltip.x + 12,
                  top: tooltip.y + 12,
                }}
              >
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {levelLabel(tooltip.node)}
                </p>
                <p className="mb-1 text-sm font-semibold leading-tight">{tooltip.node.name}</p>
                {tooltip.node.team && !tooltip.node.isTeam ? (
                  <p className="text-xs text-muted-foreground">{tooltip.node.team}</p>
                ) : null}
                {tooltip.node.unit && !tooltip.node.isUnit ? (
                  <p className="text-xs text-muted-foreground">{tooltip.node.unit}</p>
                ) : null}
                {moneyVisible ? (
                  <div className="mt-2 flex items-baseline justify-between gap-3 text-xs tabular-nums">
                    <span className="text-muted-foreground">{pct(tooltip.node.value, totalValue)}</span>
                    <span className="font-medium">
                      {formatLocationCompactM(tooltip.node.value)}
                      <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                        ({formatLocationFullAmount(tooltip.node.value)} ₽)
                      </span>
                    </span>
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground px-4 text-center">
            Нет инициатив с бюджетом за {year}.
          </p>
        )}
      </div>
    </div>
  );
}
