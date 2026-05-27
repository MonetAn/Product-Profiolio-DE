import { useCallback, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { toast } from 'sonner';
import ScopeSelector from '@/components/admin/ScopeSelector';
import StaticTreemapContainer from '@/components/treemap/StaticTreemapContainer';
import { prepareStaticTreemapTree } from '@/lib/staticTreemapData';
import { buildUnificationTreemapRoot } from '@/lib/unificationTreemap';
import { buildSingleCrossOverviewTree } from '@/lib/crossInitiativeOverviewTree';
import { LinkDestinationDialog } from '@/components/unification/LinkDestinationDialog';
import { LogoLoader } from '@/components/LogoLoader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { AdminDataRow } from '@/lib/adminDataManager';
import {
  crossIdsForInitiative,
  crossNamesForInitiative,
  type CrossInitiativesBundle,
} from '@/lib/crossInitiativeModel';
import { getCrossName } from '@/hooks/useCrossInitiatives';
import { getUniqueUnits } from '@/lib/adminDataManager';
import { getUnitColor } from '@/lib/dataManager';
import { createCrossOverviewColorGetter, getCrossInitiativeColor } from '@/lib/crossTreemapColors';
import type { UnificationBudgetContext } from '@/lib/unificationBudget';

interface UnificationLinkModeProps {
  allInitiatives: AdminDataRow[];
  bundle: CrossInitiativesBundle | undefined;
  initiativeById: Map<string, AdminDataRow>;
  selectedQuarters: string[];
  showMoney: boolean;
  isLoading: boolean;
  budgetCtx: UnificationBudgetContext;
  onLink: (
    sourceId: string,
    targetId: string,
    mode: 'create' | 'add' | 'add_both',
    crossId?: string,
    name?: string
  ) => Promise<string | void>;
}

function filterInitiativesByQuery(
  rows: AdminDataRow[],
  query: string,
  excludeId?: string | null
): AdminDataRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return rows.filter(
    (r) =>
      r.id !== excludeId &&
      (r.initiative.toLowerCase().includes(q) ||
        r.unit.toLowerCase().includes(q) ||
        (r.team || '').toLowerCase().includes(q))
  );
}

