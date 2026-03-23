// Treemap tooltip component - rendered via portal to document.body for correct positioning

import { useLayoutEffect, useRef, useState, memo } from 'react';
import { createPortal } from 'react-dom';
import { TreemapLayoutNode } from './types';
import { formatBudget, escapeHtml, formatQuarterRange } from '@/lib/dataManager';

interface TreemapTooltipProps {
  data: {
    node: TreemapLayoutNode;
    position: { x: number; y: number };
  } | null;
  lastQuarter: string | null;
  selectedUnitsCount: number;
  totalValue: number;
  /** If false, do not show "Распределение бюджета" block (used for Stakeholders treemap) */
  showDistributionInTooltip?: boolean;
  /** If false, hide budget amounts (show only percentages where applicable) */
  showMoney?: boolean;
}

export type { TreemapTooltipProps };

// Constants for positioning
const CURSOR_OFFSET = 12;  // Distance from cursor
const SCREEN_PADDING = 16; // Min distance from screen edges

/** Sum distributed (described) vs unallocated (stub) budget in subtree */
function sumDistributedUnallocated(node: TreemapLayoutNode): { distributed: number; unallocated: number } {
  let distributed = 0, unallocated = 0;
  function walk(n: TreemapLayoutNode) {
    if (n.isInitiative) {
      if (n.isTimelineStub) unallocated += n.value;
      else distributed += n.value;
      return;
    }
    (n.children ?? []).forEach(walk);
  }
  walk(node);
  return { distributed, unallocated };
}

