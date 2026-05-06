/** Align with DB function public.normalize_team_name */
export function normalizeTeamName(team: string | null | undefined): string {
  const t = team?.trim();
  return !t ? 'Без команды' : t;
}

export type SensitiveScopeRow = { unit: string; team: string | null };

export function isUnitTeamSensitive(
  unit: string,
  team: string | null | undefined,
  scopes: SensitiveScopeRow[]
): boolean {
  const nt = normalizeTeamName(team);
  return scopes.some((s) => {
    if (s.unit !== unit) return false;
    if (s.team === null) return true;
    return normalizeTeamName(s.team) === nt;
  });
}
