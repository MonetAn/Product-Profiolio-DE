/** Куда смотрит фронт (Vite env). Не путать с LOCAL_DB_URL — это только для psql/скриптов. */
export type SupabaseBackendKind = 'local' | 'prod' | 'unknown';

export function getSupabaseBackendKind(): SupabaseBackendKind {
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? '';
  if (!url) return 'unknown';
  if (/^https?:\/\/(127\.0\.0\.1|localhost):54321\/?$/i.test(url)) return 'local';
  if (/supabase\.co/i.test(url)) return 'prod';
  return 'unknown';
}

export function isLocalSupabaseBackend(): boolean {
  return getSupabaseBackendKind() === 'local';
}

/** Вкладка «Активность» в админке — только при локальной БД; на проде скрыта. */
export function isAdminActivityEnabled(): boolean {
  return isLocalSupabaseBackend();
}

export function supabaseBackendLabel(): string {
  const kind = getSupabaseBackendKind();
  if (kind === 'local') return 'Локальная БД (Docker)';
  if (kind === 'prod') return 'ПРОД Supabase';
  return 'Supabase: не настроен';
}
