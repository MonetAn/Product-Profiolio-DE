import type { CSSProperties } from 'react';

/** Семантические стили rc-picker / Ant DatePicker: без текстового курсора, вся плашка — pointer. */
export const antPickerPointerStylesEnabled: {
  root: CSSProperties;
  input: CSSProperties;
  suffix: CSSProperties;
} = {
  root: { cursor: 'pointer' },
  input: { cursor: 'pointer', caretColor: 'transparent' },
  suffix: { cursor: 'pointer' },
};

export function antSemanticPointerStyles(disabled?: boolean) {
  if (disabled) return undefined;
  return antPickerPointerStylesEnabled;
}
