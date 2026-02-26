import { useMemo, useEffect, useRef, useState } from 'react';
import { Upload, FileText, Search, ChevronDown, ChevronUp } from 'lucide-react';
import {
  RawDataRow,
  calculateBudget,
  calculateTotalBudget,
  getInitiativeQuarters,
  isInitiativeSupport,
  isInitiativeOffTrack,
  formatBudgetShort,
  formatBudget
} from '@/lib/dataManager';
import '@/styles/gantt.css';

interface QuarterPopupData {
  row: RawDataRow;
  quarter: string;
  x: number;
  y: number;
  pinned: boolean;
}

interface NamePopupData {
  row: RawDataRow;
  x: number;
  y: number;
  pinned: boolean;
}

interface GanttViewProps {
  rawData: RawDataRow[];
  selectedQuarters: string[];
  hideSupport: boolean;
  showOnlyOfftrack: boolean;
  selectedUnits: string[];
  selectedTeams: string[];
  selectedStakeholders: string[];
  onUploadClick?: () => void;
  highlightedInitiative?: string | null;
  onResetFilters?: () => void;
  // Cost filter props
  costSortOrder?: 'none' | 'asc' | 'desc';
  costFilterMin?: number | null;
  costFilterMax?: number | null;
  costType?: 'period' | 'total';
}

