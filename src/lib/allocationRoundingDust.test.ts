import { describe, expect, it } from 'vitest';
import {
  ALLOCATION_ROUNDING_DUST_RUB,
  costForAllocationDisplay,
  isAllocationRoundingDustRub,
} from '@/lib/adminDataManager';

describe('allocation rounding dust', () => {
  it('treats 1–99 ₽ as dust, keeps meaningful amounts', () => {
    expect(isAllocationRoundingDustRub(1)).toBe(true);
    expect(isAllocationRoundingDustRub(99)).toBe(true);
    expect(isAllocationRoundingDustRub(0)).toBe(false);
    expect(isAllocationRoundingDustRub(100)).toBe(false);
    expect(isAllocationRoundingDustRub(ALLOCATION_ROUNDING_DUST_RUB)).toBe(false);
  });

  it('maps dust to zero for display', () => {
    expect(costForAllocationDisplay(2)).toBe(0);
    expect(costForAllocationDisplay(150)).toBe(150);
  });
});
