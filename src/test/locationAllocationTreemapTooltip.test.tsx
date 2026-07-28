import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LocationAllocationTreemapTooltip } from '@/components/admin/location-allocation/LocationAllocationTreemapTooltip';
import type { AdminDataRow } from '@/lib/adminDataManager';
import type { TreemapLayoutNode } from '@/components/treemap/types';
import { buildLocationAllocationTreemapMeta } from '@/lib/locationAllocationTreemap';
import type { MarketCountryRow } from '@/hooks/useMarketCountries';

describe('LocationAllocationTreemapTooltip', () => {
  it('shows a compact, non-interactive market summary with the full title', () => {
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
      {
        id: 'kz',
        cluster_key: 'Central Asia',
        label_ru: 'Казахстан',
        sort_order: 3,
        is_active: true,
        created_at: '',
      },
      {
        id: 'ae',
        cluster_key: 'MENA',
        label_ru: 'ОАЭ',
        sort_order: 4,
        is_active: true,
        created_at: '',
      },
      {
        id: 'drinkit',
        cluster_key: 'Drinkit',
        label_ru: 'Drinkit',
        sort_order: 5,
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
            percent: 40,
            allocationSource: 'revenue',
          },
          {
            kind: 'country',
            countryId: 'pl',
            percent: 20,
            allocationSource: 'manual',
          },
          {
            kind: 'country',
            countryId: 'kz',
            percent: 20,
            allocationSource: 'revenue',
          },
          {
            kind: 'country',
            countryId: 'ae',
            percent: 10,
            allocationSource: 'manual',
          },
          {
            kind: 'country',
            countryId: 'drinkit',
            percent: 10,
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
      ['kz', 'Central Asia'],
      ['ae', 'MENA'],
      ['drinkit', 'Drinkit'],
    ]);
    const meta = buildLocationAllocationTreemapMeta(
      [row],
      ['2026-Q1'],
      countries,
      countryIdToClusterKey
    );
    const longTitle =
      'Checkout platform migration with a complete transition to the new payment architecture';
    const node = {
      key: 'initiative-1',
      path: 'Core/Platform/Checkout',
      name: longTitle,
      data: {
        name: longTitle,
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

    const { rerender } = render(
      <LocationAllocationTreemapTooltip
        data={{ node, position: { x: 200, y: 200 } }}
        meta={meta}
        countries={countries}
        countryIdToClusterKey={countryIdToClusterKey}
      />
    );

    expect(screen.getByText('Командное решение')).toBeInTheDocument();
    expect(screen.getByText('↳ Коэффициенты от команды «Platform»')).toBeInTheDocument();
    expect(
      screen.getByText(/Выручка 60% · вручную 40%/)
    ).toBeInTheDocument();
    expect(screen.getByText(longTitle)).not.toHaveClass('truncate');
    expect(screen.getByText('Россия')).toBeInTheDocument();
    expect(screen.getByText('Казахстан')).toBeInTheDocument();
    expect(screen.getByText('Польша')).toBeInTheDocument();
    expect(screen.getByText('ОАЭ')).toBeInTheDocument();
    expect(screen.getByText('Drinkit')).toBeInTheDocument();
    expect(screen.queryByText('Ещё 2 рынка')).not.toBeInTheDocument();
    const tooltip = document.querySelector('.location-allocation-treemap-tooltip');
    expect(tooltip).toHaveClass('pointer-events-none');
    expect(tooltip?.querySelector('.overflow-y-auto')).not.toBeInTheDocument();

    const revenueOnlyRow: AdminDataRow = {
      ...row,
      initiativeGeoCostSplit: {
        ...row.initiativeGeoCostSplit,
        entries: row.initiativeGeoCostSplit.entries.map((entry) => ({
          ...entry,
          allocationSource: 'revenue',
        })),
      },
    };
    const revenueOnlyMeta = buildLocationAllocationTreemapMeta(
      [revenueOnlyRow],
      ['2026-Q1'],
      countries,
      countryIdToClusterKey
    );

    rerender(
      <LocationAllocationTreemapTooltip
        data={{ node, position: { x: 200, y: 200 } }}
        meta={revenueOnlyMeta}
        countries={countries}
        countryIdToClusterKey={countryIdToClusterKey}
      />
    );

    expect(screen.getByText('По выручке')).toBeInTheDocument();
    expect(screen.queryByText(/100% по выручке/)).not.toBeInTheDocument();
  });
});
