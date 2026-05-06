import { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Calendar, HelpCircle, Check, RotateCcw, ArrowUpDown, Eye, EyeOff } from 'lucide-react';
import { RawDataRow, calculateBudget, formatBudget, isInitiativeOffTrack, isInitiativeSupport, parseStakeholderParts, compareStakeholderOrder, getStakeholderSetKey, type SupportFilter } from '@/lib/dataManager';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface FilterBarProps {
  // Filters
  units: string[];
  teams: string[];
  selectedUnits: string[];
  selectedTeams: string[];
  onUnitsChange: (units: string[]) => void;
  onTeamsChange: (teams: string[]) => void;
  
  // Support filter: all | exclude support | only support
  supportFilter: SupportFilter;
  onSupportFilterChange: (val: SupportFilter) => void;
  showOnlyOfftrack: boolean;
  onShowOnlyOfftrackChange: (val: boolean) => void;
  
  // Stakeholder multi-select
  allStakeholders: string[];
  selectedStakeholders: string[];
  onStakeholdersChange: (stakeholders: string[]) => void;
  
  // Period selector
  availableYears: string[];
  availableQuarters: string[];
  selectedQuarters: string[];
  onQuartersChange: (quarters: string[]) => void;
  
  // Totals
  rawData: RawDataRow[];
  
  // Nesting toggles
  showTeams: boolean;
  showInitiatives: boolean;
  onShowTeamsChange: (val: boolean) => void;
  onShowInitiativesChange: (val: boolean) => void;
  showOnlyPnlIt?: boolean;
  onShowOnlyPnlItChange?: (val: boolean) => void;
  showMoney: boolean;
  onShowMoneyChange: (val: boolean) => void;
  /** If false, money checkbox and cost filter are hidden; user cannot see money */
  canViewMoney?: boolean;
  
  // Off-track modal
  onOfftrackClick: () => void;
  hideStubs?: boolean;
  onHideStubsChange?: (val: boolean) => void;
  onStubClick?: () => void;
  
  // Hide nesting toggles (for Timeline view)
  hideNestingToggles?: boolean;

  /** Влияет на зум тримапы и на применение фильтра стоимости (только таймлайн) */
  currentView?: 'budget' | 'stakeholders' | 'timeline';

  /** Только super_admin на вкладке «Бюджет»: показать sensitive в тримапе (по умолчанию скрыты на клиенте) */
  showSensitiveTreemap?: boolean;
  onShowSensitiveTreemapChange?: (val: boolean) => void;
  /** Показывать блок с галочкой Sensitive */
  sensitiveTreemapToggleVisible?: boolean;
  
  // Reset filters
  onResetFilters?: () => void;
  hasActiveFilters?: boolean;
  
  // Cost filter (Timeline only)
  costSortOrder?: 'none' | 'asc' | 'desc';
  onCostSortOrderChange?: (order: 'none' | 'asc' | 'desc') => void;
  costFilterMin?: number | null;
  costFilterMax?: number | null;
  onCostFilterChange?: (min: number | null, max: number | null) => void;
  costType?: 'period' | 'total';
  onCostTypeChange?: (type: 'period' | 'total') => void;
  
  // Zoom breadcrumb (visual only, no data effect)
  zoomPath?: string[];
  zoomActiveTab?: 'budget' | 'stakeholders';
}

/** Доли 0–100 для трёх ведёр; сумма всегда 100 при total > 0 (метод наибольших дробных частей). */
function threeBucketPercentages(a: number, b: number, c: number): [number, number, number] {
  const total = a + b + c;
  if (total <= 0) return [0, 0, 0];
  const raw = [(a / total) * 100, (b / total) * 100, (c / total) * 100];
  const floors = raw.map((r) => Math.floor(r));
  let remainder = 100 - floors.reduce((s, x) => s + x, 0);
  const byFrac = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((x, y) => y.frac - x.frac);
  const out: [number, number, number] = [floors[0], floors[1], floors[2]];
  for (let k = 0; k < remainder; k++) {
    out[byFrac[k].i]++;
  }
  return out;
}

