import { AdminDataRow, AdminQuarterData } from './adminDataManager';

// ===== DATA TYPES =====
export interface QuarterData {
  budget: number;
  support: boolean;
  onTrack: boolean;
  metricPlan: string;
  metricFact: string;
  comment: string;
}

export interface RawDataRow {
  unit: string;
  team: string;
  initiative: string;
  description: string;
  stakeholders: string;
  quarterlyData: Record<string, QuarterData>;
}

export interface TreeNode {
  name: string;
  children?: TreeNode[];
  value?: number;
  description?: string;
  stakeholders?: string[];
  support?: boolean;
  offTrack?: boolean;
  quarterlyData?: Record<string, QuarterData>;
  isUnit?: boolean;
  isTeam?: boolean;
  isInitiative?: boolean;
  isRoot?: boolean;
  isStakeholder?: boolean;
}

// ===== CONVERT FROM DATABASE =====
// Convert AdminDataRow (from Supabase) to RawDataRow (for Dashboard)
export function convertFromDB(dbRows: AdminDataRow[]): {
  rawData: RawDataRow[];
  availableYears: string[];
  availableQuarters: string[];
  stakeholderCombinations: string[];
} {
  // Collect all quarters from all rows
  const quarterSet = new Set<string>();
  const yearSet = new Set<string>();
  const stakeholderSet = new Set<string>();

  dbRows.forEach(row => {
    Object.keys(row.quarterlyData || {}).forEach(q => {
      quarterSet.add(q);
      // Extract year from quarter (e.g., "2025-Q1" -> "2025")
      const year = q.split('-')[0];
      if (year) yearSet.add(year);
    });
    
    // Collect stakeholder combinations
    if (row.stakeholders) {
      stakeholderSet.add(row.stakeholders);
    }
  });

  const availableQuarters = Array.from(quarterSet).sort();
  const availableYears = Array.from(yearSet).sort();
  const stakeholderCombinations = Array.from(stakeholderSet).sort();

  // Convert rows
  const rawData: RawDataRow[] = dbRows.map(row => {
    const quarterlyData: Record<string, QuarterData> = {};
    
    Object.entries(row.quarterlyData || {}).forEach(([quarter, qData]) => {
      const adminQData = qData as AdminQuarterData;
      quarterlyData[quarter] = {
        budget: (adminQData.cost || 0) + (adminQData.otherCosts || 0),
        support: adminQData.support ?? false,
        onTrack: adminQData.onTrack ?? true,
        metricPlan: adminQData.metricPlan || '',
        metricFact: adminQData.metricFact || '',
        comment: adminQData.comment || ''
      };
    });

    return {
      unit: row.unit,
      team: row.team,
      initiative: row.initiative,
      description: row.description || '',
      stakeholders: row.stakeholders || '',
      quarterlyData
    };
  });

  return {
    rawData,
    availableYears,
    availableQuarters,
    stakeholderCombinations
  };
}

// ===== CSV PARSING =====

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

// Keep for backward compatibility
export function parseCSVLine(line: string): string[] {
  return parseCSVToRows(line)[0] || [];
}

export function parseNumber(value: string | undefined): number {
  if (!value) return 0;
  const cleaned = value.toString().replace(/[\s\u00A0]/g, '').replace(/,/g, '.');
  return parseFloat(cleaned) || 0;
}

export function parseBoolean(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.toString().toUpperCase().trim();
  return v === 'TRUE' || v === '1' || v === 'ДА';
}

export function normalizeStakeholders(value: string): string {
  if (!value) return '';
  const parts = value.split(',').map(s => s.trim()).filter(s => s);
  parts.sort();
  return parts.join(', ');
}

export function detectPeriodsFromHeaders(headers: string[]): { years: string[]; quarters: string[] } {
  const yearSet = new Set<string>();
  const quarterSet = new Set<string>();
  const regex = /(\d{2})_Q(\d)/;

  headers.forEach(h => {
    const match = h.match(regex);
    if (match) {
      const year = '20' + match[1];
      const quarter = year + '-Q' + match[2];
      yearSet.add(year);
      quarterSet.add(quarter);
    }
  });

  return {
    years: Array.from(yearSet).sort(),
    quarters: Array.from(quarterSet).sort()
  };
}

