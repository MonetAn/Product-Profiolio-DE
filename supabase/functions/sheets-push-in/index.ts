import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeadersFromRequest, jsonResponse } from '../_shared/cors.ts';
import { requireAdmin } from '../_shared/require-admin.ts';
import { getGoogleSheetsAccessToken } from '../_shared/google-access-token.ts';
import {
  buildInValuesWithHeaders,
  fetchAssignmentRows,
  writeInTabToGoogle,
  type PreviewQuarterEfforts,
} from '../_shared/sheets-in-sheet-values.ts';
import {
  looksLikeSpreadsheetFileId,
  normalizeSpreadsheetId,
} from '../_shared/spreadsheet-id.ts';

const DEFAULT_TAB = 'IN';

function parsePreviewBody(text: string): PreviewQuarterEfforts | null {
  if (!text || !text.trim()) return null;
  try {
    const body = JSON.parse(text) as { previewQuarterEfforts?: unknown };
    const p = body.previewQuarterEfforts;
    if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
    const out: PreviewQuarterEfforts = {};
    for (const [initId, quarters] of Object.entries(p as Record<string, unknown>)) {
      if (!initId || typeof quarters !== 'object' || quarters === null || Array.isArray(quarters)) continue;
      const qmap: Record<string, number> = {};
      for (const [qk, v] of Object.entries(quarters as Record<string, unknown>)) {
        const n = typeof v === 'number' ? v : Number(v);
        if (Number.isFinite(n)) qmap[qk] = n;
      }
      if (Object.keys(qmap).length > 0) out[initId] = qmap;
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeadersFromRequest(req) });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const denied = await requireAdmin(req);
  if (denied) return denied;

  const spreadsheetId = normalizeSpreadsheetId(
    Deno.env.get('GOOGLE_SHEETS_SPREADSHEET_ID') ?? ''
  );
  const saJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY')?.trim();
  if (!spreadsheetId || !saJson) {
    return jsonResponse(
      {
        error:
          'Missing GOOGLE_SHEETS_SPREADSHEET_ID or GOOGLE_SERVICE_ACCOUNT_KEY secrets',
      },
      500
    );
  }

  if (!looksLikeSpreadsheetFileId(spreadsheetId)) {
    return jsonResponse(
      {
        error:
          `GOOGLE_SHEETS_SPREADSHEET_ID после нормализации выглядит неверно (длина ${spreadsheetId.length}).`,
      },
      500
    );
  }

  const tabName = (Deno.env.get('SHEETS_IN_TAB_NAME') ?? DEFAULT_TAB).trim() || DEFAULT_TAB;

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!url || !serviceKey) {
    return jsonResponse({ error: 'Server misconfigured' }, 500);
  }

  let previewQuarterEfforts: PreviewQuarterEfforts | null = null;
  try {
    const raw = await req.text();
    previewQuarterEfforts = parsePreviewBody(raw);
  } catch {
    previewQuarterEfforts = null;
  }

  const supabase = createClient(url, serviceKey);

  let list;
  try {
    list = await fetchAssignmentRows(supabase);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: msg }, 500);
  }

  const values = buildInValuesWithHeaders(list, previewQuarterEfforts);

  try {
    const accessToken = await getGoogleSheetsAccessToken(saJson);
    const { rowsWritten } = await writeInTabToGoogle({
      accessToken,
      spreadsheetId,
      tabName,
      values,
    });

    return jsonResponse({
      ok: true,
      tab: tabName,
      rowsWritten,
      message:
        previewQuarterEfforts != null
          ? 'Лист IN обновлён с учётом previewQuarterEfforts (черновик коэффициентов).'
          : 'Лист IN обновлён из person_initiative_assignments (коэффициенты по людям).',
      usedPreviewOverrides: previewQuarterEfforts != null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: msg }, 500);
  }
});
