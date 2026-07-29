import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AdminDataRow, GeoCostSplit } from '@/lib/adminDataManager';
import type { MarketCountryRow } from '@/hooks/useMarketCountries';
import {
  buildLocationAllocationTreemapMeta,
  buildLocationAllocationTreemapTree,
  prepareLocationAllocationTreemapTree,
  resolveLocationAllocationTreemapScope,
} from '@/lib/locationAllocationTreemap';
import {
  filterLocationTimelineInitiatives,
  type LocationTeamFilter,
  type TopRegionLabel,
} from '@/lib/locationRegionModel';
import { LocationAllocationTreemapContainer } from '@/components/admin/location-allocation/LocationAllocationTreemapContainer';
import { LocationAllocationTreemapEditDialog } from '@/components/admin/location-allocation/LocationAllocationTreemapEditDialog';
import { quartersForYear } from '@/lib/locationAllocationModel';
import { getUnitColor } from '@/lib/dataManager';
import type { TreemapLayoutNode } from '@/components/treemap/types';
import {
  resolveGeoEditTargetFromNode,
  resolveGeoEditTargetFromScope,
  type LocationAllocationGeoEditScope,
  type LocationAllocationGeoEditTarget,
} from '@/lib/locationAllocationGeoEdit';
import type { InitiativeTag } from '@/lib/initiativeTags';
import type { LocationHeadcountIndex } from '@/lib/locationAllocationPlanning';
import { useLocationAllocationCommentSummary } from '@/hooks/useLocationAllocationCommentSummary';
import { locationAllocationFilterFocusPath } from '@/lib/locationAllocationFilterNavigation';

type Props = {
  initiatives: AdminDataRow[];
  year: number;
  regionFilter: TopRegionLabel | null;
  unitFilter: string | null;
  teamFilter: LocationTeamFilter | null;
  marketCountry?: MarketCountryRow | null;
  countries: MarketCountryRow[];
  countryIdToClusterKey: Map<string, string>;
  onGeoCostSplitSave: (id: string, split: GeoCostSplit | undefined) => Promise<void>;
  onInitiativeTagsSave: (id: string, tags: InitiativeTag[]) => Promise<void>;
  headcount?: LocationHeadcountIndex;
  showTeams: boolean;
  onShowTeamsChange: (show: boolean) => void;
  showInitiatives: boolean;
  onShowInitiativesChange: (show: boolean) => void;
  onNavigateUp?: (nextPath: string[]) => void;
  focusedComment?: {
    id: string;
    scope: LocationAllocationGeoEditScope;
  } | null;
  readOnly?: boolean;
};

