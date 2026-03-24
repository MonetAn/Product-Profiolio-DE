import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { ensureWorksheet } from './sheets-helpers.ts';
import { IN_HEADERS, QUARTER_KEYS } from './sheets-in-out-layout.ts';

export type AssignmentRow = {
  initiative_id: string;
  person_id: string;
  quarterly_effort: Record<string, unknown> | null;
  initiatives: {
    id: string;
    unit: string;
    team: string;
    initiative: string;
  } | null;
  people: {
    full_name: string;
    unit: string | null;
    team: string | null;
  } | null;
};

/** Опциональные коэффициенты для превью: initiative_id → { "2025-Q3": 25, ... } */
export type PreviewQuarterEfforts = Record<string, Record<string, number>>;

export async function fetchAssignmentRows(
  supabase: SupabaseClient
): Promise<AssignmentRow[]> {
  const { data: rows, error: dbError } = await supabase
    .from('person_initiative_assignments')
    .select(
      `
      initiative_id,
      person_id,
      quarterly_effort,
      initiatives ( id, unit, team, initiative ),
      people ( full_name, unit, team )
    `
    );

  if (dbError) throw new Error(dbError.message);

  const list = (rows ?? []) as AssignmentRow[];
  list.sort((a, b) => {
    const iu = a.initiatives?.unit ?? '';
    const bu = b.initiatives?.unit ?? '';
    if (iu !== bu) return iu.localeCompare(bu);
    const it = a.initiatives?.team ?? '';
    const bt = b.initiatives?.team ?? '';
    if (it !== bt) return it.localeCompare(bt);
    const iname = a.initiatives?.initiative ?? '';
    const bname = b.initiatives?.initiative ?? '';
    if (iname !== bname) return iname.localeCompare(bname);
    const ap = a.people?.full_name ?? '';
    const bp = b.people?.full_name ?? '';
    return ap.localeCompare(bp);
  });
  return list;
}

function effortFromRow(r: AssignmentRow): Record<string, number> {
  const raw = r.quarterly_effort;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    const n = typeof v === 'number' ? v : Number(v);
    if (Number.isFinite(n)) out[k] = n;
  }
  return out;
}

/** Строки данных листа IN (без шапки). */
export function buildInDataRows(
  list: AssignmentRow[],
  previewQuarterEfforts?: PreviewQuarterEfforts | null
): (string | number)[][] {
  const dataRows: (string | number)[][] = [];
  for (const r of list) {
    const init = r.initiatives;
    const person = r.people;
    if (!init || !person) continue;

    const ef = effortFromRow(r);
    const override = previewQuarterEfforts?.[init.id];
    if (override && typeof override === 'object') {
      for (const [q, v] of Object.entries(override)) {
        if (typeof v === 'number' && Number.isFinite(v)) ef[q] = v;
      }
    }

    const quarterCells = QUARTER_KEYS.map((q) => {
      const v = ef[q];
      return v !== undefined && v !== null && Number.isFinite(v) ? v : '';
    });

    dataRows.push([
      init.id,
      init.unit ?? '',
      init.team ?? '',
      init.initiative ?? '',
      person.full_name ?? '',
      ...quarterCells,
    ]);
  }
  return dataRows;
}

export function buildInValuesWithHeaders(
  list: AssignmentRow[],
  previewQuarterEfforts?: PreviewQuarterEfforts | null
): (string | number)[][] {
  const dataRows = buildInDataRows(list, previewQuarterEfforts);
  return [[...IN_HEADERS], ...dataRows];
}

export async function writeInTabToGoogle(params: {
  accessToken: string;
  spreadsheetId: string;
  tabName: string;
  values: (string | number)[][];
}): Promise<{ rowsWritten: number }> {
  const { accessToken, spreadsheetId, tabName, values } = params;
  await ensureWorksheet(accessToken, spreadsheetId, tabName);
  const endRow = values.length;
  const range = encodeURIComponent(`${tabName}!A1:M${endRow}`);
  const sid = encodeURIComponent(spreadsheetId);
  const putRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sid}/values/${range}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values }),
    }
  );
  const putText = await putRes.text();
  if (!putRes.ok) {
    throw new Error(`Sheets API ${putRes.status}: ${putText.slice(0, 600)}`);
  }
  const dataRowsLen = Math.max(0, values.length - 1);
  return { rowsWritten: dataRowsLen };
}
