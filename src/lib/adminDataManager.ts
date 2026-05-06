import {
  compareQuarters,
  isCalendarPastQuarter,
  isPortfolioMandatoryMetricFactQuarter,
} from '@/lib/quarterUtils';

// ===== GEO COST SPLIT (квартал: % от cost по строкам справочника market_countries) =====

export type GeoCostSplitEntry =
  | { kind: 'country'; countryId: string; percent: number; note?: string }
  | { kind: 'cluster'; clusterKey: string; percent: number; note?: string };

export interface GeoCostSplit {
  entries: GeoCostSplitEntry[];
  /** Комментарий ко всему сплиту квартала (один на квартал). */
  note?: string;
  /** Стабильный ключ пресета распределения (драйвер), см. `GEO_ALLOCATION_DRIVERS` в `geoAllocationDrivers.ts`. */
  driverKey?: string;
  /** Подпись драйвера для UI и выгрузок; при пересчёте коэффициентов ключ ищем по `driverKey`. */
  driverLabel?: string;
}

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
  /** false — предварительная стоимость (Quick Flow); true/undefined — подтверждено финансами */
  costFinanceConfirmed?: boolean;
}

// Available stakeholders (кластеры; IT убран)
export const STAKEHOLDERS_LIST = [
  'Russia',
  'Central Asia',
  'Europe',
  'Turkey',
  'MENA',
  'Other Countries',
  'Drinkit',
] as const;

/** Кластер в БД / JSON → подпись в stakeholders_list */
export function clusterKeyToStakeholderLabel(clusterKey: string): string {
  if (clusterKey === 'Other_Countries') return 'Other Countries';
  return clusterKey;
}

/** Обратное сопоставление для справочника market_countries.cluster_key */
export function stakeholderLabelToClusterKey(label: string): string {
  if (label === 'Other Countries') return 'Other_Countries';
  return label;
}

const STAKEHOLDER_ORDER = new Map(STAKEHOLDERS_LIST.map((s, i) => [s, i]));

/** Сортировка подписей кластеров в порядке STAKEHOLDERS_LIST + прочие в конце */
export function sortStakeholderLabels(labels: string[]): string[] {
  return [...new Set(labels)].sort((a, b) => {
    const ia = STAKEHOLDER_ORDER.has(a as (typeof STAKEHOLDERS_LIST)[number])
      ? STAKEHOLDER_ORDER.get(a as (typeof STAKEHOLDERS_LIST)[number])!
      : 999;
    const ib = STAKEHOLDER_ORDER.has(b as (typeof STAKEHOLDERS_LIST)[number])
      ? STAKEHOLDER_ORDER.get(b as (typeof STAKEHOLDERS_LIST)[number])!
      : 999;
    if (ia !== ib) return ia - ib;
    return a.localeCompare(b);
  });
}

/** JSON для колонки `initiatives.geo_cost_split` и API (без пустых note). */
export function geoCostSplitToJson(split: GeoCostSplit): {
  entries: Record<string, unknown>[];
  note?: string;
  driverKey?: string;
  driverLabel?: string;
} {
  const splitNote = typeof split.note === 'string' && split.note.trim() ? split.note.trim() : undefined;
  const driverKey =
    typeof split.driverKey === 'string' && split.driverKey.trim() ? split.driverKey.trim() : undefined;
  const driverLabel =
    typeof split.driverLabel === 'string' && split.driverLabel.trim() ? split.driverLabel.trim() : undefined;
  return {
    entries: split.entries.map((e) => {
      const note = typeof e.note === 'string' && e.note.trim() ? e.note.trim() : undefined;
      if (e.kind === 'country') {
        return {
          kind: 'country',
          countryId: e.countryId,
          percent: e.percent,
          ...(note ? { note } : {}),
        };
      }
      return {
        kind: 'cluster',
        clusterKey: e.clusterKey,
        percent: e.percent,
        ...(note ? { note } : {}),
      };
    }),
    ...(splitNote ? { note: splitNote } : {}),
    ...(driverKey ? { driverKey, ...(driverLabel ? { driverLabel } : {}) } : {}),
  };
}

