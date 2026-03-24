import {
  ITOG_QUARTER_KEYS,
  OUT_COL_ITOG_Q1,
  OUT_COL_ITOG_Q4,
  OUT_DATA_START_ROW,
  padRow,
  parseSheetNumber,
  looksLikeInitiativeUuid,
} from './sheets-in-out-layout.ts';

/** Последняя строка с тем же id побеждает (как при последовательных update). */
export function parseOutGridToItogById(grid: unknown[][]): Map<string, Record<string, number>> {
  const itogById = new Map<string, Record<string, number>>();
  for (let i = 0; i < grid.length; i++) {
    const raw = grid[i];
    if (!Array.isArray(raw)) continue;
    const row = padRow(raw, OUT_COL_ITOG_Q4 + 1);
    const id = row[0]?.trim() ?? '';
    if (!id || !looksLikeInitiativeUuid(id)) continue;

    const itog: Record<string, number> = {};
    for (let c = OUT_COL_ITOG_Q1; c <= OUT_COL_ITOG_Q4; c++) {
      const qk = ITOG_QUARTER_KEYS[c - OUT_COL_ITOG_Q1];
      const n = parseSheetNumber(row[c]);
      if (n !== null) itog[qk] = n;
    }

    if (Object.keys(itog).length === 0) continue;
    itogById.set(id, itog);
  }
  return itogById;
}

export async function fetchOutGrid(
  accessToken: string,
  spreadsheetId: string,
  tabName: string
): Promise<{ grid: unknown[][]; rawStatus: number }> {
  const sid = encodeURIComponent(spreadsheetId);
  const lastRow = OUT_DATA_START_ROW + 5000;
  const range = encodeURIComponent(`${tabName}!A${OUT_DATA_START_ROW}:R${lastRow}`);
  const getRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sid}/values/${range}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const getText = await getRes.text();
  if (!getRes.ok) {
    throw new Error(`Sheets read ${getRes.status}: ${getText.slice(0, 600)}`);
  }
  const payload = JSON.parse(getText) as { values?: unknown[][] };
  const grid = payload.values ?? [];
  return { grid, rawStatus: getRes.status };
}

export function itogMapToPreviewList(
  itogById: Map<string, Record<string, number>>,
  initiativeNames?: Map<string, string>
): { initiativeId: string; initiativeName?: string; itog: Record<string, number> }[] {
  const out: { initiativeId: string; initiativeName?: string; itog: Record<string, number> }[] = [];
  for (const [initiativeId, itog] of itogById) {
    out.push({
      initiativeId,
      initiativeName: initiativeNames?.get(initiativeId),
      itog: { ...itog },
    });
  }
  out.sort((a, b) =>
    (a.initiativeName ?? a.initiativeId).localeCompare(b.initiativeName ?? b.initiativeId, 'ru')
  );
  return out;
}