export function parseCSV(text: string): {
  rawData: RawDataRow[];
  availableYears: string[];
  availableQuarters: string[];
  stakeholderCombinations: string[];
} {
  const rows = parseCSVToRows(text);
  if (rows.length < 2) {
    return { rawData: [], availableYears: [], availableQuarters: [], stakeholderCombinations: [] };
  }

  const headers = rows[0];
  const { years: availableYears, quarters: availableQuarters } = detectPeriodsFromHeaders(headers);

  const rawData: RawDataRow[] = [];

  for (let i = 1; i < rows.length; i++) {
    const values = rows[i];
    if (values.length < 5) continue;

    const row: RawDataRow = {
      unit: values[0]?.trim() || '',
      team: values[1]?.trim() || '',
      initiative: values[2]?.trim() || '',
      description: values[3]?.trim() || '',
      stakeholders: normalizeStakeholders(values[4] || ''),
      quarterlyData: {}
    };

    if (!row.unit || !row.initiative) continue;

    // Parse quarterly data
    availableQuarters.forEach(q => {
      const prefix = q.replace('20', '').replace('-', '_') + '_';
      const costIdx = headers.findIndex(h => h.includes(prefix + 'Стоимость'));
      const supportIdx = headers.findIndex(h => h.includes(prefix + 'Поддержка'));
      const onTrackIdx = headers.findIndex(h => h.includes(prefix + 'On-Track'));
      const otherCostsIdx = headers.findIndex(h => h.includes(prefix + 'Other Costs'));
      const metricPlanIdx = headers.findIndex(h => h.includes(prefix + 'Metric Plan'));
      const metricFactIdx = headers.findIndex(h => h.includes(prefix + 'Metric Fact'));
      const commentIdx = headers.findIndex(h => h.includes(prefix + 'Comment'));

      const cost = parseNumber(values[costIdx]) || 0;
      const otherCosts = parseNumber(values[otherCostsIdx]) || 0;

      row.quarterlyData[q] = {
        budget: cost + otherCosts,
        support: parseBoolean(values[supportIdx]),
        onTrack: parseBoolean(values[onTrackIdx]),
        metricPlan: values[metricPlanIdx] || '',
        metricFact: values[metricFactIdx] || '',
        comment: values[commentIdx] || ''
      };
    });

    rawData.push(row);
  }

  // Collect unique stakeholder combinations
  const combos = new Set<string>();
  rawData.forEach(row => {
    if (row.stakeholders) {
      combos.add(row.stakeholders);
    }
  });

  return {
    rawData,
    availableYears,
    availableQuarters,
    stakeholderCombinations: Array.from(combos).sort()
  };
}

// ===== BUDGET CALCULATION =====
export function calculateBudget(row: RawDataRow, selectedQuarters: string[]): number {
  let total = 0;
  selectedQuarters.forEach(q => {
    if (row.quarterlyData[q]) {
      total += row.quarterlyData[q].budget;
    }
  });
  return total;
}

// Calculate total budget across ALL quarters (for Gantt total cost)
export function calculateTotalBudget(row: RawDataRow): number {
  let total = 0;
  Object.values(row.quarterlyData).forEach(qData => {
    total += qData.budget;
  });
  return total;
}

// Get all quarters where initiative has budget
export function getInitiativeQuarters(row: RawDataRow): string[] {
  return Object.keys(row.quarterlyData).filter(q => row.quarterlyData[q].budget > 0);
}

export function isInitiativeSupport(row: RawDataRow, selectedQuarters: string[]): boolean {
  if (selectedQuarters.length === 0) return false;
  const lastQ = selectedQuarters[selectedQuarters.length - 1];
  return row.quarterlyData[lastQ]?.support ?? false;
}

export function isInitiativeOffTrack(row: RawDataRow, selectedQuarters: string[]): boolean {
  if (selectedQuarters.length === 0) return false;
  // Off-track only if the LAST quarter in selected period was off-track
  const lastQuarter = selectedQuarters[selectedQuarters.length - 1];
  const qData = row.quarterlyData[lastQuarter];
  return qData ? !qData.onTrack : false;
}

