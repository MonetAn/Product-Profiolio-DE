import { describe, expect, it } from 'vitest';
import { adjustBrightness } from '@/lib/dataManager';
import { getCrossInitiativeColor } from '@/lib/crossTreemapColors';

describe('getCrossInitiativeColor', () => {
  it('returns hex compatible with adjustBrightness', () => {
    const hex = getCrossInitiativeColor('GDPR');
    expect(hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
    const darker = adjustBrightness(hex, -15);
    expect(darker).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(darker).not.toBe(hex);
  });

  it('is stable for the same name', () => {
    expect(getCrossInitiativeColor('Тест 1')).toBe(getCrossInitiativeColor('Тест 1'));
  });
});
