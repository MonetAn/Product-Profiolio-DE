import { supabase } from '@/integrations/supabase/client';

/** Блоки карточки «Квартальное обновление» (без roster). */
export type PortfolioHubAckBlock =
  | 'coefficients'
  | 'descriptions'
  | 'planFact'
  | 'geo';

export type PortfolioHubAckByBlock = Partial<Record<PortfolioHubAckBlock, string>>;

const CELEBRATION_KEY = 'portfolio_hub_complete_celebration_v1';

export async function fetchHubBlockAcksForQuarter(
  unit: string,
  team: string,
  quarter: string
): Promise<PortfolioHubAckByBlock> {
  if (!unit.trim() || !team.trim() || !quarter.trim()) return {};
  const { data, error } = await supabase
    .from('portfolio_hub_block_acks')
    .select('block, confirmed_at')
    .eq('unit', unit)
    .eq('team', team)
    .eq('quarter', quarter);
  if (error) throw error;
  const out: PortfolioHubAckByBlock = {};
  for (const row of data ?? []) {
    const b = row.block as PortfolioHubAckBlock;
    const at = row.confirmed_at as string | null;
    if (at && (b === 'coefficients' || b === 'descriptions' || b === 'planFact' || b === 'geo')) {
      out[b] = at;
    }
  }
  return out;
}

/** Upsert shared acknowledgement and return saved timestamp. */
export async function upsertHubBlockAckForQuarter(
  unit: string,
  team: string,
  quarter: string,
  block: PortfolioHubAckBlock,
  confirmedByName?: string | null
): Promise<string> {
  const atIso = new Date().toISOString();
  const payload: {
    unit: string;
    team: string;
    quarter: string;
    block: PortfolioHubAckBlock;
    confirmed_at: string;
    confirmed_by_name?: string | null;
  } = {
    unit,
    team,
    quarter,
    block,
    confirmed_at: atIso,
  };
  if (typeof confirmedByName === 'string') {
    payload.confirmed_by_name = confirmedByName.trim() || null;
  }
  const { data, error } = await supabase
    .from('portfolio_hub_block_acks')
    .upsert(payload, { onConflict: 'unit,team,quarter,block' })
    .select('confirmed_at')
    .single();
  if (error) throw error;
  return (data?.confirmed_at as string | null) ?? atIso;
}

/** ISO-время последней отметки по блоку или null. */
export function getHubBlockAckAt(
  ackByBlock: PortfolioHubAckByBlock,
  block: PortfolioHubAckBlock
): string | null {
  return ackByBlock[block] ?? null;
}

export function isHubBlockAcked(
  ackByBlock: PortfolioHubAckByBlock,
  block: PortfolioHubAckBlock
): boolean {
  return getHubBlockAckAt(ackByBlock, block) !== null;
}

export function wasPortfolioHubCelebrationShown(
  userId: string,
  quarter: string
): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    const raw = localStorage.getItem(CELEBRATION_KEY);
    if (!raw) return false;
    const p = JSON.parse(raw) as Record<string, true>;
    return Boolean(p?.[`${userId}|${quarter}`]);
  } catch {
    return false;
  }
}

/** Подпись для UI: дата/время последней отметки «данные актуальны». */
export function formatHubAckTimestampRu(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
}

export function setPortfolioHubCelebrationShown(
  userId: string,
  quarter: string
): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(CELEBRATION_KEY);
    const p: Record<string, true> = raw ? (JSON.parse(raw) as Record<string, true>) : {};
    p[`${userId}|${quarter}`] = true;
    localStorage.setItem(CELEBRATION_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}
