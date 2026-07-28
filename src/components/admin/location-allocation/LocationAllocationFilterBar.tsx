import { useMemo, useState } from 'react';
import { CalendarRange, Check, ChevronDown, RotateCcw } from 'lucide-react';
import type { AdminDataRow } from '@/lib/adminDataManager';
import type { MarketCountryRow } from '@/hooks/useMarketCountries';
import {
  countryBelongsToTopRegion,
  TOP_REGION_DISPLAY_LABELS,
  TOP_REGION_ORDER,
  type TopRegionLabel,
} from '@/lib/locationRegionModel';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  resolveLocationAllocationPeriod,
  type LocationAllocationPeriodOption,
} from '@/lib/locationAllocationPeriod';

const ALL_VALUE = '__all__';

type Props = {
  initiatives: AdminDataRow[];
  countries: MarketCountryRow[];
  countryIdToClusterKey: Map<string, string>;
  periodOptions: LocationAllocationPeriodOption[];
  period: string;
  defaultPeriod: string;
  onPeriodChange: (period: string) => void;
  onResetFilters: () => void;
  region: TopRegionLabel | null;
  onRegionChange: (region: TopRegionLabel | null) => void;
  unit: string | null;
  onUnitChange: (unit: string | null) => void;
  team: { unit: string; team: string } | null;
  onTeamChange: (team: string | null, unit?: string | null) => void;
  market: MarketCountryRow | null;
  onMarketChange: (market: MarketCountryRow | null) => void;
  showTeams: boolean;
  onShowTeamsChange: (show: boolean) => void;
  showInitiatives: boolean;
  onShowInitiativesChange: (show: boolean) => void;
};

function FilterField({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={className} title={label}>
      <span className="sr-only">{label}</span>
      {children}
    </label>
  );
}

function NestingToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (show: boolean) => void;
}) {
  return (
    <label className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs text-foreground transition-colors hover:bg-muted/60">
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span
        className={`flex h-3.5 w-3.5 items-center justify-center rounded border ${
          checked
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-muted-foreground/50'
        }`}
      >
        {checked ? <Check className="h-2.5 w-2.5" aria-hidden /> : null}
      </span>
      {label}
    </label>
  );
}

