import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdminDataRow, AdminQuarterData, normalizeSupportCascade } from '@/lib/adminDataManager';
import { Tables, Json } from '@/integrations/supabase/types';

type DBInitiative = Tables<'initiatives'>;

// Convert database row to client format
export function dbToAdminRow(db: DBInitiative): AdminDataRow {
  // Safely cast JSONB to our format
  const rawQuarterlyData = db.quarterly_data;
  const quarterlyData: Record<string, AdminQuarterData> = {};
  
  if (rawQuarterlyData && typeof rawQuarterlyData === 'object' && !Array.isArray(rawQuarterlyData)) {
    Object.entries(rawQuarterlyData).forEach(([key, value]) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const qData = value as Record<string, unknown>;
        quarterlyData[key] = {
          cost: typeof qData.cost === 'number' ? qData.cost : 0,
          otherCosts: typeof qData.otherCosts === 'number' ? qData.otherCosts : 0,
          support: typeof qData.support === 'boolean' ? qData.support : false,
          onTrack: typeof qData.onTrack === 'boolean' ? qData.onTrack : true,
          metricPlan: typeof qData.metricPlan === 'string' ? qData.metricPlan : '',
          metricFact: typeof qData.metricFact === 'string' ? qData.metricFact : '',
          comment: typeof qData.comment === 'string' ? qData.comment : '',
          effortCoefficient: typeof qData.effortCoefficient === 'number' ? qData.effortCoefficient : 0,
        };
      }
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
    result[key] = {
      cost: value.cost,
      otherCosts: value.otherCosts,
      support: value.support,
      onTrack: value.onTrack,
      metricPlan: value.metricPlan,
      metricFact: value.metricFact,
      comment: value.comment,
      effortCoefficient: value.effortCoefficient,
    };
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
      quarterSet.add(q);
    });
  });
  
  return Array.from(quarterSet).sort();
}

export const INITIATIVES_QUERY_KEY = ['initiatives'] as const;

export async function fetchInitiatives(): Promise<AdminDataRow[]> {
  const { data, error } = await supabase
    .from('initiatives')
    .select('*')
    .order('unit')
    .order('team')
    .order('initiative');

  if (error) throw error;
  const rows = (data || []).map(dbToAdminRow);
  const quarters = extractQuartersFromData(rows);
  return rows.map(row => normalizeSupportCascade(row, quarters));
}

export function useInitiatives() {
  return useQuery({
    queryKey: INITIATIVES_QUERY_KEY,
    queryFn: fetchInitiatives,
    staleTime: 1000 * 60 * 3, // 3 minutes — меньше повторных запросов при переходах
    gcTime: 1000 * 60 * 10, // 10 minutes in cache
  });
}

// Hook to get unique quarters from loaded data
export function useQuarters(data: AdminDataRow[] | undefined) {
  if (!data || data.length === 0) return [];
  return extractQuartersFromData(data);
}
