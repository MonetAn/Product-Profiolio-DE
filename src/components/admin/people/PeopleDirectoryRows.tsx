import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { usePeopleMutations } from '@/hooks/usePeople';
import {
  type Person,
  isManualPendingReview,
  isManualResolved,
} from '@/lib/peopleDataManager';
import { cn } from '@/lib/utils';

type Props = {
  people: Person[];
  listClassName?: string;
};

export function PeopleDirectoryRows({ people, listClassName }: Props) {
  const { resolveManualPersonReview } = usePeopleMutations();

  return (
    <ul className={cn('divide-y divide-border/60', listClassName)}>
      {people.map((p) => {
        const pending = isManualPendingReview(p);
        const resolved = isManualResolved(p);
        const resolvedWhen =
          p.manual_resolved_at &&
          new Date(p.manual_resolved_at).toLocaleString('ru-RU', {
            dateStyle: 'short',
            timeStyle: 'short',
          });
        return (
          <li
            key={p.id}
            className={cn(
              'px-2.5 py-2 text-xs',
              pending && 'bg-amber-500/[0.12] dark:bg-amber-500/10'
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-1">
                  <span className="font-medium text-foreground">{p.full_name}</span>
                  {p.directory_source === 'manual' ? (
                    <Badge variant="outline" className="text-[10px] font-normal">
                      вручную
                    </Badge>
                  ) : null}
                  {pending ? (
                    <Badge className="bg-amber-600 text-[10px] hover:bg-amber-600">
                      на проверке
                    </Badge>
                  ) : null}
                  {resolved ? (
                    <Badge variant="secondary" className="text-[10px] font-normal">
                      проверено
                    </Badge>
                  ) : null}
                </div>
                <div className="space-y-0.5 text-[11px] text-muted-foreground">
                  <div>
                    {[p.unit, p.team].filter(Boolean).join(' · ') || '—'}{' '}
                    {p.email ? <>· {p.email}</> : null}
                  </div>
                  {p.position ? <div>{p.position}</div> : null}
                  {p.hired_at ? (
                    <div>Найм: {new Date(p.hired_at).toLocaleDateString('ru-RU')}</div>
                  ) : null}
                  {p.terminated_at ? (
                    <div>Уволен: {new Date(p.terminated_at).toLocaleDateString('ru-RU')}</div>
                  ) : null}
                  {p.hr_structure ? (
                    <div className="truncate" title={p.hr_structure}>
                      HR: {p.hr_structure}
                    </div>
                  ) : null}
                  {resolved && (p.manual_resolved_by_name || resolvedWhen) ? (
                    <div className="text-foreground/80">
                      Проверил: {p.manual_resolved_by_name ?? '—'}
                      {resolvedWhen ? <> · {resolvedWhen}</> : null}
                    </div>
                  ) : null}
                  {pending && p.manual_added_by_name ? (
                    <div>Добавил: {p.manual_added_by_name}</div>
                  ) : null}
                </div>
              </div>
              {pending ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-7 shrink-0 px-2 text-[11px]"
                  disabled={resolveManualPersonReview.isPending}
                  onClick={() => void resolveManualPersonReview.mutateAsync(p.id)}
                >
                  Проверено
                </Button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
