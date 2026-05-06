import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react';
import type { AdminDataRow, AdminQuarterData } from '@/lib/adminDataManager';
import type { TeamEffortSubgroupRow } from '@/hooks/useTeamEffortSubgroups';
import {
  useTeamSubgroupInitiativeEffort,
  type SubgroupInitiativeEffortRow,
} from '@/hooks/useTeamSubgroupInitiativeEffort';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { LogoLoader } from '@/components/LogoLoader';
import EffortInput from '@/components/admin/people/EffortInput';
import { cn } from '@/lib/utils';

type Props = {
  subgroups: TeamEffortSubgroupRow[];
  initiatives: AdminDataRow[];
  quarters: string[];
  queryEnabled: boolean;
};

function initiativeExpectedForQuarter(row: AdminDataRow, q: string): number | undefined {
  const qd = row.quarterlyData[q] as AdminQuarterData | undefined;
  const v = qd?.effortCoefficient;
  return v !== undefined && v !== null && Number(v) > 0 ? Number(v) : undefined;
}

export function SubgroupInitiativeMatrix({
  subgroups,
  initiatives,
  quarters,
  queryEnabled,
}: Props) {
  const subgroupIds = useMemo(() => subgroups.map((s) => s.id), [subgroups]);
  const initiativeIds = useMemo(() => initiatives.map((i) => i.id), [initiatives]);

  const { byKey, isLoading, upsertQuarter, isSaving } = useTeamSubgroupInitiativeEffort(
    subgroupIds,
    initiativeIds,
    queryEnabled
  );

  const gridCols = useMemo(
    () => `minmax(240px, 1fr) repeat(${quarters.length}, 92px) 80px`,
    [quarters.length]
  );

  const subgroupQuarterTotals = useMemo(() => {
    const map = new Map<string, Record<string, number>>();
    for (const sg of subgroups) {
      const totals: Record<string, number> = {};
      for (const q of quarters) totals[q] = 0;
      for (const ini of initiatives) {
        const row = byKey.get(`${sg.id}:${ini.id}`);
        for (const q of quarters) {
          totals[q] += row?.quarterly_effort[q] ?? 0;
        }
      }
      map.set(sg.id, totals);
    }
    return map;
  }, [subgroups, initiatives, quarters, byKey]);

  const handleCellChange = (
    subgroupId: string,
    initiativeId: string,
    quarter: string,
    value: number
  ) => {
    const key = `${subgroupId}:${initiativeId}`;
    const prev = byKey.get(key)?.quarterly_effort ?? {};
    upsertQuarter.mutate({ subgroupId, initiativeId, quarter, value, prevQuarterly: prev });
  };

  if (initiatives.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-muted-foreground">Нет инициатив в scope.</p>
    );
  }

  if (!queryEnabled) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <LogoLoader className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className={cn('flex h-full min-h-0 flex-col overflow-hidden', isSaving && 'opacity-90')}>
      <div
        className="sticky top-0 z-10 grid shrink-0 items-center border-b bg-muted/50 px-3 py-2 sm:px-4"
        style={{ gridTemplateColumns: gridCols }}
      >
        <span className="text-xs font-medium text-muted-foreground">Подкоманда</span>
        {quarters.map((q) => (
          <div key={q} className="text-center text-xs font-medium tabular-nums text-muted-foreground">
            {q.replace('20', '').replace('-', ' ')}
          </div>
        ))}
        <div />
      </div>

      <div className="flex-1 overflow-y-auto">
        {subgroups.map((sg) => (
          <SubgroupBlock
            key={sg.id}
            subgroup={sg}
            initiatives={initiatives}
            quarters={quarters}
            gridCols={gridCols}
            byKey={byKey}
            quarterTotals={subgroupQuarterTotals.get(sg.id) ?? {}}
            onCellChange={handleCellChange}
          />
        ))}
      </div>
    </div>
  );
}

function SubgroupBlock({
  subgroup,
  initiatives,
  quarters,
  gridCols,
  byKey,
  quarterTotals,
  onCellChange,
}: {
  subgroup: TeamEffortSubgroupRow;
  initiatives: AdminDataRow[];
  quarters: string[];
  gridCols: string;
  byKey: Map<string, SubgroupInitiativeEffortRow>;
  quarterTotals: Record<string, number>;
  onCellChange: (sgId: string, iniId: string, q: string, v: number) => void;
}) {
  const [open, setOpen] = useState(true);

  const hasOver = Object.values(quarterTotals).some((t) => t > 100);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-b border-border">
      <div
        className={cn(
          'grid items-center px-3 py-2.5 sm:px-4 sm:py-3',
          hasOver && 'bg-destructive/5'
        )}
        style={{ gridTemplateColumns: gridCols }}
      >
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex min-w-0 items-center gap-2 rounded-md text-left outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
          >
            {open ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            )}
            <span className="truncate font-medium">{subgroup.name}</span>
          </button>
        </CollapsibleTrigger>
        {quarters.map((q) => {
          const total = quarterTotals[q] ?? 0;
          const isOver = total > 100;
          const isUnder = total < 100 && total > 0;
          return (
            <div
              key={q}
              className={cn(
                'rounded px-2 py-1 text-center text-xs font-mono tabular-nums',
                isOver && 'bg-destructive/20 text-destructive',
                isUnder && 'bg-muted text-muted-foreground',
                total === 100 && 'bg-primary/20 text-primary',
                total === 0 && 'bg-muted/50 text-muted-foreground'
              )}
            >
              {total}%
              {isOver && <AlertTriangle className="ml-1 inline h-3 w-3" aria-hidden />}
              {total === 100 && !isOver && <CheckCircle2 className="ml-1 inline h-3 w-3" aria-hidden />}
            </div>
          );
        })}
        <div />
      </div>

      <CollapsibleContent>
        <div className="border-t border-border bg-muted/15">
          {initiatives.map((ini) => {
            const key = `${subgroup.id}:${ini.id}`;
            const row = byKey.get(key);
            const prev = row?.quarterly_effort ?? {};
            return (
              <div
                key={ini.id}
                className="grid items-center border-b border-border/60 px-3 py-2 last:border-b-0 sm:px-4"
                style={{ gridTemplateColumns: gridCols }}
              >
                <div className="min-w-0 pl-6">
                  <div className="truncate font-medium" title={ini.initiative}>
                    {ini.initiative}
                  </div>
                </div>
                {quarters.map((q) => {
                  const v = prev[q] ?? 0;
                  const exp = initiativeExpectedForQuarter(ini, q);
                  return (
                    <div key={q} className="flex justify-center">
                      <EffortInput
                        value={v}
                        expectedValue={exp}
                        isAuto={false}
                        isVirtual={!row}
                        onChange={(nv) => onCellChange(subgroup.id, ini.id, q, nv)}
                      />
                    </div>
                  );
                })}
                <div />
              </div>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
