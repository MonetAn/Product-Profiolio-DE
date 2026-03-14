/**
 * Quarter helpers for quick flow: previous/next quarter by current date.
 * Format matches data: "YYYY-QN" (e.g. 2026-Q1).
 */

export function getCurrentQuarter(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const quarter = Math.floor(month / 3) + 1;
  return `${year}-Q${quarter}`;
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
