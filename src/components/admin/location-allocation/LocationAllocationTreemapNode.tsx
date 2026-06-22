import { memo, useMemo } from 'react';
import { Pencil } from 'lucide-react';
import type { TreemapLayoutNode } from '@/components/treemap/types';
import type { LocationAllocationTreemapMeta } from '@/lib/locationAllocationTreemap';
import {
  collectLocationTreemapInitiativeIds,
  resolveLocationTreemapNodeYearCost,
  sumLocationTreemapRegionBreakdown,
} from '@/lib/locationAllocationTreemap';
import {
  TOP_REGION_ORDER,
  TOP_REGION_SHORT_LABELS,
} from '@/lib/locationRegionModel';
import { formatLocationCompactM } from '@/lib/locationDisplayFormat';

function getLuminance(hex: string): number {
  const rgb = parseInt(hex.slice(1), 16);
  const r = ((rgb >> 16) & 255) / 255;
  const g = ((rgb >> 8) & 255) / 255;
  const b = (rgb & 255) / 255;
  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function getTextColorClass(bgColor: string): string {
  return getLuminance(bgColor) > 0.4 ? 'text-gray-900' : 'text-white';
}

const ParentHeader = memo(function ParentHeader({
  node,
  textColorClass,
  isTiny,
  isSmall,
}: {
  node: TreemapLayoutNode;
  textColorClass: string;
  isTiny: boolean;
  isSmall: boolean;
}) {
  if (node.height < 30) return null;

  const labelClass =
    node.isUnit || node.isTeam ? 'text-white' : textColorClass;
  const nameSize = isTiny ? 'text-[9px]' : isSmall ? 'text-[11px]' : 'text-[14px]';

  return (
    <div
      className={`absolute top-0.5 left-1 right-1 flex items-center font-semibold z-20 pointer-events-none ${labelClass} ${nameSize}`}
      style={{
        textShadow: '0 1px 3px rgba(0,0,0,0.85), 0 0 1px rgba(0,0,0,0.6)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        lineHeight: '1.2',
      }}
    >
      <span className="truncate">{node.name}</span>
    </div>
  );
});

type CellCenterStackProps = {
  node: TreemapLayoutNode;
  meta: LocationAllocationTreemapMeta;
  textColorClass: string;
  isTiny: boolean;
  isSmall: boolean;
  showMoney: boolean;
};

const CellCenterStack = memo(function CellCenterStack({
  node,
  meta,
  textColorClass,
  isTiny,
  isSmall,
  showMoney,
}: CellCenterStackProps) {
  const initiativeIds = useMemo(
    () => collectLocationTreemapInitiativeIds(node, meta),
    [node, meta]
  );
  const fullCost = useMemo(
    () => resolveLocationTreemapNodeYearCost(node, meta),
    [node, meta]
  );
  const regionBreakdown = useMemo(
    () => sumLocationTreemapRegionBreakdown(initiativeIds, meta),
    [initiativeIds, meta]
  );

  const regionRows = useMemo(
    () =>
      TOP_REGION_ORDER.map((region) => {
        const rub = regionBreakdown.get(region) ?? 0;
        if (rub <= 0) return null;
        return {
          region,
          rub,
          pct: fullCost > 0 ? (rub / fullCost) * 100 : 0,
        };
      }).filter((r): r is NonNullable<typeof r> => r != null),
    [regionBreakdown, fullCost]
  );

  if (node.height < 30) return null;

  const shadow =
    textColorClass === 'text-white' ? '0 1px 3px rgba(0,0,0,0.85)' : 'none';
  const labelClass =
    node.isUnit || node.isTeam ? 'text-white' : textColorClass;
  const nameSize = isTiny ? 'text-[9px]' : isSmall ? 'text-[11px]' : 'text-[14px]';
  const totalSize = isTiny ? 'text-[8px]' : isSmall ? 'text-[10px]' : 'text-[12px]';
  const regionSize = isTiny ? 'text-[8px]' : isSmall ? 'text-[9px]' : 'text-[11px]';
  const mutedClass =
    textColorClass === 'text-white' ? 'text-white/90' : 'text-gray-700/90';

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center text-center p-1 pointer-events-none z-10"
      style={{ textShadow: shadow }}
    >
      <div
        className={`font-semibold leading-tight max-w-full truncate px-0.5 ${labelClass} ${nameSize}`}
      >
        {node.name}
      </div>

      {showMoney && fullCost > 0 && !isTiny ? (
        <div className={`mt-0.5 tabular-nums leading-tight ${labelClass} ${totalSize}`}>
          {formatLocationCompactM(fullCost)}
        </div>
      ) : null}

      {regionRows.length > 0 && node.height >= 36 ? (
        <div
          className={`mt-1 flex flex-col items-center justify-center gap-0.5 w-full min-w-0 ${regionSize} ${mutedClass}`}
        >
          {regionRows.map(({ region, rub, pct }) => (
            <div
              key={region}
              className="max-w-full truncate tabular-nums leading-tight text-center px-0.5"
            >
              {TOP_REGION_SHORT_LABELS[region]}
              {' · '}
              {pct.toFixed(0)}%
              {showMoney && !isTiny ? (
                <>
                  {' · '}
                  {formatLocationCompactM(rub)}
                </>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
});

export type LocationAllocationTreemapNodeProps = {
  node: TreemapLayoutNode;
  meta: LocationAllocationTreemapMeta;
  focusedPath?: string[];
  parentX?: number;
  parentY?: number;
  onClick?: (node: TreemapLayoutNode) => void;
  onMouseEnter?: (e: React.MouseEvent, node: TreemapLayoutNode) => void;
  onMouseMove?: (e: React.MouseEvent) => void;
  onMouseLeave?: (node?: TreemapLayoutNode) => void;
  showChildren?: boolean;
  renderDepth?: number;
  totalValue?: number;
  showMoney?: boolean;
  onEditClick?: (node: TreemapLayoutNode) => void;
};

export const LocationAllocationTreemapNode = memo(function LocationAllocationTreemapNode({
  node,
  meta,
  focusedPath = [],
  parentX = 0,
  parentY = 0,
  onClick,
  onMouseEnter,
  onMouseMove,
  onMouseLeave,
  showChildren = true,
  renderDepth = 3,
  totalValue = 0,
  showMoney = true,
  onEditClick,
}: LocationAllocationTreemapNodeProps) {
  const hasChildren = node.children && node.children.length > 0;
  const shouldRenderChildren = hasChildren && node.depth < renderDepth - 1;
  const textColorClass = getTextColorClass(node.color);
  const x = node.x0 - parentX;
  const y = node.y0 - parentY;
  const isTiny = node.width < 60 || node.height < 40;
  const isSmall = node.width < 100 || node.height < 60;

  const classNames = [
    'treemap-node',
    'location-allocation-treemap-node',
    `depth-${node.depth}`,
    isTiny && 'treemap-node-tiny',
    isSmall && 'treemap-node-small',
    hasChildren && 'has-children',
    node.isTeam && 'is-team',
    node.isInitiative && 'is-initiative',
  ]
    .filter(Boolean)
    .join(' ');

  const boxStyle: React.CSSProperties = {
    position: 'absolute',
    left: x,
    top: y,
    width: node.width,
    height: node.height,
    backgroundColor: node.color,
    borderRadius: 4,
    overflow: 'hidden',
    cursor: 'pointer',
  };

  const eventHandlers = {
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      onClick?.(node);
    },
    onMouseOver: (e: React.MouseEvent) => {
      e.stopPropagation();
      onMouseEnter?.(e, node);
    },
    onMouseMove,
    onMouseLeave: (e: React.MouseEvent) => {
      e.stopPropagation();
      onMouseLeave?.(node);
    },
  };

  return (
    <div className={classNames} style={boxStyle} {...eventHandlers}>
      {onEditClick && node.height >= 28 && node.width >= 36 ? (
        <button
          type="button"
          className="absolute top-0.5 right-0.5 z-30 flex h-6 w-6 items-center justify-center rounded-md bg-black/25 text-white/95 hover:bg-black/40 hover:text-white pointer-events-auto"
          title="Редактировать аллокации"
          aria-label="Редактировать аллокации"
          onClick={(e) => {
            e.stopPropagation();
            onEditClick(node);
          }}
        >
          <Pencil className="h-3 w-3" strokeWidth={2.25} />
        </button>
      ) : null}
      {hasChildren && shouldRenderChildren ? (
        <ParentHeader
          node={node}
          textColorClass={textColorClass}
          isTiny={isTiny}
          isSmall={isSmall}
        />
      ) : (
        <CellCenterStack
          node={node}
          meta={meta}
          textColorClass={textColorClass}
          isTiny={isTiny}
          isSmall={isSmall}
          showMoney={showMoney}
        />
      )}
      {shouldRenderChildren && showChildren
        ? node.children?.map((child) => (
            <LocationAllocationTreemapNode
              key={child.key}
              node={child}
              meta={meta}
              focusedPath={focusedPath}
              parentX={node.x0}
              parentY={node.y0}
              onClick={onClick}
              onMouseEnter={onMouseEnter}
              onMouseMove={onMouseMove}
              onMouseLeave={onMouseLeave}
              showChildren={showChildren}
              renderDepth={renderDepth}
              totalValue={totalValue}
              showMoney={showMoney}
              onEditClick={onEditClick}
            />
          ))
        : null}
    </div>
  );
});
