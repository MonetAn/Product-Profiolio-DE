// Treemap container with Framer Motion animations and Flourish-style zoom

import { useRef, useState, useCallback, useEffect, useLayoutEffect, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ArrowUp, Upload, FileText, Search } from 'lucide-react';
import TreemapNode from './TreemapNode';
import TreemapTooltip from './TreemapTooltip';
import { useTreemapLayout } from './useTreemapLayout';
import { TreemapLayoutNode, AnimationType, ColorGetter } from './types';
import { TreeNode } from '@/lib/dataManager';
import '@/styles/treemap.css';

interface TreemapContainerProps {
  data: TreeNode;
  showTeams?: boolean;
  showInitiatives?: boolean;
  onNodeClick?: (node: TreeNode) => void;
  onNavigateBack?: () => void;
  canNavigateBack?: boolean;
  onInitiativeClick?: (initiativeName: string) => void;
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
}: TreemapContainerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [animationType, setAnimationType] = useState<AnimationType>('initial');
  const [showHint, setShowHint] = useState(true);
  const [isDropHovering, setIsDropHovering] = useState(false);
  const dropCounterRef = useRef(0);
  const isAnimatingRef = useRef(false);
  const pendingClickRef = useRef<TreemapLayoutNode | null>(null);
  
  // Flourish-style zoom: internal focused path (array of node names from root children)
  const [focusedPath, setFocusedPath] = useState<string[]>(initialFocusedPath || []);
  
  
  // Track previous state for animation type detection
  const prevDataNameRef = useRef<string | null>(null);
  const prevShowTeamsRef = useRef(showTeams);
  const prevShowInitiativesRef = useRef(showInitiatives);
  const prevFocusedPathRef = useRef<string[]>([]);
  const isFirstRenderRef = useRef(true);
  
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
  
  // Detect animation type based on data changes
  useLayoutEffect(() => {
    if (isEmpty) return;
    
    let newAnimationType: AnimationType = 'filter';
    
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      newAnimationType = 'initial';
    } else if (dimensions.width > 0 && prevDataNameRef.current !== data.name) {
      newAnimationType = canNavigateBack ? 'drilldown' : 'navigate-up';
    } else if (prevFocusedPathRef.current.length !== focusedPath.length) {
      // Focused path changed — this is a zoom drill-down/up
      if (focusedPath.length > prevFocusedPathRef.current.length) {
        newAnimationType = 'drilldown';
      } else {
        // Zoom out: check aspect ratio of the node we're returning FROM
        // (the node at the previous focused path, which is now expanding back)
        const prevLastName = prevFocusedPathRef.current[prevFocusedPathRef.current.length - 1];
        const returningNode = prevLastName ? layoutNodes.find(n => n.name === prevLastName) : null;
        if (returningNode) {
          const ar = returningNode.width / returningNode.height;
          newAnimationType = (ar > 5 || ar < 1/5) ? 'navigate-up-fast' : 'navigate-up';
        } else {
          newAnimationType = 'navigate-up';
        }
      }
    } else if (prevShowTeamsRef.current !== showTeams || 
               prevShowInitiativesRef.current !== showInitiatives) {
      newAnimationType = 'filter';
    }
    
    prevDataNameRef.current = data.name;
    prevShowTeamsRef.current = showTeams;
    prevShowInitiativesRef.current = showInitiatives;
    prevFocusedPathRef.current = focusedPath;
    setAnimationType(newAnimationType);
    
    // Show hint briefly
    setShowHint(true);
    const timer = setTimeout(() => setShowHint(false), 3000);
    return () => clearTimeout(timer);
  }, [data.name, showTeams, showInitiatives, canNavigateBack, isEmpty, dimensions.width, focusedPath]);
  
  // Render depth: matches actual tree structure from toggles
  const targetRenderDepth = useMemo(() => {
    let depth = 1; // Units only
    if (showTeams && showInitiatives) depth = 3; // Unit > Team > Initiative
    else if (showTeams) depth = 2; // Unit > Team
    else if (showInitiatives) depth = 2; // Unit > Initiative (teams skipped in data)
    depth = Math.max(depth, focusedPath.length + 1);
    return depth + extraDepth;
  }, [showTeams, showInitiatives, extraDepth, focusedPath.length]);
  
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
    
    // Initiative click → navigate to Gantt
    if (node.data.isInitiative && onInitiativeClick) {
      onInitiativeClick(node.data.name);
      return;
    }
    
    // If node is a non-leaf (unit/team/stakeholder), zoom into it
    const isNonLeaf = node.data.isUnit || node.data.isTeam || node.data.isStakeholder;
    
    if (isNonLeaf) {
      // Smart auto-enable: show children based on node type
      if (node.data.isUnit || node.data.isStakeholder) {
        if (!showTeams) onAutoEnableTeams?.();
      } else if (node.data.isTeam) {
        if (!showInitiatives) onAutoEnableInitiatives?.();
      }
      
      // Detect extreme aspect ratio for fast drilldown
      const aspectRatio = node.width / node.height;
      const isExtreme = aspectRatio > 5 || aspectRatio < (1 / 5);
      
      if (isExtreme) {
        setAnimationType('drilldown-fast');
      }
      
      isAnimatingRef.current = true;
      setTimeout(() => {
        isAnimatingRef.current = false;
        if (pendingClickRef.current) {
          const pending = pendingClickRef.current;
          pendingClickRef.current = null;
          handleNodeClick(pending);
        }
      }, 900);
      // Build full path from node.path (e.g. "UnitA/Team1" -> ['UnitA', 'Team1'])
      const newFocusedPath = node.path.split('/');
      setFocusedPath(newFocusedPath);
      onFocusedPathChange?.(newFocusedPath);
    }
  }, [onInitiativeClick, showTeams, showInitiatives, onAutoEnableTeams, onFocusedPathChange]);
  
  // Navigate back handler — zoom out one level with symmetric auto-disable
  const handleNavigateBack = useCallback(() => {
    if (focusedPath.length > 0) {
      const oldLength = focusedPath.length;
      const newPath = focusedPath.slice(0, -1);
      const newLength = newPath.length;
      
      // Auto-disable nesting levels symmetrically
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
      
      {/* Instruction hint */}
      <div className={`instruction-hint ${showHint && !isEmpty ? 'visible' : ''}`}>
        Кликните на блок для детализации
      </div>
      
      {/* Tooltip */}
      <TreemapTooltip
        data={tooltipData}
        lastQuarter={lastQuarter}
        selectedUnitsCount={selectedUnitsCount}
        totalValue={layoutNodes.reduce((sum, n) => sum + n.value, 0)}
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
                onClick={handleNodeClick}
                onMouseEnter={handleMouseEnter}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                showChildren={true}
                renderDepth={renderDepth}
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
