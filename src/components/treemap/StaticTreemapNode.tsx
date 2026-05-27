// Узел статичного тримапа — без Framer Motion, отдельно от TreemapNode.

import { memo, type CSSProperties } from 'react';
import type { TreemapLayoutNode } from './types';
import { formatBudget } from '@/lib/dataManager';
import { getTreemapUnitIcon } from '@/lib/treemapUnitIcons';
import { SemanticUnitNodeContent } from './SemanticUnitNodeContent';

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

function initiativeLeafBoxShadow(node: TreemapLayoutNode): string | undefined {
  if (!node.isInitiative) return undefined;
  if (node.unitStripeColor && node.isTimelineStub) {
    return `inset 4px 0 0 0 ${node.unitStripeColor}, inset 0 0 0 1px rgba(255, 255, 255, 0.18)`;
  }
  if (node.unitStripeColor) {
    return `inset 4px 0 0 0 ${node.unitStripeColor}`;
  }
  return undefined;
}

interface StaticTreemapNodeContentProps {
  node: TreemapLayoutNode;
  showValue: boolean;
  textColorClass: string;
  totalValue?: number;
  showMoney?: boolean;
  focusedPath: string[];
}

const StaticTreemapNodeContent = memo(({
  node,
  showValue,
  textColorClass,
  totalValue = 0,
  showMoney = true,
  focusedPath,
}: StaticTreemapNodeContentProps) => {
  const isTiny = node.width < 60 || node.height < 40;
  const isSmall = node.width < 100 || node.height < 60;
  const hasChildren = node.children && node.children.length > 0;
  const showSemanticChrome =
    node.isUnit && node.depth === 0 && focusedPath.length === 0;

  if (node.height < 30) return null;

  if (showSemanticChrome && !hasChildren) {
    return (
      <SemanticUnitNodeContent
        node={node}
        textColorClass={textColorClass}
        totalValue={totalValue}
        showMoney={showMoney}
        showValue={showValue}
      />
    );
  }

  if (node.data.isRoot) {
    return null;
  }

  if (hasChildren) {
    const UnitIcon = showSemanticChrome ? getTreemapUnitIcon(node.name) : null;
    const labelClass =
      node.data.isCrossInitiative || node.isUnit || node.isTeam
        ? 'text-white'
        : textColorClass;
    return (
      <div
        className={`absolute top-0.5 left-1 right-1 flex items-center gap-1 font-semibold z-20 pointer-events-none ${labelClass} ${isTiny ? 'text-[9px]' : isSmall ? 'text-[11px]' : 'text-[14px]'}`}
        style={{
          textShadow: '0 1px 3px rgba(0,0,0,0.85), 0 0 1px rgba(0,0,0,0.6)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          lineHeight: '1.2',
        }}
      >
        {UnitIcon && (
          <span className="flex shrink-0 items-center justify-center rounded bg-white/20 p-0.5">
            <UnitIcon size={isTiny ? 10 : 12} className={textColorClass} strokeWidth={2} />
          </span>
        )}
        <span className="truncate">{node.name}</span>
      </div>
    );
  }

  return (
    <LeafCellContent
      textColorClass={textColorClass}
      isTiny={isTiny}
      isSmall={isSmall}
      name={node.name}
      showValue={showValue}
      totalValue={totalValue}
      showMoney={showMoney}
      node={node}
    />
  );
});

StaticTreemapNodeContent.displayName = 'StaticTreemapNodeContent';

/** Деньги на плитке: displayBudget (кросс-инициатива, инициатива), иначе value для раскладки. */
function treemapMoneyLabel(node: TreemapLayoutNode): number {
  const displayBudget = node.data?.displayBudget;
  if (typeof displayBudget === 'number' && displayBudget > 0) return displayBudget;
  return node.value;
}

