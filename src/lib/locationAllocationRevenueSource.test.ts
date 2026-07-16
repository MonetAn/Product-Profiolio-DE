import { describe, expect, it } from 'vitest';
import type { MarketCountryRow } from '@/hooks/useMarketCountries';
import type { AdminDataRow, GeoCostSplit } from '@/lib/adminDataManager';
import { geoCostSplitToJson, parseGeoCostSplit } from '@/lib/adminDataManager';
import {
  applyMarketPercentChange,
  applyRegionPercentChange,
} from '@/lib/locationAllocationGeoEdit';
import { initiativeFactAllocationSourcesByMarket } from '@/lib/locationRegionModel';
import {
  resolveLocationTreemapDecisionAnnotation,
  type LocationAllocationTreemapMeta,
} from '@/lib/locationAllocationTreemap';
import type { TreemapLayoutNode } from '@/components/treemap/types';

const countries: MarketCountryRow[] = [
  {
    id: 'ru',
    cluster_key: 'Russia',
    label_ru: 'Россия',
    sort_order: 1,
    is_active: true,
    created_at: '',
  },
  {
    id: 'kz',
    cluster_key: 'Central Asia',
    label_ru: 'Казахстан',
    sort_order: 2,
    is_active: true,
    created_at: '',
  },
  {
    id: 'pl',
    cluster_key: 'Europe',
    label_ru: 'Польша',
    sort_order: 3,
    is_active: true,
    created_at: '',
  },
];

const countryIdToClusterKey = new Map(
  countries.map((country) => [country.id, country.cluster_key])
);

function initiative(split?: GeoCostSplit): AdminDataRow {
  return {
    id: 'initiative-1',
    unit: 'Core',
    team: 'Platform',
    initiative: 'Initiative',
    stakeholdersList: [],
    description: '',
    documentationLink: '',
    stakeholders: '',
    quarterlyData: {},
    ...(split ? { initiativeGeoCostSplit: split } : {}),
  };
}

function totalSources(byMarket: ReturnType<typeof initiativeFactAllocationSourcesByMarket>) {
  return [...byMarket.values()].reduce(
    (total, row) => ({
      revenueRub: total.revenueRub + row.revenueRub,
      manualRub: total.manualRub + row.manualRub,
    }),
    { revenueRub: 0, manualRub: 0 }
  );
}

describe('location allocation revenue source', () => {
  it('recognizes the saved revenue driver from the fill admin', () => {
    const result = initiativeFactAllocationSourcesByMarket(
      1_000_000,
      initiative({
        entries: [
          { kind: 'country', countryId: 'ru', percent: 70 },
          { kind: 'country', countryId: 'kz', percent: 30 },
        ],
        driverKey: 'geo_driver_revenue',
      }),
      countries,
      countryIdToClusterKey
    );

    expect(totalSources(result)).toEqual({ revenueRub: 1_000_000, manualRub: 0 });
  });

  it('keeps a mixed revenue/manual split in exact rubles', () => {
    const result = initiativeFactAllocationSourcesByMarket(
      1_000_000,
      initiative({
        entries: [
          {
            kind: 'country',
            countryId: 'ru',
            percent: 60,
            allocationSource: 'revenue',
          },
          {
            kind: 'country',
            countryId: 'pl',
            percent: 40,
            allocationSource: 'manual',
          },
        ],
      }),
      countries,
      countryIdToClusterKey
    );

    expect(totalSources(result)).toEqual({ revenueRub: 600_000, manualRub: 400_000 });
  });

  it('marks fallback without a completed split as revenue-based', () => {
    const result = initiativeFactAllocationSourcesByMarket(
      1_000_000,
      initiative(),
      countries,
      countryIdToClusterKey
    );

    expect(totalSources(result)).toEqual({ revenueRub: 1_000_000, manualRub: 0 });
  });

  it('marks a whole region change as revenue and a market change as manual', () => {
    const initial: GeoCostSplit = {
      entries: [
        {
          kind: 'country',
          countryId: 'ru',
          percent: 60,
          allocationSource: 'manual',
        },
        {
          kind: 'country',
          countryId: 'pl',
          percent: 40,
          allocationSource: 'manual',
        },
      ],
      note: 'Решение команды',
      allocationOrigin: {
        level: 'team',
        unit: 'Core',
        team: 'Platform',
      },
    };

    const afterRegion = applyRegionPercentChange(
      initial,
      'International Region',
      40,
      countries,
      countryIdToClusterKey
    );
    const internationalEntries = afterRegion?.entries.filter(
      (entry) => entry.kind === 'country' && entry.countryId === 'pl'
    );
    expect(internationalEntries).toEqual([
      expect.objectContaining({ allocationSource: 'revenue', percent: 40 }),
    ]);
    expect(afterRegion).toEqual(
      expect.objectContaining({
        note: 'Решение команды',
        allocationOrigin: initial.allocationOrigin,
      })
    );

    const afterMarket = applyMarketPercentChange(
      afterRegion,
      'pl',
      40,
      countries,
      countryIdToClusterKey
    );
    const poland = afterMarket?.entries.find(
      (entry) => entry.kind === 'country' && entry.countryId === 'pl'
    );
    expect(poland).toEqual(
      expect.objectContaining({ allocationSource: 'manual', percent: 40 })
    );
  });

  it('round-trips the allocation source through stored JSON', () => {
    const split: GeoCostSplit = {
      entries: [
        {
          kind: 'country',
          countryId: 'ru',
          percent: 100,
          allocationSource: 'revenue',
        },
      ],
      note: 'Согласовано с командой',
      allocationOrigin: {
        level: 'team',
        unit: 'Core',
        team: 'Platform',
      },
    };

    expect(parseGeoCostSplit(geoCostSplitToJson(split))).toEqual(split);
  });

  it('shows a shared team comment as inherited on an initiative', () => {
    const row = initiative({
      entries: [{ kind: 'country', countryId: 'ru', percent: 100 }],
      note: 'Командное решение',
      allocationOrigin: {
        level: 'team',
        unit: 'Core',
        team: 'Platform',
      },
    });
    const meta: LocationAllocationTreemapMeta = {
      yearCostByInitiativeId: new Map(),
      regionBreakdownByInitiativeId: new Map(),
      clusterMarketBreakdownByInitiativeId: new Map(),
      allocationSourceByMarketByInitiativeId: new Map(),
      initiativeRowById: new Map([[row.id, row]]),
    };
    const node = {
      name: row.initiative,
      data: {
        name: row.initiative,
        unit: row.unit,
        team: row.team,
        isInitiative: true,
        adminInitiativeRowId: row.id,
      },
      isInitiative: true,
    } as TreemapLayoutNode;

    expect(resolveLocationTreemapDecisionAnnotation(node, [row.id], meta)).toEqual({
      comment: 'Командное решение',
      inheritedFrom: 'Коэффициенты от команды «Platform»',
    });
  });
});
