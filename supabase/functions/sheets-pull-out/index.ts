import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeadersFromRequest, jsonResponse } from '../_shared/cors.ts';
import { requireAdmin } from '../_shared/require-admin.ts';
import { getGoogleSheetsAccessToken } from '../_shared/google-access-token.ts';
import {
  fetchOutGrid,
  itogMapToPreviewList,
  parseOutGridToItogById,
} from '../_shared/sheets-out-read-itog.ts';
import {
  looksLikeSpreadsheetFileId,
  normalizeSpreadsheetId,
} from '../_shared/spreadsheet-id.ts';

const DEFAULT_TAB = 'OUT';

/** PostgREST: слишком длинный URL при .in() с сотнями id. */
const SELECT_IN_CHUNK = 120;
/** Один вызов RPC — разумный размер тела. */
const RPC_CHUNK = 200;

/** Подмешивает стоимость из листа в поле cost квартала (то, что видит админка). */
function applySheetCostsToQuarters(
  qd: Record<string, unknown>,
  itog: Record<string, number>
): void {
  for (const [quarterKey, cost] of Object.entries(itog)) {
    if (!/^202(5|6)-Q[1-4]$/.test(quarterKey)) continue;
    const existing = qd[quarterKey];
    const base: Record<string, unknown> =
      existing && typeof existing === 'object' && !Array.isArray(existing)
        ? { ...(existing as Record<string, unknown>) }
        : {
            cost: 0,
            comment: '',
            onTrack: true,
            support: false,
            metricFact: '',
            metricPlan: '',
            otherCosts: 0,
            effortCoefficient: 0,
          };
    base.cost = cost;
    qd[quarterKey] = base;
  }
}

async function fetchInitiativesMap(
  supabase: SupabaseClient,
  ids: string[]
): Promise<Map<string, { id: string; quarterly_data: unknown }>> {
  const map = new Map<string, { id: string; quarterly_data: unknown }>();
  for (let i = 0; i < ids.length; i += SELECT_IN_CHUNK) {
    const slice = ids.slice(i, i + SELECT_IN_CHUNK);
    const { data, error } = await supabase
      .from('initiatives')
      .select('id, quarterly_data, initiative')
      .in('id', slice);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      map.set(row.id, row);
    }
  }
  return map;
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

  let previewOnly = false;
  try {
    const raw = await req.text();
    if (raw?.trim()) {
      const j = JSON.parse(raw) as { previewOnly?: unknown };
      previewOnly = j.previewOnly === true;
    }
  } catch {
    previewOnly = false;
  }

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

  const tabName = (Deno.env.get('SHEETS_OUT_TAB_NAME') ?? DEFAULT_TAB).trim() || DEFAULT_TAB;

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!url || !serviceKey) {
    return jsonResponse({ error: 'Server misconfigured' }, 500);
  }

  const supabase = createClient(url, serviceKey);

  try {
    const accessToken = await getGoogleSheetsAccessToken(saJson);
    const { grid } = await fetchOutGrid(accessToken, spreadsheetId, tabName);
    const itogById = parseOutGridToItogById(grid as unknown[][]);

    const ids = [...itogById.keys()];
    if (ids.length === 0) {
      return jsonResponse({
        ok: true,
        tab: tabName,
        rowsScanned: grid.length,
        updated: 0,
        errors: [],
        errorCount: 0,
        message: 'Нет строк с UUID и числами в O–R / Y–AB',
        previewOnly,
        preview: [],
      });
    }

    if (previewOnly) {
      let nameMap = new Map<string, string>();
      try {
        const imap = await fetchInitiativesMap(supabase, ids);
        for (const [id, row] of imap) {
          const name =
            row &&
            typeof row === 'object' &&
            row !== null &&
            'initiative' in row &&
            typeof (row as { initiative?: unknown }).initiative === 'string'
              ? (row as { initiative: string }).initiative
              : undefined;
          if (name) nameMap.set(id, name);
        }
      } catch {
        nameMap = new Map();
      }
      const preview = itogMapToPreviewList(itogById, nameMap);
      return jsonResponse({
        ok: true,
        tab: tabName,
        rowsScanned: grid.length,
        updated: 0,
        previewOnly: true,
        preview,
        message:
          'Предпросмотр: итоги с листа OUT без записи в базу. Для сохранения вызовите без previewOnly.',
      });
    }

    let existingMap: Map<string, { id: string; quarterly_data: unknown }>;
    try {
      existingMap = await fetchInitiativesMap(supabase, ids);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return jsonResponse({ error: `Загрузка initiatives: ${msg}` }, 500);
    }

    const syncedAt = new Date().toISOString();
    const batchPayload: { id: string; quarterly_data: Record<string, unknown> }[] = [];
    const errors: string[] = [];

    for (const id of ids) {
      const itog = itogById.get(id)!;
      const existing = existingMap.get(id);
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

      const prevItog =
        qd.sheet_out_itog_2025 &&
        typeof qd.sheet_out_itog_2025 === 'object' &&
        !Array.isArray(qd.sheet_out_itog_2025)
          ? { ...(qd.sheet_out_itog_2025 as Record<string, unknown>) }
          : {};
      delete prevItog.synced_at;
      qd.sheet_out_itog_2025 = {
        ...prevItog,
        ...itog,
        synced_at: syncedAt,
      };

      applySheetCostsToQuarters(qd, itog);
      batchPayload.push({ id, quarterly_data: qd });
    }

    if (batchPayload.length === 0) {
      return jsonResponse({
        ok: true,
        tab: tabName,
        rowsScanned: grid.length,
        updated: 0,
        errors: errors.slice(0, 50),
        errorCount: errors.length,
        message: 'Нет валидных инициатив для обновления',
      });
    }

    let updated = 0;
    for (let i = 0; i < batchPayload.length; i += RPC_CHUNK) {
      const slice = batchPayload.slice(i, i + RPC_CHUNK);
      const { data: rpcData, error: rpcErr } = await supabase.rpc(
        'apply_initiatives_quarterly_data_batch',
        { p_updates: slice }
      );

      if (rpcErr) {
        return jsonResponse(
          {
            error:
              `RPC apply_initiatives_quarterly_data_batch: ${rpcErr.message}. Примените миграцию supabase/migrations/20260323140000_apply_initiatives_quarterly_data_batch.sql`,
            partialUpdated: updated,
            errors: errors.slice(0, 20),
          },
          500
        );
      }

      const n =
        rpcData &&
        typeof rpcData === 'object' &&
        rpcData !== null &&
        'updated' in rpcData &&
        typeof (rpcData as { updated: unknown }).updated === 'number'
          ? (rpcData as { updated: number }).updated
          : 0;
      updated += n;
    }

    return jsonResponse({
      ok: true,
      tab: tabName,
      rowsScanned: grid.length,
      updated,
      errors: errors.slice(0, 50),
      errorCount: errors.length,
      message:
        'Итоги OUT O–R (2025) и Y–AB (2026) → sheet_out_itog_2025 и cost по кварталам (батч RPC).',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: msg }, 500);
  }
});
