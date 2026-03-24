import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeadersFromRequest, jsonResponse } from '../_shared/cors.ts';
import { requireAdmin } from '../_shared/require-admin.ts';
import { getGoogleSheetsAccessToken } from '../_shared/google-access-token.ts';
import { getUserIdFromAuthHeader } from '../_shared/jwt-user-id.ts';
import {
  buildInValuesWithHeaders,
  fetchAssignmentRows,
  type PreviewQuarterEfforts,
  writeInTabToGoogle,
} from '../_shared/sheets-in-sheet-values.ts';
import {
  fetchOutGrid,
  itogMapToPreviewList,
  parseOutGridToItogById,
} from '../_shared/sheets-out-read-itog.ts';
import {
  looksLikeSpreadsheetFileId,
  normalizeSpreadsheetId,
} from '../_shared/spreadsheet-id.ts';

const DEFAULT_IN_TAB = 'IN';
const DEFAULT_OUT_TAB = 'OUT';

function parseBody(text: string): {
  previewQuarterEfforts: PreviewQuarterEfforts | null;
  maxWaitMs: number;
} {
  const fallback = { previewQuarterEfforts: null as PreviewQuarterEfforts | null, maxWaitMs: 12000 };
  if (!text?.trim()) return fallback;
  try {
    const body = JSON.parse(text) as {
      previewQuarterEfforts?: unknown;
      maxWaitMs?: unknown;
    };
    let maxWaitMs =
      typeof body.maxWaitMs === 'number' && Number.isFinite(body.maxWaitMs)
        ? Math.min(30000, Math.max(2000, body.maxWaitMs))
        : 12000;
    const p = body.previewQuarterEfforts;
    if (!p || typeof p !== 'object' || Array.isArray(p)) {
      return { previewQuarterEfforts: null, maxWaitMs };
    }
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
    return {
      previewQuarterEfforts: Object.keys(out).length > 0 ? out : null,
      maxWaitMs,
    };
  } catch {
    return fallback;
  }
}

function snapshotKey(m: Map<string, Record<string, number>>): string {
  const ids = [...m.keys()].sort();
  const parts: string[] = [];
  for (const id of ids) {
    const itog = m.get(id)!;
    const qs = Object.keys(itog).sort();
    parts.push(
      id +
        ':' +
        qs.map((q) => `${q}=${itog[q]}`).join(',')
    );
  }
  return parts.join('|');
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
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

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!url || !anon || !serviceKey) {
    return jsonResponse({ error: 'Server misconfigured' }, 500);
  }

  const userId = await getUserIdFromAuthHeader(req, url, anon);
  if (!userId) {
    return jsonResponse({ error: 'Не удалось определить пользователя' }, 401);
  }

  let bodyText = '';
  try {
    bodyText = await req.text();
  } catch {
    bodyText = '';
  }
  const { previewQuarterEfforts, maxWaitMs } = parseBody(bodyText);

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

  const inTab = (Deno.env.get('SHEETS_IN_TAB_NAME') ?? DEFAULT_IN_TAB).trim() || DEFAULT_IN_TAB;
  const outTab = (Deno.env.get('SHEETS_OUT_TAB_NAME') ?? DEFAULT_OUT_TAB).trim() || DEFAULT_OUT_TAB;

  const supabaseService = createClient(url, serviceKey);

  const { data: lockRows, error: lockErr } = await supabaseService.rpc(
    'acquire_sheet_preview_lock',
    { p_holder_id: userId, p_ttl_seconds: Math.ceil(maxWaitMs / 1000) + 120 }
  );

  if (lockErr) {
    return jsonResponse({ error: `Lock: ${lockErr.message}` }, 500);
  }

  let lockRow: unknown = Array.isArray(lockRows) ? lockRows[0] : lockRows;
  if (
    !lockRow &&
    lockRows &&
    typeof lockRows === 'object' &&
    !Array.isArray(lockRows) &&
    'acquired' in (lockRows as object)
  ) {
    lockRow = lockRows;
  }
  const acquired =
    lockRow &&
    typeof lockRow === 'object' &&
    'acquired' in lockRow &&
    (lockRow as { acquired: boolean }).acquired === true;

  if (!acquired) {
    const reason =
      lockRow &&
      typeof lockRow === 'object' &&
      'reason' in lockRow &&
      typeof (lockRow as { reason: unknown }).reason === 'string'
        ? (lockRow as { reason: string }).reason
        : 'busy';
    return jsonResponse(
      {
        error:
          reason === 'busy'
            ? 'Другой администратор уже запускает расчёт. Подождите или повторите позже.'
            : `Не удалось занять блокировку: ${reason}`,
        code: 'LOCK_BUSY',
      },
      409
    );
  }

  try {
    let list;
    try {
      list = await fetchAssignmentRows(supabaseService);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return jsonResponse({ error: msg }, 500);
    }

    const values = buildInValuesWithHeaders(list, previewQuarterEfforts);
    const accessToken = await getGoogleSheetsAccessToken(saJson);

    await writeInTabToGoogle({
      accessToken,
      spreadsheetId,
      tabName: inTab,
      values,
    });

    const deadline = Date.now() + maxWaitMs;
    let prevKey = '';
    let stableCount = 0;
    let lastMap = new Map<string, Record<string, number>>();

    while (Date.now() < deadline) {
      await sleep(400);
      const { grid } = await fetchOutGrid(accessToken, spreadsheetId, outTab);
      const itogById = parseOutGridToItogById(grid as unknown[][]);
      const key = snapshotKey(itogById);
      if (key === prevKey && key !== '') {
        stableCount += 1;
      } else {
        stableCount = 0;
      }
      prevKey = key;
      lastMap = itogById;
      if (stableCount >= 2) break;
    }

    const ids = [...lastMap.keys()];
    let nameMap = new Map<string, string>();
    if (ids.length > 0) {
      for (let i = 0; i < ids.length; i += 120) {
        const slice = ids.slice(i, i + 120);
        const { data, error } = await supabaseService
          .from('initiatives')
          .select('id, initiative')
          .in('id', slice);
        if (!error && data) {
          for (const row of data) {
            if (row.initiative) nameMap.set(row.id, row.initiative);
          }
        }
      }
    }

    const preview = itogMapToPreviewList(lastMap, nameMap);

    return jsonResponse({
      ok: true,
      message:
        'Предпросмотр: лист IN обновлён, итоги прочитаны с OUT без записи cost в базу. Восстановите IN из базы кнопкой «Сбросить лист по базе», если не сохраняете.',
      usedPreviewOverrides: previewQuarterEfforts != null,
      pollStable: stableCount >= 2,
      preview,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: msg }, 500);
  } finally {
    await supabaseService.rpc('release_sheet_preview_lock', {
      p_holder_id: userId,
    });
  }
});
