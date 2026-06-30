import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  calculateBudget,
  formatBudgetShort,
  RawDataRow,
} from '@/lib/dataManager';
import type { TeamBaselineRow } from '@/lib/budgetTruth2026';
import type { EmbedView } from '@/lib/publicEmbed';

interface EmbedToolbarProps {
  currentView: EmbedView;
  onViewChange: (view: EmbedView) => void;
  showTeams: boolean;
  showInitiatives: boolean;
  onShowTeamsChange: (val: boolean) => void;
  onShowInitiativesChange: (val: boolean) => void;
  rawData: RawDataRow[];
  selectedQuarters: string[];
  selectedUnit: string;
  baselineByTeam?: Map<string, TeamBaselineRow>;
}

export function EmbedToolbar({
  currentView,
  onViewChange,
  showTeams,
  showInitiatives,
  onShowTeamsChange,
  onShowInitiativesChange,
  rawData,
  selectedQuarters,
  selectedUnit,
  baselineByTeam,
}: EmbedToolbarProps) {
  const totals = rawData.reduce(
    (acc, row) => {
      const periodBudget = calculateBudget(row, selectedQuarters, {
        includeNonPnlBudgets: false,
        includePreliminaryData: false,
        baselineByTeam,
      });
      if (periodBudget === 0) return acc;
      if (row.unit !== selectedUnit) return acc;

      acc.count++;
      acc.budget += periodBudget;
      return acc;
    },
    { count: 0, budget: 0 }
  );

  return (
    <header className="h-10 shrink-0 border-b border-border bg-header flex items-center gap-3 px-3 sm:px-4 overflow-x-auto">
      <ToggleGroup
        type="single"
        value={currentView}
        onValueChange={(v) => {
          if (v === 'budget' || v === 'timeline') onViewChange(v);
        }}
        className="bg-secondary rounded-md p-0.5 shrink-0"
      >
        <ToggleGroupItem
          value="budget"
          className="h-7 px-2.5 text-xs font-medium rounded data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
        >
          Бюджет
        </ToggleGroupItem>
        <ToggleGroupItem
          value="timeline"
          className="h-7 px-2.5 text-xs font-medium rounded data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
        >
          Таймлайн
        </ToggleGroupItem>
      </ToggleGroup>

      <div className="h-4 w-px bg-border shrink-0" aria-hidden />

      <div className="flex items-center gap-3 shrink-0">
        {currentView === 'budget' && (
          <>
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <Checkbox
                id="embed-show-teams"
                checked={showTeams}
                onCheckedChange={(c) => onShowTeamsChange(!!c)}
                className="h-3.5 w-3.5"
              />
              <Label htmlFor="embed-show-teams" className="text-xs font-normal cursor-pointer">
                Команды
              </Label>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <Checkbox
                id="embed-show-initiatives"
                checked={showInitiatives}
                onCheckedChange={(c) => onShowInitiativesChange(!!c)}
                className="h-3.5 w-3.5"
              />
              <Label htmlFor="embed-show-initiatives" className="text-xs font-normal cursor-pointer">
                Инициативы
              </Label>
            </label>
          </>
        )}
      </div>

      <div className="flex-1 min-w-[8px]" />

      <div className="flex items-center gap-1.5 shrink-0 text-[11px] font-medium whitespace-nowrap bg-secondary rounded px-2 py-1">
        {totals.budget > 0 && (
          <>
            <span className="font-bold tabular-nums">{formatBudgetShort(totals.budget)}</span>
            <span className="w-px h-3.5 bg-border/70" aria-hidden />
          </>
        )}
        <span className="flex items-baseline">
          <span className="font-bold tabular-nums">{totals.count}</span>
          <span className="text-muted-foreground font-normal"> иниц.</span>
        </span>
      </div>
    </header>
  );
}
