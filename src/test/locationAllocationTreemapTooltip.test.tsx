import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LocationAllocationTreemapTooltip } from '@/components/admin/location-allocation/LocationAllocationTreemapTooltip';
import type { AdminDataRow } from '@/lib/adminDataManager';
import type { TreemapLayoutNode } from '@/components/treemap/types';
import { buildLocationAllocationTreemapMeta } from '@/lib/locationAllocationTreemap';
import type { MarketCountryRow } from '@/hooks/useMarketCountries';

describe('LocationAllocationTreemapTooltip', () => {
  it('shows comment, inheritance, source split and markets in the compact hover', () => {
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
        id: 'pl',
        cluster_key: 'Europe',
        label_ru: 'Польша',
        sort_order: 2,
        is_active: true,
        created_at: '',
      },
    ];
    const row = {
      id: 'initiative-1',
      unit: 'Core',
      team: 'Platform',
      initiative: 'Checkout',
      stakeholdersList: [],
      description: '',
      documentationLink: '',
      stakeholders: '',
      quarterlyData: {
        '2026-Q1': {
          cost: 1_000_000,
          otherCosts: 0,
          support: false,
          onTrack: true,
          metricPlan: '',
          metricFact: '',
          comment: '',
          effortCoefficient: 10,
        },
      },
      initiativeGeoCostSplit: {
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
        note: 'Командное решение',
        allocationOrigin: {
          level: 'team',
          unit: 'Core',
          team: 'Platform',
        },
      },
    } satisfies AdminDataRow;
    const countryIdToClusterKey = new Map([
      ['ru', 'Russia'],
      ['pl', 'Europe'],
    ]);
    const meta = buildLocationAllocationTreemapMeta(
      [row],
      ['2026-Q1'],
      countries,
      countryIdToClusterKey
    );
    const node = {
      key: 'initiative-1',
      path: 'Core/Platform/Checkout',
      name: 'Checkout',
      data: {
        name: 'Checkout',
        value: 1_000_000,
        unit: 'Core',
        team: 'Platform',
        isInitiative: true,
        adminInitiativeRowId: row.id,
      },
      x0: 0,
      y0: 0,
      x1: 300,
      y1: 200,
      width: 300,
      height: 200,
      depth: 2,
      value: 1_000_000,
      color: '#000000',
      isInitiative: true,
    } satisfies TreemapLayoutNode;

    render(
      <LocationAllocationTreemapTooltip
        data={{ node, position: { x: 200, y: 200 } }}
        meta={meta}
        countries={countries}
        countryIdToClusterKey={countryIdToClusterKey}
      />
    );

    expect(screen.getByText('Командное решение')).toBeInTheDocument();
    expect(screen.getByText('↳ Коэффициенты от команды «Platform»')).toBeInTheDocument();
    expect(screen.getByText('Как распределено')).toBeInTheDocument();
    expect(screen.getByText('Россия')).toBeInTheDocument();
    expect(screen.getByText('Польша')).toBeInTheDocument();
  });
});
