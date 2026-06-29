import {
  type AdminDataRow,
  getInitiativeDisplayName,
  hasInitiativeEffortOrCostInYear,
} from '@/lib/adminDataManager';
import { isHubLocalRowId } from '@/lib/portfolioHubDraft';

/** Год, по которому строится экран заполнения портфеля (кварталы 2025 в матрице не показываем). */
export const PORTFOLIO_FILL_YEAR = 2026;

export type PortfolioMatrixTier =
  | 'ghost'
  | 'draft'
  | 'active'
  | 'completed_current'
  | 'completed_past'
  | 'inactive';

export type PartitionCoefficientMatrixOptions = {
  year?: number;
  /** Выбранный интервал кварталов в матрице (пикер периода). */
  intervalQuarters?: readonly string[];
};

export function isHubDraftRow(row: AdminDataRow): boolean {
  return Boolean(row.isNew) || isHubLocalRowId(row.id);
}

/** Ghost не храним в БД (ALTER initiatives на проде блокируется). Пока не скрываем legacy — 0% идут в inactive. */
export function isPortfolioGhostRow(row: AdminDataRow): boolean {
  if (row.isTimelineStub) return false;
  return false;
}

export function hasInitiativeSignalInQuarters(
  row: AdminDataRow,
  quarterKeys: readonly string[]
): boolean {
  for (const q of quarterKeys) {
    const qd = row.quarterlyData[q];
    if (!qd) continue;
    if ((qd.effortCoefficient ?? 0) > 0) return true;
    const totalCost = (qd.cost ?? 0) + (qd.otherCosts ?? 0);
    if (totalCost > 0) return true;
  }
  return false;
}

export function resolvePortfolioMatrixTier(
  row: AdminDataRow,
  opts: PartitionCoefficientMatrixOptions = {}
): PortfolioMatrixTier {
  const year = opts.year ?? PORTFOLIO_FILL_YEAR;
  const interval = opts.intervalQuarters ?? [];

  if (row.isTimelineStub) return 'active';
  if (isPortfolioGhostRow(row)) return 'ghost';
  if (isHubDraftRow(row)) return 'draft';

  if (row.isPortfolioCompleted) {
    const inInterval =
      interval.length > 0
        ? hasInitiativeSignalInQuarters(row, interval)
        : hasInitiativeEffortOrCostInYear(row, year);
    return inInterval ? 'completed_current' : 'completed_past';
  }

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
  completedCurrent: AdminDataRow[];
  stubs: AdminDataRow[];
  inactive: AdminDataRow[];
  completedPast: AdminDataRow[];
};

function sortByInitiativeName(rows: AdminDataRow[]): AdminDataRow[] {
  return [...rows].sort((a, b) =>
    getInitiativeDisplayName(a).localeCompare(getInitiativeDisplayName(b), 'ru')
  );
}

export function partitionCoefficientMatrixRows(
  rows: AdminDataRow[],
  opts: PartitionCoefficientMatrixOptions = {}
): CoefficientMatrixPartition {
  const drafts: AdminDataRow[] = [];
  const active: AdminDataRow[] = [];
  const completedCurrent: AdminDataRow[] = [];
  const stubs: AdminDataRow[] = [];
  const inactive: AdminDataRow[] = [];
  const completedPast: AdminDataRow[] = [];

  for (const row of rows) {
    if (row.isTimelineStub) {
      stubs.push(row);
      continue;
    }
    switch (resolvePortfolioMatrixTier(row, opts)) {
      case 'ghost':
        break;
      case 'draft':
        drafts.push(row);
        break;
      case 'active':
        active.push(row);
        break;
      case 'completed_current':
        completedCurrent.push(row);
        break;
      case 'completed_past':
        completedPast.push(row);
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
    completedCurrent: sortByInitiativeName(completedCurrent),
    stubs,
    inactive: sortByInitiativeName(inactive),
    completedPast: sortByInitiativeName(completedPast),
  };
}

/** Основная матрица и treemap: черновики → активные → завершённые в интервале → стаб. */
export function buildCoefficientMatrixPrimaryRows(partition: CoefficientMatrixPartition): AdminDataRow[] {
  return [
    ...partition.drafts,
    ...partition.active,
    ...partition.completedCurrent,
    ...partition.stubs,
  ];
}

/** Строки, участвующие в сумме % усилий (активные, черновики, завершённые в интервале). */
export function rowsForCoefficientEffortSum(
  rows: AdminDataRow[],
  opts: PartitionCoefficientMatrixOptions = {}
): AdminDataRow[] {
  return rows.filter((row) => {
    if (row.isTimelineStub) return true;
    const tier = resolvePortfolioMatrixTier(row, opts);
    return tier === 'draft' || tier === 'active' || tier === 'completed_current';
  });
}
