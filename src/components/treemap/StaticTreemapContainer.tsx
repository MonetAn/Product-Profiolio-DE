// Статичный тримап (слайдовая раскладка) — отдельно от динамического TreemapContainer.

import { useRef, useState, useCallback, useEffect, useLayoutEffect, useMemo, type CSSProperties } from 'react';
import { ArrowUp, Upload, FileText, Search } from 'lucide-react';
import StaticTreemapNode from './StaticTreemapNode';
import TreemapTooltip from './TreemapTooltip';
import { useStaticTreemapLayout } from './useStaticTreemapLayout';
import { TreemapLayoutNode, ColorGetter } from './types';
import type { StaticTreemapLayoutStrategy } from './useStaticTreemapLayout';
import type { TreeNode } from '@/lib/dataManager';
import { getSubtreeValue } from '@/lib/dataManager';
import { normalizeTreemapFocusPath, splitTreemapEncodedPath } from '@/lib/treemapPathCodec';
import '@/styles/treemap.css';

export interface StaticTreemapContainerProps {
  data: TreeNode;
  showTeams?: boolean;
  showInitiatives?: boolean;
  onNodeClick?: (node: TreeNode) => void;
  onNavigateBack?: () => void;
  canNavigateBack?: boolean;
  onInitiativeClick?: (initiativeName: string, path: string) => void;
  /** Если задано, клик по листу с adminInitiativeRowId открывает обзор вместо стандартного peek (quick flow). */
  onAdminInitiativeRowClick?: (rowId: string, node: TreeNode) => void;
  selectedQuarters?: string[];
  hasData?: boolean;
  onResetFilters?: () => void;
  selectedUnitsCount?: number;
  clickedNodeName?: string | null;
  getColor?: ColorGetter;
  emptyStateTitle?: string;
  emptyStateSubtitle?: string;
  /** false — не показывать кнопку «Сбросить фильтры» в заглушке при hasData (например старт «Кластеры») */
  emptyStateShowResetButton?: boolean;
  showUploadButton?: boolean;
  onUploadClick?: () => void;
  onFileDrop?: (file: File) => void;
  extraDepth?: number;
  onAutoEnableUnits?: () => void;
  onAutoEnableTeams?: () => void;
  onAutoEnableInitiatives?: () => void;
  onAutoDisableUnits?: () => void;
  onAutoDisableTeams?: () => void;
  onAutoDisableInitiatives?: () => void;
  onFocusedPathChange?: (path: string[]) => void;
  resetZoomTrigger?: number;
  initialFocusedPath?: string[];
  /** When switching to this tab (viewKey changes), show treemap with no animation and text immediately */
  viewKey?: string;
  /** If false, tooltip does not show "Распределение бюджета" block (e.g. for Stakeholders treemap) */
  showDistributionInTooltip?: boolean;
  /** If false, only percentages are shown on cells (no money) */
  showMoney?: boolean;
  /** When this key changes (e.g. support/off-track/stub filter), use same animation as filter toggle (smooth rebuild) */
  contentKey?: string;
  /** Quick flow treemap: упрощённый тултип листа (описание + документация) */
  tooltipInitiativeVariant?: 'default' | 'descriptionDocReview';
  /** Каталог кварталов матрицы: если выбраны все, в тултипе quick review не показываем уточнение «за выбранный период». */
  treemapQuarterCatalog?: string[];
  /** Курсор над ячейками (например `default`, если тремап только для просмотра). */
  nodeCursor?: CSSProperties['cursor'];
  /** Показывать предупреждение о предварительных данных в тултипе инициативы */
  showPreliminaryWarnings?: boolean;
  /**
   * Админ-превью (матрица усилий): без exit-анимации при смене данных + изолированный фон под плитками,
   * чтобы удалённые ячейки не просвечивали в щелях между прямоугольниками.
   */
  linkDragOverId?: string | null;
  onInitiativeLinkDragStart?: (initiativeId: string) => void;
  onInitiativeLinkDragEnter?: (initiativeId: string) => void;
  onInitiativeLinkDragLeave?: () => void;
  onInitiativeLinkDrop?: (sourceId: string, targetId: string) => void;
  treemapLayoutStrategy?: StaticTreemapLayoutStrategy;
  /** Подсветка выбранной инициативы (режим «Связать»). */
  selectedInitiativeId?: string | null;
  /** Явная глубина рендера (обзор кросс-инициатив); иначе считается из showTeams/showInitiatives. */
  maxRenderDepth?: number;
  /** Не включать команды/инициативы автоматически при клике (управление снаружи). */
  disableAutoEnableLevels?: boolean;
  /** Объединение: кросс-инициативы инициативы в тултипе (по adminInitiativeRowId). */
  getInitiativeCrossNames?: (initiativeRowId: string) => string[];
  /** Объединение: участники кросс-инициативы в тултипе плитки. */
  getCrossInitiativeTooltipMembers?: (
    crossInitiativeId: string
  ) => { initiativeName: string; team: string }[];
  /** Управляемый зум (обзор кросс-инициатив). */
  focusedPath?: string[];
  /** Клик по плитке кросс-инициативы (до зума). */
  onCrossInitiativeClick?: (crossId: string) => void;
}

