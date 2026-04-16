import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  AdminDataRow,
  AdminQuarterData,
  geoCostSplitToJson,
  isQuarterPeriodKey,
  normalizeSupportCascade,
  parseGeoCostSplit,
} from '@/lib/adminDataManager';
import { Tables, Json } from '@/integrations/supabase/types';

type DBInitiative = Pick<
  Tables<'initiatives'>,
  | 'id'
  | 'unit'
  | 'team'
  | 'initiative'
  | 'initiative_type'
  | 'stakeholders_list'
  | 'description'
  | 'documentation_link'
  | 'stakeholders'
  | 'is_timeline_stub'
  | 'quarterly_data'
>;

const INITIATIVE_SELECT_COLUMNS = [
  'id',
  'unit',
  'team',
  'initiative',
  'initiative_type',
  'stakeholders_list',
  'description',
  'documentation_link',
  'stakeholders',
  'is_timeline_stub',
  'quarterly_data',
].join(', ');

export function parseAdminQuarterFromJson(
  quarterKey: string,
  qData: Record<string, unknown>
): AdminQuarterData | null {
  if (!isQuarterPeriodKey(quarterKey)) return null;
  const geoCostSplit = parseGeoCostSplit(qData.geoCostSplit);
  const cfc = qData.costFinanceConfirmed;
  return {
    cost: typeof qData.cost === 'number' ? qData.cost : 0,
    otherCosts: typeof qData.otherCosts === 'number' ? qData.otherCosts : 0,
    support: typeof qData.support === 'boolean' ? qData.support : false,
    onTrack: typeof qData.onTrack === 'boolean' ? qData.onTrack : true,
    metricPlan: typeof qData.metricPlan === 'string' ? qData.metricPlan : '',
    metricFact: typeof qData.metricFact === 'string' ? qData.metricFact : '',
    comment: typeof qData.comment === 'string' ? qData.comment : '',
    effortCoefficient: typeof qData.effortCoefficient === 'number' ? qData.effortCoefficient : 0,
    costFinanceConfirmed: cfc === false ? false : true,
    ...(geoCostSplit ? { geoCostSplit } : {}),
  };
}

/** Разбор quarterly_data из JSON (для optimistic updates). */
export function quarterlyJsonToAdminRecord(raw: unknown): Record<string, AdminQuarterData> {
  const quarterlyData: Record<string, AdminQuarterData> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return quarterlyData;
  Object.entries(raw as Record<string, unknown>).forEach(([key, value]) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    const parsed = parseAdminQuarterFromJson(key, value as Record<string, unknown>);
    if (parsed) quarterlyData[key] = parsed;
  });
  return quarterlyData;
}

// Convert database row to client format
export function dbToAdminRow(db: DBInitiative): AdminDataRow {
  const rawQuarterlyData = db.quarterly_data;
  const quarterlyData: Record<string, AdminQuarterData> = {};

  if (rawQuarterlyData && typeof rawQuarterlyData === 'object' && !Array.isArray(rawQuarterlyData)) {
    Object.entries(rawQuarterlyData).forEach(([key, value]) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return;
      const parsed = parseAdminQuarterFromJson(key, value as Record<string, unknown>);
      if (parsed) quarterlyData[key] = parsed;
    });
  }

  return {
    id: db.id,
    unit: db.unit,
    team: db.team,
    initiative: db.initiative,
    initiativeType: (db.initiative_type || '') as AdminDataRow['initiativeType'],
    stakeholdersList: db.stakeholders_list || [],
    description: db.description || '',
    documentationLink: db.documentation_link || '',
    stakeholders: db.stakeholders || '',
    isTimelineStub: db.is_timeline_stub ?? false,
    quarterlyData,
  };
}

