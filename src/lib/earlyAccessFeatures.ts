/** Ключи экспериментальных возможностей (для документации и будущих флагов). */
export const EARLY_ACCESS_FEATURES = {
  initiativeMappings: 'initiative_mappings',
  crossInitiatives: 'cross_initiatives',
  allocationDashboard: 'allocation_dashboard',
  initiativePayback: 'initiative_payback',
} as const;

export type EarlyAccessFeatureKey = (typeof EARLY_ACCESS_FEATURES)[keyof typeof EARLY_ACCESS_FEATURES];
