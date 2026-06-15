/** Отображение суммы в ₽ в поле ввода: «1 000 000». */
export function formatRubAmountInput(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '';
  return Math.round(value).toLocaleString('ru-RU');
}

/** Разбор ввода: оставляем только цифры. */
export function parseRubAmountInput(raw: string): number {
  const digits = raw.replace(/\s/g, '').replace(/[^\d]/g, '');
  if (!digits) return 0;
  const n = Number(digits);
  return Number.isFinite(n) ? n : 0;
}
