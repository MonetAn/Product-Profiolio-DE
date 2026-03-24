import { createClient } from 'jsr:@supabase/supabase-js@2';
import { jsonResponse } from './cors.ts';

/** Validates caller JWT and ensures get_my_access().is_admin is true. */
export async function requireAdmin(req: Request): Promise<Response | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Missing or invalid Authorization header' }, 401);
  }

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  if (!url || !anon) {
    return jsonResponse({ error: 'Server misconfigured: Supabase env missing' }, 500);
  }

  const supabase = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data, error } = await supabase.rpc('get_my_access');
  if (error) {
    return jsonResponse({ error: error.message, code: error.code }, 403);
  }

  const row = Array.isArray(data) && data.length > 0 ? data[0] : data;
  if (!row || typeof row !== 'object' || !('is_admin' in row)) {
    return jsonResponse({ error: 'Invalid access payload' }, 403);
  }

  if (!(row as { is_admin: boolean }).is_admin) {
    return jsonResponse({ error: 'Admin only' }, 403);
  }

  return null;
}