const GanttView = ({
  rawData,
  selectedQuarters,
  hideSupport,
  showOnlyOfftrack,
  selectedUnits,
  selectedTeams,
  selectedStakeholders,
  onUploadClick,
  highlightedInitiative,
  onResetFilters,
  costSortOrder = 'none',
  costFilterMin = null,
  costFilterMax = null,
  costType = 'period'
}: GanttViewProps) => {
  const highlightedRef = useRef<HTMLDivElement>(null);
  const headerTimelineRef = useRef<HTMLDivElement>(null);
  const rowsContainerRef = useRef<HTMLDivElement>(null);
  const [quarterPopup, setQuarterPopup] = useState<QuarterPopupData | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const popupRef = useRef<HTMLDivElement>(null);
  const [quarterPopupSize, setQuarterPopupSize] = useState<{ width: number; height: number } | null>(null);
  
  // Name popup state
  const [namePopup, setNamePopup] = useState<NamePopupData | null>(null);
  const [nameExpandedSections, setNameExpandedSections] = useState<Record<string, boolean>>({});
  const namePopupRef = useRef<HTMLDivElement>(null);
  const [namePopupSize, setNamePopupSize] = useState<{ width: number; height: number } | null>(null);

  // Measure tooltip sizes after render
  useEffect(() => {
    if (popupRef.current && quarterPopup) {
      const rect = popupRef.current.getBoundingClientRect();
      if (!quarterPopupSize || quarterPopupSize.width !== rect.width || quarterPopupSize.height !== rect.height) {
        setQuarterPopupSize({ width: rect.width, height: rect.height });
      }
    }
  }, [quarterPopup, expandedSections]);

  useEffect(() => {
    if (namePopupRef.current && namePopup) {
      const rect = namePopupRef.current.getBoundingClientRect();
      if (!namePopupSize || namePopupSize.width !== rect.width || namePopupSize.height !== rect.height) {
        setNamePopupSize({ width: rect.width, height: rect.height });
      }
    }
  }, [namePopup, nameExpandedSections]);

  // Filter data based on current filters
  const filteredData = useMemo(() => {
    let result = rawData.filter(row => {
      const periodBudget = calculateBudget(row, selectedQuarters);
      if (periodBudget === 0) return false;

      if (hideSupport && isInitiativeSupport(row, selectedQuarters)) return false;
      if (showOnlyOfftrack && !isInitiativeOffTrack(row, selectedQuarters)) return false;
      if (selectedUnits.length > 0 && !selectedUnits.includes(row.unit)) return false;
      if (selectedTeams.length > 0 && !selectedTeams.includes(row.team)) return false;
      if (selectedStakeholders.length > 0 && !selectedStakeholders.includes(row.stakeholders)) return false;

      // Cost filter
      const costValue = costType === 'period' 
        ? periodBudget 
        : calculateTotalBudget(row);
      
      if (costFilterMin !== null && costValue < costFilterMin) return false;
      if (costFilterMax !== null && costValue > costFilterMax) return false;

      return true;
    });

    // Sort by cost if enabled
    if (costSortOrder !== 'none') {
      result = [...result].sort((a, b) => {
        const costA = costType === 'period' 
          ? calculateBudget(a, selectedQuarters) 
          : calculateTotalBudget(a);
        const costB = costType === 'period' 
          ? calculateBudget(b, selectedQuarters) 
          : calculateTotalBudget(b);
        
        return costSortOrder === 'asc' ? costA - costB : costB - costA;
      });
    }

    return result;
  }, [rawData, selectedQuarters, hideSupport, showOnlyOfftrack, selectedUnits, selectedTeams, selectedStakeholders, costSortOrder, costFilterMin, costFilterMax, costType]);

  // Calculate Support/Development budget breakdown
  const { supportTotal, developmentTotal, grandTotal, supportPercent } = useMemo(() => {
    let support = 0;
    let development = 0;
    
    filteredData.forEach(row => {
      selectedQuarters.forEach(q => {
        const qData = row.quarterlyData[q];
        if (qData && qData.budget > 0) {
          if (qData.support) {
            support += qData.budget;
          } else {
            development += qData.budget;
          }
        }
      });
    });
    
    const total = support + development;
    const percent = total > 0 ? Math.round((support / total) * 100) : 0;
    
    return { 
      supportTotal: support, 
      developmentTotal: development, 
      grandTotal: total,
      supportPercent: percent 
    };
  }, [filteredData, selectedQuarters]);

  // Scroll to highlighted initiative
  useEffect(() => {
    if (highlightedInitiative && highlightedRef.current) {
      highlightedRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightedInitiative, filteredData]);

  // Sync horizontal scroll between header and rows
  useEffect(() => {
    const rowsContainer = rowsContainerRef.current;
    const headerTimeline = headerTimelineRef.current;

    if (!rowsContainer || !headerTimeline) return;

    const handleScroll = () => {
      headerTimeline.scrollLeft = rowsContainer.scrollLeft;
    };

    rowsContainer.addEventListener('scroll', handleScroll);
    return () => rowsContainer.removeEventListener('scroll', handleScroll);
  }, []);

  // Close popups on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      // Close quarter popup
      if (quarterPopup?.pinned && popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setQuarterPopup(null);
        setExpandedSections({});
      }
      // Close name popup
      if (namePopup?.pinned && namePopupRef.current && !namePopupRef.current.contains(e.target as Node)) {
        setNamePopup(null);
        setNameExpandedSections({});
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [quarterPopup, namePopup]);

  const quarterWidth = 160;

  // Name popup handlers
  const handleNameMouseEnter = (e: React.MouseEvent, row: RawDataRow) => {
    if (namePopup?.pinned) return;
    setNamePopup({
      row,
      x: e.clientX,
      y: e.clientY,
      pinned: false
    });
  };

  const handleNameMouseMove = (e: React.MouseEvent) => {
    if (namePopup?.pinned) return;
    setNamePopup(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null);
  };

  const handleNameMouseLeave = () => {
    if (namePopup?.pinned) return;
    setNamePopup(null);
  };

  const handleNameClick = (e: React.MouseEvent, row: RawDataRow) => {
    e.stopPropagation();
    setNamePopup({
      row,
      x: e.clientX,
      y: e.clientY,
      pinned: true
    });
    setNameExpandedSections({});
  };

  const toggleNameSection = (section: string) => {
    setNameExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleSegmentMouseEnter = (e: React.MouseEvent, row: RawDataRow, quarter: string) => {
    if (quarterPopup?.pinned) return;
    setQuarterPopup({
      row,
      quarter,
      x: e.clientX,
      y: e.clientY,
      pinned: false
    });
  };

  const handleSegmentMouseMove = (e: React.MouseEvent) => {
    if (quarterPopup?.pinned) return;
    setQuarterPopup(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null);
  };

  const handleSegmentMouseLeave = () => {
    if (quarterPopup?.pinned) return;
    setQuarterPopup(null);
  };

  const handleSegmentClick = (e: React.MouseEvent, row: RawDataRow, quarter: string) => {
    e.stopPropagation();
    setQuarterPopup({
      row,
      quarter,
      x: e.clientX,
      y: e.clientY,
      pinned: true
    });
    setExpandedSections({});
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Empty state
  if (rawData.length === 0) {
    return (
      <div className="gantt-container">
        <div className="gantt-empty-state">
          <div className="gantt-empty-icon">
            <FileText size={32} />
          </div>
          <div className="gantt-empty-text">Нет данных для отображения</div>
          <button className="gantt-empty-btn" onClick={onUploadClick}>
            <Upload size={16} />
            Загрузить CSV
          </button>
        </div>
      </div>
    );
  }

  // No results after filtering
  if (filteredData.length === 0) {
    return (
      <div className="gantt-container">
        <div className="gantt-header">
          <div className="gantt-timeline-row">
            <div className="gantt-header-label">Инициатива</div>
            <div className="gantt-timeline-header" ref={headerTimelineRef}>
              {selectedQuarters.map(q => (
                <div key={q} className="gantt-quarter" style={{ minWidth: quarterWidth }}>{q.replace('-', ' ')}</div>
              ))}
            </div>
          </div>
        </div>
        <div className="gantt-empty-state">
          <div className="gantt-empty-icon">
            <Search size={32} />
          </div>
          <div className="gantt-empty-text">Нет инициатив по выбранным фильтрам</div>
          {onResetFilters && (
            <button 
              onClick={onResetFilters}
              className="mt-4 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 transition-colors"
            >
              Сбросить фильтры
            </button>
          )}
        </div>
      </div>
    );
  }

  const renderQuarterPopup = () => {
    if (!quarterPopup) return null;

    const { row, quarter, x, y, pinned } = quarterPopup;
    const qData = row.quarterlyData[quarter];
    if (!qData) return null;

    const isSupport = qData.support;
    const isOffTrack = !qData.onTrack;
    const planLong = qData.metricPlan && qData.metricPlan.length > 100;
    const factLong = qData.metricFact && qData.metricFact.length > 100;
    const commentLong = qData.comment && qData.comment.length > 100;

    // Dynamic sizing: use measured size or fallback
    const padding = 16;
    const tooltipWidth = quarterPopupSize?.width || 360;
    const tooltipHeight = quarterPopupSize?.height || 400;

    let posX: number;
    let posY: number;

    if (typeof window !== 'undefined') {
      // Horizontal: try right first, flip to left if doesn't fit
      const fitsOnRight = x + padding + tooltipWidth <= window.innerWidth - padding;
      if (fitsOnRight) {
        posX = x + padding; // Right of cursor
      } else {
        posX = x - tooltipWidth - padding; // Left of cursor
      }
      // Clamp to viewport
      posX = Math.max(padding, Math.min(posX, window.innerWidth - tooltipWidth - padding));

      // Vertical: try below first, flip to above if doesn't fit
      const fitsBelow = y + padding + tooltipHeight <= window.innerHeight - padding;
      if (fitsBelow) {
        posY = y + padding; // Below cursor
      } else {
        posY = y - tooltipHeight - padding; // Above cursor
      }
      // Clamp to viewport
      posY = Math.max(padding, Math.min(posY, window.innerHeight - tooltipHeight - padding));
    } else {
      posX = x + padding;
      posY = y + padding;
    }

    return (
      <div
        ref={popupRef}
        className={`gantt-quarter-popup ${pinned ? 'pinned' : ''}`}
        style={{
          left: posX,
          top: posY,
          pointerEvents: pinned ? 'auto' : 'none'
        }}
      >
        <div className="gantt-quarter-popup-header">
          <div className="gantt-quarter-popup-title">{row.initiative}</div>
          <div className="gantt-quarter-popup-quarter">{quarter.replace('-', ' ')}</div>
        </div>

        <div className="gantt-quarter-popup-status">
          <span className={`gantt-quarter-popup-badge ${isSupport ? 'support' : 'development'}`}>
            {isSupport ? 'Support' : 'Development'}
          </span>
          {isOffTrack && (
            <span className="gantt-quarter-popup-badge off-track">Off-track</span>
          )}
        </div>

        <div className="gantt-quarter-popup-budget">
          Бюджет: {formatBudget(qData.budget)}
        </div>

        {qData.metricPlan && (
          <div className="gantt-quarter-popup-section">
            <div 
              className="gantt-quarter-popup-label expandable-header"
              onClick={() => pinned && planLong && toggleSection('plan')}
            >
              План
              {pinned && planLong && (
                expandedSections['plan'] 
                  ? <ChevronUp size={12} className="expand-icon" />
                  : <ChevronDown size={12} className="expand-icon" />
              )}
            </div>
            <div 
              className={`gantt-quarter-popup-text ${!expandedSections['plan'] && planLong ? 'truncated' : ''}`}
            >
              {expandedSections['plan'] || !planLong 
                ? qData.metricPlan 
                : qData.metricPlan.slice(0, 100) + '…'}
            </div>
          </div>
        )}

        {qData.metricFact && (
          <div className="gantt-quarter-popup-section">
            <div 
              className="gantt-quarter-popup-label expandable-header"
              onClick={() => pinned && factLong && toggleSection('fact')}
            >
              Факт
              {pinned && factLong && (
                expandedSections['fact'] 
                  ? <ChevronUp size={12} className="expand-icon" />
                  : <ChevronDown size={12} className="expand-icon" />
              )}
            </div>
            <div 
              className={`gantt-quarter-popup-text ${!expandedSections['fact'] && factLong ? 'truncated' : ''}`}
            >
              {expandedSections['fact'] || !factLong 
                ? qData.metricFact 
                : qData.metricFact.slice(0, 100) + '…'}
            </div>
          </div>
        )}

        {qData.comment && (
          <div className="gantt-quarter-popup-section">
            <div 
              className="gantt-quarter-popup-label expandable-header"
              onClick={() => pinned && commentLong && toggleSection('comment')}
            >
              Комментарий
              {pinned && commentLong && (
                expandedSections['comment'] 
                  ? <ChevronUp size={12} className="expand-icon" />
                  : <ChevronDown size={12} className="expand-icon" />
              )}
            </div>
            <div 
              className={`gantt-quarter-popup-text ${!expandedSections['comment'] && commentLong ? 'truncated' : ''}`}
            >
              {expandedSections['comment'] || !commentLong 
                ? qData.comment 
                : qData.comment.slice(0, 100) + '…'}
            </div>
          </div>
        )}

        {row.stakeholders && (
          <div className="gantt-quarter-popup-section">
            <div className="gantt-quarter-popup-label">Стейкхолдеры</div>
            <div className="gantt-quarter-popup-stakeholders">
              <span className="gantt-quarter-popup-tag">{row.stakeholders}</span>
            </div>
          </div>
        )}

        {!pinned && (
          <div className="gantt-name-popup-hint">
            Кликните для детального просмотра
          </div>
        )}
      </div>
    );
  };

  const renderNamePopup = () => {
    if (!namePopup) return null;

    const { row, x, y, pinned } = namePopup;
    const totalCost = calculateTotalBudget(row);
    const periodCost = calculateBudget(row, selectedQuarters);
    const allQuarters = getInitiativeQuarters(row);
    const showPeriodCost = selectedQuarters.length < allQuarters.length && periodCost !== totalCost;
    const descriptionLong = row.description && row.description.length > 450;

    // Dynamic sizing: use measured size or fallback
    const padding = 16;
    const tooltipWidth = namePopupSize?.width || 360;
    const tooltipHeight = namePopupSize?.height || 400;

    let posX: number;
    let posY: number;

    if (typeof window !== 'undefined') {
      // Horizontal: try right first, flip to left if doesn't fit
      const fitsOnRight = x + padding + tooltipWidth <= window.innerWidth - padding;
      if (fitsOnRight) {
        posX = x + padding; // Right of cursor
      } else {
        posX = x - tooltipWidth - padding; // Left of cursor
      }
      // Clamp to viewport
      posX = Math.max(padding, Math.min(posX, window.innerWidth - tooltipWidth - padding));

      // Vertical: try below first, flip to above if doesn't fit
      const fitsBelow = y + padding + tooltipHeight <= window.innerHeight - padding;
      if (fitsBelow) {
        posY = y + padding; // Below cursor
      } else {
        posY = y - tooltipHeight - padding; // Above cursor
      }
      // Clamp to viewport
      posY = Math.max(padding, Math.min(posY, window.innerHeight - tooltipHeight - padding));
    } else {
      posX = x + padding;
      posY = y + padding;
    }

    return (
      <div
        ref={namePopupRef}
        className={`gantt-name-popup ${pinned ? 'pinned' : ''}`}
        style={{
          left: posX,
          top: posY,
          pointerEvents: pinned ? 'auto' : 'none'
        }}
      >
        <div className="gantt-name-popup-title">{row.initiative}</div>
        
        <div className="gantt-name-popup-unit">{row.unit}</div>

        <div className="gantt-name-popup-costs">
          <span>Всего: {formatBudget(totalCost)}</span>
          {showPeriodCost && (
            <span className="period-cost">За период: {formatBudget(periodCost)}</span>
          )}
        </div>

        {row.description && (
          <div 
            className={`gantt-name-popup-section ${pinned && descriptionLong ? 'clickable' : ''}`}
            onClick={() => pinned && descriptionLong && toggleNameSection('description')}
          >
            <div className="gantt-name-popup-label expandable-header">
              Описание
              {pinned && descriptionLong && (
                nameExpandedSections['description'] 
                  ? <ChevronUp size={12} className="expand-icon" />
                  : <ChevronDown size={12} className="expand-icon" />
              )}
            </div>
            <div 
              className={`gantt-name-popup-text ${!nameExpandedSections['description'] && descriptionLong ? 'truncated' : ''} ${nameExpandedSections['description'] ? 'expanded' : ''}`}
            >
              {nameExpandedSections['description'] || !descriptionLong 
                ? row.description 
                : row.description.slice(0, 450) + '…'}
            </div>
          </div>
        )}

        {row.stakeholders && (
          <div className="gantt-name-popup-section">
            <div className="gantt-name-popup-label">Стейкхолдеры</div>
            <div className="gantt-name-popup-stakeholders">
              <span className="gantt-name-popup-tag">{row.stakeholders}</span>
            </div>
          </div>
        )}

        {!pinned && (
          <div className="gantt-name-popup-hint">
            Кликните для детального просмотра
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="gantt-container">
      {/* Header with quarter columns */}
      <div className="gantt-header">
        <div className="gantt-timeline-row">
          <div className="gantt-header-label">Инициатива</div>
          <div className="gantt-timeline-header" ref={headerTimelineRef}>
            {selectedQuarters.map(q => (
              <div key={q} className="gantt-quarter" style={{ minWidth: quarterWidth }}>{q.replace('-', ' ')}</div>
            ))}
          </div>
        </div>
      </div>

      {/* Rows */}
      <div className="gantt-rows" ref={rowsContainerRef}>
        {filteredData.map((row, idx) => {
          const totalCost = calculateTotalBudget(row);
          const periodCost = calculateBudget(row, selectedQuarters);
          const allQuarters = getInitiativeQuarters(row);
          const showPeriodCost = selectedQuarters.length < allQuarters.length && periodCost !== totalCost;
          const isHighlighted = highlightedInitiative === row.initiative;

          return (
            <div 
              key={idx} 
              ref={isHighlighted ? highlightedRef : null}
              className={`gantt-row ${isHighlighted ? 'highlighted' : ''}`}
            >
              <div className="gantt-row-label">
                <div 
                  className="gantt-row-name"
                  onMouseEnter={(e) => handleNameMouseEnter(e, row)}
                  onMouseMove={handleNameMouseMove}
                  onMouseLeave={handleNameMouseLeave}
                  onClick={(e) => handleNameClick(e, row)}
                >
                  {row.initiative}
                </div>
                <div className="gantt-row-team">{row.unit} › {row.team || 'Без команды'}</div>
                <div className="gantt-row-costs">
                  <span className="gantt-cost-total">Всего: {formatBudget(totalCost)}</span>
                  {showPeriodCost && (
                    <span className="gantt-cost-period">За выбранный период: {formatBudget(periodCost)}</span>
                  )}
                </div>
              </div>
              <div className="gantt-row-timeline" style={{ width: selectedQuarters.length * quarterWidth }}>
                {/* Segment bar row */}
                <div className="gantt-segment-row">
                  {selectedQuarters.map((q, qIdx) => {
                    const qData = row.quarterlyData[q];
                    if (!qData || qData.budget === 0) return null;

                    const isSupport = qData.support;
                    const isOffTrack = !qData.onTrack;

                    return (
                      <div
                        key={q}
                        className={`gantt-segment ${isSupport ? 'support' : 'development'} ${isOffTrack ? 'off-track' : ''}`}
                        style={{
                          left: qIdx * quarterWidth + 4,
                          width: quarterWidth - 8
                        }}
                        onMouseEnter={(e) => handleSegmentMouseEnter(e, row, q)}
                        onMouseMove={handleSegmentMouseMove}
                        onMouseLeave={handleSegmentMouseLeave}
                        onClick={(e) => handleSegmentClick(e, row, q)}
                      >
                        {formatBudgetShort(qData.budget)}
                      </div>
                    );
                  })}
                </div>
                
                {/* Quarter details row - shortened */}
                <div className="gantt-quarter-details">
                  {selectedQuarters.map((q) => {
                    const qData = row.quarterlyData[q];
                    if (!qData || qData.budget === 0) {
                      return <div key={q} className="gantt-quarter-detail" style={{ minWidth: quarterWidth }} />;
                    }

                    const hasPlan = qData.metricPlan && qData.metricPlan.trim();
                    const hasFact = qData.metricFact && qData.metricFact.trim();
                    const hasComment = qData.comment && qData.comment.trim();

                    if (!hasPlan && !hasFact && !hasComment) {
                      return <div key={q} className="gantt-quarter-detail" style={{ minWidth: quarterWidth }} />;
                    }

                    return (
                      <div key={q} className="gantt-quarter-detail" style={{ minWidth: quarterWidth }}>
                        <div className="gantt-quarter-detail-content">
                          {hasPlan && (
                            <span className="detail-value" title={qData.metricPlan}>
                              <span className="detail-label">П:</span> {qData.metricPlan?.slice(0, 20)}{qData.metricPlan && qData.metricPlan.length > 20 ? '...' : ''}
                            </span>
                          )}
                          {hasFact && (
                            <span className="detail-value" title={qData.metricFact}>
                              <span className="detail-label">Ф:</span> {qData.metricFact?.slice(0, 20)}{qData.metricFact && qData.metricFact.length > 20 ? '...' : ''}
                            </span>
                          )}
                          {hasComment && (
                            <span className="detail-value" title={qData.comment}>
                              <span className="detail-label">К:</span> {qData.comment?.slice(0, 20)}{qData.comment && qData.comment.length > 20 ? '...' : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Name popup */}
      {renderNamePopup()}

      {/* Quarter detail popup */}
      {renderQuarterPopup()}

      {/* Legend */}
      <div className="gantt-legend">
        <div className="gantt-legend-item">
          <div className="gantt-legend-color development"></div>
          <span>Development</span>
        </div>
        <div className="gantt-legend-item">
          <div className="gantt-legend-color support"></div>
          <span>Support</span>
        </div>
        <div className="gantt-legend-item">
          <div className="gantt-legend-color hatched"></div>
          <span>Off-track</span>
        </div>
        
        {/* Budget statistics */}
        <div className="gantt-legend-divider" />
        <div className="gantt-legend-stats">
          <span className="gantt-legend-stats-total">Итого: {formatBudget(grandTotal)}</span>
          <span className="gantt-legend-stats-development">
            Development: {formatBudget(developmentTotal)} ({100 - supportPercent}%)
          </span>
          <span className="gantt-legend-stats-support">
            Support: {formatBudget(supportTotal)} ({supportPercent}%)
          </span>
        </div>
      </div>
    </div>
  );
};

export default GanttView;
