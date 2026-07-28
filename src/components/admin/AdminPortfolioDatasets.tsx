import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, CheckCircle2, Database, History, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ACTIVE_PORTFOLIO_DATASET_QUERY_KEY } from '@/hooks/useActivePortfolioDataset';
import { PUBLIC_EMBED_QUERY_KEY } from '@/hooks/usePublicEmbedPortfolio';
import { LOCATION_ALLOCATION_WORKSPACE_QUERY_KEY } from '@/hooks/useLocationAllocationWorkspace';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type DatasetRow = {
  id: string;
  code: string;
  label: string;
  kind: 'live' | 'snapshot';
  period_start: string | null;
  period_end: string | null;
  snapshot_at: string;
  notes: string | null;
  is_active: boolean;
  created_at: string;
};

type DatasetQueryBuilder = {
  select: (columns: string) => DatasetQueryBuilder;
  order: (
    column: string,
    options: { ascending: boolean }
  ) => DatasetQueryBuilder;
  data: DatasetRow[] | null;
  error: Error | null;
};

type PortfolioDatasetSupabaseClient = {
  from: (relation: string) => DatasetQueryBuilder;
  rpc: (
    functionName: string,
    params?: Record<string, unknown>
  ) => PromiseLike<{ data: unknown; error: Error | null }>;
};

const portfolioDatasetSupabase =
  supabase as unknown as PortfolioDatasetSupabaseClient;

const DATASETS_QUERY_KEY = ['portfolio_datasets_admin'] as const;

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

async function fetchDatasets(): Promise<DatasetRow[]> {
  const { data, error } = await portfolioDatasetSupabase
    .from('portfolio_datasets')
    .select(
      'id, code, label, kind, period_start, period_end, snapshot_at, notes, is_active, created_at'
    )
    .order('kind', { ascending: true })
    .order('snapshot_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as DatasetRow[];
}

export function AdminPortfolioDatasets() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [label, setLabel] = useState('Срез до обновления Q1–Q2 2026');
  const [periodStart, setPeriodStart] = useState('2026-01-01');
  const [periodEnd, setPeriodEnd] = useState('2026-06-30');
  const [notes, setNotes] = useState(
    'Полный исторический набор перед загрузкой актуального факта Q1–Q2 2026'
  );

  const datasetsQuery = useQuery({
    queryKey: DATASETS_QUERY_KEY,
    queryFn: fetchDatasets,
    staleTime: 30_000,
  });

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: DATASETS_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: ACTIVE_PORTFOLIO_DATASET_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: PUBLIC_EMBED_QUERY_KEY }),
      queryClient.invalidateQueries({
        queryKey: LOCATION_ALLOCATION_WORKSPACE_QUERY_KEY,
      }),
    ]);
  };

  const createSnapshot = useMutation({
    mutationFn: async () => {
      const cleanLabel = label.trim();
      if (!cleanLabel) throw new Error('Укажите название снимка');
      const { data, error } = await portfolioDatasetSupabase.rpc(
        'create_portfolio_dataset_snapshot',
        {
          p_label: cleanLabel,
          p_period_start: periodStart || null,
          p_period_end: periodEnd || null,
          p_notes: notes.trim() || null,
        }
      );
      if (error) throw error;
      return data as string;
    },
    onSuccess: async () => {
      toast({
        title: 'Исторический снимок создан',
        description: 'Он сохранён целиком и не включён автоматически.',
      });
      await invalidate();
    },
    onError: (error: Error) => {
      toast({
        title: 'Не удалось создать снимок',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const activateDataset = useMutation({
    mutationFn: async (dataset: DatasetRow) => {
      const confirmed = window.confirm(
        `Включить набор «${dataset.label}» сразу для всех пользователей и публичных ссылок?`
      );
      if (!confirmed) return false;
      const { error } = await portfolioDatasetSupabase.rpc('set_active_portfolio_dataset', {
        p_dataset_id: dataset.id,
      });
      if (error) throw error;
      return true;
    },
    onSuccess: async (changed) => {
      if (!changed) return;
      toast({
        title: 'Активный набор переключён',
        description: 'Изменение действует для дашборда и всех публичных ссылок.',
      });
      await invalidate();
    },
    onError: (error: Error) => {
      toast({
        title: 'Не удалось переключить набор',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const datasets = useMemo(() => datasetsQuery.data ?? [], [datasetsQuery.data]);
  const active = useMemo(
    () => datasets.find((dataset) => dataset.is_active) ?? null,
    [datasets]
  );

  return (
    <section className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="p-4 border-b border-border">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <History className="h-4 w-4 text-primary" aria-hidden />
          История наборов данных
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Активный набор одновременно используется в основном дашборде и во всех публичных
          embed-ссылках. Исторические снимки содержат весь портфель, а не только суммы тримапа.
        </p>
      </div>

      {datasetsQuery.isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
        </div>
      ) : datasetsQuery.error ? (
        <div className="p-4 text-sm text-destructive">
          Не удалось загрузить наборы: {(datasetsQuery.error as Error).message}
        </div>
      ) : (
        <>
          <div className="p-4 border-b border-border bg-muted/25">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Сейчас включён
            </p>
            <div className="mt-2 flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">{active?.label ?? 'Активный набор не найден'}</p>
                {active && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {active.kind === 'live' ? 'Текущие рабочие данные' : 'Исторический снимок'}
                    {' · '}
                    {formatDateTime(active.snapshot_at)}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="p-4 border-b border-border space-y-4">
            <div>
              <p className="text-sm font-medium flex items-center gap-2">
                <Archive className="h-4 w-4" aria-hidden />
                Создать полный снимок текущих данных
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Снимок не переключает дашборд и после создания не изменяется.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dataset-label">Название</Label>
              <Input
                id="dataset-label"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="dataset-period-start">Начало периода</Label>
                <Input
                  id="dataset-period-start"
                  type="date"
                  value={periodStart}
                  onChange={(event) => setPeriodStart(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dataset-period-end">Конец периода</Label>
                <Input
                  id="dataset-period-end"
                  type="date"
                  value={periodEnd}
                  onChange={(event) => setPeriodEnd(event.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dataset-notes">Комментарий</Label>
              <Textarea
                id="dataset-notes"
                rows={2}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>
            <Button
              type="button"
              onClick={() => createSnapshot.mutate()}
              disabled={createSnapshot.isPending || !label.trim()}
            >
              {createSnapshot.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Создать снимок
            </Button>
          </div>

          <div className="divide-y divide-border">
            {datasets.map((dataset) => (
              <div
                key={dataset.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center gap-3"
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <Database
                    className={`h-4 w-4 mt-0.5 shrink-0 ${
                      dataset.is_active ? 'text-emerald-600' : 'text-muted-foreground'
                    }`}
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium break-words">{dataset.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {dataset.kind === 'live'
                        ? 'Текущие рабочие данные'
                        : `${formatDate(dataset.period_start)} — ${formatDate(dataset.period_end)}`}
                      {' · '}
                      снимок {formatDateTime(dataset.snapshot_at)}
                    </p>
                    {dataset.notes && (
                      <p className="text-xs text-muted-foreground mt-1 break-words">
                        {dataset.notes}
                      </p>
                    )}
                  </div>
                </div>
                {dataset.is_active ? (
                  <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1 self-start sm:self-center">
                    Включён
                  </span>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={activateDataset.isPending}
                    onClick={() => activateDataset.mutate(dataset)}
                  >
                    Включить
                  </Button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
