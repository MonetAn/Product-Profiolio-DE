/**
 * Структурные действия в сценарии доступны всем пользователям приложения.
 * Сервер повторяет это правило и проверяет присутствие пользователя в
 * allowed_users.
 */
export function canManageAllocationScenarioTeams(): boolean {
  return true;
}
