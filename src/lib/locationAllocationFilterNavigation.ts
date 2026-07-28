export type LocationAllocationOrganizationFilter = {
  unit: string;
  team: string;
};

export function locationAllocationFilterFocusPath(
  unit: string | null,
  team: LocationAllocationOrganizationFilter | null
): string[] {
  if (team) return [team.unit, team.team.trim() || 'Без команды'];
  return unit ? [unit] : [];
}
