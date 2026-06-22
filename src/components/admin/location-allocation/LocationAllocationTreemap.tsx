import { useCallback, useMemo, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import type { AdminDataRow, GeoCostSplit } from '@/lib/adminDataManager';
import type { MarketCountryRow } from '@/hooks/useMarketCountries';
import {
  buildLocationAllocationTreemapMeta,
  buildLocationAllocationTreemapTree,
  prepareLocationAllocationTreemapTree,
} from '@/lib/locationAllocationTreemap';
import {
  filterLocationTimelineInitiatives,
  type LocationTeamFilter,
} from '@/lib/locationRegionModel';
import { LocationAllocationTreemapContainer } from '@/components/admin/location-allocation/LocationAllocationTreemapContainer';
import { LocationAllocationTreemapEditDialog } from '@/components/admin/location-allocation/LocationAllocationTreemapEditDialog';
import { quartersForYear } from '@/lib/locationAllocationModel';
import { getUnitColor } from '@/lib/dataManager';
import { useAccess } from '@/hooks/useAccess';
import { cn } from '@/lib/utils';
import type { TreemapLayoutNode } from '@/components/treemap/types';
import {
  resolveGeoEditTargetFromNode,
  type LocationAllocationGeoEditTarget,
} from '@/lib/locationAllocationGeoEdit';

type Props = {
  initiatives: AdminDataRow[];
  year: number;
  unitFilter: string | null;
  teamFilter: LocationTeamFilter | null;
  countries: MarketCountryRow[];
  countryIdToClusterKey: Map<string, string>;
  onGeoCostSplitSave: (id: string, split: GeoCostSplit | undefined) => Promise<void>;
};

function NestingToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer px-1.5 py-1 rounded hover:bg-secondary">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="hidden" />
      <span
        className={cn(
          'w-3.5 h-3.5 border rounded flex items-center justify-center',
          checked ? 'bg-primary border-primary text-primary-foreground' : 'border-border'
        )}
      >
        {checked && <Check size={10} />}
      </span>
      <span>{label}</span>
    </label>
  );
}

export function LocationAllocationTreemap({
  initiatives,
  year,
  unitFilter,
  teamFilter,
  countries,
  countryIdToClusterKey,
  onGeoCostSplitSave,
}: Props) {
  const { canViewMoney } = useAccess();

  const [showTeams, setShowTeams] = useState(false);
  const [showInitiatives, setShowInitiatives] = useState(false);
  const [showMoney, setShowMoney] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<LocationAllocationGeoEditTarget | null>(null);

  const autoEnabledRef = useRef({ teams: false, initiatives: false });

  const filteredInitiatives = useMemo(
    () =>
      filterLocationTimelineInitiatives(initiatives, {
        year,
        region: null,
        unit: unitFilter,
        team: teamFilter,
        countries,
        countryIdToClusterKey,
      }),
    [initiatives, year, unitFilter, teamFilter, countries, countryIdToClusterKey]
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
        countryIdToClusterKey
      ),
    [filteredInitiatives, yearQuarters, countries, countryIdToClusterKey]
  );

  const initiativesById = useMemo(
    () => new Map(filteredInitiatives.map((row) => [row.id, row])),
    [filteredInitiatives]
  );

  const tree = useMemo(
    () =>
      prepareLocationAllocationTreemapTree(
        buildLocationAllocationTreemapTree(filteredInitiatives, yearQuarters, {
          showTeams,
          showInitiatives,
        })
      ),
    [filteredInitiatives, yearQuarters, showTeams, showInitiatives]
  );

  const totalValue = useMemo(
    () => (tree.children ?? []).reduce((s, c) => s + (c.value ?? 0), 0),
    [tree]
  );

  const contentKey = useMemo(
    () =>
      [
        showTeams ? 'teams:1' : 'teams:0',
        showInitiatives ? 'initiatives:1' : 'initiatives:0',
        yearQuarters.join('|'),
      ].join(';'),
    [showTeams, showInitiatives, yearQuarters]
  );

  const handleAutoEnableTeams = useCallback(() => {
    if (!showTeams) {
      setShowTeams(true);
      autoEnabledRef.current.teams = true;
    }
  }, [showTeams]);

  const handleAutoEnableInitiatives = useCallback(() => {
    if (!showInitiatives) {
      setShowInitiatives(true);
      autoEnabledRef.current.initiatives = true;
    }
  }, [showInitiatives]);

  const handleAutoDisableTeams = useCallback(() => {
    if (autoEnabledRef.current.teams) {
      setShowTeams(false);
      autoEnabledRef.current.teams = false;
    }
  }, []);

  const handleAutoDisableInitiatives = useCallback(() => {
    if (autoEnabledRef.current.initiatives) {
      setShowInitiatives(false);
      autoEnabledRef.current.initiatives = false;
    }
  }, []);

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

  if (yearQuarters.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-1 border-b border-border bg-header px-3 py-2 rounded-t-xl">
        <NestingToggle
          label="Команды"
          checked={showTeams}
          onChange={(v) => {
            setShowTeams(v);
            if (!v) autoEnabledRef.current.teams = false;
          }}
        />
        <NestingToggle
          label="Инициативы"
          checked={showInitiatives}
          onChange={(v) => {
            setShowInitiatives(v);
            if (!v) autoEnabledRef.current.initiatives = false;
          }}
        />
        {canViewMoney ? (
          <NestingToggle label="Деньги" checked={showMoney} onChange={setShowMoney} />
        ) : null}
        <p className="ml-auto text-[10px] text-muted-foreground hidden sm:block">
          В ячейке — по регионам; наведите — по рынкам; ✎ — редактирование
        </p>
      </div>

      <div className="h-[calc(100dvh-10rem)] min-h-[560px]">
        {totalValue > 0 ? (
          <LocationAllocationTreemapContainer
            data={tree}
            meta={meta}
            contentKey={contentKey}
            showTeams={showTeams}
            showInitiatives={showInitiatives}
            hasData={filteredInitiatives.length > 0}
            showMoney={canViewMoney && showMoney}
            getColor={getUnitColor}
            onAutoEnableTeams={handleAutoEnableTeams}
            onAutoEnableInitiatives={handleAutoEnableInitiatives}
            onAutoDisableTeams={handleAutoDisableTeams}
            onAutoDisableInitiatives={handleAutoDisableInitiatives}
            onEditNode={handleEditNode}
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
      />
    </div>
  );
}
