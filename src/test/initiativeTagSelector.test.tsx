import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InitiativeTagSelector } from '@/components/InitiativeTagSelector';

describe('InitiativeTagSelector', () => {
  it('adds and removes tags through the shared catalog controls', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <InitiativeTagSelector value={[]} onChange={onChange} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Безопасность' }));
    expect(onChange).toHaveBeenLastCalledWith(['Безопасность']);

    rerender(
      <InitiativeTagSelector value={['Безопасность']} onChange={onChange} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Безопасность' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});
