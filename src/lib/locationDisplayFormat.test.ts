import { describe, expect, it } from 'vitest';
import {
  formatLocationExactRub,
  formatLocationMillionsRub,
} from './locationDisplayFormat';

describe('formatLocationExactRub', () => {
  it('shows the complete amount rounded only to a whole ruble', () => {
    expect(formatLocationExactRub(113_456_789.49)).toBe('113 456 789 ₽');
    expect(formatLocationExactRub(807_412.6)).toBe('807 413 ₽');
    expect(formatLocationExactRub(0)).toBe('0 ₽');
  });
});

describe('formatLocationMillionsRub', () => {
  it('formats whole and fractional millions with a ruble suffix', () => {
    expect(formatLocationMillionsRub(20_000_000)).toBe('20 млн ₽');
    expect(formatLocationMillionsRub(3_400_000)).toBe('3,4 млн ₽');
    expect(formatLocationMillionsRub(500_000)).toBe('0,5 млн ₽');
    expect(formatLocationMillionsRub(0)).toBe('0 млн ₽');
  });
});
