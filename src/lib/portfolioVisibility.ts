import {
  type AdminDataRow,
  getInitiativeDisplayName,
  hasInitiativeEffortOrCostInYear,
} from '@/lib/adminDataManager';
import { isHubLocalRowId } from '@/lib/portfolioHubDraft';

/** Год, по которому строится экран заполнения портфеля (кварталы 2025 в матрице не показываем). */
export const PORTFOLIO_FILL_YEAR = 2026;

export type PortfolioMatrixTier = 'ghost' | 'draft' | 'active' | 'inactive';

export function isHubDraftRow(row: AdminDataRow): boolean {
  return Boolean(row.isNew) || isHubLocalRowId(row.id);
}

export function isPortfolioGhostRow(row: AdminDataRow): boolean {
  if (row.isTimelineStub) return false;
  return Boolean(row.isPortfolioGhost);
}

export function resolvePortfolioMatrixTier(
  row: AdminDataRow,
  year: number = PORTFOLIO_FILL_YEAR
): PortfolioMatrixTier {
  if (row.isTimelineStub) return 'active';
  if (isPortfolioGhostRow(row)) return 'ghost';
  if (isHubDraftRow(row)) return 'draft';
  if (row.isPortfolioSuspended) return 'inactive';
  if (hasInitiativeEffortOrCostInYear(row, year)) return 'active';
  return 'inactive';
}

export function excludePortfolioGhostRows(rows: AdminDataRow[]): AdminDataRow[] {
  return rows.filter((r) => !isPortfolioGhostRow(r));
}

/** Инициативы для каунтеров заполнения (без ghost и без стабов). */
export function countPortfolioFillInitiatives(rows: AdminDataRow[]): number {
  return excludePortfolioGhostRows(rows).filter((r) => !r.isTimelineStub).length;
}

export type CoefficientMatrixPartition = {
  drafts: AdminDataRow[];
  active: AdminDataRow[];
  stubs: AdminDataRow[];
  inactive: AdminDataRow[];
};

function sortByInitiativeName(rows: AdminDataRow[]): AdminDataRow[] {
  return [...rows].sort((a, b) =>
    getInitiativeDisplayName(a).localeCompare(getInitiativeDisplayName(b), 'ru')
  );
}

export function partitionCoefficientMatrixRows(
  rows: AdminDataRow[],
  year: number = PORTFOLIO_FILL_YEAR
): CoefficientMatrixPartition {
  const drafts: AdminDataRow[] = [];
  const active: AdminDataRow[] = [];
  const stubs: AdminDataRow[] = [];
  const inactive: AdminDataRow[] = [];

  for (const row of rows) {
    if (row.isTimelineStub) {
      stubs.push(row);
      continue;
    }
    switch (resolvePortfolioMatrixTier(row, year)) {
      case 'ghost':
        break;
      case 'draft':
        drafts.push(row);
        break;
      case 'active':
        active.push(row);
        break;
      case 'inactive':
        inactive.push(row);
        break;
      default:
        break;
    }
  }

  return {
    drafts: sortByInitiativeName(drafts),
    active: sortByInitiativeName(active),
    stubs,
    inactive: sortByInitiativeName(inactive),
  };
}

/** Основная матрица: черновики → активные → стаб. */
export function buildCoefficientMatrixPrimaryRows(partition: CoefficientMatrixPartition): AdminDataRow[] {
  return [...partition.drafts, ...partition.active, ...partition.stubs];
}

/** Строки, участвующие в сумме % усилий по кварталу (без неактивных и ghost). */
export function rowsForCoefficientEffortSum(rows: AdminDataRow[], year: number = PORTFOLIO_FILL_YEAR): AdminDataRow[] {
  return rows.filter((row) => {
    const tier = resolvePortfolioMatrixTier(row, year);
    return tier === 'draft' || tier === 'active' || row.isTimelineStub;
  });
}
