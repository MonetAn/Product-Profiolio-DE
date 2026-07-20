import { describe, expect, it } from 'vitest';
import { normalizeInitiativeTags } from '@/lib/initiativeTags';

describe('initiative tags', () => {
  it('keeps only catalog values, removes duplicates and restores catalog order', () => {
    expect(
      normalizeInitiativeTags([
        'Авторизация',
        'неизвестный тег',
        'Надёжность',
        'Авторизация',
      ])
    ).toEqual(['Надёжность', 'Авторизация']);
  });
});
