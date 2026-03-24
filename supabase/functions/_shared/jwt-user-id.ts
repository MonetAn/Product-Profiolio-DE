import { createClient } from 'jsr:@supabase/supabase-js@2';

/** UUID текущего пользователя из Bearer JWT (после requireAdmin). */
export async function getUserIdFromAuthHeader(
  req: Request,
  supabaseUrl: string,
  supabaseAnonKey: string
): Promise<string | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.id) return null;
  return data.user.id;
}
