import { describe, expect, it } from 'vitest';
import { pickCanonicalTeamStub } from './transferInitiativeBudgetToTeamStub';

describe('pickCanonicalTeamStub', () => {
  it('prefers FOT / team cost stub over accidental stub flag', () => {
    const chosen = pickCanonicalTeamStub([
      { id: 'a', initiative: 'Моя инициатива', created_at: '2026-01-02' },
      {
        id: 'b',
        initiative: 'Стоимость команды X-men(u) 2026',
        created_at: '2026-01-10',
      },
    ]);
    expect(chosen?.id).toBe('b');
  });

  it('returns the only stub when alone', () => {
    const chosen = pickCanonicalTeamStub([
      { id: 'x', initiative: 'ФОТ X-men(u) Q2-Q4 26', created_at: null },
    ]);
    expect(chosen?.id).toBe('x');
  });
});