export function LocationAllocationFilterBar({
  initiatives,
  countries,
  countryIdToClusterKey,
  periodOptions,
  period,
  defaultPeriod,
  onPeriodChange,
  onResetFilters,
  region,
  onRegionChange,
  unit,
  onUnitChange,
  team,
  onTeamChange,
  market,
  onMarketChange,
  showTeams,
  onShowTeamsChange,
  showInitiatives,
  onShowInitiativesChange,
}: Props) {
  const [periodOpen, setPeriodOpen] = useState(false);
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [hoverQuarter, setHoverQuarter] = useState<string | null>(null);
  const units = [...new Set(initiatives.map((row) => row.unit.trim()).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b, 'ru')
  );
  const teams = [
    ...new Map(
      initiatives
        .filter((row) => !unit || row.unit === unit)
        .map((row) => {
          const teamName = row.team.trim() || 'Без команды';
          const key = `${row.unit}\t${teamName}`;
          return [key, { key, unit: row.unit, team: teamName }] as const;
        })
    ).values(),
  ].sort(
    (a, b) =>
      a.unit.localeCompare(b.unit, 'ru') || a.team.localeCompare(b.team, 'ru')
  );
  const markets = countries
    .filter(
      (country) =>
        country.is_active &&
        countryBelongsToTopRegion(country, region, countryIdToClusterKey)
    )
    .sort((a, b) => a.label_ru.localeCompare(b.label_ru, 'ru'));
  const activeFilterCount =
    Number(period !== defaultPeriod) +
    Number(Boolean(region)) +
    Number(Boolean(unit)) +
    Number(Boolean(team)) +
    Number(Boolean(market));
  const availableQuarters = useMemo(
    () => [...new Set(periodOptions.flatMap((option) => option.quarters))].sort(),
    [periodOptions]
  );
  const availableYears = useMemo(
    () =>
      [...new Set(availableQuarters.map((quarter) => quarter.slice(0, 4)))].sort(
        (a, b) => b.localeCompare(a)
      ),
    [availableQuarters]
  );
  const selectedPeriod = resolveLocationAllocationPeriod(period, periodOptions);
  const selectedQuarterSet = new Set(selectedPeriod?.quarters ?? []);
  const previewQuarterSet = useMemo(() => {
    if (!rangeStart || !hoverQuarter) return new Set<string>();
    if (rangeStart.slice(0, 4) !== hoverQuarter.slice(0, 4)) {
      return new Set([hoverQuarter]);
    }
    const yearQuarters = availableQuarters.filter((quarter) =>
      quarter.startsWith(`${rangeStart.slice(0, 4)}-`)
    );
    const startIndex = yearQuarters.indexOf(rangeStart);
    const endIndex = yearQuarters.indexOf(hoverQuarter);
    if (startIndex < 0 || endIndex < 0) return new Set<string>();
    const [from, to] =
      startIndex <= endIndex
        ? [startIndex, endIndex]
        : [endIndex, startIndex];
    return new Set(yearQuarters.slice(from, to + 1));
  }, [availableQuarters, hoverQuarter, rangeStart]);

  const handleQuarterClick = (quarter: string) => {
    if (!rangeStart || rangeStart.slice(0, 4) !== quarter.slice(0, 4)) {
      setRangeStart(quarter);
      return;
    }

    const yearQuarters = availableQuarters.filter((value) =>
      value.startsWith(`${quarter.slice(0, 4)}-`)
    );
    const startIndex = yearQuarters.indexOf(rangeStart);
    const endIndex = yearQuarters.indexOf(quarter);
    const [from, to] =
      startIndex <= endIndex
        ? [startIndex, endIndex]
        : [endIndex, startIndex];
    const start = yearQuarters[from];
    const end = yearQuarters[to];
    onPeriodChange(start === end ? start : `${start}..${end}`);
    setRangeStart(null);
    setHoverQuarter(null);
    setPeriodOpen(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-2 shadow-sm">
        <FilterField label="Период" className="min-w-[142px] flex-[0.85_1_150px]">
          <Popover
            open={periodOpen}
            onOpenChange={(open) => {
              setPeriodOpen(open);
              if (!open) {
                setRangeStart(null);
                setHoverQuarter(null);
              }
            }}
          >
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="h-8 w-full justify-between px-2.5 text-xs font-normal"
                aria-label="Период"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <CalendarRange className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">
                    {selectedPeriod?.label ?? 'Выберите период'}
                  </span>
                </span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="w-[min(92vw,320px)] space-y-2 p-2.5"
            >
              <p className="px-1 text-[10px] text-muted-foreground">
                {rangeStart
                  ? `Начало ${rangeStart.replace('-', ' · ')} · выберите конец`
                  : 'Выберите начало и конец диапазона'}
              </p>
              {availableYears.map((year) => {
                const yearQuarters = availableQuarters.filter((quarter) =>
                  quarter.startsWith(`${year}-`)
                );
                const fullYearSelected = period === year;
                return (
                  <div key={year} className="space-y-1">
                    <button
                      type="button"
                      className={`flex w-full items-center justify-between rounded-md px-2 py-1 text-xs font-semibold transition-colors hover:bg-muted ${
                        fullYearSelected ? 'bg-primary/10 text-primary' : ''
                      }`}
                      onClick={() => {
                        onPeriodChange(year);
                        setPeriodOpen(false);
                      }}
                    >
                      <span>{year}</span>
                      <span className="text-[10px] font-normal">Весь год</span>
                    </button>
                    <div className="grid grid-cols-4 gap-1">
                      {yearQuarters.map((quarter) => {
                        const isStart = rangeStart === quarter;
                        const isSelected = selectedQuarterSet.has(quarter);
                        const isPreview = previewQuarterSet.has(quarter);
                        return (
                          <button
                            key={quarter}
                            type="button"
                            className={`rounded-md border px-2 py-1.5 text-[11px] transition-colors ${
                              isStart
                                ? 'border-primary bg-primary text-primary-foreground'
                                : isPreview
                                  ? 'border-primary/50 bg-primary/15 text-foreground'
                                  : isSelected
                                    ? 'border-foreground bg-foreground text-background'
                                    : 'border-border bg-background hover:bg-muted'
                            }`}
                            onClick={() => handleQuarterClick(quarter)}
                            onMouseEnter={() => setHoverQuarter(quarter)}
                            onMouseLeave={() => setHoverQuarter(null)}
                          >
                            {quarter.slice(5)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </PopoverContent>
          </Popover>
        </FilterField>

        <FilterField label="Регион" className="min-w-[142px] flex-[0.9_1_160px]">
          <Select
            value={region ?? ALL_VALUE}
            onValueChange={(value) =>
              onRegionChange(
                value === ALL_VALUE ? null : (value as TopRegionLabel)
              )
            }
          >
            <SelectTrigger className="h-8 px-2.5 text-xs" aria-label="Регион">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>Все регионы</SelectItem>
              {TOP_REGION_ORDER.map((value) => (
                <SelectItem key={value} value={value}>
                  {TOP_REGION_DISPLAY_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="Юнит" className="min-w-[142px] flex-1">
          <Select
            value={unit ?? ALL_VALUE}
            onValueChange={(value) => {
              const nextUnit = value === ALL_VALUE ? null : value;
              onUnitChange(nextUnit);
              if (nextUnit) {
                onShowTeamsChange(true);
                onShowInitiativesChange(true);
              }
            }}
          >
            <SelectTrigger className="h-8 px-2.5 text-xs" aria-label="Юнит">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>Все юниты</SelectItem>
              {units.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="Команда" className="min-w-[150px] flex-1">
          <Select
            value={team ? `${team.unit}\t${team.team}` : ALL_VALUE}
            onValueChange={(value) => {
              if (value === ALL_VALUE) {
                onTeamChange(null);
                return;
              }
              const selected = teams.find((item) => item.key === value);
              if (selected) {
                onShowTeamsChange(true);
                onShowInitiativesChange(true);
                onTeamChange(selected.team, selected.unit);
              }
            }}
          >
            <SelectTrigger className="h-8 px-2.5 text-xs" aria-label="Команда">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>Все команды</SelectItem>
              {teams.map((item) => (
                <SelectItem key={item.key} value={item.key}>
                  {unit ? item.team : `${item.unit} · ${item.team}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="Рынок" className="min-w-[142px] flex-1">
          <Select
            value={market?.id ?? ALL_VALUE}
            onValueChange={(value) =>
              onMarketChange(
                value === ALL_VALUE
                  ? null
                  : markets.find((country) => country.id === value) ?? null
              )
            }
          >
            <SelectTrigger className="h-8 px-2.5 text-xs" aria-label="Рынок">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>Все рынки</SelectItem>
              {markets.map((country) => (
                <SelectItem key={country.id} value={country.id}>
                  {country.label_ru}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <NestingToggle
          label="Команды"
          checked={showTeams}
          onChange={onShowTeamsChange}
        />
        <NestingToggle
          label="Инициативы"
          checked={showInitiatives}
          onChange={onShowInitiativesChange}
        />

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 shrink-0 px-2 text-xs"
          disabled={activeFilterCount === 0}
          onClick={onResetFilters}
        >
          <RotateCcw className="mr-1 h-3.5 w-3.5" aria-hidden />
          Сбросить{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ''}
        </Button>
    </div>
  );
}
