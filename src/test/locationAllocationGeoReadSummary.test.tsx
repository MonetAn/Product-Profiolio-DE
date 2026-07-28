import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MarketCountryRow } from '@/hooks/useMarketCountries';
import { LocationAllocationGeoReadSummary } from '@/components/admin/location-allocation/LocationAllocationGeoReadSummary';

describe('LocationAllocationGeoReadSummary', () => {
  it('shows a read-only regional and market summary before editing', () => {
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
        id: 'drinkit',
        cluster_key: 'Drinkit',
        label_ru: 'Drinkit',
        sort_order: 3,
        is_active: true,
        created_at: '',
      },
    ];
    const onEdit = vi.fn();

    render(
      <LocationAllocationGeoReadSummary
        split={{
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
              percent: 30,
              allocationSource: 'manual',
            },
            {
              kind: 'country',
              countryId: 'drinkit',
              percent: 10,
              allocationSource: 'manual',
            },
          ],
        }}
        totalCostRub={1_000_000}
        countries={countries}
        countryIdToClusterKey={
          new Map([
            ['ru', 'Russia'],
            ['pl', 'Europe'],
            ['drinkit', 'Drinkit'],
          ])
        }
        onEdit={onEdit}
      />
    );

    expect(screen.getByText('Domestic Region')).toBeInTheDocument();
    expect(screen.getByText('International Region')).toBeInTheDocument();
    expect(screen.getAllByText('Drinkit')).toHaveLength(2);
    expect(screen.getByText('Россия')).toBeInTheDocument();
    expect(screen.getByText('Польша')).toBeInTheDocument();
    expect(
      screen.getByText('Выручка 60% · вручную 40%')
    ).toBeInTheDocument();
    expect(screen.queryByText('База')).not.toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Изменить распределение' })
    );
    expect(onEdit).toHaveBeenCalledOnce();
  });
});
