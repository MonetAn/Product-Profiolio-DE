import type { AdminDataRow } from '@/lib/adminDataManager';
import { convertFromDB, type RawDataRow } from '@/lib/dataManager';
import {
  initiativeDisplayBudget,
  initiativeTreemapValue,
  type UnificationBudgetContext,
} from '@/lib/unificationBudget';

export type CrossInitiativeRow = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type CrossInitiativeMemberRow = {
  id: string;
  cross_initiative_id: string;
  initiative_id: string;
  cost_share_pct: number;
  initiative_name: string;
  unit: string;
  team: string;
  can_view_details: boolean;
};

export type CrossInitiativesBundle = {
  crossInitiatives: CrossInitiativeRow[];
  members: CrossInitiativeMemberRow[];
};

export function parseCrossInitiativesBundle(data: unknown): CrossInitiativesBundle {
  if (!data || typeof data !== 'object') {
    return { crossInitiatives: [], members: [] };
  }
  const o = data as {
    cross_initiatives?: unknown;
    members?: unknown;
  };
  const crossInitiatives: CrossInitiativeRow[] = [];
  if (Array.isArray(o.cross_initiatives)) {
    for (const item of o.cross_initiatives) {
      if (!item || typeof item !== 'object') continue;
      const c = item as Record<string, unknown>;
      if (typeof c.id !== 'string' || typeof c.name !== 'string') continue;
      crossInitiatives.push({
        id: c.id,
        name: c.name,
        description:
          typeof c.description === 'string' && c.description.trim()
            ? c.description
            : null,
        created_at: typeof c.created_at === 'string' ? c.created_at : '',
        updated_at: typeof c.updated_at === 'string' ? c.updated_at : '',
      });
    }
  }
  const members: CrossInitiativeMemberRow[] = [];
  if (Array.isArray(o.members)) {
    for (const item of o.members) {
      if (!item || typeof item !== 'object') continue;
      const m = item as Record<string, unknown>;
      if (
        typeof m.id !== 'string' ||
        typeof m.cross_initiative_id !== 'string' ||
        typeof m.initiative_id !== 'string'
      ) {
        continue;
      }
      const pct = Number(m.cost_share_pct);
      members.push({
        id: m.id,
        cross_initiative_id: m.cross_initiative_id,
        initiative_id: m.initiative_id,
        cost_share_pct: Number.isFinite(pct) ? pct : 100,
        initiative_name: typeof m.initiative_name === 'string' ? m.initiative_name : '—',
        unit: typeof m.unit === 'string' ? m.unit : '',
        team: typeof m.team === 'string' ? m.team : '',
        can_view_details: Boolean(m.can_view_details),
      });
    }
  }
  return { crossInitiatives, members };
}

/** Равномерное распределение 100% между N кросс-инициативами одной инициативы. */
export function equalCostShares(count: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [100];
  const base = Math.floor((10000 / count)) / 100;
  const shares = Array(count).fill(base);
  let remainder = Math.round((100 - base * count) * 100) / 100;
  let i = 0;
  while (remainder > 0.001 && i < count) {
    const add = Math.min(0.01, remainder);
    shares[i] = Math.round((shares[i] + add) * 100) / 100;
    remainder = Math.round((remainder - add) * 100) / 100;
    i += 1;
  }
  return shares;
}

export function membersForInitiative(
  initiativeId: string,
  members: CrossInitiativeMemberRow[]
): CrossInitiativeMemberRow[] {
  return members.filter((m) => m.initiative_id === initiativeId);
}

export function membersForCross(
  crossId: string,
  members: CrossInitiativeMemberRow[]
): CrossInitiativeMemberRow[] {
  return members.filter((m) => m.cross_initiative_id === crossId);
}

export function crossIdsForInitiative(
  initiativeId: string,
  members: CrossInitiativeMemberRow[]
): string[] {
  return [...new Set(membersForInitiative(initiativeId, members).map((m) => m.cross_initiative_id))];
}

/** Названия кросс-инициатив, в которых участвует инициатива (для тултипа и списков). */
export function crossNamesForInitiative(
  initiativeId: string,
  bundle: CrossInitiativesBundle | undefined
): string[] {
  if (!bundle) return [];
  const nameById = new Map(bundle.crossInitiatives.map((c) => [c.id, c.name]));
  return crossIdsForInitiative(initiativeId, bundle.members)
    .map((id) => nameById.get(id) ?? 'Кросс-инициатива')
    .sort((a, b) => a.localeCompare(b, 'ru'));
}

export function initiativeRowToRaw(row: AdminDataRow): RawDataRow {
  const { rawData } = convertFromDB([row]);
  return rawData[0] ?? {
    unit: row.unit,
    team: row.team,
    initiative: row.initiative,
    description: row.description ?? '',
    stakeholders: row.stakeholders ?? '',
    quarterlyData: {},
    adminInitiativeRowId: row.id,
  };
}

export function initiativeFullCost(
  row: AdminDataRow | undefined,
  selectedQuarters: string[],
  budgetCtx?: UnificationBudgetContext
): number {
  return initiativeDisplayBudget(row, selectedQuarters, budgetCtx);
}

/** Суммарный вклад инициативы во все кросс-инициативы (по долям cost_share_pct). */
export function totalCrossContributionForInitiative(
  initiativeId: string,
  members: CrossInitiativeMemberRow[],
  initiativeById: Map<string, AdminDataRow>,
  selectedQuarters: string[],
  budgetCtx?: UnificationBudgetContext
): number {
  return membersForInitiative(initiativeId, members).reduce(
    (sum, m) =>
      sum +
      contributionToCross(
        initiativeId,
        m.cross_initiative_id,
        members,
        initiativeById,
        selectedQuarters,
        budgetCtx
      ),
    0
  );
}

export function contributionToCross(
  initiativeId: string,
  crossId: string,
  members: CrossInitiativeMemberRow[],
  initiativeById: Map<string, AdminDataRow>,
  selectedQuarters: string[],
  budgetCtx?: UnificationBudgetContext
): number {
  const mem = members.find(
    (m) => m.initiative_id === initiativeId && m.cross_initiative_id === crossId
  );
  if (!mem) return 0;
  const full = initiativeFullCost(initiativeById.get(initiativeId), selectedQuarters, budgetCtx);
  return (full * mem.cost_share_pct) / 100;
}

export function crossInitiativeTotalCost(
  crossId: string,
  members: CrossInitiativeMemberRow[],
  initiativeById: Map<string, AdminDataRow>,
  selectedQuarters: string[],
  budgetCtx?: UnificationBudgetContext
): number {
  return membersForCross(crossId, members).reduce(
    (sum, m) =>
      sum +
      contributionToCross(
        m.initiative_id,
        crossId,
        members,
        initiativeById,
        selectedQuarters,
        budgetCtx
      ),
    0
  );
}
