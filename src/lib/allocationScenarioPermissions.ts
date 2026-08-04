const ALLOCATION_SCENARIO_TEAM_MANAGER_EMAIL =
  'a.monetov@dodobrands.io';

/**
 * Структурные действия меняют состав или порядок команд и доступны только
 * владельцу сценария. Редактирование описаний и распределений остаётся общим.
 */
export function canManageAllocationScenarioTeams(
  email: string | null | undefined
): boolean {
  return (
    email?.trim().toLocaleLowerCase('en-US') ===
    ALLOCATION_SCENARIO_TEAM_MANAGER_EMAIL
  );
}
