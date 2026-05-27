/** Дашборд «Кросс-инициативы» — только ранний доступ. */
export function canViewCrossInitiativesOnDashboard(access: {
  hasEarlyAccess: boolean;
}): boolean {
  return access.hasEarlyAccess;
}

/** Админка «Кросс-инициатива» и API кроссов — только ранний доступ. */
export function canManageCrossInitiatives(access: {
  hasEarlyAccess: boolean;
}): boolean {
  return access.hasEarlyAccess;
}
