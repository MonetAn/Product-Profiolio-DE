import { useMemo, useEffect, useRef, useState, useCallback } from 'react';
import { Upload, FileText, Search, ChevronDown, ChevronUp, ExternalLink, Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  RawDataRow,
  calculateBudget,
  calculateTotalBudget,
  timelineVisiblePeriodCost,
  getInitiativeQuarters,
  formatBudgetShort,
  formatBudget,
  rowPassesTimelineFilters,
  isNegligibleTimelineBudgetRub,
  type PreliminaryQuarterBudgetMap,
  type SupportFilter
} from '@/lib/dataManager';
import { DescriptionMarkdown } from '@/components/DescriptionMarkdown';
import { cn } from '@/lib/utils';
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

interface DetailPanelData {
  row: RawDataRow;
  focusQuarter?: string;
}

interface GanttViewProps {
  rawData: RawDataRow[];
  selectedQuarters: string[];
  supportFilter: SupportFilter;
  showOnlyOfftrack: boolean;
  hideStubs?: boolean;
  selectedUnits: string[];
  selectedTeams: string[];
  selectedStakeholders: string[];
  onUploadClick?: () => void;
  highlightedInitiative?: string | null;
  onResetFilters?: () => void;
  /** If false, hide all budget/cost amounts (popups, row costs, cells, legend) */
  showMoney?: boolean;
  /** Super admin preview mode: учитывать предварительные стоимости */
  includePreliminaryData?: boolean;
  preliminaryQuarterBudgetMap?: PreliminaryQuarterBudgetMap;
  // Cost filter props
  costSortOrder?: 'none' | 'asc' | 'desc';
  costFilterMin?: number | null;
  costFilterMax?: number | null;
  costType?: 'period' | 'total';
  /** Quick flow: в закреплённом попапе квартала — правка план/факта и пр. */
  adminOnEditQuarter?: (adminRowId: string, quarter: string) => void;
  /** Quick flow: в закреплённом попапе имени — карточка инициативы */
  adminOnEditInitiativeCard?: (adminRowId: string) => void;
  /** Quick flow только: подсветка сегментов с незаполненными обязательными полями */
  adminTimelineQuarterWarnings?: (adminRowId: string, quarter: string) => string[];
}