export function parseGeoCostSplit(raw: unknown): GeoCostSplit | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.entries)) return undefined;
  const entries: GeoCostSplitEntry[] = [];
  for (const item of o.entries) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const e = item as Record<string, unknown>;
    const kind = e.kind;
    const percent = typeof e.percent === 'number' ? Math.round(e.percent) : 0;
    const noteRaw = e.note;
    const note =
      typeof noteRaw === 'string' && noteRaw.trim() ? noteRaw.trim() : undefined;
    if (kind === 'country' && typeof e.countryId === 'string' && e.countryId) {
      entries.push({ kind: 'country', countryId: e.countryId, percent, ...(note ? { note } : {}) });
    } else if (kind === 'cluster' && typeof e.clusterKey === 'string' && e.clusterKey) {
      entries.push({ kind: 'cluster', clusterKey: e.clusterKey, percent, ...(note ? { note } : {}) });
    }
  }
  if (entries.length === 0) return undefined;
  const splitNoteRaw = o.note;
  const splitNote =
    typeof splitNoteRaw === 'string' && splitNoteRaw.trim() ? splitNoteRaw.trim() : undefined;
  const driverKeyRaw = o.driverKey;
  const driverLabelRaw = o.driverLabel;
  const driverKey =
    typeof driverKeyRaw === 'string' && driverKeyRaw.trim() ? driverKeyRaw.trim() : undefined;
  const driverLabel =
    typeof driverLabelRaw === 'string' && driverLabelRaw.trim() ? driverLabelRaw.trim() : undefined;
  return {
    entries,
    ...(splitNote ? { note: splitNote } : {}),
    ...(driverKey ? { driverKey, ...(driverLabel ? { driverLabel } : {}) } : {}),
  };
}

/** Копия сплита без общих ссылок на объекты строк (другой квартал, правки не затронут источник). */
export function cloneGeoCostSplit(split: GeoCostSplit | undefined): GeoCostSplit | undefined {
  if (!split?.entries?.length) return undefined;
  const n = typeof split.note === 'string' && split.note.trim() ? split.note.trim() : undefined;
  const dk = typeof split.driverKey === 'string' && split.driverKey.trim() ? split.driverKey.trim() : undefined;
  const dl =
    typeof split.driverLabel === 'string' && split.driverLabel.trim() ? split.driverLabel.trim() : undefined;
  return {
    entries: split.entries.map((e) => ({ ...e })),
    ...(n ? { note: n } : {}),
    ...(dk ? { driverKey: dk, ...(dl ? { driverLabel: dl } : {}) } : {}),
  };
}

export function geoCostSplitPercentsTotal(entries: GeoCostSplitEntry[]): number {
  return entries.reduce((s, e) => s + (Number.isFinite(e.percent) ? e.percent : 0), 0);
}

/** Для cost > 0: сплит считается заполненным при сумме процентов = 100 */
export function isGeoCostSplitCompleteForCost(cost: number, split: GeoCostSplit | undefined): boolean {
  if (cost <= 0) return true;
  if (!split?.entries?.length) return false;
  return geoCostSplitPercentsTotal(split.entries) === 100;
}

/** Кварталы интервала quick flow с cost &gt; 0 по инициативе (по возрастанию). */
export function quickFlowPaidQuartersForRow(row: AdminDataRow, fillQuarters: string[]): string[] {
  const sortedFill = [...fillQuarters].filter(Boolean).sort(compareQuarters);
  return sortedFill.filter((q) => (row.quarterlyData[q]?.cost ?? 0) > 0);
}

/** По всем кварталам интервала с затратами — geo split на 100%. Иначе false; нет затрат в интервале — false. */
export function isQuickFlowGeoCompleteForRow(row: AdminDataRow, fillQuarters: string[]): boolean {
  const paid = quickFlowPaidQuartersForRow(row, fillQuarters);
  if (paid.length === 0) return false;
  return paid.every((q) => {
    const qd = row.quarterlyData[q];
    const cost = qd?.cost ?? 0;
    if (cost <= 0) return true;
    return isGeoCostSplitCompleteForCost(cost, row.initiativeGeoCostSplit);
  });
}

/** Инициативы с затратами в интервале, у которых не везде заполнено распределение по странам. Заглушки не проверяем — они не разнесены ни по странам, ни по чему-либо. */
export function getQuickFlowRowsWithIncompleteGeoSplit(
  rows: AdminDataRow[],
  fillQuarters: string[]
): AdminDataRow[] {
  return rows.filter(
    (r) =>
      !r.isTimelineStub &&
      quickFlowPaidQuartersForRow(r, fillQuarters).length > 0 &&
      !isQuickFlowGeoCompleteForRow(r, fillQuarters)
  );
}

/**
 * Целые рубли по строкам сплита; сумма = round(totalCost). Остаток от округления
 * распределяется по наибольшим дробным частям.
 */
export function rubleAmountsFromGeoPercents(totalCost: number, percents: number[]): number[] {
  const total = Math.round(Number(totalCost) || 0);
  const n = percents.length;
  if (n === 0) return [];
  const exact = percents.map((p) => (total * p) / 100);
  const floors = exact.map((x) => Math.floor(x));
  let rem = total - floors.reduce((a, b) => a + b, 0);
  const idxByFrac = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac);
  const out = [...floors];
  let k = 0;
  while (rem > 0 && k < idxByFrac.length) {
    out[idxByFrac[k].i] += 1;
    rem -= 1;
    k += 1;
  }
  k = 0;
  while (rem < 0 && k < n) {
    if (out[k] > 0) {
      out[k] -= 1;
      rem += 1;
    }
    k += 1;
  }
  return out;
}

