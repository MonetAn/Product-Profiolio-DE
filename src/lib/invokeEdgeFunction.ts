import { supabase } from '@/integrations/supabase/client';

function networkHint(): string {
  return (
    'Не удалось достучаться до Edge Function. Попробуйте ещё раз через минуту.\n' +
    'Частые причины: нестабильный интернет/VPN, блокировка *.supabase.co, расширения браузера.\n' +
    'Проверьте в DevTools → Network запрос к …/functions/v1/…'
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Прямой POST к Edge Function (только заголовки authorization, apikey, content-type).
 * Не используем supabase.functions.invoke: в новых версиях SDK добавляется x-supabase-client-platform,
 * и preflight падает, пока в облаке не задеплоен обновлённый CORS.
 */
async function invokeViaFetch(
  functionName: string,
  accessToken: string,
  requestBody: Record<string, unknown> | undefined
): Promise<unknown> {
  const baseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '');
  const anon = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (!baseUrl || !anon) {
    throw new Error('VITE_SUPABASE_URL или VITE_SUPABASE_PUBLISHABLE_KEY не заданы');
  }

  const url = `${baseUrl}/functions/v1/${functionName}`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 120_000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: anon,
        'Content-Type': 'application/json',
      },
      body: requestBody === undefined ? '{}' : JSON.stringify(requestBody),
      signal: controller.signal,
    });

    const text = await res.text();
    let parsed: Record<string, unknown> = {};
    try {
      parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      parsed = { error: text.slice(0, 500) };
    }

    if (!res.ok) {
      const errPart = typeof parsed.error === 'string' ? parsed.error : '';
      const detailPart = typeof parsed.detail === 'string' ? parsed.detail : '';
      const combined =
        [errPart, detailPart].filter(Boolean).join('\n') || `HTTP ${res.status} ${res.statusText}`.trim();
      throw new Error(combined);
    }
    return parsed;
  } finally {
    clearTimeout(t);
  }
}

/**
 * POST к Supabase Edge Function с JWT текущего пользователя.
 */
export async function invokeEdgeFunction(
  functionName: string,
  body?: Record<string, unknown>
): Promise<unknown> {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!baseUrl?.trim()) {
    throw new Error('В .env не задан VITE_SUPABASE_URL');
  }

  await supabase.auth.refreshSession().catch(() => {});

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Войдите в приложение');
  }

  const maxAttempts = 3;
  let lastErr: Error | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await invokeViaFetch(functionName, session.access_token, body);
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      if (attempt < maxAttempts - 1) {
        await sleep(500 * (attempt + 1));
      }
    }
  }

  throw new Error(`${lastErr?.message ?? 'Ошибка запроса'}\n\n${networkHint()}`);
}
