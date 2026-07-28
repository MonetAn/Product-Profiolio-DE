import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LocationRegionKpiCards } from '@/components/admin/location-allocation/LocationRegionKpiCards';

describe('LocationRegionKpiCards', () => {
  it('shows each region payment share next to the absolute amount', () => {
    render(
      <LocationRegionKpiCards
        year={2026}
        totalRub={100_000_000}
        rows={[
          {
            region: 'Domestic Region',
            actualRub: 50_000_000,
            planRub: 45_000_000,
          },
          {
            region: 'International Region',
            actualRub: 40_000_000,
            planRub: 38_000_000,
          },
          {
            region: 'Drink It',
            actualRub: 10_000_000,
            planRub: 15_000_000,
          },
        ]}
      />
    );

    expect(screen.getByText('50М')).toBeInTheDocument();
    expect(screen.getByText('(50%)')).toHaveClass('text-muted-foreground');
    expect(screen.getByText('40М')).toBeInTheDocument();
    expect(screen.getByText('(40%)')).toHaveClass('text-muted-foreground');
    expect(screen.getByText('10М')).toBeInTheDocument();
    expect(screen.getByText('(10%)')).toHaveClass('text-muted-foreground');
  });
});