// ===== DATA TREE BUILDING =====
export interface BuildTreeOptions {
  selectedQuarters: string[];
  hideSupportInitiatives: boolean;
  showOnlyOfftrack: boolean;
  selectedStakeholders: string[];
  unitFilter: string;
  teamFilter: string;
  selectedUnits?: string[];
  selectedTeams?: string[];
  // NEW: control tree structure based on toggles
  showTeams?: boolean;
  showInitiatives?: boolean;
}

export function buildBudgetTree(rawData: RawDataRow[], options: BuildTreeOptions): TreeNode {
  const showTeams = options.showTeams ?? false;
  const showInitiatives = options.showInitiatives ?? false;

  // Different tree structures based on toggle combination:
  // 1. Nothing selected -> Units only (with aggregated value)
  // 2. Only Teams -> Units -> Teams (with aggregated values)
  // 3. Teams + Initiatives -> Units -> Teams -> Initiatives
  // 4. Only Initiatives -> Units -> Initiatives directly (skip teams)

  if (!showTeams && !showInitiatives) {
    // Case 1: Only Units - aggregate all to unit level
    return buildUnitsOnlyTree(rawData, options);
  } else if (showTeams && !showInitiatives) {
    // Case 2: Units -> Teams (aggregate initiatives into teams)
    return buildUnitsTeamsTree(rawData, options);
  } else if (showTeams && showInitiatives) {
    // Case 3: Full hierarchy Units -> Teams -> Initiatives
    return buildFullTree(rawData, options);
  } else {
    // Case 4: Units -> Initiatives directly (skip teams)
    return buildUnitsInitiativesTree(rawData, options);
  }
}

// Helper: filter row based on options
function shouldIncludeRow(row: RawDataRow, options: BuildTreeOptions, budget: number): boolean {
  if (budget === 0) return false;

  const isSupport = isInitiativeSupport(row, options.selectedQuarters);
  const isOffTrack = isInitiativeOffTrack(row, options.selectedQuarters);

  if (options.hideSupportInitiatives && isSupport) return false;
  if (options.showOnlyOfftrack && !isOffTrack) return false;
  if (options.selectedStakeholders.length > 0 && !options.selectedStakeholders.includes(row.stakeholders)) return false;
  if (options.selectedUnits && options.selectedUnits.length > 0 && !options.selectedUnits.includes(row.unit)) return false;
  if (options.unitFilter && row.unit !== options.unitFilter) return false;
  if (options.selectedTeams && options.selectedTeams.length > 0 && !options.selectedTeams.includes(row.team)) return false;
  if (options.teamFilter && row.team !== options.teamFilter) return false;

  return true;
}

// Case 1: Only Units with aggregated values
function buildUnitsOnlyTree(rawData: RawDataRow[], options: BuildTreeOptions): TreeNode {
  const unitMap: Record<string, { name: string; value: number; isUnit: boolean; children: TreeNode[] }> = {};

  rawData.forEach(row => {
    const budget = calculateBudget(row, options.selectedQuarters);
    if (!shouldIncludeRow(row, options, budget)) return;

    if (!unitMap[row.unit]) {
      unitMap[row.unit] = { name: row.unit, value: 0, isUnit: true, children: [] };
    }
    unitMap[row.unit].value += budget;
  });

  const children = Object.values(unitMap).filter(u => u.value > 0);
  return { name: 'Все Unit', children, isRoot: true };
}

