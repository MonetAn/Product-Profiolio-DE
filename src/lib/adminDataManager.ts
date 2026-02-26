// ===== ADMIN DATA TYPES =====
export interface AdminQuarterData {
  cost: number;           // Read-only (из CSV)
  otherCosts: number;     // Editable
  support: boolean;       // Read-only
  onTrack: boolean;       // Editable
  metricPlan: string;     // Editable
  metricFact: string;     // Editable
  comment: string;        // Editable
  effortCoefficient: number; // 0-100% effort for this quarter
}

// Initiative types with descriptions
export const INITIATIVE_TYPES = [
  { value: 'Product', label: 'Product', description: 'Влияет на бизнес, зарабатывает или экономит деньги' },
  { value: 'Stream', label: 'Stream', description: 'Влияет на ключевую метрику' },
  { value: 'Enabler', label: 'Enabler', description: 'Поддержка инициатив бизнеса' },
] as const;

export type InitiativeType = typeof INITIATIVE_TYPES[number]['value'];

// Available stakeholders
export const STAKEHOLDERS_LIST = [
  'Russia',
  'Central Asia', 
  'Europe',
  'Turkey+',
  'MENA',
  'Drinkit',
  'IT'
] as const;

export interface AdminDataRow {
  id: string;
  unit: string;
  team: string;
  initiative: string;
  initiativeType: InitiativeType | '';
  stakeholdersList: string[];
  description: string;
  documentationLink: string;
  stakeholders: string; // Legacy field for backward compatibility
  quarterlyData: Record<string, AdminQuarterData>;
  isNew?: boolean;
  isModified?: boolean;
}

// ===== CSV PARSING UTILITIES =====

// RFC 4180-compliant CSV tokenizer: handles multiline quoted fields
function parseCSVToRows(text: string): string[][] {
  const rows: string[][] = [];
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  // Normalize line endings
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];

    if (char === '"') {
      if (inQuotes && normalized[i + 1] === '"') {
        current += '"'; // escaped quote
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else if (char === '\n' && !inQuotes) {
      fields.push(current.trim());
      current = '';
      if (fields.some(f => f.length > 0)) {
        rows.push([...fields]);
      }
      fields.length = 0;
    } else {
      current += char;
    }
  }

  // Handle last row (no trailing newline)
  if (current || fields.length > 0) {
    fields.push(current.trim());
    if (fields.some(f => f.length > 0)) {
      rows.push([...fields]);
    }
  }

  return rows;
}

function parseNumber(value: string | undefined): number {
  if (!value) return 0;
  const cleaned = value.toString().replace(/[\s\u00A0]/g, '').replace(/,/g, '.');
  return parseFloat(cleaned) || 0;
}

function parseBoolean(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.toString().toUpperCase().trim();
  return v === 'TRUE' || v === '1' || v === 'ДА';
}

function detectPeriodsFromHeaders(headers: string[]): string[] {
  const quarterSet = new Set<string>();
  const regex = /(\d{2})_Q(\d)/;

  headers.forEach(h => {
    const match = h.match(regex);
    if (match) {
      const year = '20' + match[1];
      const quarter = year + '-Q' + match[2];
      quarterSet.add(quarter);
    }
  });

  return Array.from(quarterSet).sort();
}

