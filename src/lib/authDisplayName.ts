import { supabase } from '@/integrations/supabase/client';

export type CurrentUserCommentAuthor = {
  id: string | null;
  name: string;
  email: string;
};

/**
 * Автор для истории: имя из «Доступов» → профиль → metadata → полная почта.
 * Новые колонки allowed_users могут отсутствовать в старой локальной БД, поэтому
 * ошибка этого шага не блокирует fallback.
 */
export async function getCurrentUserCommentAuthor(): Promise<CurrentUserCommentAuthor> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user ?? null;
  const email = user?.email?.trim() ?? '';
  if (!user?.id) return { id: null, name: email || 'Пользователь', email };

  if (email) {
    const { data: allowedUser } = await supabase
      .from('allowed_users')
      .select('display_name')
      .ilike('email', email)
      .maybeSingle();
    const fromAccess = allowedUser?.display_name?.trim();
    if (fromAccess) return { id: user.id, name: fromAccess, email };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle();
  const fromProfile = profile?.full_name?.trim();
  if (fromProfile) return { id: user.id, name: fromProfile, email };

  const meta = user.user_metadata as { full_name?: string; name?: string } | undefined;
  const name = meta?.full_name || meta?.name || email || 'Пользователь';
  return { id: user.id, name, email };
}

/** Имя для подписей «кто сохранил / кто проверил». */
export async function getCurrentUserDisplayName(): Promise<{ id: string | null; name: string }> {
  const author = await getCurrentUserCommentAuthor();
  return { id: author.id, name: author.name };
}
