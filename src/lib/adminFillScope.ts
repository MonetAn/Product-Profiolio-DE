import type { AccessScope, MemberAffiliation } from '@/hooks/useAccess';
import type { AdminDataRow } from '@/lib/adminDataManager';
import { getTeamsForUnits, getUniqueUnits } from '@/lib/adminDataManager';

export type FillAccessContext = {
  isSuperAdmin: boolean;
  scope: AccessScope;
  memberUnit: string | null;
  memberTeam: string | null;
  /** Порядок из профиля / RPC — первое подходящее совпадение задаёт дефолт при входе в таблицу */
  memberAffiliations?: MemberAffiliation[];
};

function uniqSorted(xs: string[]): string[] {
  return [...new Set(xs)].sort();
}

/** Юниты, доступные для выбора при ограниченном доступе (не seeAll / не супер-админ). */
export function fillAccessibleUnits(scope: AccessScope, data: AdminDataRow[]): string[] {
  const fromUnits = scope.allowedUnits ?? [];
  const fromPairs = (scope.allowedTeamPairs ?? []).map((p) => p.unit);
  const catalog = getUniqueUnits(data);
  const merged = uniqSorted([...fromUnits, ...fromPairs]);
  return merged.filter((u) => catalog.includes(u));
}

/**
 * Команды, доступные для юнита с учётом scope: целый юнит в allowed_units или только пары.
 */
export function fillTeamsForUnit(
  scope: AccessScope,
  data: AdminDataRow[],
  unit: string
): string[] {
  if (!unit.trim()) return [];
  const whole = (scope.allowedUnits ?? []).includes(unit);
  const fromData = getTeamsForUnits(data, [unit]);
  if (whole) return fromData;
  const fromPairs = uniqSorted(
    (scope.allowedTeamPairs ?? []).filter((p) => p.unit === unit).map((p) => p.team)
  );
  return fromPairs.filter((t) => fromData.includes(t));
}

/**
 * Справочные привязки (по порядку): первая пара, существующая в каталоге и в зоне доступа.
 */
function resolveFromMemberAffiliations(
  ctx: FillAccessContext,
  data: AdminDataRow[]
): { unit: string; team: string } | null {
  const affiliations = ctx.memberAffiliations ?? [];
  if (affiliations.length === 0) return null;

  const { isSuperAdmin, scope } = ctx;

  if (isSuperAdmin || scope.seeAll) {
    const catalogUnits = getUniqueUnits(data);
    for (const a of affiliations) {
      const u = a.unit?.trim();
      if (!u || !catalogUnits.includes(u)) continue;
      const teams = getTeamsForUnits(data, [u]);
      if (a.team?.trim()) {
        const t = a.team.trim();
        if (teams.includes(t)) return { unit: u, team: t };
      } else if (teams.length > 0) {
        return { unit: u, team: teams[0] };
      }
    }
    return null;
  }

  const unitOpts = fillAccessibleUnits(scope, data);
  for (const a of affiliations) {
    const u = a.unit?.trim();
    if (!u || !unitOpts.includes(u)) continue;
    const teams = fillTeamsForUnit(scope, data, u);
    if (a.team?.trim()) {
      const t = a.team.trim();
      if (teams.includes(t)) return { unit: u, team: t };
    } else if (teams.length > 0) {
      return { unit: u, team: teams[0] };
    }
  }
  return null;
}

/**
 * Предвыбор unit/team для URL и первого захода.
 * Приоритет: member-профиль, если допустим; иначе первая пара из allowed_team_pairs;
 * иначе первый allowed_units + первая команда по данным.
 */
export function fillDefaultUnitTeam(
  ctx: FillAccessContext,
  data: AdminDataRow[]
): { unit: string | null; team: string | null } {
  const fromAff = resolveFromMemberAffiliations(ctx, data);
  if (fromAff) return { unit: fromAff.unit, team: fromAff.team };

  const { isSuperAdmin, scope, memberUnit, memberTeam } = ctx;
  if (isSuperAdmin || scope.seeAll) {
    const units = getUniqueUnits(data);
    const u = memberUnit?.trim() && units.includes(memberUnit.trim()) ? memberUnit.trim() : units[0] ?? null;
    if (!u) return { unit: null, team: null };
    const teams = getTeamsForUnits(data, [u]);
    const t =
      memberTeam?.trim() && teams.includes(memberTeam.trim()) ? memberTeam.trim() : teams[0] ?? null;
    return { unit: u, team: t };
  }

  const unitOpts = fillAccessibleUnits(scope, data);
  if (unitOpts.length === 0) return { unit: null, team: null };

  const mu = memberUnit?.trim();
  const mt = memberTeam?.trim();
  if (mu && unitOpts.includes(mu)) {
    const teams = fillTeamsForUnit(scope, data, mu);
    if (mt && teams.includes(mt)) return { unit: mu, team: mt };
    if (teams.length > 0) return { unit: mu, team: teams[0] };
  }

  const pairs = scope.allowedTeamPairs ?? [];
  for (const p of pairs) {
    if (!unitOpts.includes(p.unit)) continue;
    const ts = fillTeamsForUnit(scope, data, p.unit);
    if (ts.includes(p.team)) return { unit: p.unit, team: p.team };
  }

  const uFirst = scope.allowedUnits?.find((u) => unitOpts.includes(u)) ?? unitOpts[0] ?? null;
  if (!uFirst) return { unit: null, team: null };
  const teams = fillTeamsForUnit(scope, data, uFirst);
  return { unit: uFirst, team: teams[0] ?? null };
}

export function fillScopeLocks(ctx: FillAccessContext, data: AdminDataRow[]): { lockUnit: boolean; lockTeam: boolean } {
  const { isSuperAdmin, scope } = ctx;
  if (isSuperAdmin || scope.seeAll) return { lockUnit: false, lockTeam: false };

  const units = fillAccessibleUnits(scope, data);
  if (units.length !== 1) return { lockUnit: false, lockTeam: false };

  const u = units[0];
  const teams = fillTeamsForUnit(scope, data, u);
  return {
    lockUnit: true,
    lockTeam: teams.length <= 1,
  };
}