function LeafCellContent({
  textColorClass,
  isTiny,
  isSmall,
  name,
  showValue,
  totalValue,
  showMoney,
  node,
}: {
  textColorClass: string;
  isTiny: boolean;
  isSmall: boolean;
  name: string;
  showValue: boolean;
  totalValue: number;
  showMoney: boolean;
  node: TreemapLayoutNode;
}) {
  const shadow = textColorClass === 'text-white' ? '0 1px 2px rgba(0,0,0,0.3)' : 'none';
  const moneyLabel = treemapMoneyLabel(node);

  return (
    <div className="absolute inset-0 flex items-center justify-center p-1">
      <div className="text-center w-full px-1 min-h-0 flex flex-col items-center justify-center">
        <div
          className={`font-semibold ${textColorClass} ${isTiny ? 'text-[9px]' : isSmall ? 'text-[11px]' : 'text-[14px]'} w-full shrink-0`}
          style={{
            textShadow: shadow,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {name}
        </div>
        {showValue && node.height > 40 && !isTiny && totalValue > 0 && (
          <div
            className={`${textColorClass === 'text-white' ? 'text-white/90' : 'text-gray-700'} mt-0.5 ${isSmall ? 'text-[10px]' : 'text-[12px]'}`}
            style={{ textShadow: shadow }}
          >
            {`${((moneyLabel / totalValue) * 100).toFixed(1)}%`}
          </div>
        )}
        {showValue && showMoney && node.height > 40 && !isTiny && (
          <div
            className={`${textColorClass === 'text-white' ? 'text-white/90' : 'text-gray-700'} mt-0.5 ${isSmall ? 'text-[10px]' : 'text-[12px]'}`}
            style={{ textShadow: shadow }}
          >
            {formatBudget(moneyLabel)}
          </div>
        )}
      </div>
    </div>
  );
}

interface StaticTreemapNodeProps {
  node: TreemapLayoutNode;
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
  nodeCursor?: CSSProperties['cursor'];
  /** Режим «Объединение»: перетаскивание листьев-инициатив для линковки. */
  linkDragOverId?: string | null;
  onInitiativeLinkDragStart?: (initiativeId: string) => void;
  onInitiativeLinkDragEnter?: (initiativeId: string) => void;
  onInitiativeLinkDragLeave?: () => void;
  onInitiativeLinkDrop?: (sourceId: string, targetId: string) => void;
  selectedInitiativeId?: string | null;
}

const StaticTreemapNode = memo(({
  node,
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
  nodeCursor = 'pointer',
  linkDragOverId = null,
  onInitiativeLinkDragStart,
  onInitiativeLinkDragEnter,
  onInitiativeLinkDragLeave,
  onInitiativeLinkDrop,
  selectedInitiativeId = null,
}: StaticTreemapNodeProps) => {
  const hasChildren = node.children && node.children.length > 0;
  const shouldRenderChildren = hasChildren && node.depth < renderDepth - 1;
  const isLeaf = !hasChildren;
  const textColorClass = getTextColorClass(node.color);
  const x = node.x0 - parentX;
  const y = node.y0 - parentY;
  const isTiny = node.width < 60 || node.height < 40;
  const isSmall = node.width < 100 || node.height < 60;

  const classNames = [
    'treemap-node',
    `depth-${node.depth}`,
    isTiny && 'treemap-node-tiny',
    isSmall && 'treemap-node-small',
    hasChildren && 'has-children',
    node.offTrack && isLeaf && 'off-track',
    node.isTeam && 'is-team',
    node.data.isCrossInitiative && 'is-cross-initiative',
    node.isInitiative && 'is-initiative',
    node.isInitiative && node.isTimelineStub && 'is-timeline-stub',
  ]
    .filter(Boolean)
    .join(' ');

  const leafShadow = initiativeLeafBoxShadow(node);
  const initiativeId = node.data.adminInitiativeRowId;
  const isLinkLeaf = Boolean(isLeaf && node.isInitiative && initiativeId && onInitiativeLinkDragStart);
  const isLinkDropTarget = Boolean(isLinkLeaf && linkDragOverId && linkDragOverId === initiativeId);
  const isSelected = Boolean(
    initiativeId && selectedInitiativeId && selectedInitiativeId === initiativeId
  );

  const crossAllocated = node.crossAllocatedValue ?? node.data.crossAllocatedValue ?? 0;
  const crossShare =
    crossAllocated > 0 && node.value > 0
      ? Math.min(1, crossAllocated / node.value)
      : 0;
  const showCrossBand =
    crossShare > 0.02 &&
    node.data.isPortfolioUnit &&
    !node.data.isCrossInitiative;

  const boxStyle: React.CSSProperties = {
    position: 'absolute',
    left: x,
    top: y,
    width: node.width,
    height: node.height,
    backgroundColor: node.color,
    borderRadius: 4,
    overflow: 'hidden',
    cursor: isLinkLeaf ? 'grab' : nodeCursor,
    ...(leafShadow ? { boxShadow: leafShadow } : {}),
    ...(isLinkDropTarget
      ? { outline: '2px solid hsl(var(--primary))', outlineOffset: -2, zIndex: 2 }
      : {}),
    ...(isSelected
      ? {
          outline: '2px solid rgba(255,255,255,0.95)',
          outlineOffset: -2,
          zIndex: 4,
          filter: 'brightness(1.14) saturate(1.08)',
          transition: 'filter 0.15s ease, outline 0.15s ease',
        }
      : { transition: 'filter 0.15s ease' }),
  };

  const eventHandlers = {
    ...(isLinkLeaf
      ? {
          draggable: true,
          onDragStart: (e: React.DragEvent) => {
            e.stopPropagation();
            e.dataTransfer.setData('text/initiative-id', initiativeId!);
            e.dataTransfer.effectAllowed = 'link';
            onInitiativeLinkDragStart?.(initiativeId!);
          },
          onDragEnter: (e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            onInitiativeLinkDragEnter?.(initiativeId!);
          },
          onDragLeave: (e: React.DragEvent) => {
            e.stopPropagation();
            onInitiativeLinkDragLeave?.();
          },
          onDragOver: (e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            onInitiativeLinkDragEnter?.(initiativeId!);
          },
          onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            const sourceId = e.dataTransfer.getData('text/initiative-id');
            if (sourceId && initiativeId) {
              onInitiativeLinkDrop?.(sourceId, initiativeId);
            }
          },
        }
      : {}),
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
      {showCrossBand && (
        <div
          className="treemap-cross-allocated-band"
          style={{ height: `${(crossShare * 100).toFixed(1)}%` }}
          title="Доля юнита в кросс-инициативах"
          aria-hidden
        />
      )}
      <StaticTreemapNodeContent
        node={node}
        showValue={!shouldRenderChildren}
        textColorClass={textColorClass}
        totalValue={totalValue}
        showMoney={showMoney}
        focusedPath={focusedPath}
      />
      {shouldRenderChildren && showChildren && node.children?.map((child) => (
        <StaticTreemapNode
          key={child.key}
          node={child}
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
          nodeCursor={nodeCursor}
          linkDragOverId={linkDragOverId}
          onInitiativeLinkDragStart={onInitiativeLinkDragStart}
          onInitiativeLinkDragEnter={onInitiativeLinkDragEnter}
          onInitiativeLinkDragLeave={onInitiativeLinkDragLeave}
          onInitiativeLinkDrop={onInitiativeLinkDrop}
          selectedInitiativeId={selectedInitiativeId}
        />
      ))}
    </div>
  );
});

StaticTreemapNode.displayName = 'StaticTreemapNode';

export default StaticTreemapNode;
