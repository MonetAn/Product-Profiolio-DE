/**
 * Остаток целочисленного распределения / float — в UI показываем как 0 ₽.
 * Общий порог для treemap, таймлайна и админки (аллокации).
 */
export const DISPLAY_ROUNDING_DUST_RUB = 100;

export function isDisplayRoundingDustRub(value: number): boolean {
  const v = Math.round(Number(value) || 0);
  return v > 0 && v < DISPLAY_ROUNDING_DUST_RUB;
}

/** Сумма в рублях для отображения: пыль округления → 0. */
export function budgetRubForDisplay(value: number): number {
  return isDisplayRoundingDustRub(value) ? 0 : Math.round(Number(value) || 0);
}
