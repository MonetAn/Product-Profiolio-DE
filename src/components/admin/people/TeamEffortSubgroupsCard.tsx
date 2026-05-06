import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { Person } from '@/lib/peopleDataManager';
import type { TeamEffortSubgroupRow } from '@/hooks/useTeamEffortSubgroups';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

type Props = {
  people: Person[];
  subgroups: TeamEffortSubgroupRow[];
  membership: Map<string, string>;
  onCreateSubgroup: (name: string) => void | Promise<void>;
  onDeleteSubgroup: (id: string) => void | Promise<void>;
  onSetPersonSubgroup: (personId: string, subgroupId: string | null) => void | Promise<void>;
  busy?: boolean;
};

const NONE = '__none__';

export function TeamEffortSubgroupsCard({
  people,
  subgroups,
  membership,
  onCreateSubgroup,
  onDeleteSubgroup,
  onSetPersonSubgroup,
  busy,
}: Props) {
  const [newName, setNewName] = useState('');

  const handleCreate = async () => {
    const n = newName.trim();
    if (!n) return;
    await onCreateSubgroup(n);
    setNewName('');
  };

  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-card p-3 shadow-sm',
        busy && 'pointer-events-none opacity-70'
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="text-sm font-semibold leading-none text-foreground">Подкоманды</h2>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Название"
            className="h-9 sm:w-52"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCreate();
            }}
          />
          <Button type="button" size="sm" className="h-9 shrink-0" onClick={() => void handleCreate()}>
            Добавить
          </Button>
        </div>
      </div>

      {subgroups.length > 0 ? (
        <ul className="mt-4 flex flex-wrap gap-2">
          {subgroups.map((s) => (
            <li
              key={s.id}
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/40 px-2.5 py-1 text-sm"
            >
              <span>{s.name}</span>
              <button
                type="button"
                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Удалить группу"
                onClick={() => void onDeleteSubgroup(s.id)}
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {people.length > 0 ? (
        <div className="mt-4 overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[320px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-left text-xs font-medium text-muted-foreground">
                <th className="px-3 py-2 font-medium">Человек</th>
                <th className="px-3 py-2 font-medium">Подкоманда</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => {
                const sid = membership.get(p.id);
                const value = sid ?? NONE;
                return (
                  <tr key={p.id} className="border-b border-border/80 last:border-0">
                    <td className="px-3 py-2 font-medium">{p.full_name}</td>
                    <td className="px-3 py-2">
                      <Select
                        value={value}
                        onValueChange={(v) => {
                          void onSetPersonSubgroup(p.id, v === NONE ? null : v);
                        }}
                      >
                        <SelectTrigger className="h-9 w-full min-w-[12rem]">
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>—</SelectItem>
                          {subgroups.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">Нет людей в выбранном scope.</p>
      )}
    </div>
  );
}