export function rubleAmountsForGeoSplit(totalCost: number, entries: GeoCostSplitEntry[]): number[] {
  return rubleAmountsFromGeoPercents(
    totalCost,
    entries.map((e) => e.percent)
  );
}

/**
 * Делит total на n неотрицательных целых частей, сумма строго = total
 * (остаток от деления распределяется по одному в первые ячейки).
 */
export function splitTotalIntoIntegerParts(total: number, n: number): number[] {
  if (n <= 0) return [];
  if (total <= 0) return new Array(n).fill(0);
  const base = Math.floor(total / n);
  const rem = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}

/**
 * Множество подписей кластеров для stakeholders_list из сплита.
 * countryIdToClusterKey: id страны → cluster_key из market_countries.
 */
export function stakeholdersListFromGeoSplit(
  entries: GeoCostSplitEntry[],
  countryIdToClusterKey: Map<string, string>
): string[] {
  const labels = new Set<string>();
  for (const e of entries) {
    if (e.kind === 'cluster') {
      labels.add(clusterKeyToStakeholderLabel(e.clusterKey));
    } else {
      const ck = countryIdToClusterKey.get(e.countryId);
      if (ck) labels.add(clusterKeyToStakeholderLabel(ck));
    }
  }
  return sortStakeholderLabels([...labels]);
}

/** Кластеры для строк справочника market_countries (в т.ч. Drinkit как рынок без подстран). */
export const MARKET_COUNTRY_CLUSTER_KEYS = [
  'Russia',
  'Central Asia',
  'MENA',
  'Turkey',
  'Europe',
  'Other_Countries',
  'Drinkit',
] as const;

export function marketClusterKeyLabel(key: string): string {
  if (key === 'Other_Countries') return 'Other Countries';
  return key;
}

export interface AdminDataRow {
  id: string;
  unit: string;
  team: string;
  initiative: string;
  stakeholdersList: string[];
  description: string;
  documentationLink: string;
  stakeholders: string; // Legacy field for backward compatibility
  quarterlyData: Record<string, AdminQuarterData>;
  /** Распределение стоимости по рынкам (на инициативу; сумма 100%). */
  initiativeGeoCostSplit?: GeoCostSplit;
  isTimelineStub?: boolean;
  isNew?: boolean;
  isModified?: boolean;
}

/**
 * Фильтр для матрицы коэффициентов: оставляем инициативы, где в выбранном году есть
 * либо effortCoefficient > 0, либо стоимость (cost + otherCosts) > 0.
 */
export function hasInitiativeEffortOrCostInYear(row: AdminDataRow, year: number): boolean {
  for (const [q, qd] of Object.entries(row.quarterlyData)) {
    const m = q.match(/^(\d{4})-Q[1-4]$/);
    if (!m) continue;
    if (Number(m[1]) !== year) continue;
    if ((qd?.effortCoefficient ?? 0) > 0) return true;
    const totalCost = (qd?.cost ?? 0) + (qd?.otherCosts ?? 0);
    if (totalCost > 0) return true;
  }
  return false;
}

/**
 * Имя для отображения: для заглушки — «Нераспределено · {team}», независимо от поля initiative в БД.
 * Это контейнер остатка бюджета команды; настоящее название инициативы для него не имеет смысла.
 */
export function getStubResidualLabel(team: string | null | undefined): string {
  const t = (team ?? '').trim();
  return t ? `Нераспределено · ${t}` : 'Нераспределено';
}

export function getInitiativeDisplayName(row: {
  isTimelineStub?: boolean | null;
  initiative?: string | null;
  team?: string | null;
}): string {
  if (row.isTimelineStub) return getStubResidualLabel(row.team);
  return row.initiative?.trim() || '—';
}

/** Всем кварталам YYYY-Qn в объекте — флаг подтверждения финансами. */
export function confirmFinanceForAllQuartersInData(
  qd: Record<string, AdminQuarterData>
): Record<string, AdminQuarterData> {
  const next = { ...qd };
  for (const k of Object.keys(next)) {
    if (!isQuarterPeriodKey(k)) continue;
    next[k] = { ...createEmptyQuarterData(), ...next[k], costFinanceConfirmed: true };
  }
  return next;
}