const FilterBar = ({
  units,
  teams,
  selectedUnits,
  selectedTeams,
  onUnitsChange,
  onTeamsChange,
  supportFilter,
  onSupportFilterChange,
  showOnlyOfftrack,
  onShowOnlyOfftrackChange,
  hideStubs = false,
  onHideStubsChange,
  onStubClick,
  allStakeholders,
  selectedStakeholders,
  onStakeholdersChange,
  availableYears,
  availableQuarters,
  selectedQuarters,
  onQuartersChange,
  rawData,
  showTeams,
  showInitiatives,
  onShowTeamsChange,
  onShowInitiativesChange,
  showOnlyPnlIt = true,
  onShowOnlyPnlItChange,
  showMoney,
  onShowMoneyChange,
  canViewMoney = true,
  onOfftrackClick,
  hideNestingToggles = false,
  onResetFilters,
  hasActiveFilters = false,
  currentView = 'budget',
  // Cost filter props
  costSortOrder = 'none',
  onCostSortOrderChange,
  costFilterMin = null,
  costFilterMax = null,
  onCostFilterChange,
  costType = 'period',
  onCostTypeChange,
  zoomPath = [],
  zoomActiveTab = 'budget',
  showSensitiveTreemap = false,
  onShowSensitiveTreemapChange,
  sensitiveTreemapToggleVisible = false,
}: FilterBarProps) => {
  const [periodMenuOpen, setPeriodMenuOpen] = useState(false);
  const [stakeholderMenuOpen, setStakeholderMenuOpen] = useState(false);
  const [unitMenuOpen, setUnitMenuOpen] = useState(false);
  const [teamMenuOpen, setTeamMenuOpen] = useState(false);
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [hoverQuarter, setHoverQuarter] = useState<string | null>(null);
  
  // Cost filter local state
  const [costMenuOpen, setCostMenuOpen] = useState(false);
  const [localMinCost, setLocalMinCost] = useState<string>('');
  const [localMaxCost, setLocalMaxCost] = useState<string>('');
  
  const periodRef = useRef<HTMLDivElement>(null);
  const stakeholderRef = useRef<HTMLDivElement>(null);
  const unitRef = useRef<HTMLDivElement>(null);
  const teamRef = useRef<HTMLDivElement>(null);
  const costRef = useRef<HTMLDivElement>(null);
  
  // Sync local cost inputs with props
  useEffect(() => {
    setLocalMinCost(costFilterMin !== null ? (costFilterMin / 1000000).toString() : '');
    setLocalMaxCost(costFilterMax !== null ? (costFilterMax / 1000000).toString() : '');
  }, [costFilterMin, costFilterMax]);

  // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (periodRef.current && !periodRef.current.contains(e.target as Node)) {
        setPeriodMenuOpen(false);
        setRangeStart(null);
      }
      if (stakeholderRef.current && !stakeholderRef.current.contains(e.target as Node)) {
        setStakeholderMenuOpen(false);
      }
      if (unitRef.current && !unitRef.current.contains(e.target as Node)) {
        setUnitMenuOpen(false);
      }
      if (teamRef.current && !teamRef.current.contains(e.target as Node)) {
        setTeamMenuOpen(false);
      }
      if (costRef.current && !costRef.current.contains(e.target as Node)) {
        setCostMenuOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);
  
  // Cost filter helpers
  const getCostLabel = () => {
    const hasCostFilter = costFilterMin !== null || costFilterMax !== null || costSortOrder !== 'none';
    if (!hasCostFilter) return 'Стоимость';
    
    const parts: string[] = [];
    if (costSortOrder === 'asc') parts.push('↑');
    if (costSortOrder === 'desc') parts.push('↓');
    if (costFilterMin !== null || costFilterMax !== null) {
      const minStr = costFilterMin !== null ? `${(costFilterMin / 1000000).toFixed(1)}M` : '';
      const maxStr = costFilterMax !== null ? `${(costFilterMax / 1000000).toFixed(1)}M` : '';
      if (minStr && maxStr) parts.push(`${minStr}-${maxStr}`);
      else if (minStr) parts.push(`≥${minStr}`);
      else if (maxStr) parts.push(`≤${maxStr}`);
    }
    return parts.length > 0 ? parts.join(' ') : 'Стоимость';
  };
  
  const applyCostFilter = () => {
    const min = localMinCost ? parseFloat(localMinCost) * 1000000 : null;
    const max = localMaxCost ? parseFloat(localMaxCost) * 1000000 : null;
    onCostFilterChange?.(min, max);
  };
  
  const resetCostFilter = () => {
    setLocalMinCost('');
    setLocalMaxCost('');
    onCostFilterChange?.(null, null);
    onCostSortOrderChange?.('none');
  };

  // Get filtered teams based on selected units
  const filteredTeams = selectedUnits.length > 0
    ? teams.filter(t => {
        const teamsFromUnits = rawData
          .filter(r => selectedUnits.includes(r.unit))
          .map(r => r.team);
        return teamsFromUnits.includes(t);
      })
    : teams;

  // Totals + quarterly Dev/Support split (matches Gantt cell coloring); timeline cost filter aligned with Gantt
  const totals = useMemo(() => {
    return rawData.reduce(
      (acc, row) => {
        const periodBudget = calculateBudget(row, selectedQuarters, {
          includeNonPnlBudgets: !showOnlyPnlIt,
        });
        if (periodBudget === 0) return acc;

        const isSupport = isInitiativeSupport(row, selectedQuarters);
        const isOffTrack = isInitiativeOffTrack(row, selectedQuarters);

        if (supportFilter === 'exclude' && isSupport) return acc;
        if (supportFilter === 'only' && !isSupport) return acc;
        if (showOnlyOfftrack && !isOffTrack) return acc;
        if (hideStubs && row.isTimelineStub) return acc;
        if (selectedStakeholders.length > 0) {
          const rowParts = parseStakeholderParts(row.stakeholders);
          if (!rowParts.some(p => selectedStakeholders.includes(p))) return acc;
        }
        if (selectedUnits.length > 0 && !selectedUnits.includes(row.unit)) return acc;
        if (selectedTeams.length > 0 && !selectedTeams.includes(row.team)) return acc;

        const zoomActive =
          (currentView === 'budget' || currentView === 'stakeholders') &&
          zoomPath.length > 0 &&
          zoomActiveTab === currentView;
        if (zoomActive) {
          if (zoomActiveTab === 'budget') {
            if (row.unit !== zoomPath[0]) return acc;
            if (zoomPath.length >= 2 && row.team !== zoomPath[1]) return acc;
          } else {
            if (getStakeholderSetKey(row.stakeholders || '') !== zoomPath[0]) return acc;
            if (zoomPath.length >= 2 && row.unit !== zoomPath[1]) return acc;
            if (zoomPath.length >= 3 && row.team !== zoomPath[2]) return acc;
          }
        }

        if (currentView === 'timeline') {
          const costValue =
            costType === 'period'
              ? periodBudget
              : Object.keys(row.quarterlyData || {}).reduce((sum, quarter) => {
                  return (
                    sum +
                    calculateBudget(row, [quarter], {
                      includeNonPnlBudgets: !showOnlyPnlIt,
                    })
                  );
                }, 0);
          if (costFilterMin !== null && costValue < costFilterMin) return acc;
          if (costFilterMax !== null && costValue > costFilterMax) return acc;
        }

        acc.count++;
        acc.budget += periodBudget;
        if (isOffTrack) acc.offtrack++;
        if (row.isTimelineStub) acc.stubs++;
        selectedQuarters.forEach((q) => {
          const quarterBudget = calculateBudget(row, [q], {
            includeNonPnlBudgets: !showOnlyPnlIt,
          });
          if (quarterBudget <= 0) return;

          const quarterSupport = row.quarterlyData[q]?.support ?? false;
          if (row.isTimelineStub) acc.stubsQuarterly += quarterBudget;
          else if (quarterSupport) acc.supportQuarterly += quarterBudget;
          else acc.developmentQuarterly += quarterBudget;
        });
        return acc;
      },
      {
        count: 0,
        budget: 0,
        offtrack: 0,
        stubs: 0,
        developmentQuarterly: 0,
        supportQuarterly: 0,
        stubsQuarterly: 0,
      }
    );
  }, [
    rawData,
    selectedQuarters,
    supportFilter,
    showOnlyOfftrack,
    hideStubs,
    selectedStakeholders,
    selectedUnits,
    selectedTeams,
    currentView,
    zoomPath,
    zoomActiveTab,
    costFilterMin,
    costFilterMax,
    costType,
    showOnlyPnlIt,
  ]);

  const splitGrand =
    totals.developmentQuarterly + totals.supportQuarterly + totals.stubsQuarterly;
  const [devPct, supportPct, stubPct] = threeBucketPercentages(
    totals.developmentQuarterly,
    totals.supportQuarterly,
    totals.stubsQuarterly
  );

  // Period label - shorter version
  const getPeriodLabel = () => {
    if (selectedQuarters.length === 0) return 'Период';
    if (selectedQuarters.length === availableQuarters.length) {
      return `${availableYears[0]}-${availableYears[availableYears.length - 1]}`;
    }
    if (selectedQuarters.length === 1) {
      return selectedQuarters[0].replace('-', ' ');
    }
    return `${selectedQuarters.length} кв.`;
  };

  // Zoom context helpers
  const getZoomUnitName = () => {
    if (zoomActiveTab === 'budget') return zoomPath[0] || null;
    if (zoomActiveTab === 'stakeholders') return zoomPath[1] || null;
    return null;
  };
  const getZoomTeamName = () => {
    if (zoomActiveTab === 'budget') return zoomPath[1] || null;
    if (zoomActiveTab === 'stakeholders') return zoomPath[2] || null;
    return null;
  };
  const getZoomStakeholderName = () => {
    if (zoomActiveTab === 'stakeholders') return zoomPath[0] || null;
    return null;
  };

  const isZoomContext = (filterType: 'unit' | 'team' | 'stakeholder') => {
    if (filterType === 'unit') return selectedUnits.length === 0 && !!getZoomUnitName();
    if (filterType === 'team') return selectedTeams.length === 0 && !!getZoomTeamName();
    if (filterType === 'stakeholder') return selectedStakeholders.length === 0 && !!getZoomStakeholderName();
    return false;
  };

  // Stakeholder label - shorter
  const getStakeholderLabel = () => {
    if (selectedStakeholders.length === 0) {
      const zoomName = getZoomStakeholderName();
      if (zoomName) return zoomName.length > 10 ? zoomName.slice(0, 10) + '…' : zoomName;
      return 'Стейкх.';
    }
    if (selectedStakeholders.length === 1) {
      const s = selectedStakeholders[0];
      return s.length > 10 ? s.slice(0, 10) + '…' : s;
    }
    return `${selectedStakeholders.length} стейкх.`;
  };

  // Unit label - shorter
  const getUnitLabel = () => {
    if (selectedUnits.length === 0) {
      const zoomName = getZoomUnitName();
      if (zoomName) return zoomName.length > 12 ? zoomName.slice(0, 12) + '...' : zoomName;
      return 'Юниты';
    }
    if (selectedUnits.length === 1) {
      const u = selectedUnits[0];
      return u.length > 12 ? u.slice(0, 12) + '...' : u;
    }
    return `${selectedUnits.length} юнит.`;
  };

  // Team label - shorter
  const getTeamLabel = () => {
    if (selectedTeams.length === 0) {
      const zoomName = getZoomTeamName();
      if (zoomName) return zoomName.length > 12 ? zoomName.slice(0, 12) + '...' : zoomName;
      return 'Команды';
    }
    if (selectedTeams.length === 1) {
      const t = selectedTeams[0];
      return t.length > 12 ? t.slice(0, 12) + '...' : t;
    }
    return `${selectedTeams.length} ком.`;
  };

  // Calculate quarters in range for hover preview
  const getQuartersInRange = (start: string, end: string): string[] => {
    const sorted = availableQuarters.sort();
    const startIdx = sorted.indexOf(start);
    const endIdx = sorted.indexOf(end);
    if (startIdx === -1 || endIdx === -1) return [];
    const [minIdx, maxIdx] = [Math.min(startIdx, endIdx), Math.max(startIdx, endIdx)];
    return sorted.slice(minIdx, maxIdx + 1);
  };

  // Handle quarter click for range selection
  const handleQuarterClick = (q: string) => {
    if (rangeStart === null) {
      setRangeStart(q);
      onQuartersChange([q]);
    } else {
      const range = getQuartersInRange(rangeStart, q);
      onQuartersChange(range);
      setRangeStart(null);
    }
  };

  // Check if quarter is in hover range
  const isInHoverRange = (q: string): boolean => {
    if (!rangeStart || !hoverQuarter) return false;
    const range = getQuartersInRange(rangeStart, hoverQuarter);
    return range.includes(q);
  };

  const toggleUnit = (u: string) => {
    if (selectedUnits.includes(u)) {
      const newUnits = selectedUnits.filter(x => x !== u);
      onUnitsChange(newUnits);
      // Clear teams that don't belong to remaining units
      if (newUnits.length > 0) {
        const validTeams = rawData
          .filter(r => newUnits.includes(r.unit))
          .map(r => r.team);
        onTeamsChange(selectedTeams.filter(t => validTeams.includes(t)));
      } else {
        // If no units selected, clear teams too
        onTeamsChange([]);
      }
    } else {
      const newUnits = [...selectedUnits, u];
      onUnitsChange(newUnits);
      // When adding a unit, auto-select all teams from that unit
      const teamsFromNewUnit = [...new Set(rawData
        .filter(r => r.unit === u)
        .map(r => r.team)
        .filter(Boolean))];
      // Add new unit's teams to existing selection
      const newTeams = [...new Set([...selectedTeams, ...teamsFromNewUnit])];
      onTeamsChange(newTeams);
    }
  };

  const toggleTeam = (t: string) => {
    if (selectedTeams.includes(t)) {
      onTeamsChange(selectedTeams.filter(x => x !== t));
    } else {
      onTeamsChange([...selectedTeams, t]);
    }
  };

  const toggleYear = (year: string) => {
    const yearQuarters = availableQuarters.filter(q => q.startsWith(year));
    const allSelected = yearQuarters.every(q => selectedQuarters.includes(q));
    if (allSelected) {
      onQuartersChange(selectedQuarters.filter(q => !q.startsWith(year)));
    } else {
      const newQuarters = [...selectedQuarters];
      yearQuarters.forEach(q => {
        if (!newQuarters.includes(q)) newQuarters.push(q);
      });
      onQuartersChange(newQuarters.sort());
    }
    setRangeStart(null);
  };

  const toggleStakeholder = (s: string) => {
    if (selectedStakeholders.includes(s)) {
      onStakeholdersChange(selectedStakeholders.filter(x => x !== s));
    } else {
      onStakeholdersChange([...selectedStakeholders, s]);
    }
  };

  // Format budget for compact display
  const formatBudgetCompact = (value: number): string => {
    if (value >= 1000000) {
      return (value / 1000000).toFixed(1) + 'M';
    } else if (value >= 1000) {
      return Math.round(value / 1000) + 'K';
    }
    return value.toString();
  };

  return (
    <div className="bg-header border-b border-border fixed top-14 left-0 right-0 z-40">
      <div className="px-4 py-2 flex flex-col gap-2">
        {/* Строка 1: период и срез данных */}
        <div className="flex flex-wrap items-center gap-2 min-h-[36px]">
          {/* Unit multi-select */}
          <div ref={unitRef} className="relative">
            <button
              onClick={() => setUnitMenuOpen(!unitMenuOpen)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 bg-card border rounded-md text-xs cursor-pointer hover:border-muted-foreground ${
                isZoomContext('unit')
                  ? 'border-dashed border-muted-foreground/40 text-foreground/70'
                  : selectedUnits.length > 0
                    ? 'bg-primary/10 border-primary/30'
                    : 'border-border'
              }`}
            >
              <span className="truncate max-w-[80px]">{getUnitLabel()}</span>
              <ChevronDown size={12} className="text-muted-foreground flex-shrink-0" />
            </button>
            {unitMenuOpen && (
              <div className="absolute top-full mt-1 left-0 min-w-[200px] max-h-[280px] bg-card border border-border rounded-lg shadow-lg z-50 overflow-hidden animate-in fade-in slide-in-from-top-1">
                <div className="flex justify-between p-2 border-b border-border">
                  <button className="text-xs text-primary underline" onClick={() => onUnitsChange([...units])}>Все</button>
                  <button className="text-xs text-primary underline" onClick={() => { onUnitsChange([]); onTeamsChange([]); }}>Сброс</button>
                </div>
                <div className="max-h-[220px] overflow-y-auto p-1">
                  {units.map(u => (
                    <div
                      key={u}
                      onClick={() => toggleUnit(u)}
                      className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer text-xs hover:bg-secondary rounded ${selectedUnits.includes(u) ? 'bg-primary/10' : ''}`}
                    >
                      <span className={`w-3.5 h-3.5 border rounded flex items-center justify-center ${selectedUnits.includes(u) ? 'bg-primary border-primary text-primary-foreground' : 'border-border'}`}>
                        {selectedUnits.includes(u) && <Check size={10} />}
                      </span>
                      <span className="truncate">{u}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Team multi-select */}
          <div ref={teamRef} className="relative">
            <button
              onClick={() => setTeamMenuOpen(!teamMenuOpen)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 bg-card border rounded-md text-xs cursor-pointer hover:border-muted-foreground ${
                isZoomContext('team')
                  ? 'border-dashed border-muted-foreground/40 text-foreground/70'
                  : selectedTeams.length > 0
                    ? 'bg-primary/10 border-primary/30'
                    : 'border-border'
              }`}
            >
              <span className="truncate max-w-[80px]">{getTeamLabel()}</span>
              <ChevronDown size={12} className="text-muted-foreground flex-shrink-0" />
            </button>
            {teamMenuOpen && (
              <div className="absolute top-full mt-1 left-0 min-w-[200px] max-h-[280px] bg-card border border-border rounded-lg shadow-lg z-50 overflow-hidden animate-in fade-in slide-in-from-top-1">
                <div className="flex justify-between p-2 border-b border-border">
                  <button className="text-xs text-primary underline" onClick={() => onTeamsChange([...filteredTeams])}>Все</button>
                  <button className="text-xs text-primary underline" onClick={() => onTeamsChange([])}>Сброс</button>
                </div>
                <div className="max-h-[220px] overflow-y-auto p-1">
                  {filteredTeams.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">Нет команд</div>
                  ) : (
                    filteredTeams.map(t => (
                      <div
                        key={t}
                        onClick={() => toggleTeam(t)}
                        className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer text-xs hover:bg-secondary rounded ${selectedTeams.includes(t) ? 'bg-primary/10' : ''}`}
                      >
                        <span className={`w-3.5 h-3.5 border rounded flex items-center justify-center ${selectedTeams.includes(t) ? 'bg-primary border-primary text-primary-foreground' : 'border-border'}`}>
                          {selectedTeams.includes(t) && <Check size={10} />}
                        </span>
                        <span className="truncate">{t}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Stakeholder multi-select */}
          <div ref={stakeholderRef} className="relative">
            <button
              onClick={() => setStakeholderMenuOpen(!stakeholderMenuOpen)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 bg-card border rounded-md text-xs cursor-pointer hover:border-muted-foreground ${
                isZoomContext('stakeholder')
                  ? 'border-dashed border-muted-foreground/40 text-foreground/70'
                  : selectedStakeholders.length > 0
                    ? 'bg-primary/10 border-primary/30'
                    : 'border-border'
              }`}
            >
              <span className="truncate max-w-[80px]">{getStakeholderLabel()}</span>
              <ChevronDown size={12} className="text-muted-foreground flex-shrink-0" />
            </button>
            {stakeholderMenuOpen && (
              <div className="absolute top-full mt-1 left-0 min-w-[240px] max-h-[280px] bg-card border border-border rounded-lg shadow-lg z-50 overflow-hidden animate-in fade-in slide-in-from-top-1">
                <div className="flex justify-between p-2 border-b border-border">
                  <button className="text-xs text-primary underline" onClick={() => onStakeholdersChange([...allStakeholders])}>Все</button>
                  <button className="text-xs text-primary underline" onClick={() => onStakeholdersChange([])}>Сброс</button>
                </div>
                <div className="max-h-[220px] overflow-y-auto p-1">
                  {(() => {
                    // Get stakeholders that have projects matching current unit/team filters
                    const relevantStakeholders = new Set<string>();
                    rawData.forEach(row => {
                      const matchesUnit = selectedUnits.length === 0 || selectedUnits.includes(row.unit);
                      const matchesTeam = selectedTeams.length === 0 || selectedTeams.includes(row.team);
                      if (matchesUnit && matchesTeam && row.stakeholders) {
                        parseStakeholderParts(row.stakeholders).forEach(part => relevantStakeholders.add(part));
                      }
                    });
                    
                    // Sort: relevant first, then by display order
                    const sortedStakeholders = [...allStakeholders].sort((a, b) => {
                      const aRelevant = relevantStakeholders.has(a);
                      const bRelevant = relevantStakeholders.has(b);
                      if (aRelevant && !bRelevant) return -1;
                      if (!aRelevant && bRelevant) return 1;
                      return compareStakeholderOrder(a, b);
                    });
                    
                    return sortedStakeholders.map(s => {
                      const isRelevant = relevantStakeholders.has(s);
                      return (
                        <div
                          key={s}
                          onClick={() => toggleStakeholder(s)}
                          className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer text-xs hover:bg-secondary rounded ${selectedStakeholders.includes(s) ? 'bg-primary/10' : ''} ${!isRelevant ? 'opacity-40' : ''}`}
                        >
                          <span className={`w-3.5 h-3.5 border rounded flex items-center justify-center ${selectedStakeholders.includes(s) ? 'bg-primary border-primary text-primary-foreground' : 'border-border'}`}>
                            {selectedStakeholders.includes(s) && <Check size={10} />}
                          </span>
                          <span className="truncate">{s}</span>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            )}
          </div>

          {/* Period selector */}
          <div ref={periodRef} className="relative">
            <button
              onClick={() => setPeriodMenuOpen(!periodMenuOpen)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-card border border-border rounded-md text-xs cursor-pointer hover:border-muted-foreground font-medium"
            >
              <Calendar size={12} className="text-muted-foreground flex-shrink-0" />
              <span className="truncate max-w-[80px]">{getPeriodLabel()}</span>
              <ChevronDown size={12} className="text-muted-foreground flex-shrink-0" />
            </button>
            {periodMenuOpen && (
              <div className="absolute top-full mt-1 left-0 min-w-[300px] bg-card border border-border rounded-lg shadow-lg z-50 p-2 animate-in fade-in slide-in-from-top-1">
                <div className="flex justify-between mb-2 pb-2 border-b border-border">
                  <button className="text-xs text-primary underline" onClick={() => { onQuartersChange([...availableQuarters]); setRangeStart(null); }}>Все</button>
                  <button className="text-xs text-primary underline" onClick={() => { onQuartersChange([]); setRangeStart(null); }}>Сброс</button>
                </div>
                <p className="text-[10px] text-muted-foreground mb-2">
                  {rangeStart ? `Конец: ${rangeStart.replace('-', ' ')}` : 'Клик = начало диапазона'}
                </p>
                {availableYears.map(year => {
                  const yearQuarters = availableQuarters.filter(q => q.startsWith(year));
                  const allYearSelected = yearQuarters.every(q => selectedQuarters.includes(q));
                  return (
                    <div key={year} className="mb-2">
                      <div
                        className="flex items-center gap-1.5 px-1.5 py-1 text-xs font-semibold cursor-pointer rounded hover:bg-secondary"
                        onClick={() => toggleYear(year)}
                      >
                        <span className={`w-3.5 h-3.5 border rounded flex items-center justify-center ${allYearSelected ? 'bg-primary border-primary text-primary-foreground' : 'border-border'}`}>
                          {allYearSelected && <Check size={10} />}
                        </span>
                        {year}
                      </div>
                      <div className="grid grid-cols-4 gap-1 px-1.5 mt-1">
                        {yearQuarters.map(q => {
                          const qLabel = q.split('-')[1];
                          const isSelected = selectedQuarters.includes(q);
                          const isHovered = isInHoverRange(q);
                          const isStart = rangeStart === q;
                          return (
                            <button
                              key={q}
                              onClick={() => handleQuarterClick(q)}
                              onMouseEnter={() => setHoverQuarter(q)}
                              onMouseLeave={() => setHoverQuarter(null)}
                              className={`py-1 px-1.5 text-[10px] rounded border transition-all ${
                                isStart
                                  ? 'bg-primary text-primary-foreground border-primary ring-1 ring-primary/30'
                                  : isSelected
                                    ? 'bg-foreground text-background border-foreground'
                                    : isHovered
                                      ? 'bg-primary/30 border-primary/50'
                                      : 'bg-secondary border-border hover:border-muted-foreground'
                              }`}
                            >
                              {qLabel}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Cost filter - only shown for Timeline when user can see money */}
          {hideNestingToggles && onCostSortOrderChange && showMoney && (
            <div ref={costRef} className="relative">
              <button
                onClick={() => setCostMenuOpen(!costMenuOpen)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 border rounded-md text-xs cursor-pointer hover:border-muted-foreground ${
                  (costFilterMin !== null || costFilterMax !== null || costSortOrder !== 'none') 
                    ? 'bg-primary/10 border-primary text-primary' 
                    : 'bg-card border-border'
                }`}
              >
                <ArrowUpDown size={12} className="flex-shrink-0" />
                <span className="truncate max-w-[100px]">{getCostLabel()}</span>
                <ChevronDown size={12} className="text-muted-foreground flex-shrink-0" />
              </button>
              {costMenuOpen && (
                <div className="absolute top-full mt-1 left-0 min-w-[260px] bg-card border border-border rounded-lg shadow-lg z-50 p-3 animate-in fade-in slide-in-from-top-1">
                  {/* Cost type selector */}
                  <div className="mb-3">
                    <div className="text-[10px] text-muted-foreground mb-1.5 font-medium">Тип стоимости</div>
                    <div className="flex gap-2">
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input
                          type="radio"
                          name="costType"
                          checked={costType === 'period'}
                          onChange={() => onCostTypeChange?.('period')}
                          className="w-3 h-3 accent-primary"
                        />
                        <span>За период</span>
                      </label>
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input
                          type="radio"
                          name="costType"
                          checked={costType === 'total'}
                          onChange={() => onCostTypeChange?.('total')}
                          className="w-3 h-3 accent-primary"
                        />
                        <span>Общая</span>
                      </label>
                    </div>
                  </div>

                  {/* Sort selector */}
                  <div className="mb-3">
                    <div className="text-[10px] text-muted-foreground mb-1.5 font-medium">Сортировка</div>
                    <div className="flex gap-1">
                      {[
                        { value: 'none' as const, label: 'Нет' },
                        { value: 'asc' as const, label: '↑ По возр.' },
                        { value: 'desc' as const, label: '↓ По убыв.' }
                      ].map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => onCostSortOrderChange?.(opt.value)}
                          className={`px-2 py-1 text-[11px] rounded border transition-colors ${
                            costSortOrder === opt.value 
                              ? 'bg-primary text-primary-foreground border-primary' 
                              : 'bg-secondary border-border hover:border-muted-foreground'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Min/Max filter */}
                  <div className="mb-3">
                    <div className="text-[10px] text-muted-foreground mb-1.5 font-medium">Диапазон (млн ₽)</div>
                    <div className="flex gap-2 items-center">
                      <input
                        type="number"
                        value={localMinCost}
                        onChange={(e) => setLocalMinCost(e.target.value)}
                        placeholder="От"
                        className="w-20 px-2 py-1 text-xs border border-border rounded bg-background focus:outline-none focus:border-primary"
                        step="0.1"
                        min="0"
                      />
                      <span className="text-muted-foreground">—</span>
                      <input
                        type="number"
                        value={localMaxCost}
                        onChange={(e) => setLocalMaxCost(e.target.value)}
                        placeholder="До"
                        className="w-20 px-2 py-1 text-xs border border-border rounded bg-background focus:outline-none focus:border-primary"
                        step="0.1"
                        min="0"
                      />
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2 pt-2 border-t border-border">
                    <button
                      onClick={applyCostFilter}
                      className="flex-1 px-2 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
                    >
                      Применить
                    </button>
                    <button
                      onClick={resetCostFilter}
                      className="px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded hover:bg-secondary transition-colors"
                    >
                      Сброс
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Строка 2: режим поддержки, тумблеры отображения, статусы и KPI */}
        <div className="flex flex-wrap items-center gap-2 min-h-[36px] pt-1.5 border-t border-border/80">
          <div className="flex items-center gap-0.5 rounded-md border border-border overflow-hidden text-[11px] shrink-0 bg-card">
            {(['all', 'exclude', 'only'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onSupportFilterChange(mode)}
                className={`px-2 py-1 min-w-0 transition-colors ${
                  supportFilter === mode
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/40 text-foreground hover:bg-muted/70'
                }`}
              >
                {mode === 'all' ? 'Все' : mode === 'exclude' ? 'Разработка' : 'Поддержка'}
              </button>
            ))}
          </div>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary shrink-0"
                  aria-label="Справка: фильтр и цвета"
                >
                  <HelpCircle size={14} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[288px] text-xs space-y-2">
                <p>
                  <strong>Все</strong> — все инициативы. <strong>Разработка</strong> — без кварталов поддержки в выбранном
                  периоде. <strong>Поддержка</strong> — есть хотя бы один квартал поддержки в периоде.
                </p>
                <p className="text-muted-foreground">
                  Таймлайн: цвет полосы — тип <strong>квартала</strong> (синий — разработка, серый — поддержка). Тримап:
                  яркий цвет группы — разработка; тот же оттенок, приглушённый серым — поддержка (юнит или кластер).
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {hasActiveFilters && onResetFilters && (
            <>
              <div className="w-px h-4 bg-border hidden sm:block" />
              <button
                onClick={onResetFilters}
                className="flex items-center gap-1 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-secondary rounded transition-colors"
                title="Сбросить все фильтры (Shift+R)"
              >
                <RotateCcw size={12} />
                <span className="hidden sm:inline">Сброс</span>
              </button>
            </>
          )}

          {hideNestingToggles ? (
            <div className="hidden sm:block w-[228px] shrink-0 min-h-[28px]" aria-hidden />
          ) : (
            <>
              <div className="w-px h-4 bg-border hidden sm:block" />
              {canViewMoney && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <label className="flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer px-1.5 py-1 rounded hover:bg-secondary">
                        <input
                          type="checkbox"
                          checked={showMoney}
                          onChange={(e) => onShowMoneyChange(e.target.checked)}
                          className="hidden"
                        />
                        <span className={`w-3.5 h-3.5 border rounded flex items-center justify-center ${showMoney ? 'bg-primary border-primary text-primary-foreground' : 'border-border'}`}>
                          {showMoney && <Check size={10} />}
                        </span>
                        <span>Деньги</span>
                      </label>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                      Показывать суммы на ячейках
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {onShowOnlyPnlItChange && (
                <label className="flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer px-1.5 py-1 rounded hover:bg-secondary">
                  <input
                    type="checkbox"
                    checked={showOnlyPnlIt}
                    onChange={(e) => onShowOnlyPnlItChange(e.target.checked)}
                    className="hidden"
                  />
                  <span className={`w-3.5 h-3.5 border rounded flex items-center justify-center ${showOnlyPnlIt ? 'bg-primary border-primary text-primary-foreground' : 'border-border'}`}>
                    {showOnlyPnlIt && <Check size={10} />}
                  </span>
                  <span>Только PnL IT</span>
                </label>
              )}
              <label className="flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer px-1.5 py-1 rounded hover:bg-secondary">
                <input
                  type="checkbox"
                  checked={showTeams}
                  onChange={(e) => onShowTeamsChange(e.target.checked)}
                  className="hidden"
                />
                <span className={`w-3.5 h-3.5 border rounded flex items-center justify-center ${showTeams ? 'bg-primary border-primary text-primary-foreground' : 'border-border'}`}>
                  {showTeams && <Check size={10} />}
                </span>
                <span>Команды</span>
              </label>
              <label className="flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer px-1.5 py-1 rounded hover:bg-secondary">
                <input
                  type="checkbox"
                  checked={showInitiatives}
                  onChange={(e) => onShowInitiativesChange(e.target.checked)}
                  className="hidden"
                />
                <span className={`w-3.5 h-3.5 border rounded flex items-center justify-center ${showInitiatives ? 'bg-primary border-primary text-primary-foreground' : 'border-border'}`}>
                  {showInitiatives && <Check size={10} />}
                </span>
                <span>Инициативы</span>
              </label>
              {sensitiveTreemapToggleVisible && currentView === 'budget' && onShowSensitiveTreemapChange && (
                <label className="flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer px-1.5 py-1 rounded hover:bg-secondary">
                  <input
                    type="checkbox"
                    checked={showSensitiveTreemap}
                    onChange={(e) => onShowSensitiveTreemapChange(e.target.checked)}
                    className="hidden"
                  />
                  <span className={`w-3.5 h-3.5 border rounded flex items-center justify-center ${showSensitiveTreemap ? 'bg-primary border-primary text-primary-foreground' : 'border-border'}`}>
                    {showSensitiveTreemap && <Check size={10} />}
                  </span>
                  <span>Sensitive</span>
                </label>
              )}
            </>
          )}

          <div className="flex-1 min-w-[8px]" />

          <div className="flex flex-nowrap items-center gap-1.5 shrink-0">
            <button
              onClick={onOfftrackClick}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium cursor-pointer transition-colors whitespace-nowrap ${
                showOnlyOfftrack
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  : 'bg-destructive/10 text-destructive hover:bg-destructive/20'
              }`}
              title="Показать только Off-track (повторный клик — сброс)"
            >
              <span className="font-bold">{totals.offtrack}</span>
              <span className="hidden sm:inline">off-track</span>
              <div className="legend-off-track-icon legend-off-track-icon-sm" />
            </button>
            {onStubClick && (
              <button
                onClick={onStubClick}
                className={`flex items-center gap-1 px-2 py-1 border rounded text-[11px] font-medium cursor-pointer transition-colors whitespace-nowrap ${
                  hideStubs
                    ? 'bg-primary text-primary-foreground border-primary hover:bg-primary/90'
                    : 'bg-muted border-border text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                }`}
                title={hideStubs ? 'Показать заглушки в выдаче' : 'Скрыть заглушки из выдачи'}
              >
                <span className="font-bold">{totals.stubs}</span>
                {hideStubs ? <EyeOff size={12} className="flex-shrink-0" /> : <Eye size={12} className="flex-shrink-0" />}
                <span className="hidden sm:inline">Заглушки</span>
                <div className="legend-stub-sample-sm" />
              </button>
            )}

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-0 px-2 py-1 bg-secondary rounded text-[11px] font-medium whitespace-nowrap text-left hover:bg-secondary/80 transition-colors border border-transparent hover:border-border"
                  >
                    {canViewMoney && showMoney && splitGrand > 0 && (
                      <>
                        <span className="font-bold tabular-nums shrink-0">{formatBudgetCompact(splitGrand)}</span>
                        <span
                          className="w-px h-3.5 shrink-0 bg-border/70 mx-1.5 self-center"
                          aria-hidden
                        />
                      </>
                    )}
                    <span className="flex items-baseline shrink-0">
                      <span className="font-bold tabular-nums">{totals.count}</span>
                      <span className="text-muted-foreground font-normal"> иниц.</span>
                    </span>
                    {canViewMoney && showMoney && splitGrand > 0 && (
                      <>
                        <span
                          className="w-px h-3.5 shrink-0 bg-border/70 mx-1.5 self-center"
                          aria-hidden
                        />
                        <span className="text-muted-foreground font-normal shrink-0 tabular-nums">
                          разр {devPct}% подд {supportPct}% загл {stubPct}%
                        </span>
                      </>
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[300px] text-xs space-y-2 text-left">
                  <p>
                    <strong>{totals.count}</strong> инициатив с ненулевым бюджетом за выбранные кварталы, с учётом фильтров
                    {currentView === 'timeline' ? ' и ограничений стоимости на таймлайне' : ''}.
                  </p>
                  {canViewMoney && showMoney && splitGrand > 0 ? (
                    <>
                      <p>
                        Сумма за период (по кварталам в выборке): <strong>{formatBudget(splitGrand)}</strong>
                      </p>
                      <p className="text-muted-foreground">
                        Разработка (без заглушек): {formatBudget(totals.developmentQuarterly)} ({devPct}%) — на таймлайне
                        синие полосы, на тримапе ячейки в цвете группы.
                      </p>
                      <p className="text-muted-foreground">
                        Поддержка (без заглушек): {formatBudget(totals.supportQuarterly)} ({supportPct}%) — серые полосы
                        на таймлайне; на тримапе тот же цвет группы, смешанный с серым.
                      </p>
                      <p className="text-muted-foreground">
                        Заглушки (кварталы): {formatBudget(totals.stubsQuarterly)} ({stubPct}%) — бюджет по кварталам у
                        инициатив-заглушек, отдельно от разработки и поддержки.
                      </p>
                    </>
                  ) : (
                    <p className="text-muted-foreground">Включите «Деньги», чтобы видеть суммы в панели и на графиках.</p>
                  )}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FilterBar;