// ===== ADMIN CSV PARSING =====
export function parseAdminCSV(text: string): {
  data: AdminDataRow[];
  quarters: string[];
  originalHeaders: string[];
} {
  const rows = parseCSVToRows(text);
  if (rows.length < 2) {
    return { data: [], quarters: [], originalHeaders: [] };
  }

  const headers = rows[0];
  const quarters = detectPeriodsFromHeaders(headers);
  const data: AdminDataRow[] = [];

  // Find column indices
  const unitIdx = headers.findIndex(h => h.toLowerCase().includes('unit') || h.toLowerCase() === 'юнит');
  const teamIdx = headers.findIndex(h => h.toLowerCase().includes('team') || h.toLowerCase() === 'команда');
  const initiativeIdx = headers.findIndex(h => h.toLowerCase().includes('initiative') || h.toLowerCase() === 'инициатива');
  const typeIdx = headers.findIndex(h => h.toLowerCase() === 'type' || h.toLowerCase() === 'тип');
  const stakeholdersListIdx = headers.findIndex(h => h.toLowerCase() === 'stakeholders list' || h.toLowerCase() === 'список стейкхолдеров');
  const descriptionIdx = headers.findIndex(h => h.toLowerCase().includes('description') || h.toLowerCase() === 'описание');
  const docLinkIdx = headers.findIndex(h => h.toLowerCase().includes('documentation') || h.toLowerCase().includes('doc link'));
  const stakeholdersIdx = headers.findIndex(h => h.toLowerCase().includes('stakeholder') || h.toLowerCase() === 'стейкхолдеры');

  for (let i = 1; i < rows.length; i++) {
    const values = rows[i];
    if (values.length < 4) continue;

    // Parse stakeholders list from CSV (comma-separated)
    const stakeholdersListRaw = stakeholdersListIdx >= 0 ? values[stakeholdersListIdx]?.trim() || '' : '';
    const parsedStakeholdersList = stakeholdersListRaw
      ? stakeholdersListRaw.split(',').map(s => s.trim()).filter(Boolean)
      : [];

    const row: AdminDataRow = {
      id: `row-${i}-${Date.now()}`,
      unit: values[unitIdx >= 0 ? unitIdx : 0]?.trim() || '',
      team: values[teamIdx >= 0 ? teamIdx : 1]?.trim() || '',
      initiative: values[initiativeIdx >= 0 ? initiativeIdx : 2]?.trim() || '',
      initiativeType: (typeIdx >= 0 ? values[typeIdx]?.trim() || '' : '') as InitiativeType | '',
      stakeholdersList: parsedStakeholdersList,
      description: values[descriptionIdx >= 0 ? descriptionIdx : 3]?.trim() || '',
      documentationLink: docLinkIdx >= 0 ? values[docLinkIdx]?.trim() || '' : '',
      stakeholders: values[stakeholdersIdx >= 0 ? stakeholdersIdx : 4]?.trim() || '',
      quarterlyData: {}
    };

    if (!row.unit || !row.initiative) continue;

    // Parse quarterly data
    quarters.forEach(q => {
      const prefix = q.replace('20', '').replace('-', '_') + '_';
      const costIdx = headers.findIndex(h => h.includes(prefix + 'Стоимость'));
      const otherCostsIdx = headers.findIndex(h => h.includes(prefix + 'Other Costs'));
      const supportIdx = headers.findIndex(h => h.includes(prefix + 'Поддержка'));
      const onTrackIdx = headers.findIndex(h => h.includes(prefix + 'On-Track'));
      const metricPlanIdx = headers.findIndex(h => h.includes(prefix + 'Metric Plan'));
      const metricFactIdx = headers.findIndex(h => h.includes(prefix + 'Metric Fact'));
      const commentIdx = headers.findIndex(h => h.includes(prefix + 'Comment'));
      const effortIdx = headers.findIndex(h => h.includes(prefix + 'Effort'));

      row.quarterlyData[q] = {
        cost: parseNumber(values[costIdx]),
        otherCosts: parseNumber(values[otherCostsIdx]),
        support: parseBoolean(values[supportIdx]),
        onTrack: parseBoolean(values[onTrackIdx]),
        metricPlan: values[metricPlanIdx]?.trim() || '',
        metricFact: values[metricFactIdx]?.trim() || '',
        comment: values[commentIdx]?.trim() || '',
        effortCoefficient: parseNumber(values[effortIdx])
      };
    });

    data.push(row);
  }

  return { data, quarters, originalHeaders: headers };
}

