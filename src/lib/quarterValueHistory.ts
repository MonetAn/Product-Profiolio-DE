import type { AdminQuarterData } from './adminDataManager';
import { formatQuarterHuman } from './initiativePayback';

export interface QuarterMoneyHistoryEntry {
  value: number;
  at: string;
  setInQuarter: string;
  savedBy?: string;
  savedById?: string;
}

export interface QuarterCostHistoryEntry {
  cost: number;
  otherCosts: number;
  total: number;
  at: string;
  setInQuarter: string;
  savedBy?: string;
  savedById?: string;
}

export interface QuarterHistorySaver {
  id?: string | null;
  name: string;
}

export function quarterBudgetTotal(q: { cost?: number; otherCosts?: number }): number {
  return (q.cost ?? 0) + (q.otherCosts ?? 0);
}

function parseMoneyHistory(raw: unknown): QuarterMoneyHistoryEntry[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const entries: QuarterMoneyHistoryEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const o = item as Record<string, unknown>;
    if (typeof o.value !== 'number' || !Number.isFinite(o.value)) continue;
    if (typeof o.at !== 'string' || !o.at) continue;
    if (typeof o.setInQuarter !== 'string' || !o.setInQuarter) continue;
    const savedBy = typeof o.savedBy === 'string' && o.savedBy.trim() ? o.savedBy.trim() : undefined;
    const savedById = typeof o.savedById === 'string' && o.savedById ? o.savedById : undefined;
    entries.push({
      value: o.value,
      at: o.at,
      setInQuarter: o.setInQuarter,
      ...(savedBy ? { savedBy } : {}),
      ...(savedById ? { savedById } : {}),
    });
  }
  return entries.length > 0 ? entries : undefined;
}

function parseCostHistory(raw: unknown): QuarterCostHistoryEntry[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const entries: QuarterCostHistoryEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const o = item as Record<string, unknown>;
    const cost = typeof o.cost === 'number' ? o.cost : 0;
    const otherCosts = typeof o.otherCosts === 'number' ? o.otherCosts : 0;
    const total = typeof o.total === 'number' ? o.total : cost + otherCosts;
    if (typeof o.at !== 'string' || !o.at) continue;
    if (typeof o.setInQuarter !== 'string' || !o.setInQuarter) continue;
    const savedBy = typeof o.savedBy === 'string' && o.savedBy.trim() ? o.savedBy.trim() : undefined;
    const savedById = typeof o.savedById === 'string' && o.savedById ? o.savedById : undefined;
    entries.push({
      cost,
      otherCosts,
      total,
      at: o.at,
      setInQuarter: o.setInQuarter,
      ...(savedBy ? { savedBy } : {}),
      ...(savedById ? { savedById } : {}),
    });
  }
  return entries.length > 0 ? entries : undefined;
}

export function parseRevenueRubHistoryFromJson(raw: unknown): QuarterMoneyHistoryEntry[] | undefined {
  return parseMoneyHistory(raw);
}

export function parseCostHistoryFromJson(raw: unknown): QuarterCostHistoryEntry[] | undefined {
  return parseCostHistory(raw);
}

export function appendRevenueRubHistory(
  prev: AdminQuarterData,
  nextRevenueRub: number | undefined,
  setInQuarter: string,
  saver?: QuarterHistorySaver
): QuarterMoneyHistoryEntry[] | undefined {
  const nextVal = typeof nextRevenueRub === 'number' && nextRevenueRub > 0 ? nextRevenueRub : undefined;
  if (nextVal === undefined) return prev.revenueRubHistory;
  if (prev.revenueRub === nextVal) return prev.revenueRubHistory;

  const history = [...(prev.revenueRubHistory ?? [])];
  const last = history[history.length - 1];
  if (last?.value === nextVal) return history;

  history.push({
    value: nextVal,
    at: new Date().toISOString(),
    setInQuarter,
    ...(saver?.name ? { savedBy: saver.name } : {}),
    ...(saver?.id ? { savedById: saver.id } : {}),
  });
  return history;
}

export function appendCostHistory(
  prev: AdminQuarterData,
  nextCost: number,
  nextOtherCosts: number,
  setInQuarter: string,
  saver?: QuarterHistorySaver
): QuarterCostHistoryEntry[] | undefined {
  const prevTotal = quarterBudgetTotal(prev);
  const nextTotal = nextCost + nextOtherCosts;
  if (
    prevTotal === nextTotal &&
    (prev.cost ?? 0) === nextCost &&
    (prev.otherCosts ?? 0) === nextOtherCosts
  ) {
    return prev.costHistory;
  }

  const history = [...(prev.costHistory ?? [])];
  const last = history[history.length - 1];
  if (
    last &&
    last.total === nextTotal &&
    last.cost === nextCost &&
    last.otherCosts === nextOtherCosts
  ) {
    return history;
  }

  history.push({
    cost: nextCost,
    otherCosts: nextOtherCosts,
    total: nextTotal,
    at: new Date().toISOString(),
    setInQuarter,
    ...(saver?.name ? { savedBy: saver.name } : {}),
    ...(saver?.id ? { savedById: saver.id } : {}),
  });
  return history;
}

export function formatHistoryTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export function formatHistoryTimestampDetailed(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatHistoryContext(setInQuarter: string, variant: 'short' | 'admin' = 'admin'): string {
  const q = formatQuarterHuman(setInQuarter);
  return variant === 'short' ? `из ${q}` : `планировали в ${q}`;
}

export function formatHistorySavedBy(savedBy?: string): string | null {
  if (!savedBy?.trim()) return null;
  return savedBy.trim();
}
