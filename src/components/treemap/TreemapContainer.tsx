// Treemap container with Framer Motion animations and Flourish-style zoom

import { useRef, useState, useCallback, useEffect, useLayoutEffect, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ArrowUp, Upload, FileText, Search } from 'lucide-react';
import TreemapNode from './TreemapNode';
import TreemapTooltip from './TreemapTooltip';
import { useTreemapLayout } from './useTreemapLayout';
import { TreemapLayoutNode, AnimationType, ColorGetter, ANIMATION_DURATIONS, getEffectiveDuration, TEXT_VISIBLE_AT_RATIO } from './types';
import { TreeNode, getSubtreeValue } from '@/lib/dataManager';
import { perfMark } from '@/lib/perfDiagnostics';
import '@/styles/treemap.css';

interface TreemapContainerProps {
  data: TreeNode;
  showTeams?: boolean;
  showInitiatives?: boolean;
  onNodeClick?: (node: TreeNode) => void;
  onNavigateBack?: () => void;
  canNavigateBack?: boolean;
  onInitiativeClick?: (initiativeName: string, path: string) => void;
  selectedQuarters?: string[];
  hasData?: boolean;
  onResetFilters?: () => void;
  selectedUnitsCount?: number;
  clickedNodeName?: string | null;
  getColor?: ColorGetter;
  emptyStateTitle?: string;
  emptyStateSubtitle?: string;
  showUploadButton?: boolean;
  onUploadClick?: () => void;
  onFileDrop?: (file: File) => void;
  extraDepth?: number;
  onAutoEnableTeams?: () => void;
  onAutoEnableInitiatives?: () => void;
  onAutoDisableTeams?: () => void;
  onAutoDisableInitiatives?: () => void;
  onFocusedPathChange?: (path: string[]) => void;
  resetZoomTrigger?: number;
  initialFocusedPath?: string[];
  /** When switching to this tab (viewKey changes), show treemap with no animation and text immediately */
  viewKey?: string;
  /** If false, tooltip does not show "Распределение бюджета" block (e.g. for Stakeholders treemap) */
  showDistributionInTooltip?: boolean;
  onTrackTreemapAction?: (type: 'treemap_zoom' | 'treemap_click', payload: { view: string; path: string; name: string }) => void;
  /** If false, only percentages are shown on cells (no money) */
  showMoney?: boolean;
  /** When this key changes (e.g. support/off-track/stub filter), use same animation as filter toggle (smooth rebuild) */
  contentKey?: string;
}

