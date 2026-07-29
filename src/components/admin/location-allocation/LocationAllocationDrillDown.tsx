import type { AdminDataRow, GeoCostSplit } from '@/lib/adminDataManager';
import type { MarketCountryRow } from '@/hooks/useMarketCountries';
import type { InitiativeTag } from '@/lib/initiativeTags';
import type { Person, PersonAssignment } from '@/lib/peopleDataManager';
import type { LocationHeadcountIndex } from '@/lib/locationAllocationPlanning';
import type { TopRegionLabel } from '@/lib/locationRegionModel';
import type { LocationAllocationPeriodOption } from '@/lib/locationAllocationPeriod';
import type { LocationAllocationGeoEditScope } from '@/lib/locationAllocationGeoEdit';
import type { LocationAllocationTeamMetric } from '@/hooks/useLocationAllocationTeamMetrics';
import { LocationAllocationTeamView } from '@/components/admin/location-allocation/LocationAllocationTeamView';

type Props = {
  initiatives: AdminDataRow[];
  countries: MarketCountryRow[];
  countryIdToClusterKey: Map<string, string>;
  year: number;
  period: string;
  defaultPeriod: string;
  periodLabel: string;
  periodOptions: LocationAllocationPeriodOption[];
  selectedQuarters: string[];
  onPeriodChange: (period: string) => void;
  onResetFilters: () => void;
  regionFilter: TopRegionLabel | null;
  onRegionFilterChange: (region: TopRegionLabel | null) => void;
  unitFilter: string | null;
  onUnitFilterChange: (unit: string | null) => void;
  teamFilter: string | null;
  onTeamFilterChange: (team: string | null, unit?: string | null) => void;
  marketCountry: MarketCountryRow | null;
  onMarketFilterChange: (country: MarketCountryRow | null) => void;
  onGeoCostSplitSave: (id: string, split: GeoCostSplit | undefined) => Promise<void>;
  onInitiativeTagsSave: (id: string, tags: InitiativeTag[]) => Promise<void>;
  people: Person[];
  assignments: PersonAssignment[];
  headcount: LocationHeadcountIndex;
  teamMetrics?: LocationAllocationTeamMetric[];
  readOnly?: boolean;
  focusedComment?: {
    id: string;
    scope: LocationAllocationGeoEditScope;
  } | null;
};

/**
 * Временный сценарный режим: старые treemap, timeline, фильтры и аналитический
 * drill-down сохранены в кодовой базе, но не выводятся. Здесь остаётся только
 * самостоятельный конструктор команд.
 */
export function LocationAllocationDrillDown({
  initiatives,
  headcount,
  teamMetrics = [],
  readOnly = false,
  unitFilter,
  onUnitFilterChange,
}: Props) {
  return (
    <section id="location-initiatives" className="scroll-mt-4">
      <LocationAllocationTeamView
        initiatives={initiatives}
        headcount={headcount}
        teamMetrics={teamMetrics}
        readOnly={readOnly}
        selectedUnit={unitFilter}
        onSelectedUnitChange={onUnitFilterChange}
      />
    </section>
  );
}