// Case 2: Units -> Teams with aggregated values
function buildUnitsTeamsTree(rawData: RawDataRow[], options: BuildTreeOptions): TreeNode {
  const unitMap: Record<string, { 
    name: string; 
    children: TreeNode[]; 
    teamMap: Record<string, { name: string; value: number; isTeam: boolean; children: TreeNode[] }>; 
    isUnit: boolean 
  }> = {};

  rawData.forEach(row => {
    const budget = calculateBudget(row, options.selectedQuarters);
    if (!shouldIncludeRow(row, options, budget)) return;

    if (!unitMap[row.unit]) {
      unitMap[row.unit] = { name: row.unit, children: [], teamMap: {}, isUnit: true };
    }

    const unit = unitMap[row.unit];
    const teamName = row.team || 'Без команды';

    if (!unit.teamMap[teamName]) {
      unit.teamMap[teamName] = { name: teamName, value: 0, isTeam: true, children: [] };
      unit.children.push(unit.teamMap[teamName]);
    }

    unit.teamMap[teamName].value += budget;
  });

  const children = Object.values(unitMap)
    .map(unit => {
      const { teamMap, ...rest } = unit;
      return {
        ...rest,
        children: rest.children.filter((team: TreeNode) => (team.value || 0) > 0)
      };
    })
    .filter(unit => unit.children.length > 0);

  return { name: 'Все Unit', children, isRoot: true };
}

// Case 3: Full hierarchy Units -> Teams -> Initiatives
function buildFullTree(rawData: RawDataRow[], options: BuildTreeOptions): TreeNode {
  const unitMap: Record<string, { name: string; children: TreeNode[]; teamMap: Record<string, TreeNode>; isUnit: boolean }> = {};

  rawData.forEach(row => {
    const budget = calculateBudget(row, options.selectedQuarters);
    if (!shouldIncludeRow(row, options, budget)) return;

    const isSupport = isInitiativeSupport(row, options.selectedQuarters);
    const isOffTrack = isInitiativeOffTrack(row, options.selectedQuarters);

    if (!unitMap[row.unit]) {
      unitMap[row.unit] = { name: row.unit, children: [], teamMap: {}, isUnit: true };
    }

    const unit = unitMap[row.unit];
    const teamName = row.team || 'Без команды';

    if (!unit.teamMap[teamName]) {
      unit.teamMap[teamName] = { name: teamName, children: [], isTeam: true };
      unit.children.push(unit.teamMap[teamName]);
    }

    unit.teamMap[teamName].children!.push({
      name: row.initiative,
      value: budget,
      description: row.description,
      stakeholders: row.stakeholders ? row.stakeholders.split(', ') : [],
      support: isSupport,
      offTrack: isOffTrack,
      quarterlyData: row.quarterlyData,
      isInitiative: true
    });
  });

  const children = Object.values(unitMap)
    .map(unit => {
      const { teamMap, ...rest } = unit;
      return {
        ...rest,
        children: rest.children.filter(team => team.children && team.children.length > 0)
      };
    })
    .filter(unit => unit.children.length > 0);

  return { name: 'Все Unit', children, isRoot: true };
}

// Case 4: Units -> Initiatives directly (skip teams)
function buildUnitsInitiativesTree(rawData: RawDataRow[], options: BuildTreeOptions): TreeNode {
  const unitMap: Record<string, { name: string; children: TreeNode[]; isUnit: boolean }> = {};

  rawData.forEach(row => {
    const budget = calculateBudget(row, options.selectedQuarters);
    if (!shouldIncludeRow(row, options, budget)) return;

    const isSupport = isInitiativeSupport(row, options.selectedQuarters);
    const isOffTrack = isInitiativeOffTrack(row, options.selectedQuarters);

    if (!unitMap[row.unit]) {
      unitMap[row.unit] = { name: row.unit, children: [], isUnit: true };
    }

    unitMap[row.unit].children.push({
      name: row.initiative,
      value: budget,
      description: row.description,
      stakeholders: row.stakeholders ? row.stakeholders.split(', ') : [],
      support: isSupport,
      offTrack: isOffTrack,
      quarterlyData: row.quarterlyData,
      isInitiative: true
    });
  });

  const children = Object.values(unitMap).filter(unit => unit.children.length > 0);
  return { name: 'Все Unit', children, isRoot: true };
}

// ===== FORMATTING =====
export function formatBudget(value: number): string {
  if (value >= 1000000) {
    return (value / 1000000).toFixed(1) + ' млн ₽';
  } else if (value >= 1000) {
    return (value / 1000).toFixed(0) + ' тыс. ₽';
  }
  return value + ' ₽';
}

