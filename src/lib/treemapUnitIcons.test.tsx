import {
  Building2,
  Code,
  Globe,
  Pizza,
  Sparkles,
  Users,
} from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { getTreemapUnitIcon } from './treemapUnitIcons';

describe('getTreemapUnitIcon', () => {
  it.each([
    ['App&Web', Globe],
    ['B2B Pizza', Pizza],
    ['Client Platform', Users],
    ['Data Office', Building2],
    ['AI Hub', Sparkles],
    ['Tech Platform', Code],
  ])('returns a distinct icon for %s', (unit, expectedIcon) => {
    expect(getTreemapUnitIcon(unit)).toBe(expectedIcon);
  });
});
