/** Treemap path segments use «Без команды»; row.team is often empty string. */
export function teamFromPathSegment(segment: string): string {
  return segment === 'Без команды' ? '' : segment;
}

export function teamToPathSegment(team: string): string {
  return team.trim() ? team : 'Без команды';
}

/** Budget treemap path: [unit] or [unit, team]. */
export function filtersToBudgetTreemapPath(units: string[], teams: string[]): string[] {
  if (units.length !== 1) return [];
  const path = [units[0]];
  if (teams.length === 1) {
    path.push(teamToPathSegment(teams[0]));
  }
  return path;
}

/** Stakeholders treemap path: [cluster, unit?, team?]. */
export function filtersToStakeholdersTreemapPath(
  stakeholders: string[],
  units: string[],
  teams: string[]
): string[] {
  if (stakeholders.length !== 1) return [];
  const path = [stakeholders[0]];
  if (units.length === 1) {
    path.push(units[0]);
  }
  if (teams.length === 1) {
    path.push(teamToPathSegment(teams[0]));
  }
  return path;
}

export function treemapPathToBudgetFilters(path: string[]): { units: string[]; teams: string[] } {
  const units = path.length >= 1 ? [path[0]] : [];
  const teams = path.length >= 2 ? [teamFromPathSegment(path[1])] : [];
  return { units, teams };
}

export function treemapPathToStakeholdersFilters(path: string[]): {
  stakeholders: string[];
  units: string[];
  teams: string[];
} {
  const stakeholders = path.length >= 1 ? [path[0]] : [];
  const units = path.length >= 2 ? [path[1]] : [];
  const teams = path.length >= 3 ? [teamFromPathSegment(path[2])] : [];
  return { stakeholders, units, teams };
}
