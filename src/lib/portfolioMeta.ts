import { supabase } from '@/integrations/supabase/client';

export type PortfolioCompletedMap = Map<string, boolean>;

/** Загрузка флага «завершена» из side-table (без ALTER initiatives). */
export async function fetchPortfolioCompletedMap(): Promise<PortfolioCompletedMap> {
  const { data, error } = await supabase
    .from('initiative_portfolio_meta')
    .select('initiative_id, is_portfolio_completed')
    .eq('is_portfolio_completed', true);

  if (error) {
    // Таблица ещё не создана на проде — считаем все активными.
    if (error.code === '42P01' || error.message.includes('does not exist')) {
      return new Map();
    }
    throw error;
  }

  return new Map((data ?? []).map((row) => [row.initiative_id, true]));
}

export async function upsertPortfolioCompleted(
  initiativeId: string,
  completed: boolean
): Promise<void> {
  if (completed) {
    const { error } = await supabase.from('initiative_portfolio_meta').upsert(
      {
        initiative_id: initiativeId,
        is_portfolio_completed: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'initiative_id' }
    );
    if (error) throw error;
    return;
  }

  const { error } = await supabase
    .from('initiative_portfolio_meta')
    .delete()
    .eq('initiative_id', initiativeId);
  if (error) throw error;
}