export function formatBudgetShort(value: number): string {
  if (value >= 1000000) {
    return (value / 1000000).toFixed(1) + 'M';
  } else if (value >= 1000) {
    return (value / 1000).toFixed(0) + 'K';
  }
  return value.toString();
}

export function escapeHtml(text: string): string {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ===== COLOR UTILITIES =====
// Deep, saturated palette with high contrast for white text (WCAG AA compliant)
const colorPalette = [
  '#4A7DD7',  // Насыщенный синий
  '#7B5FA8',  // Глубокий фиолетовый
  '#D4852C',  // Янтарь (замена жёлтому)
  '#2D9B6A',  // Тёмный изумруд
  '#C44E89',  // Глубокий розовый
  '#4A90B8',  // Стальной синий
  '#E67A3D',  // Тыквенный оранж
  '#8B6AAF',  // Аметист
];

// Explicit colors for all known units — guaranteed unique, no auto-generation collisions
const explicitUnitColors: Record<string, string> = {
  'Drinkit':          '#4A7DD7',  // Насыщенный синий (закреплён)
  'Tech Platform':    '#7B5FA8',  // Глубокий фиолетовый
  'Data Office':      '#D4852C',  // Янтарь
  'FAP':              '#E67A3D',  // Тыквенный оранж
  'Client Platform':  '#2D9B6A',  // Тёмный изумруд
  'App&Web':          '#C44E89',  // Глубокий розовый
  'B2B Pizza':        '#4A90B8',  // Стальной синий
};

const unitColors: Record<string, string> = { ...explicitUnitColors };
let unitColorIndex = 0;

export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

// ===== HUE SHIFT COLOR UTILITIES =====
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 0, b: 0 };
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return { h: h * 360, s, l };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  h = h / 360;

  let r, g, b;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;

    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255)
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

// Shift hue by given degrees (preserves saturation and lightness for readability)
export function shiftHue(hex: string, degrees: number): string {
  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  hsl.h = (hsl.h + degrees + 360) % 360;
  const newRgb = hslToRgb(hsl.h, hsl.s, hsl.l);
  return rgbToHex(newRgb.r, newRgb.g, newRgb.b);
}

// Generate extended color from palette with hue shifting for uniqueness
function generateExtendedColor(index: number, palette: string[]): string {
  const baseIndex = index % palette.length;
  const generation = Math.floor(index / palette.length);

  if (generation === 0) {
    return palette[baseIndex];
  }

  // For subsequent generations, shift hue alternating +/- direction
  const hueShift = generation * 25 * (generation % 2 === 0 ? 1 : -1);
  return shiftHue(palette[baseIndex], hueShift);
}

export function getUnitColor(unitName: string): string {
  if (!unitColors[unitName]) {
    // Auto-generate, skipping colors already used by explicit assignments
    const usedColors = new Set(Object.values(explicitUnitColors));
    let color: string;
    do {
      color = generateExtendedColor(unitColorIndex++, colorPalette);
    } while (usedColors.has(color));
    unitColors[unitName] = color;
  }
  return unitColors[unitName];
}

export function adjustBrightness(hex: string, percent: number): string {
  const num = parseInt(hex.slice(1), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.max(0, Math.min(255, (num >> 16) + amt));
  const G = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + amt));
  const B = Math.max(0, Math.min(255, (num & 0x0000FF) + amt));
  return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
}

// ===== STAKEHOLDERS TREE BUILDING =====
// Respects showTeams and showInitiatives toggles just like Budget tree
export function buildStakeholdersTree(rawData: RawDataRow[], options: BuildTreeOptions): TreeNode {
  const showTeams = options.showTeams ?? false;
  const showInitiatives = options.showInitiatives ?? false;

  if (!showTeams && !showInitiatives) {
    return buildStakeholdersUnitsOnlyTree(rawData, options);
  } else if (showTeams && !showInitiatives) {
    return buildStakeholdersUnitsTeamsTree(rawData, options);
  } else if (showTeams && showInitiatives) {
    return buildStakeholdersFullTree(rawData, options);
  } else {
    return buildStakeholdersUnitsInitiativesTree(rawData, options);
  }
}

