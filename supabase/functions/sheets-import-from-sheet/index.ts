import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeadersFromRequest, jsonResponse } from '../_shared/cors.ts';
import { requireAdmin } from '../_shared/require-admin.ts';
import { getGoogleSheetsAccessToken } from '../_shared/google-access-token.ts';
import { ensureWorksheet } from '../_shared/sheets-helpers.ts';
import {
  looksLikeSpreadsheetFileId,
  normalizeSpreadsheetId,
} from '../_shared/spreadsheet-id.ts';

/**
 * Tab "Portfolio import":
 * Row 1: id | coefficient | amount_rub (headers)
 * Row 2+: initiative UUID | number | number (optional)
 * Values are merged into initiatives.quarterly_data.sheet_sync
 */
const DEFAULT_TAB = 'Portfolio import';

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
            'Ожидается id из сегмента /d/…/ в URL таблицы (обычно 30+ символов).',
      },
      500
    );
  }

  const tabName = (Deno.env.get('SHEETS_IMPORT_TAB_NAME') ?? DEFAULT_TAB).trim() || DEFAULT_TAB;

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!url || !serviceKey) {
    return jsonResponse({ error: 'Server misconfigured' }, 500);
  }

  const supabase = createClient(url, serviceKey);

  try {
    const accessToken = await getGoogleSheetsAccessToken(saJson);
    await ensureWorksheet(accessToken, spreadsheetId, tabName);

    const range = encodeURIComponent(`${tabName}!A2:C5000`);
    const sid = encodeURIComponent(spreadsheetId);
    const getRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sid}/values/${range}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const getText = await getRes.text();
    if (!getRes.ok) {
      return jsonResponse(
        { error: `Sheets read ${getRes.status}`, detail: getText.slice(0, 600) },
        500
      );
    }

    const payload = JSON.parse(getText) as { values?: string[][] };
    const grid = payload.values ?? [];

    let updated = 0;
    const errors: string[] = [];

    for (let i = 0; i < grid.length; i++) {
      const row = grid[i];
      const id = (row?.[0] ?? '').trim();
      if (!id) continue;

      const coefRaw = (row?.[1] ?? '').trim();
      const amountRaw = (row?.[2] ?? '').trim();

      if (!coefRaw && !amountRaw) continue;

      const coefficient = coefRaw === '' ? null : Number(coefRaw);
      const amount_rub = amountRaw === '' ? null : Number(amountRaw);

      if (coefRaw !== '' && Number.isNaN(coefficient as number)) {
        errors.push(`Row ${i + 2}: invalid coefficient for ${id}`);
        continue;
      }
      if (amountRaw !== '' && Number.isNaN(amount_rub as number)) {
        errors.push(`Row ${i + 2}: invalid amount_rub for ${id}`);
        continue;
      }

      const { data: existing, error: fetchErr } = await supabase
        .from('initiatives')
        .select('id, quarterly_data')
        .eq('id', id)
        .maybeSingle();

      if (fetchErr) {
        errors.push(`${id}: ${fetchErr.message}`);
        continue;
      }
      if (!existing) {
        errors.push(`${id}: initiative not found`);
        continue;
      }

      const qd =
        existing.quarterly_data &&
        typeof existing.quarterly_data === 'object' &&
        !Array.isArray(existing.quarterly_data)
          ? { ...(existing.quarterly_data as Record<string, unknown>) }
          : {};

      qd.sheet_sync = {
        coefficient,
        amount_rub,
        synced_at: new Date().toISOString(),
      };

      const { error: upErr } = await supabase
        .from('initiatives')
        .update({
          quarterly_data: qd,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (upErr) {
        errors.push(`${id}: ${upErr.message}`);
        continue;
      }
      updated++;
    }

    return jsonResponse({
      ok: true,
      tab: tabName,
      rowsScanned: grid.length,
      updated,
      errors: errors.slice(0, 50),
      errorCount: errors.length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: msg }, 500);
  }
});
