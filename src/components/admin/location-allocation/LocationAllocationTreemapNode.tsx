import { memo, useMemo } from 'react';
import { MessageSquareText, MessagesSquare } from 'lucide-react';
import type { TreemapLayoutNode } from '@/components/treemap/types';
import type { LocationAllocationTreemapMeta, LocationAllocationTreemapScope } from '@/lib/locationAllocationTreemap';
import {
  collectLocationTreemapInitiativeIds,
  resolveLocationTreemapNodeYearCost,
  resolveLocationTreemapNodeScopedCost,
  resolveLocationTreemapNodeHeadcount,
  sumLocationTreemapRegionBreakdown,
  treemapScopeLabel,
} from '@/lib/locationAllocationTreemap';
import type { MarketCountryRow } from '@/hooks/useMarketCountries';
import {
  TOP_REGION_ORDER,
  TOP_REGION_SHORT_LABELS,
  type TopRegionLabel,
} from '@/lib/locationRegionModel';
import { formatLocationCompactM } from '@/lib/locationDisplayFormat';
import { locationTeamKey } from '@/lib/locationAllocationPlanning';
import {
  EMPTY_LOCATION_COMMENT_COUNT,
  type LocationAllocationCommentCount,
  type LocationAllocationCommentSummary,
} from '@/lib/locationAllocationCommentSummary';