// Convert quarterly data to JSON-safe format
function quarterlyDataToJson(data: Record<string, AdminQuarterData>): Json {
  const result: Record<string, Record<string, unknown>> = {};
  Object.entries(data).forEach(([key, value]) => {
    const row: Record<string, unknown> = {
      cost: value.cost,
      otherCosts: value.otherCosts,
      support: value.support,
      onTrack: value.onTrack,
      metricPlan: value.metricPlan,
      metricFact: value.metricFact,
      comment: value.comment,
      effortCoefficient: value.effortCoefficient,
    };
    if (value.geoCostSplit?.entries?.length) {
      row.geoCostSplit = geoCostSplitToJson(value.geoCostSplit);
    }
    if (value.costFinanceConfirmed === false) {
      row.costFinanceConfirmed = false;
    }
    result[key] = row;
  });
  return result as unknown as Json;
}

// Convert client format to database insert/update format
export function adminRowToDb(row: Partial<AdminDataRow>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  
  if (row.unit !== undefined) result.unit = row.unit;
  if (row.team !== undefined) result.team = row.team;
  if (row.initiative !== undefined) result.initiative = row.initiative;
  if (row.initiativeType !== undefined) result.initiative_type = row.initiativeType || null;
  if (row.stakeholdersList !== undefined) result.stakeholders_list = row.stakeholdersList;
  if (row.description !== undefined) result.description = row.description;
  if (row.documentationLink !== undefined) result.documentation_link = row.documentationLink;
  if (row.stakeholders !== undefined) result.stakeholders = row.stakeholders;
  if (row.isTimelineStub !== undefined) result.is_timeline_stub = row.isTimelineStub;
  if (row.quarterlyData !== undefined) result.quarterly_data = quarterlyDataToJson(row.quarterlyData);
  
  return result;
}

export { quarterlyDataToJson };

// Extract available quarters from initiatives data
export function extractQuartersFromData(data: AdminDataRow[]): string[] {
  const quarterSet = new Set<string>();
  
  data.forEach(row => {
    Object.keys(row.quarterlyData || {}).forEach(q => {
      if (!isQuarterPeriodKey(q)) return;
      quarterSet.add(q);
    });
  });
  
  return Array.from(quarterSet).sort();
}

export const INITIATIVES_QUERY_KEY = ['initiatives'] as const;

export type InitiativesScope = {
  units?: string[];
  teams?: string[];
  tableAll?: boolean;
};

function normalizeFilterValues(values: string[] | undefined): string[] {
  if (!values?.length) return [];
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export async function fetchInitiatives(scope?: InitiativesScope): Promise<AdminDataRow[]> {
  const units = normalizeFilterValues(scope?.units);
  const teams = normalizeFilterValues(scope?.teams);
  const tableAll = scope?.tableAll === true;

  let query = supabase.from('initiatives').select(INITIATIVE_SELECT_COLUMNS);
  if (!tableAll && units.length > 0) {
    query = query.in('unit', units);
  }
  if (!tableAll && teams.length > 0) {
    query = query.in('team', teams);
  }

  const { data, error } = await query
    .order('unit')
    .order('team')
    .order('initiative');

  if (error) throw error;
  const rows = (data || []).map(dbToAdminRow);
  const quarters = extractQuartersFromData(rows);
  return rows.map(row => normalizeSupportCascade(row, quarters));
}

export function useInitiatives(scope?: InitiativesScope) {
  const units = normalizeFilterValues(scope?.units);
  const teams = normalizeFilterValues(scope?.teams);
  const tableAll = scope?.tableAll === true;
  return useQuery({
    queryKey: [...INITIATIVES_QUERY_KEY, { units, teams, tableAll }],
    queryFn: () => fetchInitiatives({ units, teams, tableAll }),
    staleTime: 1000 * 60 * 3, // 3 minutes — меньше повторных запросов при переходах
    gcTime: 1000 * 60 * 10, // 10 minutes in cache
    /** При refetch после сохранений не отдаём пустой снимок — избегаем «мигания» UI в Quick Flow */
    placeholderData: keepPreviousData,
  });
}

// Hook to get unique quarters from loaded data
export function useQuarters(data: AdminDataRow[] | undefined) {
  if (!data || data.length === 0) return [];
  return extractQuartersFromData(data);
}
