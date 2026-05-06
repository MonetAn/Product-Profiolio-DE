import type { RawDataRow } from '@/lib/dataManager';

const Q = '2026-Q1';

function q(budget: number): RawDataRow['quarterlyData'] {
  return {
    [Q]: {
      budget,
      support: false,
      onTrack: true,
      metricPlan: '',
      metricFact: '',
      comment: '',
    },
  };
}

function row(p: Omit<RawDataRow, 'quarterlyData' | 'description' | 'stakeholders'> & { budget: number }): RawDataRow {
  const { budget, ...rest } = p;
  return {
    ...rest,
    description: 'Демо People Platform',
    stakeholders: '',
    quarterlyData: q(budget),
  };
}

/** Демо-выгрузка: unit = рынок, дерево как бюджетный treemap (Unit → Team → Initiative). */
export const PEOPLE_PLATFORM_BUDGET_MOCK_RAW: RawDataRow[] = [
  row({
    unit: 'Россия',
    team: 'Tech Platform',
    initiative: 'Auth .NET8',
    budget: 48_000_000,
  }),
  row({
    unit: 'Россия',
    team: 'Tech Platform',
    initiative: 'Passkey rollout',
    budget: 34_000_000,
  }),
  row({
    unit: 'Россия',
    team: 'Client Platform',
    initiative: '2FA критические роли',
    budget: 28_000_000,
  }),
  row({
    unit: 'Россия',
    team: 'Client Platform',
    initiative: 'UUId migration',
    budget: 19_000_000,
  }),
  row({
    unit: 'Россия',
    team: 'Data Office',
    initiative: 'Self-service BI',
    budget: 22_000_000,
  }),
  row({
    unit: 'Европа',
    team: 'App&Web EU',
    initiative: 'Checkout v2',
    budget: 22_000_000,
  }),
  row({
    unit: 'Европа',
    team: 'App&Web EU',
    initiative: 'Локализация',
    budget: 14_000_000,
  }),
  row({
    unit: 'Европа',
    team: 'Data Office EU',
    initiative: 'Витрина метрик',
    budget: 18_000_000,
  }),
  row({
    unit: 'Европа',
    team: 'Data Office EU',
    initiative: 'События заказов',
    budget: 11_000_000,
  }),
  row({
    unit: 'Центральная Азия',
    team: 'B2B Pizza',
    initiative: 'Корп. портал',
    budget: 16_000_000,
  }),
  row({
    unit: 'Центральная Азия',
    team: 'B2B Pizza',
    initiative: 'Интеграции ERP',
    budget: 12_000_000,
  }),
  row({
    unit: 'Центральная Азия',
    team: 'Tech Platform',
    initiative: 'API gateway',
    budget: 14_000_000,
  }),
];

export const PEOPLE_PLATFORM_BUDGET_MOCK_QUARTERS = [Q] as const;