const TreemapTooltip = memo<TreemapTooltipProps>(({ data, lastQuarter, selectedUnitsCount, totalValue, showDistributionInTooltip = true, showMoney = true }) => {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  
  // Calculate position when data changes - useLayoutEffect to avoid flicker
  useLayoutEffect(() => {
    if (!tooltipRef.current || !data) {
      setPosition(null);
      return;
    }
    
    const tooltip = tooltipRef.current;
    const rect = tooltip.getBoundingClientRect();
    
    let x = data.position.x + CURSOR_OFFSET;
    let y = data.position.y + CURSOR_OFFSET;
    
    // Flip if overflowing right
    if (x + rect.width > window.innerWidth - SCREEN_PADDING) {
      x = data.position.x - rect.width - CURSOR_OFFSET;
    }
    if (x < SCREEN_PADDING) {
      x = SCREEN_PADDING;
    }
    
    // Flip if overflowing bottom
    if (y + rect.height > window.innerHeight - SCREEN_PADDING) {
      y = data.position.y - rect.height - CURSOR_OFFSET;
    }
    if (y < SCREEN_PADDING) {
      y = SCREEN_PADDING;
    }
    
    setPosition({ x, y });
  }, [data]);
  
  // Build tooltip content
  const renderContent = () => {
    if (!data) return '';
    
    const { node } = data;
    const isInitiative = node.isInitiative;
    const hasDistributionFromChildren = !isInitiative && node.children && node.children.length > 0;
    const hasDistributionFromAggregates = !isInitiative && (node.distributedValue !== undefined || node.unallocatedValue !== undefined);
    const showDistribution = showDistributionInTooltip && (hasDistributionFromChildren || hasDistributionFromAggregates);
    
    let html = `<div class="tooltip-header">
      <div class="tooltip-title">${escapeHtml(node.name)}</div>`;
    
    if (isInitiative && node.offTrack !== undefined) {
      html += `<div class="tooltip-status ${node.offTrack ? 'off-track' : 'on-track'}"></div>`;
    }
    html += `</div>`;
    
    // Unit or Team (or Stakeholder group): show distribution (header + mini-bar + 2 rows)
    if (showDistribution) {
      let distributed: number;
      let unallocated: number;
      if (hasDistributionFromChildren) {
        const summed = sumDistributedUnallocated(node);
        distributed = summed.distributed;
        unallocated = summed.unallocated;
        // When view is "teams only" (no initiatives), subtree has no initiative nodes — use aggregates if present
        if (distributed + unallocated === 0 && (node.distributedValue !== undefined || node.unallocatedValue !== undefined)) {
          distributed = node.distributedValue ?? 0;
          unallocated = node.unallocatedValue ?? 0;
        }
      } else {
        distributed = node.distributedValue ?? 0;
        unallocated = node.unallocatedValue ?? 0;
      }
      const total = distributed + unallocated;
      const pctDist = total > 0 ? (distributed / total) * 100 : 0;
      const pctUnalloc = total > 0 ? (unallocated / total) * 100 : 0;
      
      html += `<div class="tooltip-mini-bar">`;
      if (pctDist > 0) html += `<div class="tooltip-mini-bar-segment tooltip-mini-bar-segment-distributed" style="flex-grow:${pctDist}"></div>`;
      if (pctUnalloc > 0) html += `<div class="tooltip-mini-bar-segment tooltip-mini-bar-segment-unallocated" style="flex-grow:${pctUnalloc}"></div>`;
      html += `</div>`;
      if (showMoney) {
        html += `<div class="tooltip-row tooltip-row-initiatives"><span class="tooltip-label tooltip-label-wrap">Аллоцированный бюджет</span><span class="tooltip-value">${formatBudget(distributed)} (${pctDist.toFixed(1)}%)</span></div>`;
        html += `<div class="tooltip-row tooltip-row-team-cost"><span class="tooltip-label tooltip-label-wrap">Нераспределённый бюджет</span><span class="tooltip-value">${formatBudget(unallocated)} (${pctUnalloc.toFixed(1)}%)</span></div>`;
      } else {
        html += `<div class="tooltip-row tooltip-row-initiatives"><span class="tooltip-label tooltip-label-wrap">Аллоцированный бюджет</span><span class="tooltip-value">${pctDist.toFixed(1)}%</span></div>`;
        html += `<div class="tooltip-row tooltip-row-team-cost"><span class="tooltip-label tooltip-label-wrap">Нераспределённый бюджет</span><span class="tooltip-value">${pctUnalloc.toFixed(1)}%</span></div>`;
      }
      
      return html;
    }
    
    // Initiative: заглушка / поддержка — короткие пометки; про «разработку» не пишем
    if (isInitiative) {
      if (node.isTimelineStub) {
        html += `<div class="tooltip-type-line">Заглушка — нераспределённая стоимость команды</div>`;
      } else if (node.support) {
        html += `<div class="tooltip-type-line">Инициатива в поддержке в выбранном периоде</div>`;
      }
      
      const quarterRange = formatQuarterRange(node.data.quarterlyData);
      if (quarterRange) {
        html += `<div class="tooltip-quarters">${escapeHtml(quarterRange)}</div>`;
      }
      
      // Quarter metrics for initiatives (plan/fact last quarter)
      if (node.quarterlyData && lastQuarter) {
        const qData = node.quarterlyData[lastQuarter];
        if (qData && (qData.metricPlan || qData.metricFact)) {
          const [year, quarter] = lastQuarter.split('-');
          const qLabel = `${quarter} ${year}`;
          html += `<div class="tooltip-metrics">`;
          if (qData.metricPlan) {
            const truncatedPlan = qData.metricPlan.length > 100 
              ? qData.metricPlan.slice(0, 100) + '…' 
              : qData.metricPlan;
            html += `<div class="tooltip-metric"><span class="tooltip-metric-label">План (${qLabel})</span><span class="tooltip-metric-value">${escapeHtml(truncatedPlan)}</span></div>`;
          }
          if (qData.metricFact) {
            const truncatedFact = qData.metricFact.length > 100 
              ? qData.metricFact.slice(0, 100) + '…' 
              : qData.metricFact;
            html += `<div class="tooltip-metric"><span class="tooltip-metric-label">Факт (${qLabel})</span><span class="tooltip-metric-value">${escapeHtml(truncatedFact)}</span></div>`;
          }
          html += `</div>`;
        }
      }
      
      if (node.stakeholders && node.stakeholders.length > 0) {
        html += `<div class="tooltip-stakeholders">
          <div class="tooltip-stakeholders-label">Стейкхолдеры</div>
          <div class="tooltip-tags">${node.stakeholders.map(s => `<span class="tooltip-tag">${escapeHtml(s)}</span>`).join('')}</div>
        </div>`;
      }
      return html;
    }
    
    // Fallback: e.g. stakeholder group or other — budget + %
    if (showMoney) {
      html += `<div class="tooltip-row"><span class="tooltip-label">Бюджет</span><span class="tooltip-value">${formatBudget(node.value)}</span></div>`;
    }
    if (totalValue > 0) {
      const percentOfTotal = ((node.value / totalValue) * 100).toFixed(1);
      html += `<div class="tooltip-row"><span class="tooltip-label tooltip-label-group"><span>% от бюджета</span><span class="tooltip-label-sub">выбранного на экране</span></span><span class="tooltip-value">${percentOfTotal}%</span></div>`;
    }
    
    return html;
  };
  
  // Style with visibility hidden until position is calculated
  const style: React.CSSProperties = {
    position: 'fixed',
    zIndex: 9999,
    pointerEvents: 'none',
    ...(position ? {
      left: position.x,
      top: position.y,
      visibility: 'visible',
      opacity: 1,
    } : {
      left: 0,
      top: 0,
      visibility: 'hidden',
      opacity: 0,
    }),
  };
  
  // Render tooltip via portal to document.body to avoid transform-related positioning issues
  const tooltipElement = (
    <div 
      ref={tooltipRef} 
      className={`treemap-tooltip ${data && position ? 'visible' : ''}`}
      style={style}
      dangerouslySetInnerHTML={{ __html: renderContent() }}
    />
  );
  
  // Use portal to render in document.body
  return createPortal(tooltipElement, document.body);
});

TreemapTooltip.displayName = 'TreemapTooltip';

export default TreemapTooltip;
