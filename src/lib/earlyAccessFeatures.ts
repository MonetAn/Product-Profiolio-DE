/** Ключи экспериментальных возможностей (для документации и будущих флагов). */
export const EARLY_ACCESS_FEATURES = {
  initiativeMappings: 'initiative_mappings',
  allocationDashboard: 'allocation_dashboard',
} as const;

export type EarlyAccessFeatureKey = (typeof EARLY_ACCESS_FEATURES)[keyof typeof EARLY_ACCESS_FEATURES];
