import { supabase } from '@/integrations/supabase/client';

/** Имя для подписей «кто сохранил / кто проверил» (profiles → metadata → email). */
export async function getCurrentUserDisplayName(): Promise<{ id: string | null; name: string }> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user ?? null;
  if (!user?.id) return { id: null, name: 'Пользователь' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle();

  const fromProfile = profile?.full_name?.trim();
  if (fromProfile) return { id: user.id, name: fromProfile };

  const meta = user.user_metadata as { full_name?: string; name?: string } | undefined;
  const name =
    meta?.full_name ||
    meta?.name ||
    user.email?.split('@')[0]?.trim() ||
    'Пользователь';
  return { id: user.id, name };
}
