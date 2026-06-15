import type { AdminDataRow, AdminQuarterData } from '@/lib/adminDataManager';
import { compareQuarters } from '@/lib/quarterUtils';
import {
  buildQuarterlyCostsForTeam,
  frozenTeamQuarterTotals,
  type BuildTeamCostsOptions,
} from '@/lib/redistributeTeamCosts2026';

export type { BuildTeamCostsOptions };

/**
 * quarterly_data по строкам команды для записи в БД (Quick Flow / Hub).
 * Тот же алгоритм, что delete → redistributeTeamCosts2026InDb; costFinanceConfirmed=false.
 */
export function buildQuarterlyDataFromPreview(
  teamRows: AdminDataRow[],
  previewQuarters: string[],
  options?: BuildTeamCostsOptions
): Map<string, Record<string, AdminQuarterData>> {
  const sortedQ = [...previewQuarters].filter(Boolean).sort(compareQuarters);
  const out = new Map<string, Record<string, AdminQuarterData>>();
  for (const r of teamRows) {
    out.set(r.id, structuredClone(r.quarterlyData));
  }
  if (sortedQ.length === 0) return out;

  const anchored = Boolean(options?.baseline) || Boolean(options?.fixedTqByQuarter);
  const buildOpts: BuildTeamCostsOptions = anchored
    ? { ...options }
    : { ...options, fixedTqByQuarter: frozenTeamQuarterTotals(teamRows, sortedQ) };

  const built = buildQuarterlyCostsForTeam(teamRows, sortedQ, buildOpts);
  for (const [id, qd] of built) {
    const patched = { ...qd };
    for (const q of sortedQ) {
      if (patched[q]) {
        patched[q] = { ...patched[q], costFinanceConfirmed: false };
      }
    }
    out.set(id, patched);
  }
  return out;
}
