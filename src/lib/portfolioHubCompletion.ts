import type { AdminDataRow } from '@/lib/adminDataManager';
import {
  getQuickFlowDescriptionDocIssuesForQuarters,
  getQuickFlowPlanFactIssuesForQuarters,
  getQuickFlowRowsWithIncompleteGeoSplit,
  validateTeamQuarterEffort,
} from '@/lib/adminDataManager';
import type { PortfolioHubAckBlock, PortfolioHubAckByBlock } from '@/lib/portfolioHubAck';
import { isHubBlockAcked } from '@/lib/portfolioHubAck';
import { compareQuarters } from '@/lib/quarterUtils';

const YEAR_2026_QUARTERS = ['2026-Q1', '2026-Q2', '2026-Q3', '2026-Q4'] as const;

/** Все кварталы каталога выгрузки — замечания по описанию / план-факт / geo считаются по истории, не только «от текущего квартала». */
function hubValidationQuarters(catalog: string[]): string[] {
  const uniq = new Set<string>();
  for (const q of catalog) {
    const s = q?.trim();
    if (s) uniq.add(s);
  }
  return [...uniq].sort(compareQuarters);
}

/** Есть ли незакрытые коэффициенты по календарному году в матрице (2026 в каталоге). */
export function portfolioHubCoefficientsIncomplete(
  rows: AdminDataRow[],
  quartersCatalog: string[]
): boolean {
  const qs = YEAR_2026_QUARTERS.filter((q) => quartersCatalog.includes(q));
  if (qs.length === 0) return false;
  const byTeam = new Map<string, AdminDataRow[]>();
  for (const r of rows) {
    if (r.isTimelineStub) continue;
    const key = `${r.unit}\u0000${r.team}`;
    const arr = byTeam.get(key) ?? [];
    arr.push(r);
    byTeam.set(key, arr);
  }
  for (const [, teamRows] of byTeam) {
    const unit = teamRows[0]?.unit ?? '';
    const team = teamRows[0]?.team ?? '';
    for (const q of qs) {
      const { isValid } = validateTeamQuarterEffort(teamRows, unit, team, q);
      // Σ < 100% — допустимо: остаток лежит на заглушке (контейнер бюджета команды).
      // Помечаем «неполным» только перебор > 100% — такие коэффициенты невалидны.
      if (!isValid) return true;
    }
  }
  return false;
}

export function portfolioHubDescriptionsIncomplete(rows: AdminDataRow[], quartersCatalog: string[]): boolean {
  const fq = hubValidationQuarters(quartersCatalog);
  return getQuickFlowDescriptionDocIssuesForQuarters(rows, fq).length > 0;
}

export function portfolioHubPlanFactIncomplete(rows: AdminDataRow[], quartersCatalog: string[]): boolean {
  const fq = hubValidationQuarters(quartersCatalog);
  return getQuickFlowPlanFactIssuesForQuarters(rows, fq).length > 0;
}

export function portfolioHubGeoIncomplete(rows: AdminDataRow[], quartersCatalog: string[]): boolean {
  const fq = hubValidationQuarters(quartersCatalog);
  return getQuickFlowRowsWithIncompleteGeoSplit(rows, fq).length > 0;
}

const BLOCKS: PortfolioHubAckBlock[] = ['coefficients', 'descriptions', 'planFact', 'geo'];

export function portfolioHubBlockIncomplete(
  block: PortfolioHubAckBlock,
  rows: AdminDataRow[],
  quartersCatalog: string[]
): boolean {
  switch (block) {
    case 'coefficients':
      return portfolioHubCoefficientsIncomplete(rows, quartersCatalog);
    case 'descriptions':
      return portfolioHubDescriptionsIncomplete(rows, quartersCatalog);
    case 'planFact':
      return portfolioHubPlanFactIncomplete(rows, quartersCatalog);
    case 'geo':
      return portfolioHubGeoIncomplete(rows, quartersCatalog);
    default:
      return false;
  }
}

/** Все разделы без пробелов в данных и с отметкой проверки в этом квартале. */
export function isPortfolioHubFullyDoneForQuarter(
  rows: AdminDataRow[],
  quartersCatalog: string[],
  ackByBlock: PortfolioHubAckByBlock
): boolean {
  for (const b of BLOCKS) {
    if (portfolioHubBlockIncomplete(b, rows, quartersCatalog)) return false;
    if (!isHubBlockAcked(ackByBlock, b)) return false;
  }
  return true;
}