const GanttView = ({
  rawData,
  selectedQuarters,
  supportFilter,
  showOnlyOfftrack,
  hideStubs = false,
  selectedUnits,
  selectedTeams,
  selectedStakeholders,
  onUploadClick,
  highlightedInitiative,
  onResetFilters,
  showMoney = true,
  includePreliminaryData = false,
  preliminaryQuarterBudgetMap,
  costSortOrder = 'none',
  costFilterMin = null,
  costFilterMax = null,
  costType = 'period',
  adminOnEditQuarter,
  adminOnEditInitiativeCard,
  adminTimelineQuarterWarnings,
}: GanttViewProps) => {
  const highlightedRef = useRef<HTMLDivElement>(null);
  const unifiedScrollRef = useRef<HTMLDivElement>(null);
  const [quarterPopup, setQuarterPopup] = useState<QuarterPopupData | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const popupRef = useRef<HTMLDivElement>(null);
  const [quarterPopupSize, setQuarterPopupSize] = useState<{ width: number; height: number } | null>(null);

  // Name popup state
  const [namePopup, setNamePopup] = useState<NamePopupData | null>(null);
  const [nameExpandedSections, setNameExpandedSections] = useState<Record<string, boolean>>({});
  const namePopupRef = useRef<HTMLDivElement>(null);
  const [namePopupSize, setNamePopupSize] = useState<{ width: number; height: number } | null>(null);

  const [detailPanel, setDetailPanel] = useState<DetailPanelData | null>(null);
  const detailPanelScrollRef = useRef<HTMLDivElement>(null);
  const focusQuarterRef = useRef<HTMLDivElement>(null);

  const timelineQuarterWarningsForRow = (row: RawDataRow, quarter: string): string[] => {
    if (!adminTimelineQuarterWarnings || !row.adminInitiativeRowId) return [];
    return adminTimelineQuarterWarnings(row.adminInitiativeRowId, quarter);
  };

  const ganttRowKey = (row: RawDataRow) =>
    row.adminInitiativeRowId ?? `${row.unit}|${row.team}|${row.initiative}`;

  const isSameGanttRow = (a: RawDataRow, b: RawDataRow) => ganttRowKey(a) === ganttRowKey(b);

  const isDetailPanelOpenForRow = (row: RawDataRow) =>
    detailPanel != null && isSameGanttRow(detailPanel.row, row);

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
  const timelineFilterOptions = useMemo(
    () => ({
      selectedQuarters,
      supportFilter,
      showOnlyOfftrack,
      hideStubs: hideStubs ?? false,
      selectedUnits,
      selectedTeams,
      selectedStakeholders,
      includePreliminaryData,
      preliminaryQuarterBudgetMap,
      costFilterMin,
      costFilterMax,
      costType,
    }),
    [
      selectedQuarters,
      supportFilter,
      showOnlyOfftrack,
      hideStubs,
      selectedUnits,
      selectedTeams,
      selectedStakeholders,
      includePreliminaryData,
      preliminaryQuarterBudgetMap,
      costFilterMin,
      costFilterMax,
      costType,
    ]
  );

  const filteredData = useMemo(() => {
    const periodCostOpts = { includePreliminaryData, preliminaryQuarterBudgetMap };
    const periodCost = (row: RawDataRow) =>
      timelineVisiblePeriodCost(row, selectedQuarters, periodCostOpts);

    let result = rawData.filter((row) => rowPassesTimelineFilters(row, timelineFilterOptions));

    if (costSortOrder !== 'none') {
      const dir = costSortOrder === 'asc' ? 1 : -1;
      result = [...result].sort((a, b) => {
        const costA = costType === 'period' ? periodCost(a) : calculateTotalBudget(a);
        const costB = costType === 'period' ? periodCost(b) : calculateTotalBudget(b);
        if (costA !== costB) return (costA - costB) * dir;
        const totalA = calculateTotalBudget(a);
        const totalB = calculateTotalBudget(b);
        if (totalA !== totalB) return (totalA - totalB) * dir;
        return (a.initiative || '').localeCompare(b.initiative || '', 'ru');
      });
    }

    // Stubs (placeholders) at the bottom of the timeline
    const stubs = result.filter(row => row.isTimelineStub === true);
    const nonStubs = result.filter(row => row.isTimelineStub !== true);
    result = [...nonStubs, ...stubs];

    return result;
  }, [rawData, timelineFilterOptions, costSortOrder, costType, selectedQuarters, includePreliminaryData, preliminaryQuarterBudgetMap]);

  // Scroll to highlighted initiative
  useEffect(() => {
    if (highlightedInitiative && highlightedRef.current) {
      highlightedRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightedInitiative, filteredData]);

  const quarterWidth = 160;

  const openDetailPanel = useCallback((row: RawDataRow, focusQuarter?: string) => {
    setDetailPanel({ row, focusQuarter });
    setQuarterPopup(null);
    setNamePopup(null);
    setExpandedSections({});
    setNameExpandedSections({});
  }, []);

  const closeDetailPanel = useCallback(() => {
    setDetailPanel(null);
  }, []);

  useEffect(() => {
    if (!detailPanel?.focusQuarter || !focusQuarterRef.current || !detailPanelScrollRef.current) return;
    const frame = requestAnimationFrame(() => {
      focusQuarterRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(frame);
  }, [detailPanel?.row, detailPanel?.focusQuarter]);

  // Name popup handlers
  const handleNameMouseEnter = (e: React.MouseEvent, row: RawDataRow) => {
    if (isDetailPanelOpenForRow(row)) return;
    setNamePopup({
      row,
      x: e.clientX,
      y: e.clientY,
      pinned: false
    });
  };

  const handleNameMouseMove = (e: React.MouseEvent) => {
    setNamePopup(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null);
  };

  const handleNameMouseLeave = () => {
    setNamePopup(null);
  };

  const handleNameClick = (e: React.MouseEvent, row: RawDataRow) => {
    e.stopPropagation();
    if (detailPanel && isSameGanttRow(detailPanel.row, row) && !detailPanel.focusQuarter) {
      closeDetailPanel();
      return;
    }
    openDetailPanel(row);
  };

  const toggleNameSection = (section: string) => {
    setNameExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleSegmentMouseEnter = (e: React.MouseEvent, row: RawDataRow, quarter: string) => {
    if (isDetailPanelOpenForRow(row)) return;
    setQuarterPopup({
      row,
      quarter,
      x: e.clientX,
      y: e.clientY,
      pinned: false
    });
  };

  const handleSegmentMouseMove = (e: React.MouseEvent) => {
    setQuarterPopup((prev) => (prev ? { ...prev, x: e.clientX, y: e.clientY } : null));
  };

  const handleSegmentMouseLeave = () => {
    setQuarterPopup(null);
  };

  const handleSegmentClick = (e: React.MouseEvent, row: RawDataRow, quarter: string) => {
    e.stopPropagation();
    if (adminOnEditQuarter && row.adminInitiativeRowId) {
      adminOnEditQuarter(row.adminInitiativeRowId, quarter);
      setQuarterPopup(null);
      return;
    }
    openDetailPanel(row, quarter);
  };

  const handleQuarterDetailClick = (e: React.MouseEvent, row: RawDataRow, quarter: string) => {
    e.stopPropagation();
    openDetailPanel(row, quarter);
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Empty state
  if (rawData.length === 0) {
    return (
      <div className={cn('gantt-container', detailPanel && 'gantt-container-with-panel')}>
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
    const sheetMin = 320 + selectedQuarters.length * quarterWidth;
    return (
      <div className="gantt-container">
        <div className="gantt-unified-scroll">
          <div
            className="gantt-sheet"
            style={{
              minWidth: sheetMin,
              ['--gantt-timeline-width' as string]: `${selectedQuarters.length * quarterWidth}px`,
            }}
          >
            <div className="gantt-header-sticky">
              <div className="gantt-timeline-row">
                <div className="gantt-header-label">Инициатива</div>
                <div className="gantt-timeline-header">
                  {selectedQuarters.map((q) => (
                    <div key={q} className="gantt-quarter" style={{ minWidth: quarterWidth }}>
                      {q.replace('-', ' ')}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="gantt-empty-state gantt-empty-state--in-sheet">
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
    const adminUnpinnedHover = Boolean(adminOnEditQuarter && !pinned);
    const quarterWarnings =
      adminTimelineQuarterWarnings && row.adminInitiativeRowId
        ? adminTimelineQuarterWarnings(row.adminInitiativeRowId, quarter)
        : [];

    const showPlanFull = !planLong || expandedSections['plan'] || adminUnpinnedHover;
    const showFactFull = !factLong || expandedSections['fact'] || adminUnpinnedHover;
    const showCommentFull = !commentLong || expandedSections['comment'] || adminUnpinnedHover;

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
        className={cn('gantt-quarter-popup', pinned && 'pinned')}
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

        {quarterWarnings.length > 0 ? (
          <div className="gantt-quarter-popup-admin-warnings" role="status">
            {quarterWarnings.map((t, i) => (
              <div key={`${i}-${t}`} className="gantt-quarter-popup-admin-warning-line">
                {t}
              </div>
            ))}
          </div>
        ) : null}

        <div className="gantt-quarter-popup-status">
          <span className={`gantt-quarter-popup-badge ${isSupport ? 'support' : 'development'}`}>
            {isSupport ? 'Support' : 'Development'}
          </span>
          {isOffTrack && (
            <span className="gantt-quarter-popup-badge off-track">Off-track</span>
          )}
        </div>

        {showMoney && (
          <div className="gantt-quarter-popup-budget">
            Бюджет: {formatBudget(qData.budget)}
          </div>
        )}

        {qData.metricPlan && (
          <div className="gantt-quarter-popup-section">
            <div 
              className="gantt-quarter-popup-label expandable-header"
              onClick={() => pinned && planLong && toggleSection('plan')}
            >
              План
              {pinned && planLong && !adminUnpinnedHover && (
                expandedSections['plan'] 
                  ? <ChevronUp size={12} className="expand-icon" />
                  : <ChevronDown size={12} className="expand-icon" />
              )}
            </div>
            <div 
              className={`gantt-quarter-popup-text ${!showPlanFull && planLong ? 'truncated' : ''}`}
            >
              {showPlanFull ? qData.metricPlan : qData.metricPlan.slice(0, 100) + '…'}
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
              {pinned && factLong && !adminUnpinnedHover && (
                expandedSections['fact'] 
                  ? <ChevronUp size={12} className="expand-icon" />
                  : <ChevronDown size={12} className="expand-icon" />
              )}
            </div>
            <div 
              className={`gantt-quarter-popup-text ${!showFactFull && factLong ? 'truncated' : ''}`}
            >
              {showFactFull ? qData.metricFact : qData.metricFact.slice(0, 100) + '…'}
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
              {pinned && commentLong && !adminUnpinnedHover && (
                expandedSections['comment'] 
                  ? <ChevronUp size={12} className="expand-icon" />
                  : <ChevronDown size={12} className="expand-icon" />
              )}
            </div>
            <div 
              className={`gantt-quarter-popup-text ${!showCommentFull && commentLong ? 'truncated' : ''}`}
            >
              {showCommentFull ? qData.comment : qData.comment.slice(0, 100) + '…'}
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

      </div>
    );
  };

  const renderNamePopup = () => {
    if (!namePopup) return null;

    const { row, x, y, pinned } = namePopup;
    const totalCost = calculateTotalBudget(row);
    const periodCost = calculateBudget(row, selectedQuarters, {
      includePreliminaryData,
      preliminaryQuarterBudgetMap,
    });
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

        {showMoney && (
          <div className="gantt-name-popup-costs">
            <span>Всего: {formatBudget(totalCost)}</span>
            {showPeriodCost && (
              <span className="period-cost">За период: {formatBudget(periodCost)}</span>
            )}
          </div>
        )}

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
              <DescriptionMarkdown
                content={nameExpandedSections['description'] || !descriptionLong
                  ? row.description
                  : row.description.slice(0, 450) + '…'}
              />
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


      </div>
    );
  };


  const renderDetailPanel = () => {
    if (!detailPanel) return null;

    const { row, focusQuarter } = detailPanel;
    const totalCost = calculateTotalBudget(row);
    const periodCost = calculateBudget(row, selectedQuarters, {
      includePreliminaryData,
      preliminaryQuarterBudgetMap,
    });
    const allQuarters = getInitiativeQuarters(row);
    const showPeriodCost = selectedQuarters.length < allQuarters.length && periodCost !== totalCost;

    const quartersWithData = selectedQuarters.filter((q) => {
      const qData = row.quarterlyData[q];
      if (!qData) return false;
      if (qData.budget > 0 && !isNegligibleTimelineBudgetRub(qData.budget)) return true;
      return Boolean(
        qData.metricPlan?.trim() ||
          qData.metricFact?.trim() ||
          qData.comment?.trim()
      );
    });

    return (
      <aside className="gantt-detail-panel" aria-label="Детали инициативы">
        <div className="gantt-detail-panel-header">
          <h2 className="gantt-detail-panel-title">{row.initiative}</h2>
          <button
            type="button"
            className="gantt-detail-panel-close"
            onClick={closeDetailPanel}
            aria-label="Закрыть панель"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        <div ref={detailPanelScrollRef} className="gantt-detail-panel-body">
          <div className="gantt-detail-panel-meta">
            {row.unit} › {row.team || 'Без команды'}
          </div>

          {showMoney && (
            <div className="gantt-detail-panel-costs">
              <span>Всего: {formatBudget(totalCost)}</span>
              {showPeriodCost && <span className="period-cost">За период: {formatBudget(periodCost)}</span>}
            </div>
          )}

          {row.description ? (
            <div className="gantt-detail-panel-section">
              <div className="gantt-detail-panel-label">Описание</div>
              <div className="gantt-detail-panel-text gantt-detail-panel-description">
                <DescriptionMarkdown content={row.description} />
              </div>
            </div>
          ) : null}

          {row.stakeholders ? (
            <div className="gantt-detail-panel-section">
              <div className="gantt-detail-panel-label">Стейкхолдеры</div>
              <div className="gantt-detail-panel-tags">
                <span className="gantt-detail-panel-tag">{row.stakeholders}</span>
              </div>
            </div>
          ) : null}

          {!row.isTimelineStub && row.documentationLink?.trim() ? (
            <a
              href={row.documentationLink}
              target="_blank"
              rel="noopener noreferrer"
              className="gantt-detail-panel-doc-link"
            >
              <ExternalLink size={14} aria-hidden />
              Документация
            </a>
          ) : null}

          {quartersWithData.length > 0 ? (
            <div className="gantt-detail-panel-quarters">
              <div className="gantt-detail-panel-label">Кварталы</div>
              {quartersWithData.map((q) => {
                const qData = row.quarterlyData[q]!;
                const isSupport = qData.support;
                const isOffTrack = !qData.onTrack;
                const quarterWarnings = timelineQuarterWarningsForRow(row, q);
                const isFocused = focusQuarter === q;

                return (
                  <div
                    key={q}
                    ref={isFocused ? focusQuarterRef : undefined}
                    className={cn('gantt-detail-quarter', isFocused && 'gantt-detail-quarter-focused')}
                  >
                    <div className="gantt-detail-quarter-head">
                      <span className="gantt-detail-quarter-name">{q.replace('-', ' ')}</span>
                      <div className="gantt-detail-quarter-badges">
                        <span className={`gantt-quarter-popup-badge ${isSupport ? 'support' : 'development'}`}>
                          {isSupport ? 'Support' : 'Development'}
                        </span>
                        {isOffTrack ? (
                          <span className="gantt-quarter-popup-badge off-track">Off-track</span>
                        ) : null}
                      </div>
                    </div>

                    {quarterWarnings.length > 0 ? (
                      <div className="gantt-quarter-popup-admin-warnings" role="status">
                        {quarterWarnings.map((t, i) => (
                          <div key={`${i}-${t}`} className="gantt-quarter-popup-admin-warning-line">
                            {t}
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {showMoney && qData.budget > 0 && !isNegligibleTimelineBudgetRub(qData.budget) ? (
                      <div className="gantt-detail-quarter-budget">Бюджет: {formatBudget(qData.budget)}</div>
                    ) : null}

                    {qData.metricPlan?.trim() ? (
                      <div className="gantt-detail-panel-section">
                        <div className="gantt-detail-panel-sublabel">План</div>
                        <div className="gantt-detail-panel-text">{qData.metricPlan}</div>
                      </div>
                    ) : null}

                    {qData.metricFact?.trim() ? (
                      <div className="gantt-detail-panel-section">
                        <div className="gantt-detail-panel-sublabel">Факт</div>
                        <div className="gantt-detail-panel-text">{qData.metricFact}</div>
                      </div>
                    ) : null}

                    {qData.comment?.trim() ? (
                      <div className="gantt-detail-panel-section">
                        <div className="gantt-detail-panel-sublabel">Комментарий</div>
                        <div className="gantt-detail-panel-text">{qData.comment}</div>
                      </div>
                    ) : null}

                    {adminOnEditQuarter && row.adminInitiativeRowId ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="mt-2 h-8 w-full gap-1.5 text-xs"
                        onClick={() => adminOnEditQuarter(row.adminInitiativeRowId!, q)}
                      >
                        <Pencil className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        Редактировать квартал
                      </Button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}

          {adminOnEditInitiativeCard && row.adminInitiativeRowId ? (
            <div className="gantt-detail-panel-footer">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-8 w-full gap-1.5 text-xs"
                onClick={() => adminOnEditInitiativeCard(row.adminInitiativeRowId!)}
              >
                <Pencil className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Редактировать карточку
              </Button>
            </div>
          ) : null}
        </div>
      </aside>
    );
  };

  const sheetMinWidth = 320 + selectedQuarters.length * quarterWidth;

  return (
    <div className={cn('gantt-container', detailPanel && 'gantt-container-with-panel')}>
      <div className="gantt-main">
      <div className="gantt-unified-scroll" ref={unifiedScrollRef}>
        <div
          className="gantt-sheet"
          style={{
            minWidth: sheetMinWidth,
            ['--gantt-timeline-width' as string]: `${selectedQuarters.length * quarterWidth}px`,
          }}
        >
          <div className="gantt-header-sticky">
            <div className="gantt-timeline-row">
              <div className="gantt-header-label">Инициатива</div>
              <div className="gantt-timeline-header">
                {selectedQuarters.map((q) => (
                  <div key={q} className="gantt-quarter" style={{ minWidth: quarterWidth }}>
                    {q.replace('-', ' ')}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="gantt-rows-block">
        {filteredData.map((row, idx) => {
          const totalCost = calculateTotalBudget(row);
          const periodCost = calculateBudget(row, selectedQuarters, {
            includePreliminaryData,
            preliminaryQuarterBudgetMap,
          });
          const allQuarters = getInitiativeQuarters(row);
          const showPeriodCost = selectedQuarters.length < allQuarters.length && periodCost !== totalCost;
          const isHighlighted = highlightedInitiative === row.initiative;
          const isDetailSelected = isDetailPanelOpenForRow(row);

          return (
            <div 
              key={row.adminInitiativeRowId ?? `${row.unit}|${row.team}|${row.initiative}|${idx}`} 
              ref={isHighlighted ? highlightedRef : null}
              className={cn('gantt-row', isHighlighted && 'highlighted', row.isTimelineStub && 'gantt-row-is-stub', isDetailSelected && 'gantt-row-detail-selected')}
            >
              <div
                className="gantt-row-label gantt-row-label-clickable"
                onClick={(e) => handleNameClick(e, row)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleNameClick(e as unknown as React.MouseEvent, row);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <div 
                  className="gantt-row-name"
                  onMouseEnter={(e) => handleNameMouseEnter(e, row)}
                  onMouseMove={handleNameMouseMove}
                  onMouseLeave={handleNameMouseLeave}
                >
                  {row.initiative}
                </div>
                {!row.isTimelineStub && row.documentationLink?.trim() && (
                  <a
                    href={row.documentationLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="gantt-row-doc-link"
                    aria-label="Открыть документацию в новой вкладке"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink size={12} aria-hidden />
                    Документация
                  </a>
                )}
                <div className="gantt-row-team">{row.unit} › {row.team || 'Без команды'}</div>
                {showMoney && (
                  <div className="gantt-row-costs">
                    <span className="gantt-cost-total">Всего: {formatBudget(totalCost)}</span>
                    {showPeriodCost && (
                      <span className="gantt-cost-period">За выбранный период: {formatBudget(periodCost)}</span>
                    )}
                  </div>
                )}
              </div>
              <div className="gantt-row-timeline" style={{ width: selectedQuarters.length * quarterWidth }}>
                {/* Segment bar row */}
                <div className="gantt-segment-row">
                  {selectedQuarters.map((q, qIdx) => {
                    const qData = row.quarterlyData[q];
                    if (
                      !qData ||
                      qData.budget === 0 ||
                      isNegligibleTimelineBudgetRub(qData.budget)
                    ) {
                      return null;
                    }

                    const isSupport = qData.support;
                    const isOffTrack = !qData.onTrack;
                    const segWarnings = timelineQuarterWarningsForRow(row, q);
                    const segHasIssue = segWarnings.length > 0;

                    return (
                      <div
                        key={q}
                        className={cn(
                          'gantt-segment',
                          isSupport ? 'support' : 'development',
                          isOffTrack && 'off-track',
                          segHasIssue && 'gantt-segment-admin-issue'
                        )}
                        style={{
                          left: qIdx * quarterWidth + 4,
                          width: quarterWidth - 8
                        }}
                        onMouseEnter={(e) => handleSegmentMouseEnter(e, row, q)}
                        onMouseMove={handleSegmentMouseMove}
                        onMouseLeave={handleSegmentMouseLeave}
                        onClick={(e) => handleSegmentClick(e, row, q)}
                      >
                        {showMoney ? formatBudgetShort(qData.budget) : ''}
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
                      <div
                        key={q}
                        role="button"
                        tabIndex={0}
                        className="gantt-quarter-detail gantt-quarter-detail-clickable"
                        style={{ minWidth: quarterWidth }}
                        onClick={(e) => handleQuarterDetailClick(e, row, q)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleQuarterDetailClick(e as unknown as React.MouseEvent, row, q);
                          }
                        }}
                      >
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
        </div>
      </div>

      {renderNamePopup()}
      {renderQuarterPopup()}
      </div>

      {renderDetailPanel()}
    </div>
  );
};

export default GanttView;
