// ===== HR STRUCTURE PARSING =====
const SKIP_SUFFIXES = ['Dev', 'Frontend', 'Backend'];

export interface ParsedHRStructure {
  unit: string;
  team: string;
  segments: string[];
}

/**
 * Parse HR structure string to extract Unit and Team
 * Example: "Dodo Engineering.B2B Pizza.Kitchen Experience.Dev"
 * → { unit: "B2B Pizza", team: "Kitchen Experience" }
 */
export function parseHRStructure(structure: string): ParsedHRStructure {
  if (!structure) {
    return { unit: '', team: '', segments: [] };
  }

  const segments = structure.split('.').map(s => s.trim()).filter(Boolean);
  
  // Unit = 2nd segment (after "Dodo Engineering")
  const unit = segments[1] || '';
  
  // Team = last segment, unless it's a technical suffix
  let team = segments[segments.length - 1] || '';
  
  if (SKIP_SUFFIXES.includes(team) && segments.length > 2) {
    team = segments[segments.length - 2] || '';
  }
  
  return { unit, team, segments };
}

// ===== PERSON DATA TYPES =====
export interface Person {
  id: string;
  external_id: string | null;
  full_name: string;
  email: string | null;
  hr_structure: string | null;
  unit: string | null;
  team: string | null;
  position: string | null;
  leader: string | null;
  hired_at: string | null;
  terminated_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface PersonAssignment {
  id: string;
  person_id: string;
  initiative_id: string;
  quarterly_effort: Record<string, number>; // { "2025-Q1": 30, "2025-Q2": 25 }
  is_auto: boolean; // true = автопроставлено из initiative, false = вручную отредактировано
  created_at: string | null;
  updated_at: string | null;
}

// Virtual assignment — not yet saved to DB, generated for all person-initiative combinations
export interface VirtualAssignment {
  id: string | null; // null if not in DB yet
  person_id: string;
  initiative_id: string;
  quarterly_effort: Record<string, number>;
  expected_effort?: Record<string, number>; // From initiative's effortCoefficient
  is_auto: boolean;
  isVirtual: boolean; // true if not in DB
}

// ===== CSV PARSING FOR PEOPLE IMPORT =====
interface RawPeopleCSVRow {
  id?: string;
  'ФИО'?: string;
  'Команда'?: string;
  'Бизнес-юнит'?: string;
  'Должность'?: string;
  'Лидер'?: string;
  'Дата приема'?: string;
  'Дата увольнения'?: string;
  'Рабочая почта'?: string;
  [key: string]: string | undefined;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function parseDate(value: string | undefined): string | null {
  if (!value) return null;
  
  // Try various date formats
  const cleaned = value.trim();
  
  // DD.MM.YYYY format
  const ddmmyyyy = cleaned.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (ddmmyyyy) {
    const [, day, month, year] = ddmmyyyy;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
  // YYYY-MM-DD format (already correct)
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return cleaned;
  }
  
  return null;
}

export interface ParsedPerson {
  external_id: string | null;
  full_name: string;
  email: string | null;
  hr_structure: string | null;
  unit: string | null;
  team: string | null;
  position: string | null;
  leader: string | null;
  hired_at: string | null;
  terminated_at: string | null;
  parseWarnings: string[];
}

export interface ParsePeopleCSVResult {
  people: ParsedPerson[];
  errors: string[];
  warnings: string[];
}

export function parsePeopleCSV(text: string, existingUnits: string[], existingTeams: string[]): ParsePeopleCSVResult {
  const lines = text.split('\n').filter(line => line.trim());
  if (lines.length < 2) {
    return { people: [], errors: ['Файл пуст или содержит только заголовки'], warnings: [] };
  }

  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
  const people: ParsedPerson[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  // Find column indices (case-insensitive)
  const findColumn = (names: string[]): number => {
    return headers.findIndex(h => names.some(name => h.includes(name.toLowerCase())));
  };

  const idIdx = findColumn(['id']);
  const nameIdx = findColumn(['фио', 'имя', 'name', 'full_name']);
  const teamIdx = findColumn(['команда', 'team', 'структура']);
  const positionIdx = findColumn(['должность', 'position']);
  const leaderIdx = findColumn(['лидер', 'leader', 'руководитель']);
  const hiredIdx = findColumn(['дата приема', 'hired', 'прием']);
  const terminatedIdx = findColumn(['дата увольнения', 'terminated', 'увольнение']);
  const emailIdx = findColumn(['почта', 'email', 'mail']);

  if (nameIdx === -1) {
    return { people: [], errors: ['Не найдена колонка с ФИО'], warnings: [] };
  }

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length < 2) continue;

    const fullName = values[nameIdx]?.trim();
    if (!fullName) continue;

    const hrStructure = teamIdx >= 0 ? values[teamIdx]?.trim() || null : null;
    const parsed = hrStructure ? parseHRStructure(hrStructure) : { unit: '', team: '' };
    
    const person: ParsedPerson = {
      external_id: idIdx >= 0 ? values[idIdx]?.trim() || null : null,
      full_name: fullName,
      email: emailIdx >= 0 ? values[emailIdx]?.trim() || null : null,
      hr_structure: hrStructure,
      unit: parsed.unit || null,
      team: parsed.team || null,
      position: positionIdx >= 0 ? values[positionIdx]?.trim() || null : null,
      leader: leaderIdx >= 0 ? values[leaderIdx]?.trim() || null : null,
      hired_at: parseDate(hiredIdx >= 0 ? values[hiredIdx] : undefined),
      terminated_at: parseDate(terminatedIdx >= 0 ? values[terminatedIdx] : undefined),
      parseWarnings: []
    };

    // Validate against existing units/teams
    if (person.unit && existingUnits.length > 0 && !existingUnits.includes(person.unit)) {
      person.parseWarnings.push(`Unit "${person.unit}" не найден в инициативах`);
    }
    if (person.team && existingTeams.length > 0 && !existingTeams.includes(person.team)) {
      person.parseWarnings.push(`Team "${person.team}" не найден в инициативах`);
    }

    people.push(person);
  }

