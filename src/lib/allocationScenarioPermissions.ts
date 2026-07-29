export const ALLOCATION_SCENARIO_TEAM_MANAGER_EMAIL =
  'a.monetov@dodobrands.io';

export function canManageAllocationScenarioTeams(
  email: string | null | undefined
): boolean {
  return (
    email?.trim().toLowerCase() === ALLOCATION_SCENARIO_TEAM_MANAGER_EMAIL
  );
}