// Stakeholders -> Units only (aggregated)
function buildStakeholdersUnitsOnlyTree(rawData: RawDataRow[], options: BuildTreeOptions): TreeNode {
  const stakeholderMap: Record<string, { 
    name: string; 
    children: TreeNode[]; 
    unitMap: Record<string, { name: string; value: number; isUnit: boolean }>;
    isStakeholder: boolean;
  }> = {};

  rawData.forEach(row => {
    const budget = calculateBudget(row, options.selectedQuarters);
    if (!shouldIncludeRow(row, options, budget)) return;

    const stakeholderKey = row.stakeholders || 'Без стейкхолдера';

    if (!stakeholderMap[stakeholderKey]) {
      stakeholderMap[stakeholderKey] = { 
        name: stakeholderKey, 
        children: [], 
        unitMap: {},
        isStakeholder: true 
      };
    }

    const stakeholder = stakeholderMap[stakeholderKey];

    if (!stakeholder.unitMap[row.unit]) {
      stakeholder.unitMap[row.unit] = { name: row.unit, value: 0, isUnit: true };
    }

    stakeholder.unitMap[row.unit].value += budget;
  });

  const children = Object.values(stakeholderMap)
    .map(sh => ({
      ...sh,
      children: Object.values(sh.unitMap).filter(u => u.value > 0)
    }))
    .filter(sh => sh.children.length > 0);

  return { name: 'Все стейкхолдеры', children, isRoot: true };
}

// Stakeholders -> Units -> Teams (aggregated)
function buildStakeholdersUnitsTeamsTree(rawData: RawDataRow[], options: BuildTreeOptions): TreeNode {
  const stakeholderMap: Record<string, { 
    name: string; 
    children: TreeNode[]; 
    unitMap: Record<string, { 
      name: string; 
      children: TreeNode[]; 
      teamMap: Record<string, { name: string; value: number; isTeam: boolean }>;
      isUnit: boolean;
    }>;
    isStakeholder: boolean;
  }> = {};

  rawData.forEach(row => {
    const budget = calculateBudget(row, options.selectedQuarters);
    if (!shouldIncludeRow(row, options, budget)) return;

    const stakeholderKey = row.stakeholders || 'Без стейкхолдера';

    if (!stakeholderMap[stakeholderKey]) {
      stakeholderMap[stakeholderKey] = { 
        name: stakeholderKey, 
        children: [], 
        unitMap: {},
        isStakeholder: true 
      };
    }

    const stakeholder = stakeholderMap[stakeholderKey];

    if (!stakeholder.unitMap[row.unit]) {
      stakeholder.unitMap[row.unit] = { 
        name: row.unit, 
        children: [], 
        teamMap: {},
        isUnit: true 
      };
    }

    const unit = stakeholder.unitMap[row.unit];
    const teamName = row.team || 'Без команды';

    if (!unit.teamMap[teamName]) {
      unit.teamMap[teamName] = { name: teamName, value: 0, isTeam: true };
    }

    unit.teamMap[teamName].value += budget;
  });

  const children = Object.values(stakeholderMap)
    .map(sh => ({
      ...sh,
      children: Object.values(sh.unitMap)
        .map(unit => ({
          ...unit,
          children: Object.values(unit.teamMap).filter(t => t.value > 0)
        }))
        .filter(unit => unit.children.length > 0)
    }))
    .filter(sh => sh.children.length > 0);

  return { name: 'Все стейкхолдеры', children, isRoot: true };
}

