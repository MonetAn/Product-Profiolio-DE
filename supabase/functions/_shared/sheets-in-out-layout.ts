/** Кварталы в том же порядке, что колонки F–M на листе IN. */
export const QUARTER_KEYS = [
  '2025-Q1',
  '2025-Q2',
  '2025-Q3',
  '2025-Q4',
  '2026-Q1',
  '2026-Q2',
  '2026-Q3',
  '2026-Q4',
] as const;

export type QuarterKey = (typeof QUARTER_KEYS)[number];

/** Строка 1 листа IN: A–M (id + юнит/команда/инициатива/ФИО + 8 кварталов). */
export const IN_HEADERS: string[] = [
  'id',
  'Юнит',
  'Команда',
  'Инициатива',
  'ФИО',
  ...QUARTER_KEYS,
];

/** Лист OUT: строка 1 — год/блоки; строка 2 — шапка колонок; строки с UUID в A — данные (часто с 4-й — пустая 3-я пропускается). */
export const OUT_HEADER_ROW = 2;
/** Первая строка диапазона чтения API (1-based). Если первая строка инициатив ниже — строки без UUID игнорируются. */
export const OUT_DATA_START_ROW = 3;

/**
 * На листе OUT колонка A = id инициативы (UUID), B–D юнит/команда/инициатива,
 * далее Fact (E–H), Прочие (I–L), затем «SUM из Итог Q1–Q4» в M–P **или** O–R —
 * в проекте зафиксировано: **O–R** = Итог Q1…Q4 (2025).
 * **Y–AB** = «SUM из Q1–Q4 Plan» за 2026 (тестовая вёрстка книги).
 * 0-based: O=14…R=17, Y=24…AB=27.
 */
export const OUT_COL_ITOG_Q1 = 14;
export const OUT_COL_ITOG_Q4 = 17;

export const OUT_COL_2026_ITOG_Q1 = 24; // Y
export const OUT_COL_2026_ITOG_Q4 = 27; // AB

/** Последний используемый индекс колонки на OUT при чтении итогов (включительно). */
export const OUT_READ_LAST_COL_INDEX = OUT_COL_2026_ITOG_Q4;

export const ITOG_QUARTER_KEYS: QuarterKey[] = [
  '2025-Q1',
  '2025-Q2',
  '2025-Q3',
  '2025-Q4',
];

export const ITOG_2026_QUARTER_KEYS: QuarterKey[] = [
  '2026-Q1',
  '2026-Q2',
  '2026-Q3',
  '2026-Q4',
];

export function padRow(row: unknown[], minLen: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < minLen; i++) {
    const v = row[i];
    if (v == null || v === '') out.push('');
    else out.push(String(v));
  }
  return out;
}

export function parseSheetNumber(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  const s = String(v).trim().replace(/\s/g, '').replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function looksLikeInitiativeUuid(s: string): boolean {
  return UUID_RE.test(s.trim());
}
