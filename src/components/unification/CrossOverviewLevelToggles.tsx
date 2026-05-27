import { Check } from 'lucide-react';

export interface CrossOverviewLevelState {
  showUnits: boolean;
  showTeams: boolean;
  showInitiatives: boolean;
}

interface CrossOverviewLevelTogglesProps extends CrossOverviewLevelState {
  focusedPathLength: number;
  onShowUnitsChange: (v: boolean) => void;
  onShowTeamsChange: (v: boolean) => void;
  onShowInitiativesChange: (v: boolean) => void;
}

function Toggle({
  id,
  label,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className={`flex items-center gap-1.5 text-xs cursor-pointer px-2 py-1 rounded hover:bg-secondary ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'text-muted-foreground'
      }`}
    >
      <input
        id={id}
        type="checkbox"
        className="hidden"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        className={`w-3.5 h-3.5 border rounded flex items-center justify-center shrink-0 ${
          checked ? 'bg-primary border-primary text-primary-foreground' : 'border-border'
        }`}
      >
        {checked && <Check size={10} />}
      </span>
      <span>{label}</span>
    </label>
  );
}

export function CrossOverviewLevelToggles({
  showUnits,
  showTeams,
  showInitiatives,
  focusedPathLength,
  onShowUnitsChange,
  onShowTeamsChange,
  onShowInitiativesChange,
}: CrossOverviewLevelTogglesProps) {
  return (
    <div className="flex shrink-0 items-center gap-1 flex-nowrap">
      <Toggle
        id="cross-level-units"
        label="Юниты"
        checked={showUnits}
        onChange={onShowUnitsChange}
      />
      <Toggle
        id="cross-level-teams"
        label="Команды"
        checked={showTeams}
        onChange={onShowTeamsChange}
      />
      <Toggle
        id="cross-level-initiatives"
        label="Инициативы"
        checked={showInitiatives}
        onChange={onShowInitiativesChange}
      />
    </div>
  );
}