  const totalWarnings = people.filter(p => p.parseWarnings.length > 0).length;
  if (totalWarnings > 0) {
    warnings.push(`${totalWarnings} человек с предупреждениями о Unit/Team`);
  }

  return { people, errors, warnings };
}

// ===== EFFORT VALIDATION =====
export function validatePersonQuarterEffort(
  assignments: PersonAssignment[],
  quarter: string
): { total: number; isValid: boolean } {
  const total = assignments.reduce((sum, a) => {
    return sum + (a.quarterly_effort[quarter] || 0);
  }, 0);
  
  return { total, isValid: total <= 100 };
}

// ===== EXPORT COEFFICIENTS CSV =====
export interface CoefficientsExportRow {
  fullName: string;
  email: string;
  team: string;
  initiative: string;
  hiredAt: string;
  terminatedAt: string;
  quarterlyEfforts: Record<string, number>;
}

export function exportCoefficientsCSV(
  rows: CoefficientsExportRow[],
  quarters: string[]
): string {
  const headers = [
    'ФИО',
    'Email',
    'Команда',
    'Инициатива',
    'Дата найма',
    'Дата увольнения',
    ...quarters.map(q => q.replace('20', '').replace('-', '_') + '_Effort')
  ];

  const csvRows = rows.map(row => {
    const values = [
      escapeCSVValue(row.fullName),
      escapeCSVValue(row.email),
      escapeCSVValue(row.team),
      escapeCSVValue(row.initiative),
      row.hiredAt || '',
      row.terminatedAt || '',
      ...quarters.map(q => (row.quarterlyEfforts[q] || 0).toString())
    ];
    return values.join(',');
  });

  const BOM = '\uFEFF';
  return BOM + headers.join(',') + '\n' + csvRows.join('\n');
}

function escapeCSVValue(value: string): string {
  if (!value) return '';
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}
