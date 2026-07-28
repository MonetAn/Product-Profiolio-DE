import type { AdminDataRow } from '@/lib/adminDataManager';
import type { Person, PersonAssignment } from '@/lib/peopleDataManager';
import {
  initiativeFactByAllRegions,
  TOP_REGION_ORDER,
  type TopRegionLabel,
} from '@/lib/locationRegionModel';
import type { MarketCountryRow } from '@/hooks/useMarketCountries';

export function locationTeamKey(unit: string, team: string): string {
  return `${unit.trim()}\t${team.trim()}`;
}

export type LocationHeadcountIndex = {
  byUnit: Map<string, number>;
  byTeam: Map<string, number>;
};

export function buildLocationHeadcountIndex(people: Person[]): LocationHeadcountIndex {
  const byUnit = new Map<string, number>();
  const byTeam = new Map<string, number>();

  for (const person of people) {
    if (person.terminated_at) continue;
    const unit = person.unit?.trim() ?? '';
    const team = person.team?.trim() ?? '';
    if (!unit) continue;
    byUnit.set(unit, (byUnit.get(unit) ?? 0) + 1);
    if (team) {
      const key = locationTeamKey(unit, team);
      byTeam.set(key, (byTeam.get(key) ?? 0) + 1);
    }
  }

  return { byUnit, byTeam };
}

export function sumInitiativeCostForYear(row: AdminDataRow, year: number): number {
  let total = 0;
  for (let quarter = 1; quarter <= 4; quarter += 1) {
    const data = row.quarterlyData[`${year}-Q${quarter}`];
    total += (Number(data?.cost) || 0) + (Number(data?.otherCosts) || 0);
  }
  return Math.round(total);
}

export function sumTeamCostForYear(rows: AdminDataRow[], year: number): number {
  return rows.reduce((sum, row) => sum + sumInitiativeCostForYear(row, year), 0);
}

function supportInitiativeIdsByQuarter(
  rows: AdminDataRow[],
  quarters: string[]
): Map<string, Set<string>> {
  const byQuarter = new Map<string, Set<string>>();
  for (const quarter of quarters) {
    byQuarter.set(
      quarter,
      new Set(
        rows
          .filter((row) => row.quarterlyData[quarter]?.support)
          .map((row) => row.id)
      )
    );
  }
  return byQuarter;
}

export type TeamRunCalculation = {
  supportFte: number;
  supportShare: number;
  runRub: number;
  source: 'assignments' | 'initiative-effort' | 'none';
};

/**
 * RUN = ФОТ × доля людей, занятых поддержкой.
 * При наличии персональных назначений доля считается по ним; иначе — по effort
 * поддерживающих инициатив команды.
 */
export function calculateTeamRun(
  rows: AdminDataRow[],
  people: Person[],
  assignments: PersonAssignment[],
  quarters: string[],
  fotRub: number,
  peopleCount: number
): TeamRunCalculation {
  if (quarters.length === 0 || fotRub <= 0) {
    return { supportFte: 0, supportShare: 0, runRub: 0, source: 'none' };
  }

  const activePeople = people.filter((person) => !person.terminated_at);
  const activeIds = new Set(activePeople.map((person) => person.id));
  const supportIds = supportInitiativeIdsByQuarter(rows, quarters);
  const relevantAssignments = assignments.filter(
    (assignment) => activeIds.has(assignment.person_id)
  );

  let assignmentSignal = false;
  let assignmentFteSum = 0;
  for (const quarter of quarters) {
    const supportInitiatives = supportIds.get(quarter) ?? new Set<string>();
    const supportByPerson = new Map<string, number>();
    for (const assignment of relevantAssignments) {
      if (!supportInitiatives.has(assignment.initiative_id)) continue;
      const effort = Math.max(
        0,
        Math.min(100, Number(assignment.quarterly_effort?.[quarter]) || 0)
      );
      if (effort <= 0) continue;
      assignmentSignal = true;
      supportByPerson.set(
        assignment.person_id,
        Math.min(100, (supportByPerson.get(assignment.person_id) ?? 0) + effort)
      );
    }
    assignmentFteSum +=
      [...supportByPerson.values()].reduce((sum, effort) => sum + effort, 0) / 100;
  }

  if (assignmentSignal) {
    const supportFte = assignmentFteSum / quarters.length;
    const denominator = peopleCount > 0 ? peopleCount : activePeople.length;
    const supportShare =
      denominator > 0 ? Math.max(0, Math.min(1, supportFte / denominator)) : 0;
    return {
      supportFte,
      supportShare,
      runRub: Math.round(fotRub * supportShare),
      source: 'assignments',
    };
  }

  let effortShareSum = 0;
  let effortSignal = false;
  for (const quarter of quarters) {
    const supportEffort = rows.reduce((sum, row) => {
      const data = row.quarterlyData[quarter];
      if (!data?.support) return sum;
      const effort = Math.max(0, Math.min(100, Number(data.effortCoefficient) || 0));
      if (effort > 0) effortSignal = true;
      return sum + effort;
    }, 0);
    effortShareSum += Math.min(100, supportEffort) / 100;
  }

  if (!effortSignal) {
    return { supportFte: 0, supportShare: 0, runRub: 0, source: 'none' };
  }

  const supportShare = effortShareSum / quarters.length;
  const supportFte = peopleCount > 0 ? peopleCount * supportShare : supportShare;
  return {
    supportFte,
    supportShare,
    runRub: Math.round(fotRub * supportShare),
    source: 'initiative-effort',
  };
}

export type InitiativeRegionPayment = {
  region: TopRegionLabel;
  rub: number;
  percent: number;
};

export function buildInitiativeRegionPayments(
  row: AdminDataRow,
  quarters: string[],
  countries: MarketCountryRow[],
  countryIdToClusterKey: Map<string, string>
): InitiativeRegionPayment[] {
  const breakdown = initiativeFactByAllRegions(
    row,
    quarters,
    countries,
    countryIdToClusterKey
  );
  const total = [...breakdown.values()].reduce((sum, value) => sum + value, 0);
  return [...breakdown.entries()]
    .filter(([, rub]) => rub > 0)
    .map(([region, rub]) => ({
      region,
      rub,
      percent: total > 0 ? (rub / total) * 100 : 0,
    }));
}

export function buildInitiativesRegionPayments(
  rows: AdminDataRow[],
  quarters: string[],
  countries: MarketCountryRow[],
  countryIdToClusterKey: Map<string, string>
): InitiativeRegionPayment[] {
  const totals = new Map<TopRegionLabel, number>(
    TOP_REGION_ORDER.map((region) => [region, 0])
  );

  for (const row of rows) {
    const breakdown = initiativeFactByAllRegions(
      row,
      quarters,
      countries,
      countryIdToClusterKey
    );
    for (const [region, rub] of breakdown) {
      if (rub <= 0) continue;
      totals.set(region, (totals.get(region) ?? 0) + rub);
    }
  }

  const total = [...totals.values()].reduce((sum, rub) => sum + rub, 0);
  return [...totals.entries()]
    .filter(([, rub]) => rub > 0)
    .map(([region, rub]) => ({
      region,
      rub,
      percent: total > 0 ? (rub / total) * 100 : 0,
    }));
}
