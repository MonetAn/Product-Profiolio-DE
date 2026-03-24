import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeadersFromRequest, jsonResponse } from '../_shared/cors.ts';
import { requireAdmin } from '../_shared/require-admin.ts';
import { getGoogleSheetsAccessToken } from '../_shared/google-access-token.ts';
import { ensureWorksheet } from '../_shared/sheets-helpers.ts';
import {
  looksLikeSpreadsheetFileId,
  normalizeSpreadsheetId,
} from '../_shared/spreadsheet-id.ts';

const DEFAULT_TAB = 'Portfolio export';

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
          `GOOGLE_SHEETS_SPREADSHEET_ID после нормализации выглядит неверно (длина ${spreadsheetId.length}). ` +
            'Ожидается id из сегмента /d/…/ в URL таблицы (обычно 30+ символов: буквы, цифры, - и _). ' +
            'Удалите секрет и вставьте заново только id или полную ссылку без переносов строк.',
      },
      500
    );
  }

  const tabName = (Deno.env.get('SHEETS_EXPORT_TAB_NAME') ?? DEFAULT_TAB).trim() || DEFAULT_TAB;

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!url || !serviceKey) {
    return jsonResponse({ error: 'Server misconfigured' }, 500);
  }

  const supabase = createClient(url, serviceKey);

  const { data: rows, error: dbError } = await supabase
    .from('initiatives')
    .select(
      'id, unit, team, initiative, initiative_type, description, quarterly_data, updated_at'
    )
    .order('unit')
    .order('team')
    .order('initiative');

  if (dbError) {
    return jsonResponse({ error: dbError.message }, 500);
  }

  const header = [
    'id',
    'unit',
    'team',
    'initiative',
    'initiative_type',
    'description',
    'quarterly_data_json',
    'updated_at',
  ];

  const values: string[][] = [header];
  for (const r of rows ?? []) {
    const qd =
      r.quarterly_data == null
        ? ''
        : typeof r.quarterly_data === 'string'
          ? r.quarterly_data
          : JSON.stringify(r.quarterly_data);
    const desc = (r.description ?? '').slice(0, 5000);
    values.push([
      r.id,
      r.unit ?? '',
      r.team ?? '',
      r.initiative ?? '',
      r.initiative_type ?? '',
      desc,
      qd,
      r.updated_at ?? '',
    ]);
  }

  try {
    const accessToken = await getGoogleSheetsAccessToken(saJson);
    await ensureWorksheet(accessToken, spreadsheetId, tabName);

    const range = encodeURIComponent(`${tabName}!A1`);
    const sid = encodeURIComponent(spreadsheetId);
    const putRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sid}/values/${range}?valueInputOption=RAW`,
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
      return jsonResponse(
        { error: `Sheets API ${putRes.status}`, detail: putText.slice(0, 600) },
        500
      );
    }

    return jsonResponse({
      ok: true,
      tab: tabName,
      rowsWritten: values.length - 1,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: msg }, 500);
  }
});
