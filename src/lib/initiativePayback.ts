import type { AdminQuarterData } from './adminDataManager';
import type { QuarterData } from './dataManager';
import {
  type QuarterCostHistoryEntry,
  type QuarterMoneyHistoryEntry,
} from './quarterValueHistory';
import { compareQuarters, getCurrentQuarter } from './quarterUtils';

export type InitiativePaybackQuarter = Pick<
  QuarterData,
  'budget' | 'revenueRubHistory' | 'costHistory'
> & {
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

export interface InitiativePaybackHorizonSummary {
  periodRevenue: number;
  periodCost: number;
  ratio: number | null;
  isPaidOff: boolean;
}

export interface InitiativePaybackDashboard {
  year: number;
  /** С начала года по текущий календарный квартал */
  now: InitiativePaybackHorizonSummary | null;
  /** Весь календарный год (Q1–Q4) */
  yearEnd: InitiativePaybackHorizonSummary | null;
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

function parseYear(quarter: string): number {
  const m = quarter.match(/^(\d{4})-Q\d$/);
  return m ? parseInt(m[1], 10) : 0;
}

function calendarQuartersForYear(year: number): string[] {
  return [1, 2, 3, 4].map((q) => `${year}-Q${q}`);
}

function calendarQuartersThrough(asOfQuarter: string): string[] {
  const year = parseYear(asOfQuarter);
  if (year === 0) return [];
  return calendarQuartersForYear(year).filter((q) => compareQuarters(q, asOfQuarter) <= 0);
}

function summarizeHorizon(
  quarterlyData: Record<string, InitiativePaybackQuarter | AdminQuarterData> | undefined,
  quarters: string[]
): InitiativePaybackHorizonSummary | null {
  if (!quarterlyData || quarters.length === 0) return null;

  let periodRevenue = 0;
  let periodCost = 0;
  for (const q of quarters) {
    const qd = quarterlyData[q];
    if (!qd) continue;
    const cost = quarterCost(qd);
    const rev = qd.revenueRub ?? 0;
    if (cost > 0) periodCost += cost;
    if (rev > 0) periodRevenue += rev;
  }

  if (periodRevenue <= 0 && periodCost <= 0) return null;

  const ratio =
    periodCost > 0 && periodRevenue > 0 ? periodRevenue / periodCost : periodCost > 0 ? 0 : null;
  return {
    periodRevenue,
    periodCost,
    ratio,
    isPaidOff: periodCost > 0 && periodRevenue >= periodCost,
  };
}

/**
 * Окупаемость для тултипа: «сейчас» (YTD) и «к концу года».
 * Блок показываем, если в году есть хотя бы один квартал с заработком.
 */
export function computeInitiativePaybackDashboard(
  quarterlyData: Record<string, InitiativePaybackQuarter | AdminQuarterData> | undefined,
  options?: { asOfQuarter?: string }
): InitiativePaybackDashboard | null {
  if (!quarterlyData) return null;

  const asOf = options?.asOfQuarter ?? getCurrentQuarter();
  const year = parseYear(asOf);
  if (year === 0) return null;

  const yearQuarters = calendarQuartersForYear(year);
  const hasAnyRevenue = yearQuarters.some((q) => quarterHasRevenue(quarterlyData[q]));
  if (!hasAnyRevenue) return null;

  const ytdQuarters = calendarQuartersThrough(asOf);
  return {
    year,
    now: summarizeHorizon(quarterlyData, ytdQuarters),
    yearEnd: summarizeHorizon(quarterlyData, yearQuarters),
  };
}

/**
 * Окупаемость за выбранный период фильтра (плитка тримэпа): только кварталы с заработком.
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

/** Компактная сумма для строки «стоимость vs заработок»: 3.9 млн, 120 тыс. */
export function formatPaybackAmountCompact(rub: number): string {
  const abs = Math.abs(rub);
  if (abs >= 1_000_000) {
    const m = rub / 1_000_000;
    const rounded = Math.round(m * 10) / 10;
    return Number.isInteger(rounded) ? `${rounded} млн` : `${rounded.toFixed(1)} млн`;
  }
  if (abs >= 1_000) {
    const k = rub / 1_000;
    const rounded = Math.round(k * 10) / 10;
    return Number.isInteger(rounded) ? `${rounded} тыс` : `${rounded.toFixed(1)} тыс`;
  }
  return rub.toLocaleString('ru-RU');
}

export function formatPaybackVsAmounts(costRub: number, revenueRub: number): string {
  return `${formatPaybackAmountCompact(costRub)} vs ${formatPaybackAmountCompact(revenueRub)}`;
}

export function formatPaybackStatusLine(summary: InitiativePaybackHorizonSummary): string {
  if (summary.periodCost <= 0 && summary.periodRevenue <= 0) return '—';
  if (summary.periodCost > 0 && summary.periodRevenue <= 0) {
    return `${formatPaybackRatio(0)} · не окупилась`;
  }
  if (summary.ratio == null) return '—';
  return `${formatPaybackRatio(summary.ratio)} · ${summary.isPaidOff ? 'окупилась' : 'не окупилась'}`;
}

export function paybackToneColor(isPaidOff: boolean): string {
  return isPaidOff ? '#059669' : '#d97706';
}

export function paybackToneClass(isPaidOff: boolean): string {
  return isPaidOff ? 'text-emerald-600' : 'text-amber-600';
}

export function paybackSummaryTitle(summary: InitiativePaybackSummary): string {
  const parts = [
    `Прибыль: ${summary.periodRevenue.toLocaleString('ru-RU')} ₽`,
    `Стоимость: ${summary.periodCost.toLocaleString('ru-RU')} ₽`,
  ];
  if (summary.ratio != null) {
    parts.push(summary.isPaidOff ? 'Окупилась' : 'Не окупилась');
  }
  return parts.join(' · ');
}

function pickLastHistoryEntryAsOf<T extends { at: string; setInQuarter: string }>(
  history: T[] | undefined,
  asOfQuarter: string
): T | undefined {
  if (!history?.length) return undefined;
  let best: T | undefined;
  for (const entry of history) {
    if (compareQuarters(entry.setInQuarter, asOfQuarter) > 0) continue;
    if (!best || entry.at.localeCompare(best.at) > 0) best = entry;
  }
  return best;
}

/** Прибыль квартала, какой она была на конец asOfQuarter (последняя запись истории). */
export function pickRevenueRubAsOf(
  qData: Pick<QuarterData, 'revenueRub' | 'revenueRubHistory'> | undefined,
  asOfQuarter: string
): number | undefined {
  if (!qData) return undefined;
  const fromHistory = pickLastHistoryEntryAsOf(qData.revenueRubHistory, asOfQuarter)?.value;
  if (typeof fromHistory === 'number' && fromHistory > 0) return fromHistory;
  if (typeof qData.revenueRub === 'number' && qData.revenueRub > 0 && !qData.revenueRubHistory?.length) {
    return qData.revenueRub;
  }
  return undefined;
}

/** Бюджет квартала на конец asOfQuarter (последняя запись costHistory или текущий бюджет без истории). */
export function pickBudgetRubAsOf(
  qData: Pick<QuarterData, 'budget' | 'costHistory'> | undefined,
  asOfQuarter: string
): number {
  if (!qData) return 0;
  const fromHistory = pickLastHistoryEntryAsOf(qData.costHistory, asOfQuarter)?.total;
  if (typeof fromHistory === 'number') return fromHistory;
  return qData.budget ?? 0;
}

/**
 * Окупаемость на конец квартала: накопительно по scopeQuarters с прибылью,
 * значения — из истории (последняя запись на тот момент).
 */
export function computeInitiativePaybackAsOf(
  quarterlyData: Record<string, InitiativePaybackQuarter | AdminQuarterData> | undefined,
  asOfQuarter: string,
  scopeQuarters: string[]
): InitiativePaybackHorizonSummary | null {
  if (!quarterlyData || scopeQuarters.length === 0) return null;

  const eligibleTargets = scopeQuarters
    .filter((q) => compareQuarters(q, asOfQuarter) <= 0)
    .filter((q) => {
      const rev = pickRevenueRubAsOf(quarterlyData[q] as QuarterData, asOfQuarter);
      return typeof rev === 'number' && rev > 0;
    });

  if (eligibleTargets.length === 0) return null;

  let periodRevenue = 0;
  let periodCost = 0;
  for (const q of eligibleTargets) {
    const qd = quarterlyData[q] as QuarterData;
    periodRevenue += pickRevenueRubAsOf(qd, asOfQuarter) ?? 0;
    periodCost += pickBudgetRubAsOf(qd, asOfQuarter);
  }

  const ratio = periodCost > 0 && periodRevenue > 0 ? periodRevenue / periodCost : periodCost > 0 ? 0 : null;
  return {
    periodRevenue,
    periodCost,
    ratio,
    isPaidOff: periodCost > 0 && periodRevenue >= periodCost,
  };
}

/**
 * Прогноз окупаемости на конец квартала планирования:
 * все кварталы выбранного периода, значения — какими они были на конец planningQuarter.
 */
export function pickQuarterRevenueAtPlanning(
  qData: Pick<QuarterData, 'revenueRub' | 'revenueRubHistory'> | undefined,
  planningQuarter: string,
  live: boolean
): number | undefined {
  if (!qData) return undefined;
  if (live && typeof qData.revenueRub === 'number' && qData.revenueRub > 0) {
    return qData.revenueRub;
  }
  return pickRevenueRubAsOf(qData, planningQuarter);
}

export function pickQuarterBudgetAtPlanning(
  qData: Pick<QuarterData, 'budget' | 'costHistory'> | undefined,
  planningQuarter: string,
  live: boolean
): number {
  if (!qData) return 0;
  if (live && typeof qData.budget === 'number') {
    return qData.budget;
  }
  return pickBudgetRubAsOf(qData, planningQuarter);
}

export interface PlanningForecastQuarterLine {
  targetQuarter: string;
  revenueRub: number;
  costRub: number;
}

export interface PlanningForecastBreakdown {
  planningQuarter: string;
  lines: PlanningForecastQuarterLine[];
  summary: InitiativePaybackHorizonSummary;
}

export function computePlanningForecastBreakdown(
  quarterlyData: Record<string, InitiativePaybackQuarter | AdminQuarterData> | undefined,
  scopeQuarters: string[],
  planningQuarter: string,
  options?: { isLivePlanningQuarter?: boolean }
): PlanningForecastBreakdown | null {
  if (!quarterlyData || scopeQuarters.length === 0) return null;

  const live = options?.isLivePlanningQuarter === true;
  const lines: PlanningForecastQuarterLine[] = [];

  for (const targetQuarter of [...scopeQuarters].sort(compareQuarters)) {
    const qd = quarterlyData[targetQuarter] as QuarterData | undefined;
    const revenueRub = pickQuarterRevenueAtPlanning(qd, planningQuarter, live);
    if (!revenueRub || revenueRub <= 0) continue;
    lines.push({
      targetQuarter,
      revenueRub,
      costRub: pickQuarterBudgetAtPlanning(qd, planningQuarter, live),
    });
  }

  if (lines.length === 0) return null;

  let periodRevenue = 0;
  let periodCost = 0;
  for (const line of lines) {
    periodRevenue += line.revenueRub;
    periodCost += line.costRub;
  }

  const ratio =
    periodCost > 0 && periodRevenue > 0 ? periodRevenue / periodCost : periodCost > 0 ? 0 : null;

  return {
    planningQuarter,
    lines,
    summary: {
      periodRevenue,
      periodCost,
      ratio,
      isPaidOff: periodCost > 0 && periodRevenue >= periodCost,
    },
  };
}

export function computeInitiativePaybackForecastAtPlanningQuarter(
  quarterlyData: Record<string, InitiativePaybackQuarter | AdminQuarterData> | undefined,
  scopeQuarters: string[],
  planningQuarter: string,
  options?: { isLivePlanningQuarter?: boolean }
): InitiativePaybackHorizonSummary | null {
  return (
    computePlanningForecastBreakdown(quarterlyData, scopeQuarters, planningQuarter, options)?.summary ??
    null
  );
}

export interface InitiativePlanningForecastPoint {
  planningQuarter: string;
  summary: InitiativePaybackHorizonSummary;
  isCurrentPlanningQuarter: boolean;
}

/**
 * Прогнозы на конец каждого календарного квартала планирования (Q1…текущий):
 * в текущем квартале строка обновляется при сохранении; прошлые — зафиксированы.
 */
export function computeInitiativePlanningForecastSeries(
  quarterlyData: Record<string, InitiativePaybackQuarter | AdminQuarterData> | undefined,
  scopeQuarters: string[],
  options?: { asOfCalendarQuarter?: string }
): InitiativePlanningForecastPoint[] {
  if (!quarterlyData || scopeQuarters.length === 0) return [];

  const asOf = options?.asOfCalendarQuarter ?? getCurrentQuarter();
  const year = parseYear(asOf) || parseYear(scopeQuarters[0] ?? '');
  if (year === 0) return [];

  const planningQuarters = calendarQuartersForYear(year).filter(
    (pq) => compareQuarters(pq, asOf) <= 0
  );

  const points: InitiativePlanningForecastPoint[] = [];
  for (const planningQuarter of planningQuarters) {
    const isCurrentPlanningQuarter = planningQuarter === asOf;
    const summary = computeInitiativePaybackForecastAtPlanningQuarter(
      quarterlyData,
      scopeQuarters,
      planningQuarter,
      { isLivePlanningQuarter: isCurrentPlanningQuarter }
    );
    if (!summary) continue;
    points.push({ planningQuarter, summary, isCurrentPlanningQuarter });
  }

  return points;
}

export interface InitiativePaybackQuarterEndPoint {
  asOfQuarter: string;
  summary: InitiativePaybackHorizonSummary;
}

/** @deprecated Используйте computeInitiativePlanningForecastSeries */
export function computeInitiativePaybackQuarterEndSeries(
  quarterlyData: Record<string, InitiativePaybackQuarter | AdminQuarterData> | undefined,
  scopeQuarters: string[]
): InitiativePaybackQuarterEndPoint[] {
  return computeInitiativePlanningForecastSeries(quarterlyData, scopeQuarters).map((p) => ({
    asOfQuarter: p.planningQuarter,
    summary: p.summary,
  }));
}

/** «2026-Q2» → «Q2 2026» */
export function formatQuarterHuman(quarter: string): string {
  const m = quarter.match(/^(\d{4})-Q(\d)$/);
  if (!m) return quarter;
  return `Q${m[2]} ${m[1]}`;
}

/** Сумма в ₽ для тултипа окупаемости: «2.0 млн ₽». */
export function formatPaybackRubAmount(rub: number): string {
  const abs = Math.abs(rub);
  if (abs >= 1_000_000) {
    const m = abs / 1_000_000;
    const rounded = Math.round(m * 10) / 10;
    const num = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
    return `${num} млн ₽`;
  }
  if (abs >= 1_000) {
    const k = abs / 1_000;
    const rounded = Math.round(k * 10) / 10;
    const num = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
    return `${num} тыс ₽`;
  }
  return `${Math.round(rub).toLocaleString('ru-RU')} ₽`;
}

export function formatPaybackReturnPercent(summary: InitiativePaybackHorizonSummary): number {
  if (summary.periodCost <= 0) return 0;
  return Math.floor((summary.periodRevenue / summary.periodCost) * 100);
}

export function formatPaybackEffectCostLine(revenueRub: number, costRub: number): string {
  return `${formatPaybackRubAmount(revenueRub)} эффекта при ${formatPaybackRubAmount(costRub)} затрат`;
}

export function formatPaybackNetLine(revenueRub: number, costRub: number): string {
  const net = revenueRub - costRub;
  const body = formatPaybackRubAmount(Math.abs(net));
  if (net > 0) return `+${body}`;
  if (net < 0) return `–${body}`;
  return body;
}

/** HTML-блок окупаемости для тултипа инициативы. */
export function renderInitiativePaybackTooltipHtml(
  quarterlyData: Record<string, InitiativePaybackQuarter> | undefined,
  options?: { asOfQuarter?: string }
): string {
  const dashboard = computeInitiativePaybackDashboard(quarterlyData, options);
  if (!dashboard) return '';

  const asOfQuarter = options?.asOfQuarter ?? getCurrentQuarter();
  const yearEndQuarter = `${dashboard.year}-Q4`;

  const horizonGroup = (
    quarterKey: string,
    summary: InitiativePaybackHorizonSummary | null
  ): string => {
    const quarterLabel = formatQuarterHuman(quarterKey);
    if (!summary || (summary.periodCost <= 0 && summary.periodRevenue <= 0)) {
      return `<div class="tooltip-payback-group">
  <div class="tooltip-payback-quarter">${quarterLabel}</div>
  <div class="tooltip-payback-muted">—</div>
</div>`;
    }
    const pct = formatPaybackReturnPercent(summary);
    const paidOffWord = summary.isPaidOff ? 'окупилось' : 'не окупилось';
    const detail = formatPaybackEffectCostLine(summary.periodRevenue, summary.periodCost);
    const net = formatPaybackNetLine(summary.periodRevenue, summary.periodCost);
    const netRub = summary.periodRevenue - summary.periodCost;
    const netClass =
      netRub > 0 ? 'tooltip-payback-net-positive' : 'tooltip-payback-net-neutral';

    return `<div class="tooltip-payback-group">
  <div class="tooltip-payback-quarter">${quarterLabel}</div>
  <div class="tooltip-payback-return"><strong>${pct}% возврата</strong> · ${paidOffWord}</div>
  <div class="tooltip-payback-detail">${detail}</div>
  <div class="tooltip-payback-net ${netClass}">${net}</div>
</div>`;
  };

  let html = `<div class="tooltip-payback-block">`;
  html += horizonGroup(asOfQuarter, dashboard.now);
  html += horizonGroup(yearEndQuarter, dashboard.yearEnd);
  html += `</div>`;
  return html;
}
