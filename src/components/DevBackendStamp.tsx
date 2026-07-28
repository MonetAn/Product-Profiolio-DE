import { isLocalSupabaseBackend, supabaseBackendLabel } from '@/lib/supabaseBackend';

/** В dev: компактный бейдж «DB: local» / «DB: PROD» рядом со сборкой в шапке. */
export function DevBackendStamp() {
  if (!import.meta.env.DEV) return null;

  const local = isLocalSupabaseBackend();
  const url = import.meta.env.VITE_SUPABASE_URL ?? '';

  return (
    <span
      className={
        local
          ? 'hidden shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800 sm:inline'
          : 'hidden shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-800 sm:inline'
      }
      role="status"
      title={
        local
          ? `${supabaseBackendLabel()} · ${url} · egress не тратится`
          : `${supabaseBackendLabel()} · ${url} · переключи .env.local или npm run dev:local`
      }
    >
      {local ? 'DB: local' : 'DB: PROD'}
    </span>
  );
}