const StaticTreemapContainer = ({
  data,
  showTeams = false,
  showInitiatives = false,
  onNodeClick,
  onNavigateBack,
  canNavigateBack = false,
  onInitiativeClick,
  onAdminInitiativeRowClick,
  selectedQuarters = [],
  hasData = false,
  onResetFilters,
  selectedUnitsCount = 0,
  getColor,
  emptyStateTitle = 'Нет инициатив по выбранным фильтрам',
  emptyStateSubtitle = 'Попробуйте изменить параметры фильтрации или сбросить фильтры',
  emptyStateShowResetButton = true,
  showUploadButton = false,
  onUploadClick,
  onFileDrop,
  extraDepth = 0,
  onAutoEnableUnits,
  onAutoEnableTeams,
  onAutoEnableInitiatives,
  onAutoDisableUnits,
  onAutoDisableTeams,
  onAutoDisableInitiatives,
  onFocusedPathChange,
  resetZoomTrigger,
  initialFocusedPath,
  viewKey,
  showDistributionInTooltip = true,
  showMoney = true,
  contentKey,
  tooltipInitiativeVariant = 'default',
  treemapQuarterCatalog,
  nodeCursor = 'pointer',
  showPreliminaryWarnings = false,
  linkDragOverId = null,
  onInitiativeLinkDragStart,
  onInitiativeLinkDragEnter,
  onInitiativeLinkDragLeave,
  onInitiativeLinkDrop,
  treemapLayoutStrategy = 'semantic-units',
  selectedInitiativeId = null,
  maxRenderDepth: maxRenderDepthProp,
  disableAutoEnableLevels = false,
  getInitiativeCrossNames,
  getCrossInitiativeTooltipMembers,
  focusedPath: focusedPathProp,
  onCrossInitiativeClick,
}: StaticTreemapContainerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [isDropHovering, setIsDropHovering] = useState(false);
  const dropCounterRef = useRef(0);

  const isFocusedPathControlled = focusedPathProp !== undefined;
  const [internalFocusedPath, setInternalFocusedPath] = useState<string[]>(
    initialFocusedPath ?? []
  );
  const focusedPath = isFocusedPathControlled ? (focusedPathProp ?? []) : internalFocusedPath;

  const applyFocusedPath = useCallback(
    (path: string[], options?: { syncFilters?: boolean }) => {
      if (!isFocusedPathControlled) {
        setInternalFocusedPath(path);
      }
      if (options?.syncFilters !== false) {
        onFocusedPathChange?.(path);
      }
    },
    [isFocusedPathControlled, onFocusedPathChange]
  );

  // Tooltip state with race condition prevention using depth priority
  const [tooltipData, setTooltipData] = useState<{
    node: TreemapLayoutNode;
    position: { x: number; y: number };
  } | null>(null);
  const hoveredNodeRef = useRef<TreemapLayoutNode | null>(null);
  const hoveredDepthRef = useRef<number>(-1);
  const tooltipTimeoutRef = useRef<number | null>(null);
  
  const isEmpty = !data.children || data.children.length === 0;
  const lastQuarter = selectedQuarters.length > 0 ? selectedQuarters[selectedQuarters.length - 1] : null;

  const docReviewShowCostPeriodNote = useMemo(() => {
    if (!treemapQuarterCatalog?.length) return true;
    if (selectedQuarters.length !== treemapQuarterCatalog.length) return true;
    const sel = new Set(selectedQuarters);
    return !treemapQuarterCatalog.every((q) => sel.has(q));
  }, [selectedQuarters, treemapQuarterCatalog]);

  // Сброс зума только при смене корня дерева (не при Sensitive / фильтре строк)
  const dataRootRef = useRef(data.name);
  useEffect(() => {
    if (dataRootRef.current !== data.name) {
      dataRootRef.current = data.name;
      applyFocusedPath(initialFocusedPath ?? [], { syncFilters: false });
    }
  }, [data.name, initialFocusedPath, applyFocusedPath]);

  const prevInitialFocusedRef = useRef(initialFocusedPath);
  useEffect(() => {
    if (isFocusedPathControlled) return;
    const ext = initialFocusedPath ?? [];
    const prev = prevInitialFocusedRef.current ?? [];
    if (ext.join('/') !== prev.join('/')) {
      prevInitialFocusedRef.current = ext;
      setInternalFocusedPath(ext);
    }
  }, [initialFocusedPath, isFocusedPathControlled]);
  
  // Reset focusedPath when manual filters trigger a reset
  const prevResetTriggerRef = useRef(resetZoomTrigger);
  useEffect(() => {
    if (resetZoomTrigger !== undefined && resetZoomTrigger !== prevResetTriggerRef.current) {
      prevResetTriggerRef.current = resetZoomTrigger;
      applyFocusedPath(initialFocusedPath ?? [], { syncFilters: false });
    }
  }, [resetZoomTrigger, initialFocusedPath, applyFocusedPath]);



  const targetRenderDepth = useMemo(() => {
    if (maxRenderDepthProp !== undefined) {
      return maxRenderDepthProp + extraDepth;
    }
    let depth = 1; // Units only
    if (showTeams && showInitiatives) depth = 3; // Unit > Team > Initiative
    else if (showTeams) depth = 2; // Unit > Team
    else if (showInitiatives) depth = 2; // Unit > Initiative (teams skipped in data)
    depth = Math.max(depth, focusedPath.length + 1);
    return depth + extraDepth;
  }, [showTeams, showInitiatives, extraDepth, focusedPath.length, maxRenderDepthProp]);

  const layoutNodes = useStaticTreemapLayout({
    data,
    dimensions,
    getColor,
    extraDepth,
    focusedPath,
    maxRenderDepth: targetRenderDepth,
    layoutStrategy: treemapLayoutStrategy,
  });

  // Clear tooltip when layout or filters change so it doesn't stay visible after re-layouts
  useEffect(() => {
    if (tooltipTimeoutRef.current !== null) {
      clearTimeout(tooltipTimeoutRef.current);
      tooltipTimeoutRef.current = null;
    }
    hoveredNodeRef.current = null;
    hoveredDepthRef.current = -1;
    setTooltipData(null);
  }, [layoutNodes, contentKey, showTeams, showInitiatives, focusedPath]);

  // Measure container synchronously to avoid flash
  useLayoutEffect(() => {
    if (!containerRef.current) return;
    
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({ width: rect.width, height: rect.height });
      }
    };
    
    // Sync measurement before paint
    updateDimensions();
    
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(updateDimensions);
    });
    
    resizeObserver.observe(containerRef.current);
    
    return () => resizeObserver.disconnect();
  }, [viewKey]);

  const renderDepth = targetRenderDepth;

  const handleNodeClick = useCallback((node: TreemapLayoutNode) => {
    // Quick flow review: полный обзор по строке админ-таблицы
    if (
      node.data.isInitiative &&
      node.data.adminInitiativeRowId &&
      onAdminInitiativeRowClick
    ) {
      onAdminInitiativeRowClick(node.data.adminInitiativeRowId, node.data);
      return;
    }

    // Initiative click → open peek modal (parent may navigate to Gantt from there)
    if (node.data.isInitiative && onInitiativeClick) {
      onInitiativeClick(node.data.name, node.path);
      return;
    }
    
    // If node is a non-leaf (unit/team/stakeholder), zoom into it
    const isNonLeaf = node.data.isUnit || node.data.isTeam || node.data.isStakeholder;
    
    if (isNonLeaf) {
      if (node.data.isCrossInitiative && node.data.crossInitiativeId) {
        onCrossInitiativeClick?.(node.data.crossInitiativeId);
      }
      if (!disableAutoEnableLevels) {
        if (node.data.isCrossInitiative) {
          onAutoEnableUnits?.();
        } else if (node.data.isUnit || node.data.isStakeholder) {
          onAutoEnableTeams?.();
        } else if (node.data.isTeam) {
          onAutoEnableInitiatives?.();
        }
      }

      const newFocusedPath = normalizeTreemapFocusPath(
        data,
        splitTreemapEncodedPath(node.path)
      );
      applyFocusedPath(newFocusedPath);
    }
  }, [
    onInitiativeClick,
    onAdminInitiativeRowClick,
    onAutoEnableUnits,
    onAutoEnableTeams,
    onAutoEnableInitiatives,
    onCrossInitiativeClick,
    applyFocusedPath,
    disableAutoEnableLevels,
  ]);
  
  // Navigate back handler — zoom out one level with symmetric auto-disable
  const handleNavigateBack = useCallback(() => {
    if (focusedPath.length > 0) {
      const oldLength = focusedPath.length;
      const newPath = focusedPath.slice(0, -1);
      const newLength = newPath.length;

      if (oldLength >= 3 && newLength < 3) {
        onAutoDisableInitiatives?.();
      }
      if (oldLength >= 2 && newLength < 2) {
        onAutoDisableTeams?.();
      }
      if (oldLength >= 1 && newLength < 1) {
        onAutoDisableUnits?.();
      }

      applyFocusedPath(newPath);
    } else if (onNavigateBack) {
      onNavigateBack();
    }
  }, [
    focusedPath,
    onNavigateBack,
    applyFocusedPath,
    onAutoDisableUnits,
    onAutoDisableTeams,
    onAutoDisableInitiatives,
  ]);

  
  const canZoomOut = focusedPath.length > 0 || canNavigateBack;

  // Total value of currently visible area (for % on squares and tooltip). When zoomed, use focused subtree; else sum of top-level nodes.
  const totalValue = useMemo(
    () =>
      focusedPath.length > 0
        ? getSubtreeValue(data, focusedPath)
        : layoutNodes.reduce((sum, n) => sum + n.value, 0),
    [data, focusedPath, layoutNodes]
  );
  
  // Tooltip handlers
  const handleMouseEnter = useCallback((e: React.MouseEvent, node: TreemapLayoutNode) => {
    hoveredNodeRef.current = node;
    hoveredDepthRef.current = node.depth;

    setTooltipData(prev => (prev && prev.node.key !== node.key ? null : prev));
    
    if (tooltipTimeoutRef.current !== null) {
      clearTimeout(tooltipTimeoutRef.current);
    }
    
    tooltipTimeoutRef.current = window.setTimeout(() => {
      if (hoveredNodeRef.current === node) {
        setTooltipData({
          node,
          position: { x: e.clientX, y: e.clientY },
        });
      }
      tooltipTimeoutRef.current = null;
    }, 5);
  }, []);
  
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setTooltipData(prev => {
      if (!prev) return null;
      if (!hoveredNodeRef.current) return null;
      if (prev.node.key !== hoveredNodeRef.current.key) return null;
      return { ...prev, position: { x: e.clientX, y: e.clientY } };
    });
  }, []);
  
  const handleMouseLeave = useCallback((node?: TreemapLayoutNode) => {
    if (tooltipTimeoutRef.current !== null) {
      clearTimeout(tooltipTimeoutRef.current);
      tooltipTimeoutRef.current = null;
    }
    
    if (node) {
      if (hoveredNodeRef.current?.key === node.key) {
        hoveredNodeRef.current = null;
        hoveredDepthRef.current = -1;
        setTooltipData(null);
      }
      return;
    }
    
    hoveredNodeRef.current = null;
    hoveredDepthRef.current = -1;
    setTooltipData(null);
  }, []);
  
  // Drop zone handlers
  const handleDropZoneDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dropCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDropHovering(true);
    }
  }, []);

  const handleDropZoneDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dropCounterRef.current--;
    if (dropCounterRef.current === 0) {
      setIsDropHovering(false);
    }
  }, []);

  const handleDropZoneDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDropZoneDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDropHovering(false);
    dropCounterRef.current = 0;

    const file = e.dataTransfer.files?.[0];
    if (file && onFileDrop) {
      onFileDrop(file);
    }
  }, [onFileDrop]);

  return (
    <div className="treemap-container" ref={containerRef} onMouseLeave={() => handleMouseLeave()}>
      {/* Navigate back button */}
      <button
        className={`navigate-back-button ${canZoomOut ? 'visible' : ''}`}
        onClick={handleNavigateBack}
        title="Подняться на уровень выше"
      >
        <ArrowUp size={28} strokeWidth={2.5} />
      </button>
      
      {/* Tooltip */}
      <TreemapTooltip
        data={tooltipData}
        lastQuarter={lastQuarter}
        selectedUnitsCount={selectedUnitsCount}
        totalValue={totalValue}
        showDistributionInTooltip={showDistributionInTooltip}
        showMoney={showMoney}
        tooltipInitiativeVariant={tooltipInitiativeVariant}
        docReviewShowCostPeriodNote={docReviewShowCostPeriodNote}
        showPreliminaryWarnings={showPreliminaryWarnings}
        getInitiativeCrossNames={getInitiativeCrossNames}
        getCrossInitiativeTooltipMembers={getCrossInitiativeTooltipMembers}
      />
      
      {!isEmpty && dimensions.width > 0 && (
        <div
          key={`${contentKey ?? 'treemap'}|${focusedPath.join('/')}|d${renderDepth}`}
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            minHeight: 0,
            isolation: 'isolate',
            backgroundColor: 'hsl(var(--card))',
          }}
        >
          {layoutNodes.map((node) => (
            <StaticTreemapNode
              key={`${node.key}|d${renderDepth}`}
              node={node}
              focusedPath={focusedPath}
              onClick={handleNodeClick}
              onMouseEnter={handleMouseEnter}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              showChildren
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
      )}
      
      {/* Empty state: No initiatives for selected filters */}
      {isEmpty && hasData && (
        <div className="welcome-empty-state">
          <div className="welcome-icon">
            <Search size={60} />
          </div>
          <h1 className="welcome-title">{emptyStateTitle}</h1>
          <p className="welcome-subtitle">{emptyStateSubtitle}</p>
          {emptyStateShowResetButton && onResetFilters && (
            <button 
              onClick={onResetFilters}
              className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 transition-colors"
            >
              Сбросить фильтры
            </button>
          )}
        </div>
      )}
      
      {/* Empty state: No data loaded */}
      {isEmpty && !hasData && (
        <div 
          className={`welcome-empty-state ${isDropHovering ? 'drag-hover' : ''}`}
          onDragEnter={handleDropZoneDragEnter}
          onDragLeave={handleDropZoneDragLeave}
          onDragOver={handleDropZoneDragOver}
          onDrop={handleDropZoneDrop}
        >
          <div className="welcome-icon">
            <FileText size={60} />
          </div>
          <h1 className="welcome-title">
            {showUploadButton ? 'Добро пожаловать в ProductDashboard' : 'Нет данных для отображения'}
          </h1>
          <p className="welcome-subtitle">
            {showUploadButton 
              ? 'Загрузите CSV-файл с данными о ваших инициативах, чтобы начать анализ бюджетов, команд и стейкхолдеров'
              : 'Загрузите CSV-файл с данными для просмотра'
            }
          </p>
          {showUploadButton && onUploadClick && (
            <>
              <button className="welcome-upload-btn" onClick={onUploadClick}>
                <Upload size={24} />
                Загрузить CSV файл
              </button>
              <p className="welcome-hint">
                или перетащите файл <code>.csv</code> сюда
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default StaticTreemapContainer;
