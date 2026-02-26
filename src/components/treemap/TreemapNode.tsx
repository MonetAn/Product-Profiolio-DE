// Framer Motion treemap node component
// Animates x, y, width, height for Flourish-style transitions

import { motion, AnimatePresence } from 'framer-motion';
import { memo } from 'react';
import { TreemapLayoutNode, AnimationType, ANIMATION_DURATIONS } from './types';
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

interface TreemapNodeProps {
  node: TreemapLayoutNode;
  animationType: AnimationType;
  parentX?: number;
  parentY?: number;
  onClick?: (node: TreemapLayoutNode) => void;
  onMouseEnter?: (e: React.MouseEvent, node: TreemapLayoutNode) => void;
  onMouseMove?: (e: React.MouseEvent) => void;
  onMouseLeave?: (node?: TreemapLayoutNode) => void;
  showChildren?: boolean;
  renderDepth?: number;
}

interface TreemapNodeContentProps {
  node: TreemapLayoutNode;
  showValue: boolean;
  textColorClass: string;
}

const TreemapNodeContent = memo(({ node, showValue, textColorClass }: TreemapNodeContentProps) => {
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
      <div className="text-center w-full px-1">
        <div 
          className={`font-semibold ${textColorClass} ${isTiny ? 'text-[9px]' : isSmall ? 'text-[11px]' : 'text-[14px]'}`}
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
          <div 
            className={`${textColorClass === 'text-white' ? 'text-white/90' : 'text-gray-700'} mt-0.5 ${isSmall ? 'text-[10px]' : 'text-[12px]'}`}
            style={{ textShadow: textColorClass === 'text-white' ? '0 1px 2px rgba(0,0,0,0.3)' : 'none' }}
          >
            {formatBudget(node.value)}
          </div>
        )}
      </div>
    </div>
  );
});

TreemapNodeContent.displayName = 'TreemapNodeContent';

const TreemapNode = memo(({
  node,
  animationType,
  parentX = 0,
  parentY = 0,
  onClick,
  onMouseEnter,
  onMouseMove,
  onMouseLeave,
  showChildren = true,
  renderDepth = 3,
}: TreemapNodeProps) => {
  const duration = animationType === 'initial' ? 0 : ANIMATION_DURATIONS[animationType] / 1000;
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
  ].filter(Boolean).join(' ');

  const skipInitial = animationType === 'initial';
  
  const variants = {
    initial: { opacity: 0, scale: 0.92, x, y, width: node.width, height: node.height },
    animate: {
      opacity: 1,
      scale: 1,
      x,
      y,
      width: node.width,
      height: node.height,
      transition: {
        duration,
        ease: [0.4, 0, 0.2, 1] as [number, number, number, number],
        scale: { duration: duration * 0.8 },
      },
    },
    exit: { opacity: 0, scale: 0.92, transition: { duration: 0.3 } },
  };

  return (
    <motion.div
      variants={variants}
      initial={skipInitial ? false : "initial"}
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
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(node);
      }}
      onMouseOver={(e) => {
        e.stopPropagation();
        onMouseEnter?.(e, node);
      }}
      onMouseMove={onMouseMove}
      onMouseLeave={(e) => {
        e.stopPropagation();
        onMouseLeave?.(node);
      }}
    >
      <TreemapNodeContent node={node} showValue={!shouldRenderChildren} textColorClass={textColorClass} />
      
      <AnimatePresence mode="sync">
        {shouldRenderChildren && showChildren &&
          node.children!.map(child => (
            <TreemapNode
              key={child.key}
              node={child}
              animationType={animationType}
              parentX={node.x0}
              parentY={node.y0}
              onClick={onClick}
              onMouseEnter={onMouseEnter}
              onMouseMove={onMouseMove}
              onMouseLeave={onMouseLeave}
              showChildren={showChildren}
              renderDepth={renderDepth}
            />
          ))
        }
      </AnimatePresence>
    </motion.div>
  );
});

TreemapNode.displayName = 'TreemapNode';

export default TreemapNode;
