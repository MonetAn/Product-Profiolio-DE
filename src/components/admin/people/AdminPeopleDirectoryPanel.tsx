import { useMemo } from 'react';
import { PeopleDirectoryRows } from '@/components/admin/people/PeopleDirectoryRows';
import { type Person, isManualPendingReview } from '@/lib/peopleDataManager';
import { cn } from '@/lib/utils';

type Props = {
  people: Person[];
  className?: string;
};

export function AdminPeopleDirectoryPanel({ people, className }: Props) {
  const sorted = useMemo(() => {
    return [...people].sort((a, b) => {
      const ap = isManualPendingReview(a) ? 0 : 1;
      const bp = isManualPendingReview(b) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return a.full_name.localeCompare(b.full_name, 'ru');
    });
  }, [people]);

  return (
    <div className={cn('flex min-h-0 flex-col gap-2', className)}>
      <div className="space-y-0.5">
        <h3 className="text-sm font-semibold">Справочник людей</h3>
        <p className="text-[10px] leading-snug text-muted-foreground">
          Все записи из базы. Ручные добавления ждут «Проверено»; до этого строка подсвечена.
        </p>
      </div>
      <div className="max-h-[min(42vh,380px)] min-h-[12rem] overflow-y-auto overscroll-contain rounded-md border border-border/80">
        <PeopleDirectoryRows people={sorted} />
      </div>
    </div>
  );
}
