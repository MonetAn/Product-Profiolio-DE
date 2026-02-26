// Treemap tooltip component - rendered via portal to document.body for correct positioning

import { useLayoutEffect, useRef, useState, memo } from 'react';
import { createPortal } from 'react-dom';
import { TreemapLayoutNode } from './types';
import { formatBudget, escapeHtml } from '@/lib/dataManager';

interface TreemapTooltipProps {
  data: {
    node: TreemapLayoutNode;
    position: { x: number; y: number };
  } | null;
  lastQuarter: string | null;
  selectedUnitsCount: number;
  totalValue: number;
}

// Constants for positioning
const CURSOR_OFFSET = 12;  // Distance from cursor
const SCREEN_PADDING = 16; // Min distance from screen edges

const TreemapTooltip = memo(({ data, lastQuarter, selectedUnitsCount, totalValue }: TreemapTooltipProps) => {
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
    
    let html = `<div class="tooltip-header">
      <div class="tooltip-title">${escapeHtml(node.name)}</div>`;
    
    if (isInitiative && node.offTrack !== undefined) {
      html += `<div class="tooltip-status ${node.offTrack ? 'off-track' : 'on-track'}"></div>`;
    }
    html += `</div>`;
    
    html += `<div class="tooltip-row"><span class="tooltip-label">Бюджет</span><span class="tooltip-value">${formatBudget(node.value)}</span></div>`;
    
    // Percent of unit (skip for top-level units)
    if (node.depth > 0) {
      // Note: for proper % of unit, we'd need parent value from context
    }
    
    // Percent of total (skip if only one unit selected)
    const showPercentOfTotal = selectedUnitsCount === 0 || selectedUnitsCount > 1;
    if (showPercentOfTotal && totalValue > 0) {
      const percentOfTotal = ((node.value / totalValue) * 100).toFixed(1);
      html += `<div class="tooltip-row"><span class="tooltip-label tooltip-label-group"><span>% от бюджета</span><span class="tooltip-label-sub">выбранного на экране</span></span><span class="tooltip-value">${percentOfTotal}%</span></div>`;
    }
    
    // Quarter metrics for initiatives
    if (isInitiative && node.quarterlyData && lastQuarter) {
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
    
    // Stakeholders
    if (node.stakeholders && node.stakeholders.length > 0) {
      html += `<div class="tooltip-stakeholders">
        <div class="tooltip-stakeholders-label">Стейкхолдеры</div>
        <div class="tooltip-tags">${node.stakeholders.map(s => `<span class="tooltip-tag">${escapeHtml(s)}</span>`).join('')}</div>
      </div>`;
    }
    
    // Hint
    if (node.data.children && node.data.children.length > 0) {
      html += '<div class="tooltip-hint">Кликните для детализации →</div>';
    } else if (isInitiative) {
      html += '<div class="tooltip-hint">Кликните для перехода в таймлайн →</div>';
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
