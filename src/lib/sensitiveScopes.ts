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
  const u = (unit ?? '').trim();
  return scopes.some((s) => {
    const su = (s.unit ?? '').trim();
    if (su !== u) return false;
    if (s.team == null) return true;
    // Как в БД: is_sensitive_unit_team — s.team = normalize_team_name(p_team)
    return s.team === normalizeTeamName(team);
  });
}

/** Ключ строки для маски дашборда (совпадает с парами в JSON для RPC). */
export function dashboardSensitiveRowKey(unit: string, team: string | null | undefined): string {
  return JSON.stringify([unit, team ?? null]);
}
