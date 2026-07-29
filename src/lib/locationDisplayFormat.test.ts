import { describe, expect, it } from 'vitest';
import { formatLocationExactRub } from './locationDisplayFormat';

describe('formatLocationExactRub', () => {
  it('shows the complete amount rounded only to a whole ruble', () => {
    expect(formatLocationExactRub(113_456_789.49)).toBe('113 456 789 ₽');
    expect(formatLocationExactRub(807_412.6)).toBe('807 413 ₽');
    expect(formatLocationExactRub(0)).toBe('0 ₽');
  });
});
