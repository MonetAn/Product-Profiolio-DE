import { useCallback, useEffect, useState } from 'react';
import { Copy, Check, Link2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { buildPublicEmbedUrl } from '@/lib/publicEmbed';

type EmbedLinkRow = {
  slug: string;
  unit: string;
  label: string;
  enabled: boolean;
};

export function AdminPublicEmbedLinks() {
  const { toast } = useToast();
  const [rows, setRows] = useState<EmbedLinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('public_embed_links')
      .select('slug, unit, label, enabled')
      .order('label');
    setLoading(false);
    if (error) {
      toast({ title: 'Не удалось загрузить embed-ссылки', description: error.message, variant: 'destructive' });
      setRows([]);
      return;
    }
    setRows((data ?? []) as EmbedLinkRow[]);
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const copyUrl = async (slug: string) => {
    const url = buildPublicEmbedUrl(slug);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedSlug(slug);
      setTimeout(() => setCopiedSlug(null), 2000);
      toast({ title: 'Ссылка скопирована' });
    } catch {
      toast({ title: 'Не удалось скопировать', variant: 'destructive' });
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div>
        <p className="text-sm font-medium flex items-center gap-2">
          <Link2 className="h-4 w-4 text-muted-foreground" aria-hidden />
          Публичные embed-ссылки
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          Компактный дашборд без Google-авторизации: только «Бюджет» / «Таймлайн», галочки «Команды» и
          «Инициативы», сумма и количество инициатив. Деньги и «Только PnL IT» всегда включены. Sensitive
          не попадает в выдачу.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground py-2">Загрузка…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">
          Нет настроенных ссылок. Примените миграцию{' '}
          <code className="text-xs">20260630120000_public_embed_links.sql</code>.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border overflow-hidden">
          {rows.map((row) => {
            const url = buildPublicEmbedUrl(row.slug);
            const disabled = !row.enabled;
            return (
              <li
                key={row.slug}
                className={`flex flex-col sm:flex-row sm:items-center gap-2 px-3 py-2.5 text-sm ${disabled ? 'opacity-60' : ''}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{row.label}</div>
                  <div className="text-xs text-muted-foreground truncate" title={url}>
                    {url}
                  </div>
                  {disabled && (
                    <div className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">Отключена</div>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5"
                    disabled={disabled}
                    onClick={() => void copyUrl(row.slug)}
                  >
                    {copiedSlug === row.slug ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    Копировать
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={disabled}
                    asChild
                  >
                    <a href={url} target="_blank" rel="noopener noreferrer" aria-label="Открыть embed">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">
        Вставьте ссылку в документацию (Build-in AI / Notion). Формат:{' '}
        <code className="text-[11px]">/embed/tech-platform</code>,{' '}
        <code className="text-[11px]">/embed/b2b-pizza</code>.
      </p>
    </div>
  );
}
