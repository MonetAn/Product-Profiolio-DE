import { formatBudget } from '@/lib/dataManager';
import { getTreemapUnitIcon } from '@/lib/treemapUnitIcons';
import type { TreemapLayoutNode } from './types';

interface SemanticUnitNodeContentProps {
  node: TreemapLayoutNode;
  textColorClass: string;
  totalValue: number;
  showMoney: boolean;
  showValue: boolean;
}

export function SemanticUnitNodeContent({
  node,
  textColorClass,
  totalValue,
  showMoney,
  showValue,
}: SemanticUnitNodeContentProps) {
  const Icon = getTreemapUnitIcon(node.name);
  const isTiny = node.width < 80 || node.height < 56;
  const isSmall = node.width < 120 || node.height < 80;
  const pct = totalValue > 0 ? ((node.value / totalValue) * 100).toFixed(1) : null;
  const shadow = textColorClass === 'text-white' ? '0 1px 2px rgba(0,0,0,0.3)' : 'none';
  const iconSize = isTiny ? 12 : isSmall ? 14 : 18;

  if (node.height < 36) return null;

  if (isTiny || !showValue) {
    return (
      <div className="absolute inset-0 flex items-center justify-center gap-1 px-1">
        {Icon && (
          <span className="flex shrink-0 items-center justify-center rounded bg-white/20 p-0.5">
            <Icon size={iconSize} className={textColorClass} strokeWidth={2} />
          </span>
        )}
        <span
          className={`truncate font-semibold ${textColorClass} text-[9px]`}
          style={{ textShadow: shadow }}
        >
          {node.name}
        </span>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center px-2 py-1 text-center">
      {Icon && (
        <span
          className={`mb-1 flex shrink-0 items-center justify-center rounded-md bg-white/20 ${isSmall ? 'p-1' : 'p-1.5'}`}
        >
          <Icon size={iconSize} className={textColorClass} strokeWidth={2} />
        </span>
      )}
      <span
        className={`w-full shrink-0 truncate font-semibold ${textColorClass} ${isSmall ? 'text-[11px]' : 'text-sm'}`}
        style={{ textShadow: shadow }}
      >
        {node.name}
      </span>
      {showValue && pct != null && (
        <>
          <span
            className={`mt-0.5 font-bold leading-none ${textColorClass} ${isSmall ? 'text-lg' : 'text-2xl'}`}
            style={{ textShadow: shadow }}
          >
            {pct}%
          </span>
          <span className={`my-1 h-px w-8 ${textColorClass === 'text-white' ? 'bg-white/40' : 'bg-gray-600/40'}`} />
          {showMoney && (
            <span
              className={`truncate ${textColorClass === 'text-white' ? 'text-white/90' : 'text-gray-700'} ${isSmall ? 'text-[10px]' : 'text-xs'}`}
              style={{ textShadow: shadow }}
            >
              {formatBudget(node.value)}
            </span>
          )}
        </>
      )}
    </div>
  );
}