const TreemapContainer = ({
  data,
  showTeams = false,
  showInitiatives = false,
  onNodeClick,
  onNavigateBack,
  canNavigateBack = false,
  onInitiativeClick,
  selectedQuarters = [],
  hasData = false,
  onResetFilters,
  selectedUnitsCount = 0,
  getColor,
  emptyStateTitle = 'Нет инициатив по выбранным фильтрам',
  emptyStateSubtitle = 'Попробуйте изменить параметры фильтрации или сбросить фильтры',
  showUploadButton = false,
  onUploadClick,
  onFileDrop,
  extraDepth = 0,
  onAutoEnableTeams,
  onAutoEnableInitiatives,
  onAutoDisableTeams,
  onAutoDisableInitiatives,
  onFocusedPathChange,
  resetZoomTrigger,
  initialFocusedPath,
  viewKey,
  showDistributionInTooltip = true,
  onTrackTreemapAction,
  showMoney = true,
  contentKey,
}: TreemapContainerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [animationType, setAnimationType] = useState<AnimationType>('initial');
  const [textVisible, setTextVisible] = useState(true);
  const textVisibleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isDropHovering, setIsDropHovering] = useState(false);
  const dropCounterRef = useRef(0);
  const isAnimatingRef = useRef(false);
  const pendingClickRef = useRef<TreemapLayoutNode | null>(null);

  // Flourish-style zoom: internal focused path (array of node names from root children)
  const [focusedPath, setFocusedPath] = useState<string[]>(initialFocusedPath || []);

  // Track previous state for animation type detection
  const prevDataNameRef = useRef<string | null>(null);
  const prevContentKeyRef = useRef<string | undefined>(contentKey);
  const prevShowTeamsRef = useRef(showTeams);
  const prevShowInitiativesRef = useRef(showInitiatives);
  const prevFocusedPathRef = useRef<string[]>([]);
  const prevDimensionsRef = useRef({ width: 0, height: 0 });
  const isFirstRenderRef = useRef(true);
  const prevViewKeyRef = useRef<string | undefined>(undefined);
  /** После принудительного initial при переключении вкладки — ещё 2 прогона держим initial, чтобы не перезаписать в filter */
  const useInitialForRunsLeftRef = useRef(0);
  /** Последний выставленный тип: второй прогон эффекта (из‑за layoutNodes) не перезаписывает drilldown/navigate-up в filter */
  const prevAnimationTypeRef = useRef<AnimationType>('initial');
  /** Предыдущая раскладка (при root) для анимации drilldown: от старой позиции/размера к новой */
  const prevLayoutAtRootRef = useRef<TreemapLayoutNode[]>([]);

  // prefers-reduced-motion: do not hide text when user requests reduced motion
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduceMotion(mq.matches);
    const fn = () => setReduceMotion(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  
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
  
  // Reset focusedPath only when root data actually changes
  const dataIdRef = useRef(data.name + '|' + (data.children?.length || 0));
  useEffect(() => {
    const newId = data.name + '|' + (data.children?.length || 0);
    if (dataIdRef.current !== newId) {
      dataIdRef.current = newId;
      setFocusedPath([]);
    }
  }, [data]);
  
  // Reset focusedPath when manual filters trigger a reset
  const prevResetTriggerRef = useRef(resetZoomTrigger);
  useEffect(() => {
    if (resetZoomTrigger !== undefined && resetZoomTrigger !== prevResetTriggerRef.current) {
      prevResetTriggerRef.current = resetZoomTrigger;
      setFocusedPath([]);
      onFocusedPathChange?.([]);
    }
  }, [resetZoomTrigger, onFocusedPathChange]);



  // Compute layout using D3, with focusedPath for zoom
  const layoutNodes = useTreemapLayout({
    data,
    dimensions,
    getColor,
    extraDepth,
    focusedPath,
  });

  function countRenderedNodes(nodes: TreemapLayoutNode[], maxDepth: number): number {
    let count = 0;
    for (const node of nodes) {
      if (node.depth < maxDepth) count += 1;
      if (node.children) count += countRenderedNodes(node.children, maxDepth);
    }
    return count;
  }

  // Render depth: matches actual tree structure from toggles (needed for nodeCountForAnimation and effect)
  const targetRenderDepth = useMemo(() => {
    let depth = 1; // Units only
    if (showTeams && showInitiatives) depth = 3; // Unit > Team > Initiative
    else if (showTeams) depth = 2; // Unit > Team
    else if (showInitiatives) depth = 2; // Unit > Initiative (teams skipped in data)
    depth = Math.max(depth, focusedPath.length + 1);
    return depth + extraDepth;
  }, [showTeams, showInitiatives, extraDepth, focusedPath.length]);

  const nodeCountForAnimation = useMemo(
    () => countRenderedNodes(layoutNodes, targetRenderDepth),
    [layoutNodes, targetRenderDepth]
  );

  // Store root layout so drilldown can animate FROM it (first zoom-in: blocks grow from old positions)
  if (focusedPath.length === 0 && layoutNodes.length > 0) {
    prevLayoutAtRootRef.current = layoutNodes;
  }

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
  }, []);
  
  // Detect animation type and drive text visibility: hide at transition start, show after layout duration
  useLayoutEffect(() => {
    if (isEmpty) return;

    const hadNoDimensions = prevDimensionsRef.current.width === 0 && prevDimensionsRef.current.height === 0;
    const hasDimensionsNow = dimensions.width > 0 && dimensions.height > 0;
    // При переключении вкладки: первый прогон (viewKey изменился) И прогон "впервые получили размеры" — принудительный initial
    const forcedInitialForView =
      viewKey !== undefined &&
      (prevViewKeyRef.current !== viewKey || (hadNoDimensions && hasDimensionsNow));

    const atRoot = focusedPath.length === 0;
    const wasAtRoot = prevFocusedPathRef.current.length === 0;

    // При переключении на вкладку с тримапом — сразу initial, без анимации.
    // Выходим до остальных веток; следующие 2 прогона тоже держим initial через useInitialForRunsLeftRef.
    if (forcedInitialForView) {
      prevViewKeyRef.current = viewKey;
      prevDataNameRef.current = data.name;
      prevContentKeyRef.current = contentKey;
      prevShowTeamsRef.current = showTeams;
      prevShowInitiativesRef.current = showInitiatives;
      prevFocusedPathRef.current = focusedPath;
      prevDimensionsRef.current = { width: dimensions.width, height: dimensions.height };
      if (isFirstRenderRef.current) isFirstRenderRef.current = false;
      useInitialForRunsLeftRef.current = 2;
      prevAnimationTypeRef.current = 'initial';
      setTextVisible(true);
      setAnimationType('initial');
      return;
    }

    // По умолчанию сохраняем последний тип — второй прогон эффекта (layoutNodes) не перезаписывает drilldown/navigate-up в filter
    let newAnimationType: AnimationType = prevAnimationTypeRef.current;

    // Стабилизация только на корне: не перезаписывать drilldown/navigate-up при первом зуме.
    // Условие: мы на корне (focusedPath.length === 0) и не только что пришли сюда зум аут'ом (prev был корень).
    // atRoot, wasAtRoot объявлены выше.
    if (
      viewKey !== undefined &&
      useInitialForRunsLeftRef.current > 0 &&
      atRoot &&
      wasAtRoot
    ) {
      useInitialForRunsLeftRef.current -= 1;
      // Не перезаписывать только что отыгравший navigate-up при выходе на корень — иначе обрежем анимацию
      if (prevAnimationTypeRef.current === 'navigate-up' || prevAnimationTypeRef.current === 'drilldown') {
        newAnimationType = prevAnimationTypeRef.current;
      } else {
        newAnimationType = 'initial';
      }
    } else {
      if (isFirstRenderRef.current) {
        isFirstRenderRef.current = false;
        newAnimationType = 'initial';
      } else if (dimensions.width > 0 && prevDataNameRef.current !== data.name) {
        newAnimationType = canNavigateBack ? 'drilldown' : 'navigate-up';
      } else if (prevFocusedPathRef.current.length !== focusedPath.length) {
        if (focusedPath.length > prevFocusedPathRef.current.length) {
          newAnimationType = 'drilldown';
        } else {
          newAnimationType = 'navigate-up';
        }
      } else if (prevShowTeamsRef.current !== showTeams ||
                 prevShowInitiativesRef.current !== showInitiatives) {
        newAnimationType = 'filter';
      } else if (contentKey !== undefined && prevContentKeyRef.current !== contentKey && focusedPath.length === 0) {
        // Support / off-track / stub filter changed — same smooth animation as filter toggles
        newAnimationType = 'filter';
      }

      // First time we get real dimensions (was 0,0): keep initial — no animation, no text fade
      if (hadNoDimensions && hasDimensionsNow) {
        newAnimationType = 'initial';
      } else if (!isFirstRenderRef.current && !hadNoDimensions && (prevDimensionsRef.current.width !== dimensions.width || prevDimensionsRef.current.height !== dimensions.height)) {
        newAnimationType = 'resize';
      }
    }

    prevDataNameRef.current = data.name;
    prevContentKeyRef.current = contentKey;
    prevShowTeamsRef.current = showTeams;
    prevShowInitiativesRef.current = showInitiatives;
    prevFocusedPathRef.current = focusedPath;
    prevDimensionsRef.current = { width: dimensions.width, height: dimensions.height };
    prevAnimationTypeRef.current = newAnimationType;
    setAnimationType(newAnimationType);
    perfMark(`treemap-animation-${newAnimationType}`);

    if (newAnimationType === 'initial') {
      setTextVisible(true);
    } else if (!reduceMotion) {
      setTextVisible(false);
      if (textVisibleTimerRef.current) clearTimeout(textVisibleTimerRef.current);
      const fullDuration = getEffectiveDuration(newAnimationType, nodeCountForAnimation);
      const textShowDelay = Math.round(fullDuration * TEXT_VISIBLE_AT_RATIO);
      textVisibleTimerRef.current = setTimeout(() => {
        textVisibleTimerRef.current = null;
        setTextVisible(true);
      }, textShowDelay);
    }

    return () => {
      if (textVisibleTimerRef.current) {
        clearTimeout(textVisibleTimerRef.current);
        textVisibleTimerRef.current = null;
      }
    };
  }, [data.name, contentKey, showTeams, showInitiatives, canNavigateBack, isEmpty, dimensions.width, dimensions.height, focusedPath, layoutNodes, viewKey, nodeCountForAnimation, reduceMotion]);
  
  // Delayed render depth: when decreasing, keep old value during exit animation
  const [renderDepth, setRenderDepth] = useState(targetRenderDepth);
  const renderDepthTimerRef = useRef<number | null>(null);
  
  useEffect(() => {
    if (renderDepthTimerRef.current !== null) {
      clearTimeout(renderDepthTimerRef.current);
      renderDepthTimerRef.current = null;
    }
    
    setRenderDepth(targetRenderDepth);
    
    return () => {
      if (renderDepthTimerRef.current !== null) clearTimeout(renderDepthTimerRef.current);
    };
  }, [targetRenderDepth]);

  // Node click handler — Flourish-style: zoom into node by updating focusedPath
  const handleNodeClick = useCallback((node: TreemapLayoutNode) => {
    // Queue click during animation instead of dropping it
    if (isAnimatingRef.current) {
      pendingClickRef.current = node;
      return;
    }
    
    // Initiative click → open peek modal (parent may navigate to Gantt from there)
    if (node.data.isInitiative && onInitiativeClick) {
      onTrackTreemapAction?.('treemap_click', { view: viewKey ?? 'budget', path: node.path, name: node.data.name });
      onInitiativeClick(node.data.name, node.path);
      return;
    }
    
    // If node is a non-leaf (unit/team/stakeholder), zoom into it
    const isNonLeaf = node.data.isUnit || node.data.isTeam || node.data.isStakeholder;
    
    if (isNonLeaf) {
      onTrackTreemapAction?.('treemap_zoom', { view: viewKey ?? 'budget', path: node.path, name: node.data.name });
      // Smart auto-enable: show children based on node type
      if (node.data.isUnit || node.data.isStakeholder) {
        if (!showTeams) onAutoEnableTeams?.();
      } else if (node.data.isTeam) {
        if (!showInitiatives) onAutoEnableInitiatives?.();
      }
      
      // Detect extreme aspect ratio for fast drilldown
      setAnimationType('drilldown');
      perfMark('treemap-drilldown-start');
      const newFocusedPath = node.path.split('/');
      isAnimatingRef.current = true;
      setTimeout(() => {
        perfMark('treemap-drilldown-end');
        isAnimatingRef.current = false;
        if (pendingClickRef.current) {
          const pending = pendingClickRef.current;
          pendingClickRef.current = null;
          handleNodeClick(pending);
        }
      }, ANIMATION_DURATIONS['drilldown'] + 80);
      setFocusedPath(newFocusedPath);
      onFocusedPathChange?.(newFocusedPath);
    }
  }, [onInitiativeClick, showTeams, showInitiatives, onAutoEnableTeams, onFocusedPathChange, onTrackTreemapAction, viewKey]);
  
  // Navigate back handler — zoom out one level with symmetric auto-disable
  const handleNavigateBack = useCallback(() => {
    if (focusedPath.length > 0) {
      const oldLength = focusedPath.length;
      const newPath = focusedPath.slice(0, -1);
      const newLength = newPath.length;

      if (oldLength >= 2 && newLength < 2) {
        onAutoDisableInitiatives?.();
      }
      if (oldLength >= 1 && newLength < 1) {
        onAutoDisableTeams?.();
      }

      setFocusedPath(newPath);
      onFocusedPathChange?.(newPath);
    } else if (onNavigateBack) {
      onNavigateBack();
    }
  }, [focusedPath, onNavigateBack, onFocusedPathChange, onAutoDisableTeams, onAutoDisableInitiatives]);

  
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
      />
      
      {/* Framer Motion treemap rendering */}
      {!isEmpty && dimensions.width > 0 && (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          <AnimatePresence mode="sync">
            {layoutNodes.map(node => (
              <TreemapNode
                key={node.key}
                node={node}
                animationType={animationType}
                fromLayoutNodes={focusedPath.length === 1 && animationType === 'drilldown' ? prevLayoutAtRootRef.current : undefined}
                focusedPath={focusedPath}
                textVisible={reduceMotion ? true : textVisible}
                visibleNodeCount={nodeCountForAnimation}
                reduceMotion={reduceMotion}
                onClick={handleNodeClick}
                onMouseEnter={handleMouseEnter}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                showChildren={true}
                renderDepth={renderDepth}
                totalValue={totalValue}
                selectedUnitsCount={selectedUnitsCount}
                showMoney={showMoney}
              />
            ))}
          </AnimatePresence>
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
          {onResetFilters && (
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

export default TreemapContainer;