function InitiativeSearchList({
  rows,
  selectedId,
  onSelect,
  emptyMessage,
}: {
  rows: AdminDataRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  emptyMessage: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="p-6 text-sm text-muted-foreground text-center">{emptyMessage}</p>
    );
  }

  return (
    <ul className="overflow-y-auto h-full divide-y divide-border">
      {rows.map((row) => (
        <li key={row.id}>
          <button
            type="button"
            className={cn(
              'w-full text-left px-4 py-3 hover:bg-secondary/50 flex gap-2 items-center transition-colors',
              selectedId === row.id && 'bg-primary/15 ring-1 ring-inset ring-primary/40'
            )}
            onClick={() => onSelect(row.id)}
          >
            <span
              className="w-1 h-8 rounded-full shrink-0"
              style={{ backgroundColor: getUnitColor(row.unit) }}
            />
            <span className="min-w-0">
              <span className="text-sm font-medium block truncate">{row.initiative}</span>
              <span className="text-xs text-muted-foreground">
                {row.unit} · {row.team}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function LinkPanelHeader({
  title,
  selection,
  searchQuery,
  onSearchQueryChange,
  searchPlaceholder,
}: {
  title: string;
  selection: string | null;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  searchPlaceholder: string;
}) {
  return (
    <div className="shrink-0 border-b border-border bg-secondary/20 px-4 py-2 space-y-2">
      <div className="flex items-baseline gap-2 min-h-[1.25rem]">
        <h3 className="text-sm font-medium shrink-0">{title}</h3>
        <span
          className={cn(
            'text-xs truncate min-w-0',
            selection ? 'text-foreground font-medium' : 'text-muted-foreground'
          )}
        >
          {selection ?? '—'}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-9 h-9"
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
          />
        </div>
        {searchQuery.trim() && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 h-9 px-2"
            onClick={() => onSearchQueryChange('')}
          >
            Сброс
          </Button>
        )}
      </div>
    </div>
  );
}

export function UnificationLinkMode({
  allInitiatives,
  bundle,
  initiativeById,
  selectedQuarters,
  showMoney,
  isLoading,
  budgetCtx,
  onLink,
}: UnificationLinkModeProps) {
  const [sourceUnits, setSourceUnits] = useState<string[]>([]);
  const [sourceTeams, setSourceTeams] = useState<string[]>([]);
  const [targetUnits, setTargetUnits] = useState<string[]>([]);
  const [targetTeams, setTargetTeams] = useState<string[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [resultCrossId, setResultCrossId] = useState<string | null>(null);
  const [sourceSearchQuery, setSourceSearchQuery] = useState('');
  const [targetSearchQuery, setTargetSearchQuery] = useState('');
  const [linking, setLinking] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);

  const members = bundle?.members ?? [];
  const getInitiativeCrossNames = useCallback(
    (initiativeId: string) => crossNamesForInitiative(initiativeId, bundle),
    [bundle]
  );
  const units = useMemo(() => getUniqueUnits(allInitiatives), [allInitiatives]);

  const sourceTeamsList = useMemo(
    () =>
      [
        ...new Set(
          allInitiatives
            .filter((r) => sourceUnits.length === 0 || sourceUnits.includes(r.unit))
            .map((r) => r.team)
            .filter(Boolean)
        ),
      ].sort() as string[],
    [allInitiatives, sourceUnits]
  );

  const targetTeamsList = useMemo(
    () =>
      [
        ...new Set(
          allInitiatives
            .filter((r) => targetUnits.length === 0 || targetUnits.includes(r.unit))
            .map((r) => r.team)
            .filter(Boolean)
        ),
      ].sort() as string[],
    [allInitiatives, targetUnits]
  );

  const sourceReady = sourceUnits.length === 1 && sourceTeams.length === 1;
  const targetReady = targetUnits.length === 1 && targetTeams.length === 1;

  const sourceRows = useMemo(() => {
    if (!sourceReady) return [];
    const [unit] = sourceUnits;
    const [team] = sourceTeams;
    return allInitiatives.filter((r) => r.unit === unit && r.team === team);
  }, [allInitiatives, sourceUnits, sourceTeams, sourceReady]);

  const sourceInSearch = sourceSearchQuery.trim().length > 0;
  const targetInSearch = targetSearchQuery.trim().length > 0;

  const sourceSearchResults = useMemo(
    () =>
      sourceInSearch
        ? filterInitiativesByQuery(allInitiatives, sourceSearchQuery, selectedTargetId)
        : [],
    [allInitiatives, sourceSearchQuery, sourceInSearch, selectedTargetId]
  );

  const targetRows = useMemo(() => {
    if (targetInSearch) {
      return filterInitiativesByQuery(allInitiatives, targetSearchQuery, selectedSourceId);
    }
    if (!targetReady) return [];
    const [unit] = targetUnits;
    const [team] = targetTeams;
    return allInitiatives.filter(
      (r) => r.unit === unit && r.team === team && r.id !== selectedSourceId
    );
  }, [
    allInitiatives,
    targetUnits,
    targetTeams,
    targetReady,
    selectedSourceId,
    targetInSearch,
    targetSearchQuery,
  ]);

  const sourceTree = useMemo(() => {
    if (!sourceReady) return null;
    const root = buildUnificationTreemapRoot('', sourceRows, selectedQuarters, budgetCtx);
    return prepareStaticTreemapTree(root);
  }, [sourceRows, sourceReady, selectedQuarters, budgetCtx]);

  const targetTree = useMemo(() => {
    if (targetInSearch || !targetReady || targetRows.length === 0) return null;
    const root = buildUnificationTreemapRoot('', targetRows, selectedQuarters, budgetCtx);
    return prepareStaticTreemapTree(root);
  }, [targetRows, targetReady, selectedQuarters, targetInSearch, budgetCtx]);

  const resultCross = useMemo(
    () => bundle?.crossInitiatives.find((c) => c.id === resultCrossId) ?? null,
    [bundle, resultCrossId]
  );

  const resultTree = useMemo(() => {
    if (!resultCross) return null;
    const root = buildSingleCrossOverviewTree(
      resultCross,
      members,
      initiativeById,
      selectedQuarters,
      budgetCtx
    );
    return prepareStaticTreemapTree(root);
  }, [resultCross, members, initiativeById, selectedQuarters, budgetCtx]);

  const sourceLabel =
    (selectedSourceId && initiativeById.get(selectedSourceId)?.initiative) || '—';
  const targetLabel =
    (selectedTargetId && initiativeById.get(selectedTargetId)?.initiative) || '—';

  const applyToCross = useCallback(
    async (crossId: string) => {
      if (!selectedSourceId || !selectedTargetId) return;
      const srcIn = crossIdsForInitiative(selectedSourceId, members).includes(crossId);
      const tgtIn = crossIdsForInitiative(selectedTargetId, members).includes(crossId);
      if (srcIn && tgtIn) {
        toast.info(`Уже в «${getCrossName(crossId, bundle)}»`);
        return;
      }
      setLinking(true);
      try {
        let id: string | void;
        if (!srcIn && !tgtIn) {
          id = await onLink(selectedSourceId, selectedTargetId, 'add_both', crossId);
        } else {
          id = await onLink(selectedSourceId, selectedTargetId, 'add', crossId);
        }
        setResultCrossId(typeof id === 'string' ? id : crossId);
        setSelectedTargetId(null);
        setLinkDialogOpen(false);
      } finally {
        setLinking(false);
      }
    },
    [selectedSourceId, selectedTargetId, members, bundle, onLink]
  );

  const openLinkDialog = useCallback(() => {
    if (!selectedSourceId || !selectedTargetId) {
      toast.info('Выберите две инициативы');
      return;
    }
    const shared = crossIdsForInitiative(selectedSourceId, members).filter((id) =>
      crossIdsForInitiative(selectedTargetId, members).includes(id)
    );
    if (shared.length > 0) {
      toast.info(`Уже в «${getCrossName(shared[0], bundle)}»`);
      return;
    }
    setLinkDialogOpen(true);
  }, [selectedSourceId, selectedTargetId, members, bundle]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <LogoLoader className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-4 py-2 border-b border-border shrink-0 space-y-2">
        <div className="flex flex-col xl:flex-row xl:items-center gap-2 xl:gap-6">
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
            <span className="text-xs font-medium text-muted-foreground shrink-0 w-[7.5rem]">
              Моя команда
            </span>
            <div className="flex-1 min-w-[200px]">
              <ScopeSelector
                units={units}
                teams={sourceTeamsList}
                selectedUnits={sourceUnits}
                selectedTeams={sourceTeams}
                onUnitsChange={setSourceUnits}
                onTeamsChange={setSourceTeams}
                allData={allInitiatives}
                adminViewAll
                selectionMode="single"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
            <span className="text-xs font-medium text-muted-foreground shrink-0 w-[7.5rem]">
              Команда-партнёр
            </span>
            <div className="flex-1 min-w-[200px]">
              <ScopeSelector
                units={units}
                teams={targetTeamsList}
                selectedUnits={targetUnits}
                selectedTeams={targetTeams}
                onUnitsChange={setTargetUnits}
                onTeamsChange={setTargetTeams}
                allData={allInitiatives}
                adminViewAll
                selectionMode="single"
              />
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            className="shrink-0 bg-[#7B5FA8] text-white hover:bg-[#6B4E9A] shadow-sm"
            disabled={!selectedSourceId || !selectedTargetId || linking}
            onClick={openLinkDialog}
          >
            Создать
          </Button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 flex-col lg:flex-row">
        <section className="flex-1 min-w-0 min-h-[220px] lg:min-h-0 flex flex-col border-b lg:border-b-0 lg:border-r border-border">
          <LinkPanelHeader
            title="Что связать"
            selection={selectedSourceId ? sourceLabel : null}
            searchQuery={sourceSearchQuery}
            onSearchQueryChange={setSourceSearchQuery}
            searchPlaceholder="Поиск по всем инициативам…"
          />
          <div className="flex-1 min-h-[180px] relative">
            {sourceInSearch ? (
              <InitiativeSearchList
                rows={sourceSearchResults}
                selectedId={selectedSourceId}
                onSelect={setSelectedSourceId}
                emptyMessage="Ничего не найдено"
              />
            ) : !sourceReady ? (
              <p className="text-sm text-muted-foreground p-6 text-center">
                Выберите юнит и команду или воспользуйтесь поиском
              </p>
            ) : sourceTree ? (
              <StaticTreemapContainer
                data={sourceTree}
                showTeams={false}
                showInitiatives
                hasData
                selectedQuarters={selectedQuarters}
                showMoney={showMoney}
                treemapLayoutStrategy="d3-root"
                getColor={() => getUnitColor(sourceUnits[0] ?? '')}
                onAdminInitiativeRowClick={(id) => setSelectedSourceId(id)}
                selectedInitiativeId={selectedSourceId}
                contentKey={`src-${selectedSourceId}-${sourceRows.length}`}
                nodeCursor="pointer"
                getInitiativeCrossNames={getInitiativeCrossNames}
                emptyStateShowResetButton={false}
              />
            ) : null}
          </div>
        </section>

        <section className="flex-1 min-w-0 min-h-[220px] lg:min-h-0 flex flex-col">
          <LinkPanelHeader
            title="С кем связать"
            selection={selectedTargetId ? targetLabel : null}
            searchQuery={targetSearchQuery}
            onSearchQueryChange={setTargetSearchQuery}
            searchPlaceholder="Поиск по всем инициативам…"
          />
          <div className="flex-1 min-h-[180px] relative">
            {targetInSearch ? (
              <InitiativeSearchList
                rows={targetRows}
                selectedId={selectedTargetId}
                onSelect={setSelectedTargetId}
                emptyMessage="Ничего не найдено"
              />
            ) : !targetReady ? (
              <p className="text-sm text-muted-foreground p-6 text-center">
                Выберите юнит и команду партнёра или воспользуйтесь поиском
              </p>
            ) : targetTree ? (
              <StaticTreemapContainer
                data={targetTree}
                showTeams={false}
                showInitiatives
                hasData
                selectedQuarters={selectedQuarters}
                showMoney={showMoney}
                treemapLayoutStrategy="d3-root"
                getColor={() => getUnitColor(targetUnits[0] ?? '')}
                onAdminInitiativeRowClick={(id) => setSelectedTargetId(id)}
                selectedInitiativeId={selectedTargetId}
                contentKey={`tgt-${selectedTargetId}-${targetRows.length}`}
                nodeCursor="pointer"
                getInitiativeCrossNames={getInitiativeCrossNames}
                emptyStateShowResetButton={false}
              />
            ) : (
              <p className="text-sm text-muted-foreground p-6 text-center">Нет инициатив в команде</p>
            )}
          </div>
        </section>
      </div>

      {resultCross && resultTree && (
        <div className="shrink-0 border-t border-border bg-card">
          <p className="text-xs font-medium text-muted-foreground px-4 pt-2">
            Результат · {resultCross.name}
          </p>
          <div className="h-[140px] w-full relative px-2 pb-2">
            <StaticTreemapContainer
              data={resultTree}
              showTeams
              showInitiatives
              hasData
              selectedQuarters={selectedQuarters}
              showMoney={showMoney}
              treemapLayoutStrategy="d3-root"
              getColor={(name) =>
                name === resultCross.name ? getCrossInitiativeColor(name) : getUnitColor(name)
              }
              contentKey={`result-${resultCrossId}`}
              nodeCursor="default"
              getInitiativeCrossNames={getInitiativeCrossNames}
              emptyStateShowResetButton={false}
            />
          </div>
        </div>
      )}

      <LinkDestinationDialog
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        bundle={bundle}
        sourceLabel={sourceLabel}
        targetLabel={targetLabel}
        busy={linking}
        onPickCross={(crossId) => void applyToCross(crossId)}
        onCreateNew={(name) => {
          if (!selectedSourceId || !selectedTargetId) return;
          setLinking(true);
          void onLink(selectedSourceId, selectedTargetId, 'create', undefined, name)
            .then((id) => {
              if (typeof id === 'string') setResultCrossId(id);
              setSelectedTargetId(null);
              setLinkDialogOpen(false);
            })
            .finally(() => setLinking(false));
        }}
      />
    </div>
  );
}
