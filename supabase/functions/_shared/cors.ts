/**
 * CORS для вызова из браузера (localhost / прод).
 * Новые версии @supabase/supabase-js шлют заголовки вроде x-supabase-client-platform —
 * их нужно разрешить в preflight (OPTIONS), иначе браузер блокирует запрос.
 */
const DEFAULT_ALLOW_HEADERS =
  'authorization, x-client-info, apikey, content-type, x-supabase-api-version, x-supabase-client-platform, x-supabase-client-info';

/** Заголовки для ответа на OPTIONS: отражаем запрошенные браузером заголовки. */
export function corsHeadersFromRequest(req: Request): Record<string, string> {
  const requested = req.headers.get('Access-Control-Request-Headers');
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': requested?.trim() || DEFAULT_ALLOW_HEADERS,
    'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
    'Access-Control-Max-Age': '86400',
  };
}

/** Заголовки для JSON-ответов (POST) — широкий список на случай проверок клиента. */
export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': DEFAULT_ALLOW_HEADERS,
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