// Stakeholders -> Units -> Teams -> Initiatives (full)
function buildStakeholdersFullTree(rawData: RawDataRow[], options: BuildTreeOptions): TreeNode {
  const stakeholderMap: Record<string, { 
    name: string; 
    children: TreeNode[]; 
    unitMap: Record<string, { 
      name: string; 
      children: TreeNode[]; 
      teamMap: Record<string, TreeNode>;
      isUnit: boolean;
    }>;
    isStakeholder: boolean;
  }> = {};

  rawData.forEach(row => {
    const budget = calculateBudget(row, options.selectedQuarters);
    if (!shouldIncludeRow(row, options, budget)) return;

    const stakeholderKey = row.stakeholders || 'Без стейкхолдера';
    const isSupport = isInitiativeSupport(row, options.selectedQuarters);
    const isOffTrack = isInitiativeOffTrack(row, options.selectedQuarters);

    if (!stakeholderMap[stakeholderKey]) {
      stakeholderMap[stakeholderKey] = { 
        name: stakeholderKey, 
        children: [], 
        unitMap: {},
        isStakeholder: true 
      };
    }

    const stakeholder = stakeholderMap[stakeholderKey];

    if (!stakeholder.unitMap[row.unit]) {
      stakeholder.unitMap[row.unit] = { 
        name: row.unit, 
        children: [], 
        teamMap: {},
        isUnit: true 
      };
      stakeholder.children.push(stakeholder.unitMap[row.unit]);
    }

    const unit = stakeholder.unitMap[row.unit];
    const teamName = row.team || 'Без команды';

    if (!unit.teamMap[teamName]) {
      unit.teamMap[teamName] = { name: teamName, children: [], isTeam: true };
      unit.children.push(unit.teamMap[teamName]);
    }

    unit.teamMap[teamName].children!.push({
      name: row.initiative,
      value: budget,
      description: row.description,
      stakeholders: row.stakeholders ? row.stakeholders.split(', ') : [],
      support: isSupport,
      offTrack: isOffTrack,
      quarterlyData: row.quarterlyData,
      isInitiative: true
    });
  });

  // Clean up helper maps and filter empty nodes
  const children = Object.values(stakeholderMap)
    .map(sh => {
      const { unitMap, ...rest } = sh;
      return {
        ...rest,
        children: rest.children
          .map(unit => {
            const { teamMap, ...unitRest } = unit as typeof stakeholderMap[string]['unitMap'][string];
            return {
              ...unitRest,
              children: unitRest.children.filter(team => team.children && team.children.length > 0)
            };
          })
          .filter(unit => unit.children.length > 0)
      };
    })
    .filter(sh => sh.children.length > 0);

  return { name: 'Все стейкхолдеры', children, isRoot: true };
}

// Stakeholders -> Units -> Initiatives directly (skip teams)
function buildStakeholdersUnitsInitiativesTree(rawData: RawDataRow[], options: BuildTreeOptions): TreeNode {
  const stakeholderMap: Record<string, { 
    name: string; 
    children: TreeNode[]; 
    unitMap: Record<string, { 
      name: string; 
      children: TreeNode[];
      isUnit: boolean;
    }>;
    isStakeholder: boolean;
  }> = {};

  rawData.forEach(row => {
    const budget = calculateBudget(row, options.selectedQuarters);
    if (!shouldIncludeRow(row, options, budget)) return;

    const stakeholderKey = row.stakeholders || 'Без стейкхолдера';
    const isSupport = isInitiativeSupport(row, options.selectedQuarters);
    const isOffTrack = isInitiativeOffTrack(row, options.selectedQuarters);

    if (!stakeholderMap[stakeholderKey]) {
      stakeholderMap[stakeholderKey] = { 
        name: stakeholderKey, 
        children: [], 
        unitMap: {},
        isStakeholder: true 
      };
    }

    const stakeholder = stakeholderMap[stakeholderKey];

    if (!stakeholder.unitMap[row.unit]) {
      stakeholder.unitMap[row.unit] = { 
        name: row.unit, 
        children: [],
        isUnit: true 
      };
    }

    stakeholder.unitMap[row.unit].children.push({
      name: row.initiative,
      value: budget,
      description: row.description,
      stakeholders: row.stakeholders ? row.stakeholders.split(', ') : [],
      support: isSupport,
      offTrack: isOffTrack,
      quarterlyData: row.quarterlyData,
      isInitiative: true
    });
  });

  const children = Object.values(stakeholderMap)
    .map(sh => ({
      ...sh,
      children: Object.values(sh.unitMap).filter(unit => unit.children.length > 0)
    }))
    .filter(sh => sh.children.length > 0);

  return { name: 'Все стейкхолдеры', children, isRoot: true };
}
