/**
 * Quarter helpers for quick flow: previous/next quarter by **текущей дате** на устройстве пользователя.
 * Формат как в данных: "YYYY-QN" (например 2026-Q2).
 *
 * **Текущий квартал:** январь–март → Q1, апрель–июнь → Q2, июль–сентябрь → Q3, октябрь–декабрь → Q4.
 *
 * **Следующий квартал для заполнения** (`getNextQuarter`): сразу после текущего календарного.
 * Пример: в апреле текущий = Q2 → следующий = **Q3** (не «текущий» Q2).
 */

export function getCurrentQuarter(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const quarter = Math.floor(month / 3) + 1;
  return `${year}-Q${quarter}`;
}

/**
 * Факт метрики по смыслу портфеля обязателен только для кварталов **строго раньше**
 * текущего календарного (`getCurrentQuarter`): в текущем и будущих кварталах факт ещё не задан.
 * План при этом может оставаться обязательным (см. `quarterRequiresPlanFact` в adminDataManager).
 */
export function isMetricFactRequiredForQuarter(quarter: string): boolean {
  const { year } = parseQuarter(quarter);
  if (year === 0) return false;
  return compareQuarters(quarter, getCurrentQuarter()) < 0;
}

function parseQuarter(q: string): { year: number; quarter: number } {
  const match = q.match(/^(\d{4})-Q(\d)$/);
  if (!match) return { year: 0, quarter: 0 };
  return { year: parseInt(match[1], 10), quarter: parseInt(match[2], 10) };
}

function formatQuarter(year: number, quarter: number): string {
  return `${year}-Q${quarter}`;
}

/** Quarter that just ended (for FYI in quick flow). */
export function getPreviousQuarter(): string {
  const { year, quarter } = parseQuarter(getCurrentQuarter());
  if (quarter === 1) {
    return formatQuarter(year - 1, 4);
  }
  return formatQuarter(year, quarter - 1);
}

/** Quarter we're planning for next (for quick flow form). */
export function getNextQuarter(): string {
  const { year, quarter } = parseQuarter(getCurrentQuarter());
  if (quarter === 4) {
    return formatQuarter(year + 1, 1);
  }
  return formatQuarter(year, quarter + 1);
}

/** Кварталы из `catalog` от текущего календарного до Q4 того же года (включительно), по порядку. */
export function getQuartersFromCurrentThroughCalendarYearEnd(catalog: string[]): string[] {
  if (catalog.length === 0) return [];
  const cur = getCurrentQuarter();
  const { year } = parseQuarter(cur);
  if (year === 0) return [];
  const end = formatQuarter(year, 4);
  const sorted = [...catalog].sort(compareQuarters);
  return filterQuartersInRange(cur, end, sorted);
}

/**
 * Кварталы из `catalog` от **следующего** после текущего календарного (`getNextQuarter`) до Q4 того же года,
 * что и этот «следующий» квартал. Текущий календарный квартал не входит (например, в Q2 не спрашиваем про Q2).
 */
export function getQuartersFromNextThroughCalendarYearEnd(catalog: string[]): string[] {
  if (catalog.length === 0) return [];
  const nq = getNextQuarter();
  const { year } = parseQuarter(nq);
  if (year === 0) return [];
  const end = formatQuarter(year, 4);
  const sorted = [...catalog].sort(compareQuarters);
  return filterQuartersInRange(nq, end, sorted);
}

/** Sort order for `YYYY-Qn` strings. */
export function compareQuarters(a: string, b: string): number {
  const pa = parseQuarter(a);
  const pb = parseQuarter(b);
  if (pa.year !== pb.year) return pa.year - pb.year;
  return pa.quarter - pb.quarter;
}

/** Calendar quarter immediately before `targetQuarter` (must match `YYYY-Qn`). */
export function getQuarterBefore(targetQuarter: string): string {
  const { year, quarter } = parseQuarter(targetQuarter);
  if (year === 0) return getPreviousQuarter();
  if (quarter === 1) return formatQuarter(year - 1, 4);
  return formatQuarter(year, quarter - 1);
}

/**
 * Quarters from `catalog` that fall in [from, to] inclusive, sorted ascending.
 * If from > to, bounds are swapped.
 */
export function filterQuartersInRange(from: string, to: string, catalog: string[]): string[] {
  let a = from;
  let b = to;
  if (compareQuarters(a, b) > 0) [a, b] = [b, a];
  return [...catalog].filter((q) => compareQuarters(q, a) >= 0 && compareQuarters(q, b) <= 0).sort(compareQuarters);
}

/** Список кварталов из query-параметра `quickQs=2026-Q1,2026-Q2`. */
export function parseQuickQsParam(value: string | null): string[] {
  if (!value?.trim()) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
