export type AllocationNotificationTeamPair = {
  unit: string;
  team: string;
};

export type AllocationNotificationScopeOption = {
  unit: string;
  teams: string[];
};

export type AllocationNotificationPreferences = {
  allScopes: boolean;
  selectedUnits: string[];
  selectedTeamPairs: AllocationNotificationTeamPair[];
};

type ScopeRow = {
  unit?: string | null;
  team?: string | null;
};

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort(
    (left, right) => left.localeCompare(right, 'ru')
  );
}

export function normalizeAllocationNotificationTeamPairs(
  value: unknown
): AllocationNotificationTeamPair[] {
  if (!Array.isArray(value)) return [];
  const byKey = new Map<string, AllocationNotificationTeamPair>();
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const row = item as { unit?: unknown; team?: unknown };
    const unit = typeof row.unit === 'string' ? row.unit.trim() : '';
    const team = typeof row.team === 'string' ? row.team.trim() : '';
    if (!unit || !team) continue;
    byKey.set(`${unit}\0${team}`, { unit, team });
  }
  return [...byKey.values()].sort(
    (left, right) =>
      left.unit.localeCompare(right.unit, 'ru') ||
      left.team.localeCompare(right.team, 'ru')
  );
}

export function buildAllocationNotificationScopeOptions(
  rows: ScopeRow[]
): AllocationNotificationScopeOption[] {
  const teamsByUnit = new Map<string, string[]>();
  for (const row of rows) {
    const unit = row.unit?.trim() ?? '';
    if (!unit) continue;
    const teams = teamsByUnit.get(unit) ?? [];
    const team = row.team?.trim() ?? '';
    if (team) teams.push(team);
    teamsByUnit.set(unit, teams);
  }
  return [...teamsByUnit.entries()]
    .map(([unit, teams]) => ({ unit, teams: uniqueSorted(teams) }))
    .sort((left, right) => left.unit.localeCompare(right.unit, 'ru'));
}

export function normalizeAllocationNotificationPreferences(
  row: Record<string, unknown> | null | undefined
): AllocationNotificationPreferences {
  const allScopes = row?.all_scopes !== false;
  const selectedUnits = Array.isArray(row?.selected_units)
    ? uniqueSorted(
        row.selected_units.filter(
          (value): value is string => typeof value === 'string'
        )
      )
    : [];
  const selectedUnitSet = new Set(selectedUnits);
  const selectedTeamPairs = normalizeAllocationNotificationTeamPairs(
    row?.selected_team_pairs
  ).filter((pair) => !selectedUnitSet.has(pair.unit));
  return {
    allScopes,
    selectedUnits: allScopes ? [] : selectedUnits,
    selectedTeamPairs: allScopes ? [] : selectedTeamPairs,
  };
}