/** Ключи вида «2025-Q1». Не служебные вложения в quarterly_data (например sheet_out_itog_2025). */
export function isQuarterPeriodKey(key: string): boolean {
  return /^\d{4}-Q[1-4]$/.test(key);
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

/** Detect quarter from "cost-only" style headers: "Q1 25", "Q2 25", "25_Q1", "26_Q2" */
function parseCostOnlyQuarterHeader(header: string): string | null {
  const trimmed = header.trim();
  // "Q1 25", "Q2 26"
  const qSpace = trimmed.match(/Q(\d)\s*(\d{2})/i);
  if (qSpace) {
    const year = '20' + qSpace[2];
    return year + '-Q' + qSpace[1];
  }
  // "25_Q1", "26_Q2"
  const underscore = trimmed.match(/(\d{2})_Q(\d)/i);
  if (underscore) {
    const year = '20' + underscore[1];
    return year + '-Q' + underscore[2];
  }
  return null;
}

export interface CostOnlyRow {
  initiative: string;
  unit?: string;
  team?: string;
  costs: Record<string, number>;
}

/**
 * Parse CSV that contains only initiative name and quarter cost columns.
 * Headers: "Инициатива" or "Initiative", optional "Unit"/"Team", then "Q1 25", "Q2 25", ... or "25_Q1", ...
 */
export function parseCostOnlyCSV(text: string): { rows: CostOnlyRow[]; quarters: string[] } {
  const rows = parseCSVToRows(text);
  if (rows.length < 2) {
    return { rows: [], quarters: [] };
  }

  const headers = rows[0];
  const initiativeIdx = headers.findIndex(
    (h) => h.toLowerCase().includes('инициатива') || h.trim().toLowerCase() === 'initiative'
  );
  const unitIdx = headers.findIndex(
    (h) => h.toLowerCase().includes('unit') || h.trim().toLowerCase() === 'юнит'
  );
  const teamIdx = headers.findIndex(
    (h) => h.toLowerCase().includes('team') || h.trim().toLowerCase() === 'команда'
  );

  const quarterKeys: string[] = [];
  const headerToQuarter = new Map<string, string>();
  headers.forEach((h, idx) => {
    if (idx === initiativeIdx || idx === unitIdx || idx === teamIdx) return;
    const q = parseCostOnlyQuarterHeader(h);
    if (q) {
      if (!headerToQuarter.has(h)) {
        quarterKeys.push(q);
        headerToQuarter.set(h, q);
      }
    }
  });
  const quarters = Array.from(new Set(quarterKeys)).sort();

  const data: CostOnlyRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const values = rows[i];
    const initiative =
      initiativeIdx >= 0 ? values[initiativeIdx]?.trim() || '' : values[0]?.trim() || '';
    if (!initiative) continue;

    const costs: Record<string, number> = {};
    headers.forEach((h, colIdx) => {
      const q = parseCostOnlyQuarterHeader(h);
      if (q && values[colIdx] !== undefined) {
        costs[q] = parseNumber(values[colIdx]);
      }
    });

    data.push({
      initiative,
      unit: unitIdx >= 0 ? values[unitIdx]?.trim() || undefined : undefined,
      team: teamIdx >= 0 ? values[teamIdx]?.trim() || undefined : undefined,
      costs,
    });
  }

  return { rows: data, quarters };
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
  // Single source of truth: column "Stakeholders" (exact name to avoid matching "Stakeholders List")
  const stakeholdersIdx = headers.findIndex(h => h.trim().toLowerCase() === 'stakeholders' || h.trim().toLowerCase() === 'стейкхолдеры');
  const descriptionIdx = headers.findIndex(h => h.toLowerCase().includes('description') || h.toLowerCase() === 'описание');
  const docLinkIdx = headers.findIndex(h => h.toLowerCase().includes('documentation') || h.toLowerCase().includes('doc link'));

  for (let i = 1; i < rows.length; i++) {
    const values = rows[i];
    if (values.length < 4) continue;

    // Single source: "Stakeholders" column → both stakeholders (string) and stakeholdersList (array)
    const stakeholdersRaw = stakeholdersIdx >= 0 ? values[stakeholdersIdx]?.trim() || '' : '';
    const stakeholdersStr = stakeholdersRaw;
    const parsedStakeholdersList = stakeholdersRaw
      ? stakeholdersRaw.split(',').map(s => s.trim()).filter(Boolean)
      : [];

    const row: AdminDataRow = {
      id: `row-${i}-${Date.now()}`,
      unit: values[unitIdx >= 0 ? unitIdx : 0]?.trim() || '',
      team: values[teamIdx >= 0 ? teamIdx : 1]?.trim() || '',
      initiative: values[initiativeIdx >= 0 ? initiativeIdx : 2]?.trim() || '',
      stakeholdersList: parsedStakeholdersList,
      description: values[descriptionIdx >= 0 ? descriptionIdx : 3]?.trim() || '',
      documentationLink: docLinkIdx >= 0 ? values[docLinkIdx]?.trim() || '' : '',
      stakeholders: stakeholdersStr,
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
  const baseHeaders = ['Unit', 'Team', 'Initiative', 'Stakeholders List', 'Description', 'Documentation Link', 'Stakeholders'];
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
      escapeCSVValue(row.stakeholders),
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

/** Минимальные поля справочника для экспорта geo split */
export type GeoExportCountry = { id: string; cluster_key: string; label_ru: string };

/** Отдельный CSV: по одной строке на строку сплита (инициатива × квартал × страна/кластер). */
export function exportGeoCostSplitCSV(
  data: AdminDataRow[],
  quarters: string[],
  countries: GeoExportCountry[]
): string {
  const idToCountry = new Map(countries.map((c) => [c.id, c]));
  const headers = [
    'Unit',
    'Team',
    'Initiative',
    'Quarter',
    'Initiative_driver_key',
    'Initiative_driver_label',
    'Cluster',
    'Country_or_ClusterOnly',
    'Percent',
    'AmountRub',
    'Entry_note',
    'Quarter_split_note',
  ];
  const out: string[] = [];
  out.push(headers.join(','));
  for (const row of data) {
    for (const q of quarters) {
      const qd = row.quarterlyData[q];
      const geo = row.initiativeGeoCostSplit;
      const split = geo?.entries;
      const quarterSplitNote = geo?.note?.trim() ?? '';
      const driverKey = geo?.driverKey?.trim() ?? '';
      const driverLabel = geo?.driverLabel?.trim() ?? '';
      const cost = qd?.cost ?? 0;
      if (!split?.length || cost <= 0) continue;
      const rubles = rubleAmountsForGeoSplit(cost, split);
      split.forEach((e, i) => {
        let cluster: string;
        let countryOr: string;
        if (e.kind === 'cluster') {
          cluster = marketClusterKeyLabel(e.clusterKey);
          countryOr = e.clusterKey;
        } else {
          const c = idToCountry.get(e.countryId);
          cluster = c ? marketClusterKeyLabel(c.cluster_key) : '';
          countryOr = c?.label_ru || e.countryId;
        }
        const entryNote = e.note?.trim() ?? '';
        out.push(
          [
            escapeCSVValue(row.unit),
            escapeCSVValue(row.team),
            escapeCSVValue(row.initiative),
            escapeCSVValue(q),
            escapeCSVValue(driverKey),
            escapeCSVValue(driverLabel),
            escapeCSVValue(cluster),
            escapeCSVValue(countryOr),
            String(e.percent),
            String(rubles[i] ?? 0),
            escapeCSVValue(entryNote),
            escapeCSVValue(quarterSplitNote),
          ].join(',')
        );
      });
    }
  }
  return '\uFEFF' + out.join('\n');
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

export interface UnitSummaryTeam {
  team: string;
  initiativeCount: number;
}

export interface UnitSummaryItem {
  unit: string;
  teams: UnitSummaryTeam[];
}

/** Summary of teams and initiative counts per unit (for "only unit selected" screen). */
export function getUnitSummary(
  data: AdminDataRow[],
  unitIds: string[]
): UnitSummaryItem[] {
  if (unitIds.length === 0) return [];
  const byUnit = new Map<string, Map<string, number>>();
  for (const row of data) {
    if (!unitIds.includes(row.unit)) continue;
    const unitMap = byUnit.get(row.unit) ?? new Map<string, number>();
    const team = row.team || '';
    unitMap.set(team, (unitMap.get(team) ?? 0) + 1);
    byUnit.set(row.unit, unitMap);
  }
  return unitIds
    .filter(u => byUnit.has(u))
    .map(unit => {
      const teamMap = byUnit.get(unit)!;
      const teams: UnitSummaryTeam[] = Array.from(teamMap.entries())
        .map(([team, initiativeCount]) => ({ team, initiativeCount }))
        .sort((a, b) => a.team.localeCompare(b.team));
      return { unit, teams };
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
    effortCoefficient: 0,
    costFinanceConfirmed: true,
  };
}

export function createNewInitiative(
  unit: string,
  team: string,
  quarters: string[],
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
    stakeholdersList,
    description: '',
    documentationLink: '',
    stakeholders: '',
    quarterlyData,
    isNew: true
  };
}

/** Whether plan/fact are required for this quarter (not support, and cost > 0). */
export function quarterRequiresPlanFact(qData: AdminQuarterData): boolean {
  if (qData.support) return false;
  const totalCost = (qData.cost ?? 0) + (qData.otherCosts ?? 0);
  return totalCost > 0;
}

/** Факт метрики обязателен в UI для сохранения только для последнего закрытого квартала при активном план/факт. */
export function quarterRequiresMetricFact(qData: AdminQuarterData, quarterKey: string): boolean {
  return quarterRequiresPlanFact(qData) && isPortfolioMandatoryMetricFactQuarter(quarterKey);
}

/** Визуальный статус ячейки «инициатива × квартал» для обзорных графиков. */
export type InitiativeQuarterFillTone = 'stub' | 'blocker' | 'metrics' | 'ok';

export function getInitiativeQuarterFillTone(
  row: AdminDataRow,
  quarter: string
): InitiativeQuarterFillTone {
  const r = getQuickFlowCellReadiness(row, quarter);
  if (r.level === 'na') return row.isTimelineStub ? 'stub' : 'ok';
  if (r.level === 'blocker') return 'blocker';
  if (r.level === 'warn') return 'metrics';
  return 'ok';
}

/** Обязательные поля карточки для общих проверок (тип убран из продукта; стейкхолдеры — через аллокации на шаге рынков). */
export function getMissingInitiativeFields(row: AdminDataRow): string[] {
  const missing: string[] = [];
  if (!row.description?.trim()) missing.push('Описание');
  return missing;
}

/** Уровень готовности ячейки «инициатива × квартал» на шаге проверки quick flow. */
export type QuickFlowReadinessLevel = 'na' | 'ok' | 'warn' | 'blocker';

export type QuickFlowCellReadiness = {
  level: QuickFlowReadinessLevel;
  reasons: string[];
};

/**
 * Единые правила для матрицы проверки и подсветок: активная ячейка = есть усилия или стоимость в квартале.
 * Блокер: карточка или гео при cost &gt; 0; предупреждение: план/факт при учётной стоимости и не поддержке.
 */
export function getQuickFlowCellReadiness(row: AdminDataRow, quarter: string): QuickFlowCellReadiness {
  if (row.isTimelineStub) {
    return { level: 'na', reasons: ['Заглушка команды — не редактируется'] };
  }
  const qd = row.quarterlyData[quarter];
  if (!qd) {
    return { level: 'na', reasons: ['Нет данных по кварталу'] };
  }
  const effort = qd.effortCoefficient ?? 0;
  const cost = qd.cost ?? 0;
  const otherCosts = qd.otherCosts ?? 0;
  const totalCost = cost + otherCosts;
  const active = effort > 0 || totalCost > 0;
  if (!active) {
    return { level: 'na', reasons: ['Нет усилий и стоимости в квартале'] };
  }

  const blockerReasons: string[] = [];
  const cardMissing = getMissingInitiativeFields(row);
  if (cardMissing.length > 0) {
    blockerReasons.push(`Карточка: ${cardMissing.join(', ')}`);
  }
  if (cost > 0 && !isGeoCostSplitCompleteForCost(cost, row.initiativeGeoCostSplit)) {
    blockerReasons.push('Распределение по рынкам (100%)');
  }
  if (quarterRequiresPlanFact(qd) && isPortfolioMandatoryMetricFactQuarter(quarter) && !qd.metricFact?.trim()) {
    blockerReasons.push('Факт метрики (последний закрытый квартал)');
  }
  if (blockerReasons.length > 0) {
    return { level: 'blocker', reasons: blockerReasons };
  }

  const warnReasons: string[] = [];
  if (quarterRequiresPlanFact(qd)) {
    if (!qd.metricPlan?.trim()) warnReasons.push('План метрики');
    if (
      isCalendarPastQuarter(quarter) &&
      !isPortfolioMandatoryMetricFactQuarter(quarter) &&
      !qd.metricFact?.trim()
    ) {
      warnReasons.push('Факт метрики (архивный квартал)');
    }
  }
  if (warnReasons.length > 0) {
    return { level: 'warn', reasons: warnReasons };
  }

  return { level: 'ok', reasons: [] };
}

/** Validation issues for quick flow: строки с усилиями или стоимостью в квартале и незакрытыми обязательными полями. */
export function getQuickFlowValidationIssues(
  rows: AdminDataRow[],
  nextQuarter: string
): { id: string; initiativeName: string; missing: string[] }[] {
  const result: { id: string; initiativeName: string; missing: string[] }[] = [];
  for (const row of rows) {
    if (row.isTimelineStub) continue;
    const qd = row.quarterlyData[nextQuarter];
    const effort = qd?.effortCoefficient ?? 0;
    const cost = qd?.cost ?? 0;
    const otherCosts = qd?.otherCosts ?? 0;
    const totalCost = cost + otherCosts;
    if (effort <= 0 && totalCost <= 0) continue;
    const missing: string[] = [...getMissingInitiativeFields(row)];
    if (cost > 0 && !isGeoCostSplitCompleteForCost(cost, row.initiativeGeoCostSplit)) {
      missing.push('Распределение по рынкам');
    }
    if (qd && quarterRequiresPlanFact(qd)) {
      if (!qd.metricPlan?.trim()) missing.push('План метрики');
      if (isPortfolioMandatoryMetricFactQuarter(nextQuarter) && !qd.metricFact?.trim()) {
        missing.push('Факт метрики');
      }
    }
    if (missing.length > 0) {
      result.push({
        id: row.id,
        initiativeName: row.initiative || '—',
        missing,
      });
    }
  }
  return result;
}

/**
 * Тексты замечаний по паре «инициатива × квартал» для превью таймлайна в quick flow (не для дашборда).
 * Учитываются строки с усилиями или ненулевой стоимостью в квартале.
 */
/**
 * Замечания для таймлайна на шаге «План/факт»: только метрики квартала (не карточка инициативы).
 */
export function getQuickFlowTimelineQuarterWarnings(row: AdminDataRow, quarter: string): string[] {
  if (row.isTimelineStub) return [];

  const qd = row.quarterlyData[quarter];
  if (!qd) return [];

  const effort = qd.effortCoefficient ?? 0;
  const totalCost = (qd.cost ?? 0) + (qd.otherCosts ?? 0);
  if (effort <= 0 && totalCost <= 0) return [];

  const warnings: string[] = [];

  if (quarterRequiresPlanFact(qd)) {
    if (!qd.metricPlan?.trim()) warnings.push('Нет плана метрики');
    if (!qd.metricFact?.trim()) {
      if (isPortfolioMandatoryMetricFactQuarter(quarter)) {
        warnings.push('Нет факта метрики (обязательно за последний закрытый квартал)');
      } else if (isCalendarPastQuarter(quarter)) {
        warnings.push('Нет факта метрики (старый период)');
      }
    }
  }

  return warnings;
}

/**
 * Только поля карточки инициативы (без план/факт по кварталам) для строк с усилиями в квартале.
 * Для шага «бюджет / treemap» до отдельного заполнения таймлайна.
 */
export function getQuickFlowCardOnlyIssuesForQuarters(
  rows: AdminDataRow[],
  fillQuarters: string[]
): { id: string; initiativeName: string; missing: string[] }[] {
  const byId = new Map<string, { id: string; initiativeName: string; missing: Set<string> }>();
  for (const q of fillQuarters) {
    for (const row of rows) {
      const qd = row.quarterlyData[q];
      const effort = qd?.effortCoefficient ?? 0;
      if (effort <= 0) continue;
      const missing = [...getMissingInitiativeFields(row)];
      if (missing.length === 0) continue;
      const cur = byId.get(row.id);
      if (!cur) {
        byId.set(row.id, {
          id: row.id,
          initiativeName: row.initiative || '—',
          missing: new Set(missing),
        });
      } else {
        missing.forEach((m) => cur.missing.add(m));
      }
    }
  }
  return Array.from(byId.values()).map((x) => ({
    ...x,
    missing: [...x.missing],
  }));
}

/** Только описание (шаг treemap в quick flow; ссылка на документацию — по желанию). */
export function getMissingDescriptionDocFields(row: AdminDataRow): string[] {
  const missing: string[] = [];
  if (!row.description?.trim()) missing.push('Описание');
  return missing;
}

/** Как `getQuickFlowCardOnlyIssuesForQuarters`, но только обязательное описание. */
export function getQuickFlowDescriptionDocIssuesForQuarters(
  rows: AdminDataRow[],
  fillQuarters: string[]
): { id: string; initiativeName: string; missing: string[] }[] {
  const byId = new Map<string, { id: string; initiativeName: string; missing: Set<string> }>();
  for (const q of fillQuarters) {
    for (const row of rows) {
      const qd = row.quarterlyData[q];
      const effort = qd?.effortCoefficient ?? 0;
      if (effort <= 0) continue;
      const missing = [...getMissingDescriptionDocFields(row)];
      if (missing.length === 0) continue;
      const cur = byId.get(row.id);
      if (!cur) {
        byId.set(row.id, {
          id: row.id,
          initiativeName: row.initiative || '—',
          missing: new Set(missing),
        });
      } else {
        missing.forEach((m) => cur.missing.add(m));
      }
    }
  }
  return Array.from(byId.values()).map((x) => ({
    ...x,
    missing: [...x.missing],
  }));
}

/** Объединённые замечания по всем кварталам интервала (уникальные поля). */
export function getQuickFlowValidationIssuesForQuarters(
  rows: AdminDataRow[],
  fillQuarters: string[]
): { id: string; initiativeName: string; missing: string[] }[] {
  const byId = new Map<string, { id: string; initiativeName: string; missing: Set<string> }>();
  for (const q of fillQuarters) {
    for (const issue of getQuickFlowValidationIssues(rows, q)) {
      const cur = byId.get(issue.id);
      if (!cur) {
        byId.set(issue.id, {
          id: issue.id,
          initiativeName: issue.initiativeName,
          missing: new Set(issue.missing),
        });
      } else {
        issue.missing.forEach((m) => cur.missing.add(m));
      }
    }
  }
  return Array.from(byId.values()).map((x) => ({
    ...x,
    missing: [...x.missing],
  }));
}

/** Только план/факт по кварталам (для блока «План и факт» на обзоре портфеля). */
export function getQuickFlowPlanFactQuarterIssues(
  rows: AdminDataRow[],
  quarter: string
): { id: string; initiativeName: string; missing: string[] }[] {
  const result: { id: string; initiativeName: string; missing: string[] }[] = [];
  for (const row of rows) {
    if (row.isTimelineStub) continue;
    const qd = row.quarterlyData[quarter];
    const effort = qd?.effortCoefficient ?? 0;
    const cost = qd?.cost ?? 0;
    const otherCosts = qd?.otherCosts ?? 0;
    const totalCost = cost + otherCosts;
    if (effort <= 0 && totalCost <= 0) continue;
    if (!qd) continue;
    const missing: string[] = [];
    if (quarterRequiresPlanFact(qd)) {
      if (!qd.metricPlan?.trim()) missing.push('План метрики');
      if (isPortfolioMandatoryMetricFactQuarter(quarter) && !qd.metricFact?.trim()) {
        missing.push('Факт метрики');
      } else if (
        !isPortfolioMandatoryMetricFactQuarter(quarter) &&
        isCalendarPastQuarter(quarter) &&
        !qd.metricFact?.trim()
      ) {
        missing.push('Факт метрики (архив)');
      }
    }
    if (missing.length > 0) {
      result.push({ id: row.id, initiativeName: row.initiative || '—', missing });
    }
  }
  return result;
}

export function getQuickFlowPlanFactIssuesForQuarters(
  rows: AdminDataRow[],
  fillQuarters: string[]
): { id: string; initiativeName: string; missing: string[] }[] {
  const byId = new Map<string, { id: string; initiativeName: string; missing: Set<string> }>();
  for (const q of fillQuarters) {
    for (const issue of getQuickFlowPlanFactQuarterIssues(rows, q)) {
      const cur = byId.get(issue.id);
      if (!cur) {
        byId.set(issue.id, {
          id: issue.id,
          initiativeName: issue.initiativeName,
          missing: new Set(issue.missing),
        });
      } else {
        issue.missing.forEach((m) => cur.missing.add(m));
      }
    }
  }
  return Array.from(byId.values()).map((x) => ({
    ...x,
    missing: [...x.missing],
  }));
}

/** Сумма % усилий в колонке только по строкам без заглушки (совпадает с вводом в матрице). */
export function nonStubQuarterEffortSum(rows: AdminDataRow[], quarter: string): number {
  return rows.reduce((acc, row) => {
    if (row.isTimelineStub) return acc;
    const v = Number(row.quarterlyData[quarter]?.effortCoefficient);
    const eff = Math.max(0, Math.min(100, Number.isFinite(v) ? v : 0));
    return acc + eff;
  }, 0);
}

const EFF_MATRIX_COL_EPS = 1e-4;

/** Шапка колонки: сумма % только по строкам без заглушки (остаток до 100% — в строке «Нераспределено»). */
export function effortMatrixColumnChipState(
  rows: AdminDataRow[],
  quarter: string
): { sum: number; nonStubSum: number; valid: boolean } {
  const nonStubSum = nonStubQuarterEffortSum(rows, quarter);
  const sum = Math.round(nonStubSum * 100) / 100;
  const valid = nonStubSum <= 100 + EFF_MATRIX_COL_EPS;
  return { sum, nonStubSum: sum, valid };
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
    .filter(row => !row.isTimelineStub && row.unit === unit && row.team === team && row.id !== excludeId)
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

// Normalize support cascade: if any quarter has support = true, that quarter and all
// subsequent quarters (by order) are set to support = true. Used on load to fix inconsistent data.
export function normalizeSupportCascade(
  row: AdminDataRow,
  quarters: string[]
): AdminDataRow {
  const firstSupportIndex = quarters.findIndex(q => row.quarterlyData[q]?.support === true);
  if (firstSupportIndex === -1) return row;

  const updatedQuarterlyData = { ...row.quarterlyData };
  for (let i = firstSupportIndex; i < quarters.length; i++) {
    const q = quarters[i];
    const existing = updatedQuarterlyData[q] || createEmptyQuarterData();
    updatedQuarterlyData[q] = { ...existing, support: true };
  }
  return { ...row, quarterlyData: updatedQuarterlyData };
}
