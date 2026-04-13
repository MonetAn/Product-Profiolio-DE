// Framer Motion treemap node component
// Animates x, y, width, height for Flourish-style transitions

import { motion, AnimatePresence } from 'framer-motion';
import { memo } from 'react';
import { TreemapLayoutNode, AnimationType, getEffectiveDuration, TREEMAP_EASE, TEXT_OPACITY_TRANSITION_MS } from './types';
import { formatBudget } from '@/lib/dataManager';

// Calculate relative luminance for WCAG contrast
function getLuminance(hex: string): number {
  const rgb = parseInt(hex.slice(1), 16);
  const r = ((rgb >> 16) & 255) / 255;
  const g = ((rgb >> 8) & 255) / 255;
  const b = (rgb & 255) / 255;
  
  const toLinear = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function getTextColorClass(bgColor: string): string {
  const luminance = getLuminance(bgColor);
  return luminance > 0.4 ? 'text-gray-900' : 'text-white';
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

interface TreemapNodeProps {
  node: TreemapLayoutNode;
  animationType: AnimationType;
  /** При drilldown с root: раскладка «до», чтобы анимировать от старых позиций/размеров */
  fromLayoutNodes?: TreemapLayoutNode[];
  /** Текущий путь зума; при drilldown дочерние ноды этого пути получают fade-in */
  focusedPath?: string[];
  textVisible?: boolean;
  parentX?: number;
  parentY?: number;
  onClick?: (node: TreemapLayoutNode) => void;
  onMouseEnter?: (e: React.MouseEvent, node: TreemapLayoutNode) => void;
  onMouseMove?: (e: React.MouseEvent) => void;
  onMouseLeave?: (node?: TreemapLayoutNode) => void;
  showChildren?: boolean;
  renderDepth?: number;
  totalValue?: number;
  selectedUnitsCount?: number;
  /** When high, container uses shorter animation duration for filter/resize to reduce lag */
  visibleNodeCount?: number;
  /** If false, only percentage is shown on leaf cells (no money) */
  showMoney?: boolean;
  /** When true (e.g. prefers-reduced-motion), use short fixed duration for enter/exit */
  reduceMotion?: boolean;
}

interface TreemapNodeContentProps {
  node: TreemapLayoutNode;
  showValue: boolean;
  textColorClass: string;
  totalValue?: number;
  selectedUnitsCount?: number;
  showMoney?: boolean;
}

const TreemapNodeContent = memo(({ node, showValue, textColorClass, totalValue = 0, selectedUnitsCount = 0, showMoney = true }: TreemapNodeContentProps) => {
  const isTiny = node.width < 60 || node.height < 40;
  const isSmall = node.width < 100 || node.height < 60;
  const hasChildren = node.children && node.children.length > 0;
  
  if (node.height < 30) return null;
  
  if (hasChildren) {
    return (
      <div 
        className={`absolute top-0.5 left-1 right-1 font-semibold ${textColorClass} ${isTiny ? 'text-[9px]' : isSmall ? 'text-[11px]' : 'text-[14px]'}`}
        style={{ 
          textShadow: textColorClass === 'text-white' ? '0 1px 2px rgba(0,0,0,0.3)' : 'none',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          lineHeight: '1.2',
        }}
      >
        {node.name}
      </div>
    );
  }
  
  return (
    <div className="absolute inset-0 flex items-center justify-center p-1">
      <div className="text-center w-full px-1 min-h-0 flex flex-col items-center justify-center">
        <div 
          className={`font-semibold ${textColorClass} ${isTiny ? 'text-[9px]' : isSmall ? 'text-[11px]' : 'text-[14px]'} w-full shrink-0`}
          style={{ 
            textShadow: textColorClass === 'text-white' ? '0 1px 2px rgba(0,0,0,0.3)' : 'none',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {node.name}
        </div>
        {showValue && node.height > 40 && !isTiny && (
          <>
            {totalValue > 0 && (
              <div 
                className={`${textColorClass === 'text-white' ? 'text-white/90' : 'text-gray-700'} mt-0.5 ${isSmall ? 'text-[10px]' : 'text-[12px]'}`}
                style={{ textShadow: textColorClass === 'text-white' ? '0 1px 2px rgba(0,0,0,0.3)' : 'none' }}
              >
                {`${((node.value / totalValue) * 100).toFixed(1)}%`}
              </div>
            )}
            {showMoney && (
              <div 
                className={`${textColorClass === 'text-white' ? 'text-white/90' : 'text-gray-700'} mt-0.5 ${isSmall ? 'text-[10px]' : 'text-[12px]'}`}
                style={{ textShadow: textColorClass === 'text-white' ? '0 1px 2px rgba(0,0,0,0.3)' : 'none' }}
              >
                {formatBudget(node.value)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
});

TreemapNodeContent.displayName = 'TreemapNodeContent';

const TreemapNode = memo(({
  node,
  animationType,
  fromLayoutNodes,
  focusedPath,
  textVisible = true,
  parentX = 0,
  parentY = 0,
  onClick,
  onMouseEnter,
  onMouseMove,
  onMouseLeave,
  showChildren = true,
  renderDepth = 3,
  totalValue = 0,
  selectedUnitsCount = 0,
  visibleNodeCount,
  showMoney = true,
  reduceMotion = false,
}: TreemapNodeProps) => {
  const duration = reduceMotion
    ? 0.15
    : (animationType === 'initial' ? 0 : getEffectiveDuration(animationType, visibleNodeCount) / 1000);
  const exitDuration = reduceMotion
    ? 0.15
    : (animationType === 'initial' ? 0.3 : getEffectiveDuration(animationType, visibleNodeCount) / 1000);
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
    node.isInitiative && 'is-initiative',
    node.isInitiative && node.isTimelineStub && 'is-timeline-stub',
    node.isInitiative && isLeaf && node.data?.adminEffortChanged && 'admin-effort-changed',
    node.isInitiative && isLeaf && node.data?.adminQuickReviewIssue && 'admin-quick-review-issue',
  ].filter(Boolean).join(' ');

  const skipInitial = animationType === 'initial';

  const isDrilldown = animationType === 'drilldown';
  const initialOpacity = isDrilldown ? 1 : 0;

  /** При zoom-in все ноды нового уровня (depth === focusedPath.length) делают fade-in; родители с useFromLayout остаются видимыми */
  const shouldFadeInOnDrilldown =
    isDrilldown &&
    focusedPath != null &&
    focusedPath.length > 0 &&
    node.depth === focusedPath.length;
  const initialOpacityForVariant = shouldFadeInOnDrilldown ? 0 : initialOpacity;

  // При первом zoom-in с root: анимировать от старых позиций/размеров к новым (настоящий zoom)
  const fromNode = fromLayoutNodes?.length ? fromLayoutNodes.find(n => n.key === node.key) : undefined;
  const useFromLayout = isDrilldown && fromNode;

  const variants = {
    initial: useFromLayout
      ? { opacity: initialOpacityForVariant, scale: 1, x: fromNode.x0, y: fromNode.y0, width: fromNode.width, height: fromNode.height }
      : { opacity: initialOpacityForVariant, scale: 0.92, x, y, width: node.width, height: node.height },
    animate: {
      opacity: 1,
      scale: 1,
      x,
      y,
      width: node.width,
      height: node.height,
      transition: {
        duration,
        ease: [...TREEMAP_EASE] as [number, number, number, number],
        scale: { duration: duration * 0.8 },
      },
    },
    exit: { opacity: 0, scale: 0.92, transition: { duration: exitDuration } },
  };

  const content = (
    <TreemapNodeContent
      node={node}
      showValue={!shouldRenderChildren}
      textColorClass={textColorClass}
      totalValue={totalValue}
      selectedUnitsCount={selectedUnitsCount}
      showMoney={showMoney}
    />
  );

  const leafShadow = initiativeLeafBoxShadow(node);

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
    zIndex: 1,
    ...(leafShadow ? { boxShadow: leafShadow } : {}),
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

  const childrenBlock = shouldRenderChildren && showChildren && node.children && (
    <>
      {node.children.map(child => (
        <TreemapNode
          key={child.key}
          node={child}
          animationType={animationType}
          fromLayoutNodes={undefined}
          focusedPath={focusedPath}
          textVisible={textVisible}
          visibleNodeCount={visibleNodeCount}
          reduceMotion={reduceMotion}
          parentX={node.x0}
          parentY={node.y0}
          onClick={onClick}
          onMouseEnter={onMouseEnter}
          onMouseMove={onMouseMove}
          onMouseLeave={onMouseLeave}
          showChildren={showChildren}
          renderDepth={renderDepth}
          totalValue={totalValue}
          selectedUnitsCount={selectedUnitsCount}
          showMoney={showMoney}
        />
      ))}
    </>
  );

  // First load: no motion, no opacity layer — box and text paint together
  if (animationType === 'initial') {
    return (
      <div className={classNames} style={boxStyle} {...eventHandlers}>
        {content}
        {childrenBlock}
      </div>
    );
  }

  // Transitions: motion box + opacity wrapper for fade after layout
  return (
    <motion.div
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
      className={classNames}
      style={{
        position: 'absolute',
        backgroundColor: node.color,
        borderRadius: 4,
        overflow: 'hidden',
        cursor: 'pointer',
        transformOrigin: 'center center',
        zIndex: 1,
        ...(leafShadow ? { boxShadow: leafShadow } : {}),
      }}
      {...eventHandlers}
    >
      <div
        className="absolute inset-0"
        style={{
          opacity: textVisible ? 1 : 0,
          transition: `opacity ${TEXT_OPACITY_TRANSITION_MS}ms ease-out`,
        }}
      >
        {content}
      </div>
      <AnimatePresence mode="sync">
        {childrenBlock}
      </AnimatePresence>
    </motion.div>
  );
});

TreemapNode.displayName = 'TreemapNode';

export default TreemapNode;