export function LocationAllocationTreemap({
  initiatives,
  year,
  regionFilter,
  unitFilter,
  teamFilter,
  marketCountry = null,
  countries,
  countryIdToClusterKey,
  onGeoCostSplitSave,
  onInitiativeTagsSave,
  headcount,
  showTeams,
  onShowTeamsChange,
  showInitiatives,
  onShowInitiativesChange,
  onNavigateUp,
  focusedComment = null,
  readOnly = false,
}: Props) {
  const commentSummaryQuery =
    useLocationAllocationCommentSummary(initiatives, {
      enabled: !readOnly,
    });

  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<LocationAllocationGeoEditTarget | null>(null);
  const handledFocusedCommentRef = useRef<string | null>(null);

  const hasTeamSelection = teamFilter != null;
  const effectiveShowTeams = showTeams || hasTeamSelection;
  const effectiveShowInitiatives = showInitiatives || hasTeamSelection;
  const selectedFilterFocusPath = useMemo(
    () => locationAllocationFilterFocusPath(unitFilter, teamFilter),
    [teamFilter, unitFilter]
  );
  const selectedFilterFocusKey = selectedFilterFocusPath.join('\t');

  const treemapScope = useMemo(
    () => resolveLocationAllocationTreemapScope(regionFilter, marketCountry),
    [regionFilter, marketCountry]
  );

  const filteredInitiatives = useMemo(
    () =>
      filterLocationTimelineInitiatives(initiatives, {
        year,
        region: regionFilter,
        unit: unitFilter,
        team: teamFilter,
        marketCountry,
        countries,
        countryIdToClusterKey,
      }),
    [
      initiatives,
      year,
      regionFilter,
      unitFilter,
      teamFilter,
      marketCountry,
      countries,
      countryIdToClusterKey,
    ]
  );

  const yearQuarters = useMemo(
    () => quartersForYear(filteredInitiatives, year),
    [filteredInitiatives, year]
  );

  const meta = useMemo(
    () =>
      buildLocationAllocationTreemapMeta(
        filteredInitiatives,
        yearQuarters,
        countries,
        countryIdToClusterKey,
        headcount
      ),
    [filteredInitiatives, yearQuarters, countries, countryIdToClusterKey, headcount]
  );

  const initiativesById = useMemo(
    () => new Map(filteredInitiatives.map((row) => [row.id, row])),
    [filteredInitiatives]
  );

  const tree = useMemo(
    () =>
      prepareLocationAllocationTreemapTree(
        buildLocationAllocationTreemapTree(
          filteredInitiatives,
          yearQuarters,
          {
            showTeams: effectiveShowTeams,
            showInitiatives: effectiveShowInitiatives,
          },
          treemapScope,
          countries,
          countryIdToClusterKey
        )
      ),
    [
      filteredInitiatives,
      yearQuarters,
      effectiveShowTeams,
      effectiveShowInitiatives,
      treemapScope,
      countries,
      countryIdToClusterKey,
    ]
  );

  const totalValue = useMemo(
    () => (tree.children ?? []).reduce((s, c) => s + (c.value ?? 0), 0),
    [tree]
  );

  const contentKey = useMemo(
    () =>
      [
        effectiveShowTeams ? 'teams:1' : 'teams:0',
        effectiveShowInitiatives ? 'initiatives:1' : 'initiatives:0',
        `filter-focus:${selectedFilterFocusKey}`,
        yearQuarters.join('|'),
        treemapScope.kind === 'all'
          ? 'scope:all'
          : treemapScope.kind === 'region'
            ? `scope:region:${treemapScope.region}`
            : `scope:market:${treemapScope.country.id}`,
      ].join(';'),
    [
      effectiveShowTeams,
      effectiveShowInitiatives,
      selectedFilterFocusKey,
      yearQuarters,
      treemapScope,
    ]
  );

  const handleAutoEnableTeams = useCallback(() => {
    if (!showTeams) {
      onShowTeamsChange(true);
    }
  }, [showTeams, onShowTeamsChange]);

  const handleAutoEnableInitiatives = useCallback(() => {
    if (!showInitiatives) {
      onShowInitiativesChange(true);
    }
  }, [showInitiatives, onShowInitiativesChange]);

  const handleEditNode = useCallback(
    (node: TreemapLayoutNode) => {
      const target = resolveGeoEditTargetFromNode(
        node,
        meta,
        initiativesById,
        yearQuarters,
        countries,
        countryIdToClusterKey
      );
      if (!target) return;
      setEditTarget(target);
      setEditOpen(true);
    },
    [meta, initiativesById, yearQuarters, countries, countryIdToClusterKey]
  );

  useEffect(() => {
    if (
      !focusedComment ||
      handledFocusedCommentRef.current === focusedComment.id ||
      yearQuarters.length === 0
    ) {
      return;
    }
    const target = resolveGeoEditTargetFromScope(
      focusedComment.scope,
      filteredInitiatives,
      yearQuarters,
      countries,
      countryIdToClusterKey
    );
    if (!target) return;
    handledFocusedCommentRef.current = focusedComment.id;
    setEditTarget(target);
    setEditOpen(true);
  }, [
    focusedComment,
    filteredInitiatives,
    yearQuarters,
    countries,
    countryIdToClusterKey,
  ]);

  if (yearQuarters.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="h-[calc(100dvh-8rem)] min-h-[560px]">
        {totalValue > 0 ? (
          <LocationAllocationTreemapContainer
            key={`location-treemap:${selectedFilterFocusKey || 'all'}`}
            data={tree}
            meta={meta}
            treemapScope={treemapScope}
            countries={countries}
            countryIdToClusterKey={countryIdToClusterKey}
            contentKey={contentKey}
            showTeams={effectiveShowTeams}
            showInitiatives={effectiveShowInitiatives}
            initialFocusedPath={selectedFilterFocusPath}
            hasData={filteredInitiatives.length > 0}
            showMoney
            getColor={getUnitColor}
            onAutoEnableTeams={handleAutoEnableTeams}
            onAutoEnableInitiatives={handleAutoEnableInitiatives}
            onNavigateUp={onNavigateUp}
            onEditNode={handleEditNode}
            commentSummary={readOnly ? undefined : commentSummaryQuery.data}
          />
        ) : (
          <p className="flex h-full items-center justify-center text-sm text-muted-foreground px-4 text-center">
            Нет инициатив с бюджетом за {year}.
          </p>
        )}
      </div>

      <LocationAllocationTreemapEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        target={editTarget}
        countries={countries}
        countryIdToClusterKey={countryIdToClusterKey}
        onGeoCostSplitSave={onGeoCostSplitSave}
        onInitiativeTagsSave={onInitiativeTagsSave}
        focusedCommentId={focusedComment?.id ?? null}
        readOnly={readOnly}
      />
    </div>
  );
}