// ===== CSV EXPORT =====
function escapeCSVValue(value: string): string {
  if (!value) return '';
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

export function exportAdminCSV(
  data: AdminDataRow[],
  quarters: string[],
  originalHeaders: string[]
): string {
  // Build headers
  const baseHeaders = ['Unit', 'Team', 'Initiative', 'Type', 'Stakeholders List', 'Description', 'Documentation Link', 'Stakeholders'];
  const quarterHeaders: string[] = [];
  
  quarters.forEach(q => {
    const prefix = q.replace('20', '').replace('-', '_') + '_';
    quarterHeaders.push(
      `${prefix}Стоимость`,
      `${prefix}Other Costs`,
      `${prefix}Поддержка`,
      `${prefix}On-Track`,
      `${prefix}Metric Plan`,
      `${prefix}Metric Fact`,
      `${prefix}Comment`,
      `${prefix}Effort`
    );
  });

  const headers = [...baseHeaders, ...quarterHeaders];
  
  // Build rows
  const rows = data.map(row => {
    const baseValues = [
      escapeCSVValue(row.unit),
      escapeCSVValue(row.team),
      escapeCSVValue(row.initiative),
      escapeCSVValue(row.initiativeType || ''),
      escapeCSVValue(row.stakeholdersList?.join(', ') || ''),
      escapeCSVValue(row.description),
      escapeCSVValue(row.documentationLink),
      escapeCSVValue(row.stakeholders)
    ];

    const quarterValues: string[] = [];
    quarters.forEach(q => {
      const qData = row.quarterlyData[q] || createEmptyQuarterData();
      quarterValues.push(
        qData.cost.toString(),
        qData.otherCosts.toString(),
        qData.support ? 'TRUE' : 'FALSE',
        qData.onTrack ? 'TRUE' : 'FALSE',
        escapeCSVValue(qData.metricPlan),
        escapeCSVValue(qData.metricFact),
        escapeCSVValue(qData.comment),
        (qData.effortCoefficient || 0).toString()
      );
    });

    return [...baseValues, ...quarterValues].join(',');
  });

  // Add BOM for Excel compatibility
  const BOM = '\uFEFF';
  return BOM + headers.join(',') + '\n' + rows.join('\n');
}

// ===== UTILITY FUNCTIONS =====
export function getUniqueUnits(data: AdminDataRow[]): string[] {
  return [...new Set(data.map(r => r.unit))].sort();
}

export function getTeamsForUnits(data: AdminDataRow[], units: string[]): string[] {
  if (units.length === 0) return [...new Set(data.map(r => r.team).filter(Boolean))].sort();
  return [...new Set(
    data
      .filter(r => units.includes(r.unit))
      .map(r => r.team)
      .filter(Boolean)
  )].sort();
}

export function filterData(
  data: AdminDataRow[],
  selectedUnits: string[],
  selectedTeams: string[]
): AdminDataRow[] {
  return data.filter(row => {
    if (selectedUnits.length > 0 && !selectedUnits.includes(row.unit)) return false;
    if (selectedTeams.length > 0 && !selectedTeams.includes(row.team)) return false;
    return true;
  });
}

export function createEmptyQuarterData(): AdminQuarterData {
  return {
    cost: 0,
    otherCosts: 0,
    support: false,
    onTrack: true,
    metricPlan: '',
    metricFact: '',
    comment: '',
    effortCoefficient: 0
  };
}

export function createNewInitiative(
  unit: string,
  team: string,
  quarters: string[],
  initiativeType: InitiativeType | '' = '',
  stakeholdersList: string[] = []
): AdminDataRow {
  const quarterlyData: Record<string, AdminQuarterData> = {};
  quarters.forEach(q => {
    quarterlyData[q] = createEmptyQuarterData();
  });

  return {
    id: `new-${Date.now()}`,
    unit,
    team,
    initiative: '',
    initiativeType,
    stakeholdersList,
    description: '',
    documentationLink: '',
    stakeholders: '',
    quarterlyData,
    isNew: true
  };
}

// ===== QUARTERLY EFFORT VALIDATION =====
export function getTeamQuarterEffortSum(
  data: AdminDataRow[], 
  unit: string, 
  team: string, 
  quarter: string,
  excludeId?: string
): number {
  return data
    .filter(row => row.unit === unit && row.team === team && row.id !== excludeId)
    .reduce((sum, row) => sum + (row.quarterlyData[quarter]?.effortCoefficient || 0), 0);
}

export function validateTeamQuarterEffort(
  data: AdminDataRow[],
  unit: string,
  team: string,
  quarter: string
): { isValid: boolean; total: number } {
  const total = getTeamQuarterEffortSum(data, unit, team, quarter);
  return { isValid: total <= 100, total };
}

// Calculate effort sums for all quarters for a specific team (for table headers)
export function getTeamQuarterEffortSums(
  data: AdminDataRow[],
  selectedUnits: string[],
  selectedTeams: string[],
  quarters: string[]
): Record<string, { total: number; isValid: boolean }> {
  const result: Record<string, { total: number; isValid: boolean }> = {};
  
  // Get unique team combinations from filtered data
  const filteredData = filterData(data, selectedUnits, selectedTeams);
  
  quarters.forEach(quarter => {
    // Sum effort for all initiatives in filtered view
    const total = filteredData.reduce((sum, row) => {
      return sum + (row.quarterlyData[quarter]?.effortCoefficient || 0);
    }, 0);
    
    result[quarter] = {
      total,
      isValid: total <= 100
    };
  });
  
  return result;
}

// ===== CASCADING SUPPORT VALIDATION =====
// Check if support can be toggled for a specific quarter
export function canToggleSupport(
  quarterlyData: Record<string, AdminQuarterData>,
  quarter: string,
  quarters: string[]
): { canToggle: boolean; reason?: string; inheritedFrom?: string } {
  const quarterIndex = quarters.indexOf(quarter);
  
  // Check previous quarters for support
  for (let i = 0; i < quarterIndex; i++) {
    if (quarterlyData[quarters[i]]?.support) {
      return {
        canToggle: false,
        reason: 'Унаследовано от предыдущего квартала',
        inheritedFrom: quarters[i]
      };
    }
  }
  
  return { canToggle: true };
}

// Get inherited support info for a quarter
export function getInheritedSupportInfo(
  quarterlyData: Record<string, AdminQuarterData>,
  quarter: string,
  quarters: string[]
): { isInherited: boolean; fromQuarter: string | null } {
  const quarterIndex = quarters.indexOf(quarter);
  
  // Find first quarter with support = true before current
  for (let i = 0; i < quarterIndex; i++) {
    if (quarterlyData[quarters[i]]?.support) {
      return {
        isInherited: true,
        fromQuarter: quarters[i]
      };
    }
  }
  
  return { isInherited: false, fromQuarter: null };
}
