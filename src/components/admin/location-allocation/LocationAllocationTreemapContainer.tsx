import {
  useRef,
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
} from 'react';
import { ArrowUp } from 'lucide-react';
import type { TreeNode } from '@/lib/dataManager';
import { getSubtreeValue, getUnitColor } from '@/lib/dataManager';
import type { ColorGetter, TreemapLayoutNode } from '@/components/treemap/types';
import { useStaticTreemapLayout } from '@/components/treemap/useStaticTreemapLayout';
import { LocationAllocationTreemapNode } from '@/components/admin/location-allocation/LocationAllocationTreemapNode';
import { LocationAllocationTreemapTooltip } from '@/components/admin/location-allocation/LocationAllocationTreemapTooltip';
import type { LocationAllocationTreemapMeta, LocationAllocationTreemapScope } from '@/lib/locationAllocationTreemap';
import type { MarketCountryRow } from '@/hooks/useMarketCountries';
import { normalizeTreemapFocusPath, splitTreemapEncodedPath } from '@/lib/treemapPathCodec';
import '@/styles/treemap.css';

type Props = {
  data: TreeNode;
  meta: LocationAllocationTreemapMeta;
  treemapScope?: LocationAllocationTreemapScope;
  countries?: MarketCountryRow[];
  countryIdToClusterKey?: Map<string, string>;
  showTeams?: boolean;
  showInitiatives?: boolean;
  showMoney?: boolean;
  hasData?: boolean;
  contentKey?: string;
  getColor?: ColorGetter;
  onAutoEnableTeams?: () => void;
  onAutoEnableInitiatives?: () => void;
  onAutoDisableTeams?: () => void;
  onAutoDisableInitiatives?: () => void;
  onEditNode?: (node: TreemapLayoutNode) => void;
};

export function LocationAllocationTreemapContainer({
  data,
  meta,
  treemapScope = { kind: 'all' },
  countries = [],
  countryIdToClusterKey = new Map(),
  showTeams = false,
  showInitiatives = false,
  showMoney = true,
  hasData = false,
  contentKey,
  getColor = getUnitColor,
  onAutoEnableTeams,
  onAutoEnableInitiatives,
  onAutoDisableTeams,
  onAutoDisableInitiatives,
  onEditNode,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [focusedPath, setFocusedPath] = useState<string[]>([]);

  const [tooltipData, setTooltipData] = useState<{
    node: TreemapLayoutNode;
    position: { x: number; y: number };
  } | null>(null);
  const hoveredNodeRef = useRef<TreemapLayoutNode | null>(null);
  const tooltipTimeoutRef = useRef<number | null>(null);

  const isEmpty = !data.children || data.children.length === 0;

  const targetRenderDepth = useMemo(() => {
    let depth = 1;
    if (showTeams && showInitiatives) depth = 3;
    else if (showTeams || showInitiatives) depth = 2;
    depth = Math.max(depth, focusedPath.length + 1);
    return depth;
  }, [showTeams, showInitiatives, focusedPath.length]);

  const layoutNodes = useStaticTreemapLayout({
    data,
    dimensions,
    getColor,
    focusedPath,
    maxRenderDepth: targetRenderDepth,
  });

  useEffect(() => {
    if (tooltipTimeoutRef.current !== null) {
      clearTimeout(tooltipTimeoutRef.current);
      tooltipTimeoutRef.current = null;
    }
    hoveredNodeRef.current = null;
    setTooltipData(null);
  }, [layoutNodes, contentKey, showTeams, showInitiatives, focusedPath]);

  useLayoutEffect(() => {
    if (!containerRef.current) return;

    const updateDimensions = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setDimensions({ width: rect.width, height: rect.height });
    };

    updateDimensions();
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(updateDimensions);
    });
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  const totalValue = useMemo(
    () =>
      focusedPath.length > 0
        ? getSubtreeValue(data, focusedPath)
        : layoutNodes.reduce((sum, n) => sum + n.value, 0),
    [data, focusedPath, layoutNodes]
  );

  const applyZoomOutAutoDisable = useCallback(
    (oldLength: number, newLength: number) => {
      if (oldLength >= 2 && newLength < 2) onAutoDisableInitiatives?.();
      if (oldLength >= 1 && newLength < 1) onAutoDisableTeams?.();
    },
    [onAutoDisableInitiatives, onAutoDisableTeams]
  );

  const handleNavigateBack = useCallback(() => {
    if (focusedPath.length === 0) return;
    const oldLength = focusedPath.length;
    const newPath = focusedPath.slice(0, -1);
    applyZoomOutAutoDisable(oldLength, newPath.length);
    setFocusedPath(newPath);
  }, [focusedPath, applyZoomOutAutoDisable]);

  const handleNodeClick = useCallback(
    (node: TreemapLayoutNode) => {
      if (node.data.isInitiative && onEditNode) {
        onEditNode(node);
        return;
      }

      if (node.data.isUnit) {
        onAutoEnableTeams?.();
      } else if (node.data.isTeam) {
        onAutoEnableInitiatives?.();
      }

      const isNonLeaf = node.data.isUnit || node.data.isTeam;
      if (!isNonLeaf) return;

      setFocusedPath(normalizeTreemapFocusPath(data, splitTreemapEncodedPath(node.path)));
    },
    [data, onAutoEnableTeams, onAutoEnableInitiatives, onEditNode]
  );

  const handleMouseEnter = useCallback((e: React.MouseEvent, node: TreemapLayoutNode) => {
    hoveredNodeRef.current = node;
    setTooltipData((prev) => (prev && prev.node.key !== node.key ? null : prev));

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
    setTooltipData((prev) => {
      if (!prev || !hoveredNodeRef.current) return null;
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
        setTooltipData(null);
      }
      return;
    }

    hoveredNodeRef.current = null;
    setTooltipData(null);
  }, []);

  const canZoomOut = focusedPath.length > 0;

  return (
    <div
      className="treemap-container location-allocation-treemap-container"
      ref={containerRef}
      onMouseLeave={() => handleMouseLeave()}
    >
      <button
        type="button"
        className={`navigate-back-button ${canZoomOut ? 'visible' : ''}`}
        onClick={handleNavigateBack}
        title="Подняться на уровень выше"
      >
        <ArrowUp size={28} strokeWidth={2.5} />
      </button>

      <LocationAllocationTreemapTooltip
        data={tooltipData}
        meta={meta}
        treemapScope={treemapScope}
        countries={countries}
        countryIdToClusterKey={countryIdToClusterKey}
        showMoney={showMoney}
      />

      {!isEmpty && dimensions.width > 0 ? (
        <div
          key={`${contentKey ?? 'loc-treemap'}|${focusedPath.join('/')}|d${targetRenderDepth}`}
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
            <LocationAllocationTreemapNode
              key={`${node.key}|d${targetRenderDepth}`}
              node={node}
              meta={meta}
              treemapScope={treemapScope}
              countries={countries}
              countryIdToClusterKey={countryIdToClusterKey}
              focusedPath={focusedPath}
              onClick={handleNodeClick}
              onMouseEnter={handleMouseEnter}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              renderDepth={targetRenderDepth}
              totalValue={totalValue}
              showMoney={showMoney}
              onEditClick={onEditNode}
            />
          ))}
        </div>
      ) : null}

      {isEmpty && hasData ? (
        <div className="welcome-empty-state">
          <p className="welcome-subtitle text-center px-4">
            Нет инициатив для отображения. Измените фильтры на странице.
          </p>
        </div>
      ) : null}
    </div>
  );
}
