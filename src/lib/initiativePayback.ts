import type { AdminQuarterData } from './adminDataManager';
import type { QuarterData } from './dataManager';

export type InitiativePaybackQuarter = Pick<QuarterData, 'budget'> & {
  revenueRub?: number;
  cost?: number;
  otherCosts?: number;
};

export interface InitiativePaybackSummary {
  periodRevenue: number;
  periodCost: number;
  /** null when periodCost is 0 */
  ratio: number | null;
  isPaidOff: boolean;
  revenueQuarters: string[];
}

function quarterHasRevenue(q: InitiativePaybackQuarter | undefined): boolean {
  if (!q) return false;
  const rev = q.revenueRub;
  return typeof rev === 'number' && Number.isFinite(rev) && rev > 0;
}

function quarterCost(q: InitiativePaybackQuarter): number {
  if (typeof q.budget === 'number') return q.budget;
  return (q.cost ?? 0) + (q.otherCosts ?? 0);
}

/**
 * Окупаемость за выбранный период: только кварталы с заполненным заработком.
 * Стоимость суммируется по тем же кварталам (вариант 1 — частичные данные).
 */
export function computeInitiativePayback(
  quarterlyData: Record<string, InitiativePaybackQuarter | AdminQuarterData> | undefined,
  selectedQuarters: string[]
): InitiativePaybackSummary | null {
  if (!quarterlyData || selectedQuarters.length === 0) return null;

  const revenueQuarters = selectedQuarters.filter((q) => quarterHasRevenue(quarterlyData[q]));
  if (revenueQuarters.length === 0) return null;

  let periodRevenue = 0;
  let periodCost = 0;
  for (const q of revenueQuarters) {
    const qd = quarterlyData[q]!;
    periodRevenue += qd.revenueRub ?? 0;
    periodCost += quarterCost(qd);
  }

  const ratio = periodCost > 0 ? periodRevenue / periodCost : null;
  return {
    periodRevenue,
    periodCost,
    ratio,
    isPaidOff: periodCost > 0 && periodRevenue >= periodCost,
    revenueQuarters,
  };
}

export function formatPaybackRatio(ratio: number): string {
  if (!Number.isFinite(ratio)) return '—';
  if (ratio >= 100) return `×${Math.round(ratio)}`;
  if (ratio >= 10) return `×${ratio.toFixed(1)}`;
  const rounded = Math.round(ratio * 100) / 100;
  return `×${rounded}`;
}

export function paybackToneClass(isPaidOff: boolean): string {
  return isPaidOff ? 'text-emerald-600' : 'text-amber-600';
}

export function paybackSummaryTitle(summary: InitiativePaybackSummary): string {
  const parts = [
    `Заработок: ${summary.periodRevenue.toLocaleString('ru-RU')} ₽`,
    `Стоимость: ${summary.periodCost.toLocaleString('ru-RU')} ₽`,
  ];
  if (summary.ratio != null) {
    parts.push(summary.isPaidOff ? 'Окупилась' : 'Не окупилась');
  }
  return parts.join(' · ');
}