function getLuminance(hex: string): number {
  const rgb = parseInt(hex.slice(1), 16);
  const r = ((rgb >> 16) & 255) / 255;
  const g = ((rgb >> 8) & 255) / 255;
  const b = (rgb & 255) / 255;
  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function getTextColorClass(bgColor: string): string {
  return getLuminance(bgColor) > 0.4 ? 'text-gray-900' : 'text-white';
}

function teamCommentButtonLabel(
  count: LocationAllocationCommentCount
): string {
  const openLabel = `${count.openCount} нерешённых комментариев команды`;
  if (count.openCount > 0 && count.unreadCount > 0) {
    return `${openLabel} · ${count.unreadCount} новых сообщений`;
  }
  if (count.openCount > 0) return openLabel;
  if (count.unreadCount > 0) {
    return `${count.unreadCount} новых сообщений`;
  }
  return 'Открыть комментарии команды';
}

function initiativeCommentIndicatorLabel(
  count: LocationAllocationCommentCount
): string {
  const openLabel = `${count.openCount} нерешённых комментариев в инициативах команды`;
  if (count.openCount > 0 && count.unreadCount > 0) {
    return `${openLabel} · ${count.unreadCount} новых сообщений. Откройте инициативу, чтобы прочитать.`;
  }
  if (count.openCount > 0) {
    return `${openLabel}. Откройте инициативу, чтобы прочитать.`;
  }
  return `${count.unreadCount} новых сообщений в инициативах команды. Откройте инициативу, чтобы прочитать.`;
}

function initiativeDiscussionButtonLabel(
  initiativeName: string,
  count: LocationAllocationCommentCount
): string {
  const discussionLabel = `Обсуждение инициативы «${initiativeName}»`;
  if (count.openCount > 0 && count.unreadCount > 0) {
    return `${discussionLabel}: ${count.openCount} нерешённых · ${count.unreadCount} новых сообщений`;
  }
  if (count.openCount > 0) {
    return `${discussionLabel}: ${count.openCount} нерешённых комментариев`;
  }
  return `${discussionLabel}: ${count.unreadCount} новых сообщений`;
}

const TeamCommentIndicators = memo(function TeamCommentIndicators({
  teamCount,
  initiativeCount,
  compact,
  onTeamCommentClick,
}: {
  teamCount: LocationAllocationCommentCount;
  initiativeCount: LocationAllocationCommentCount;
  compact: boolean;
  onTeamCommentClick?: () => void;
}) {
  const showInitiatives =
    initiativeCount.openCount > 0 || initiativeCount.unreadCount > 0;
  if (!onTeamCommentClick && !showInitiatives) return null;

  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 pointer-events-auto">
      {onTeamCommentClick ? (
        <button
          type="button"
          className="relative inline-flex h-6 min-w-6 items-center justify-center gap-1 rounded-md bg-black/25 px-1.5 text-white/95 hover:bg-black/40 hover:text-white"
          title={teamCommentButtonLabel(teamCount)}
          aria-label={teamCommentButtonLabel(teamCount)}
          onClick={(event) => {
            event.stopPropagation();
            onTeamCommentClick();
          }}
        >
          {teamCount.unreadCount > 0 ? (
            <span className="absolute -left-0.5 -top-0.5 h-2 w-2 rounded-full bg-sky-400 ring-1 ring-white" />
          ) : null}
          <MessageSquareText className="h-3.5 w-3.5" strokeWidth={2.1} />
          <span className="text-[8px] font-semibold uppercase tracking-tight">
            {compact ? 'К' : 'Ком.'}
          </span>
          {teamCount.openCount > 0 ? (
            <span className="text-[9px] font-semibold tabular-nums">
              {teamCount.openCount}
            </span>
          ) : null}
        </button>
      ) : null}
      {showInitiatives ? (
        <span
          className="relative inline-flex h-6 min-w-6 items-center justify-center gap-1 rounded-md bg-white/20 px-1.5 text-white/95"
          title={initiativeCommentIndicatorLabel(initiativeCount)}
          aria-label={initiativeCommentIndicatorLabel(initiativeCount)}
        >
          {initiativeCount.unreadCount > 0 ? (
            <span className="absolute -left-0.5 -top-0.5 h-2 w-2 rounded-full bg-sky-400 ring-1 ring-white" />
          ) : null}
          <MessagesSquare className="h-3.5 w-3.5" strokeWidth={2.1} />
          <span className="text-[8px] font-semibold uppercase tracking-tight">
            {compact ? 'И' : 'Иниц.'}
          </span>
          {initiativeCount.openCount > 0 ? (
            <span className="text-[9px] font-semibold tabular-nums">
              {initiativeCount.openCount}
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
});

const ParentHeader = memo(function ParentHeader({
  node,
  textColorClass,
  isTiny,
  isSmall,
  headcount,
  teamCommentCount,
  initiativeCommentCount,
  onTeamCommentClick,
}: {
  node: TreemapLayoutNode;
  textColorClass: string;
  isTiny: boolean;
  isSmall: boolean;
  headcount: number | null;
  teamCommentCount: LocationAllocationCommentCount;
  initiativeCommentCount: LocationAllocationCommentCount;
  onTeamCommentClick?: () => void;
}) {
  if (node.height < 30) return null;

  const labelClass =
    node.isUnit || node.isTeam ? 'text-white' : textColorClass;
  const nameSize = isTiny ? 'text-[9px]' : isSmall ? 'text-[11px]' : 'text-[14px]';

  return (
    <div
      className={`absolute left-1 right-1 top-0.5 z-20 flex min-w-0 items-center gap-1 font-semibold pointer-events-none ${labelClass} ${nameSize}`}
      style={{
        whiteSpace: 'nowrap',
        lineHeight: '1.2',
      }}
    >
      <span className="min-w-0 truncate">
        {node.name}
        {headcount != null ? ` · ${headcount} чел.` : ''}
      </span>
      {node.isTeam ? (
        <TeamCommentIndicators
          teamCount={teamCommentCount}
          initiativeCount={initiativeCommentCount}
          compact={isTiny || isSmall}
          onTeamCommentClick={onTeamCommentClick}
        />
      ) : null}
    </div>
  );
});

type CellCenterStackProps = {
  node: TreemapLayoutNode;
  meta: LocationAllocationTreemapMeta;
  treemapScope: LocationAllocationTreemapScope;
  countries: MarketCountryRow[];
  countryIdToClusterKey: Map<string, string>;
  textColorClass: string;
  isTiny: boolean;
  isSmall: boolean;
  showMoney: boolean;
  discussionCount: LocationAllocationCommentCount;
  onDiscussionClick?: () => void;
};

const CellCenterStack = memo(function CellCenterStack({
  node,
  meta,
  treemapScope,
  countries,
  countryIdToClusterKey,
  textColorClass,
  isTiny,
  isSmall,
  showMoney,
  discussionCount,
  onDiscussionClick,
}: CellCenterStackProps) {
  const initiativeIds = useMemo(
    () => collectLocationTreemapInitiativeIds(node, meta),
    [node, meta]
  );
  const fullCost = useMemo(
    () => resolveLocationTreemapNodeYearCost(node, meta),
    [node, meta]
  );
  const scopedCost = useMemo(
    () =>
      resolveLocationTreemapNodeScopedCost(
        node,
        meta,
        treemapScope,
        countries,
        countryIdToClusterKey
      ),
    [node, meta, treemapScope, countries, countryIdToClusterKey]
  );
  const regionBreakdown = useMemo(
    () => sumLocationTreemapRegionBreakdown(initiativeIds, meta),
    [initiativeIds, meta]
  );
  const headcount = useMemo(
    () => resolveLocationTreemapNodeHeadcount(node, meta),
    [node, meta]
  );

  const isFiltered = treemapScope.kind !== 'all';
  const primaryCost = isFiltered ? scopedCost : fullCost;

  const regionRows = useMemo(() => {
    if (isFiltered) {
      const excluded =
        treemapScope.kind === 'region' ? new Set<TopRegionLabel>([treemapScope.region]) : null;
      return TOP_REGION_ORDER.map((region) => {
        if (excluded?.has(region)) return null;
        const rub = regionBreakdown.get(region) ?? 0;
        if (rub <= 0) return null;
        return {
          region,
          rub,
          pct: fullCost > 0 ? (rub / fullCost) * 100 : 0,
        };
      }).filter((r): r is NonNullable<typeof r> => r != null);
    }

    return TOP_REGION_ORDER.map((region) => {
      const rub = regionBreakdown.get(region) ?? 0;
      if (rub <= 0) return null;
      return {
        region,
        rub,
        pct: fullCost > 0 ? (rub / fullCost) * 100 : 0,
      };
    }).filter((r): r is NonNullable<typeof r> => r != null);
  }, [regionBreakdown, fullCost, isFiltered, treemapScope]);

  const scopeLabel = treemapScopeLabel(treemapScope);

  if (node.height < 30) return null;

  const labelClass =
    node.isUnit || node.isTeam ? 'text-white' : textColorClass;
  const nameSize = isTiny ? 'text-[9px]' : isSmall ? 'text-[11px]' : 'text-[14px]';
  const totalSize = isTiny ? 'text-[8px]' : isSmall ? 'text-[10px]' : 'text-[12px]';
  const regionSize = isTiny ? 'text-[8px]' : isSmall ? 'text-[9px]' : 'text-[11px]';
  const mutedClass =
    textColorClass === 'text-white' ? 'text-white/90' : 'text-gray-700/90';

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-1 pointer-events-none z-10">
      <div className="flex max-w-full items-center justify-center gap-1 px-0.5">
        <div
          className={`min-w-0 truncate font-semibold leading-tight ${labelClass} ${nameSize}`}
        >
          {node.name}
        </div>
        {onDiscussionClick ? (
          <button
            type="button"
            className="relative inline-flex h-6 min-w-6 shrink-0 items-center justify-center gap-1 rounded-md bg-black/35 px-1.5 text-white/95 hover:bg-black/50 hover:text-white pointer-events-auto"
            title={initiativeDiscussionButtonLabel(node.name, discussionCount)}
            aria-label={initiativeDiscussionButtonLabel(
              node.name,
              discussionCount
            )}
            onClick={(event) => {
              event.stopPropagation();
              onDiscussionClick();
            }}
          >
            {discussionCount.unreadCount > 0 ? (
              <span className="absolute -left-0.5 -top-0.5 h-2 w-2 rounded-full bg-sky-400 ring-1 ring-white" />
            ) : null}
            <MessageSquareText className="h-3.5 w-3.5" strokeWidth={2.1} />
            {!isSmall ? (
              <span className="text-[8px] font-semibold uppercase tracking-tight">
                Обс.
              </span>
            ) : null}
            {discussionCount.openCount > 0 ? (
              <span className="text-[9px] font-semibold tabular-nums">
                {discussionCount.openCount}
              </span>
            ) : null}
          </button>
        ) : null}
      </div>

      {headcount != null && !isTiny ? (
        <div className={`mt-0.5 leading-tight ${mutedClass} ${regionSize}`}>
          {headcount} чел.
        </div>
      ) : null}

      {showMoney && primaryCost > 0 && !isTiny ? (
        <div className={`mt-0.5 tabular-nums leading-tight ${labelClass} ${totalSize}`}>
          {isFiltered && scopeLabel ? (
            <span className="block text-[9px] font-normal opacity-90">{scopeLabel}</span>
          ) : null}
          {formatLocationCompactM(primaryCost)}
        </div>
      ) : null}

      {isFiltered && showMoney && fullCost > 0 && !isTiny && primaryCost !== fullCost ? (
        <div className={`mt-0.5 tabular-nums leading-tight ${mutedClass} ${regionSize}`}>
          Всего {formatLocationCompactM(fullCost)}
        </div>
      ) : null}

      {regionRows.length > 0 && node.height >= (isFiltered ? 44 : 36) ? (
        <div
          className={`mt-1 flex flex-col items-center justify-center gap-0.5 w-full min-w-0 ${regionSize} ${mutedClass}`}
        >
          {isFiltered && regionRows.length > 0 ? (
            <div className="max-w-full truncate leading-tight opacity-90">
              {treemapScope.kind === 'market' ? 'Другие регионы' : 'Остальные регионы'}
            </div>
          ) : null}
          {regionRows.map(({ region, rub, pct }) => (
            <div
              key={region}
              className="max-w-full truncate tabular-nums leading-tight text-center px-0.5"
            >
              {TOP_REGION_SHORT_LABELS[region]}
              {' · '}
              {pct.toFixed(0)}%
              {showMoney && !isTiny ? (
                <>
                  {' · '}
                  {formatLocationCompactM(rub)}
                </>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
});

export type LocationAllocationTreemapNodeProps = {
  node: TreemapLayoutNode;
  meta: LocationAllocationTreemapMeta;
  treemapScope?: LocationAllocationTreemapScope;
  countries?: MarketCountryRow[];
  countryIdToClusterKey?: Map<string, string>;
  focusedPath?: string[];
  parentX?: number;
  parentY?: number;
  onClick?: (node: TreemapLayoutNode) => void;
  onMouseEnter?: (e: React.MouseEvent, node: TreemapLayoutNode) => void;
  onMouseMove?: (e: React.MouseEvent) => void;
  onMouseLeave?: (node?: TreemapLayoutNode) => void;
  showChildren?: boolean;
  renderDepth?: number;
  totalValue?: number;
  showMoney?: boolean;
  onEditClick?: (node: TreemapLayoutNode) => void;
  commentSummary?: LocationAllocationCommentSummary;
  isFocusedTeamView?: boolean;
};

export const LocationAllocationTreemapNode = memo(function LocationAllocationTreemapNode({
  node,
  meta,
  treemapScope = { kind: 'all' },
  countries = [],
  countryIdToClusterKey = new Map(),
  focusedPath = [],
  parentX = 0,
  parentY = 0,
  onClick,
  onMouseEnter,
  onMouseMove,
  onMouseLeave,
  showChildren = true,
  renderDepth = 3,
  totalValue = 0,
  showMoney = true,
  onEditClick,
  commentSummary,
  isFocusedTeamView = false,
}: LocationAllocationTreemapNodeProps) {
  const hasChildren = node.children && node.children.length > 0;
  const shouldRenderChildren = hasChildren && node.depth < renderDepth - 1;
  const textColorClass = getTextColorClass(node.color);
  const x = node.x0 - parentX;
  const y = node.y0 - parentY;
  const isTiny = node.width < 60 || node.height < 40;
  const isSmall = node.width < 100 || node.height < 60;
  const showsParentHeader = Boolean(hasChildren && shouldRenderChildren);
  const headcount = useMemo(
    () => resolveLocationTreemapNodeHeadcount(node, meta),
    [node, meta]
  );
  const teamKey = useMemo(() => {
    if (!node.isTeam) return null;
    const unit = node.data.unit?.trim() ?? '';
    const team = node.data.team?.trim() || node.name.trim() || 'Без команды';
    return locationTeamKey(unit, team);
  }, [node]);
  const teamCommentCount = useMemo<LocationAllocationCommentCount>(() => {
    if (!commentSummary || !teamKey) return EMPTY_LOCATION_COMMENT_COUNT;
    return (
      commentSummary.byTeamDirect.get(teamKey) ??
      EMPTY_LOCATION_COMMENT_COUNT
    );
  }, [commentSummary, teamKey]);
  const initiativeCommentCount = useMemo<LocationAllocationCommentCount>(() => {
    if (!commentSummary || !teamKey) return EMPTY_LOCATION_COMMENT_COUNT;
    return (
      commentSummary.byTeamInitiatives.get(teamKey) ??
      EMPTY_LOCATION_COMMENT_COUNT
    );
  }, [commentSummary, teamKey]);
  const initiativeId = useMemo(() => {
    if (!node.isInitiative) return null;
    return collectLocationTreemapInitiativeIds(node, meta)[0] ?? null;
  }, [meta, node]);
  const directInitiativeCommentCount =
    (initiativeId
      ? commentSummary?.byInitiative.get(initiativeId)
      : null) ?? EMPTY_LOCATION_COMMENT_COUNT;
  const showInitiativeDiscussion =
    Boolean(onEditClick) &&
    node.isInitiative &&
    isFocusedTeamView &&
    node.width >= 28 &&
    node.height >= 26 &&
    (directInitiativeCommentCount.openCount > 0 ||
      directInitiativeCommentCount.unreadCount > 0);

  const classNames = [
    'treemap-node',
    'location-allocation-treemap-node',
    `depth-${node.depth}`,
    isTiny && 'treemap-node-tiny',
    isSmall && 'treemap-node-small',
    hasChildren && 'has-children',
    node.isTeam && 'is-team',
    node.isInitiative && 'is-initiative',
  ]
    .filter(Boolean)
    .join(' ');

  const boxStyle: React.CSSProperties = {
    position: 'absolute',
    left: x,
    top: y,
    width: node.width,
    height: node.height,
    backgroundColor: node.color,
    borderRadius: 4,
    overflow: 'hidden',
    cursor: 'pointer',
  };

  const eventHandlers = {
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      onClick?.(node);
    },
    onMouseOver: (e: React.MouseEvent) => {
      e.stopPropagation();
      onMouseEnter?.(e, node);
    },
    onMouseMove,
    onMouseLeave: (e: React.MouseEvent) => {
      e.stopPropagation();
      onMouseLeave?.(node);
    },
  };

  return (
    <div className={classNames} style={boxStyle} {...eventHandlers}>
      {onEditClick &&
      node.isTeam &&
      !showsParentHeader &&
      node.height >= 30 &&
      node.width >= 42 ? (
        <span className="absolute left-1 top-1 z-30">
          <TeamCommentIndicators
            teamCount={teamCommentCount}
            initiativeCount={
              isFocusedTeamView
                ? EMPTY_LOCATION_COMMENT_COUNT
                : initiativeCommentCount
            }
            compact={isTiny || isSmall}
            onTeamCommentClick={() => onEditClick(node)}
          />
        </span>
      ) : null}
      {hasChildren && shouldRenderChildren ? (
        <ParentHeader
          node={node}
          textColorClass={textColorClass}
          isTiny={isTiny}
          isSmall={isSmall}
          headcount={headcount}
          teamCommentCount={teamCommentCount}
          initiativeCommentCount={
            isFocusedTeamView
              ? EMPTY_LOCATION_COMMENT_COUNT
              : initiativeCommentCount
          }
          onTeamCommentClick={
            onEditClick && node.isTeam
              ? () => onEditClick(node)
              : undefined
          }
        />
      ) : (
        <CellCenterStack
          node={node}
          meta={meta}
          treemapScope={treemapScope}
          countries={countries}
          countryIdToClusterKey={countryIdToClusterKey}
          textColorClass={textColorClass}
          isTiny={isTiny}
          isSmall={isSmall}
          showMoney={showMoney}
          discussionCount={directInitiativeCommentCount}
          onDiscussionClick={
            showInitiativeDiscussion
              ? () => onEditClick?.(node)
              : undefined
          }
        />
      )}
      {shouldRenderChildren && showChildren
        ? node.children?.map((child) => (
            <LocationAllocationTreemapNode
              key={child.key}
              node={child}
              meta={meta}
              treemapScope={treemapScope}
              countries={countries}
              countryIdToClusterKey={countryIdToClusterKey}
              focusedPath={focusedPath}
              parentX={node.x0}
              parentY={node.y0}
              onClick={onClick}
              onMouseEnter={onMouseEnter}
              onMouseMove={onMouseMove}
              onMouseLeave={onMouseLeave}
              showChildren={showChildren}
              renderDepth={renderDepth}
              totalValue={totalValue}
              showMoney={showMoney}
              onEditClick={onEditClick}
              commentSummary={commentSummary}
              isFocusedTeamView={isFocusedTeamView}
            />
          ))
        : null}
    </div>
  );
});
