import type { ReactNode } from 'react';
import { History } from 'lucide-react';
import { formatBudget } from '@/lib/dataManager';
import {
  formatHistoryContext,
  formatHistorySavedBy,
  formatHistoryTimestampDetailed,
  type QuarterCostHistoryEntry,
  type QuarterMoneyHistoryEntry,
} from '@/lib/quarterValueHistory';

function HistoryShell({ children }: { children: ReactNode }) {
  return (
    <div className="mt-2 rounded-lg border border-border/60 bg-muted/25 px-3 py-2.5">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <History className="h-3 w-3 shrink-0" aria-hidden />
        Ранее сохраняли
      </div>
      <ul className="space-y-2">{children}</ul>
    </div>
  );
}

function HistoryMeta({
  at,
  setInQuarter,
  savedBy,
}: {
  at: string;
  setInQuarter: string;
  savedBy?: string;
}) {
  const author = formatHistorySavedBy(savedBy);
  return (
    <span className="text-[11px] leading-snug text-muted-foreground">
      {formatHistoryTimestampDetailed(at)} · {formatHistoryContext(setInQuarter, 'admin')}
      {author ? <> · {author}</> : null}
    </span>
  );
}

export function AdminQuarterMoneyHistory({ entries }: { entries?: QuarterMoneyHistoryEntry[] }) {
  if (!entries?.length) return null;
  return (
    <HistoryShell>
      {[...entries].reverse().map((entry, idx) => (
        <li key={`${entry.at}-${idx}`} className="space-y-0.5">
          <div className="text-sm font-medium tabular-nums text-foreground">{formatBudget(entry.value)}</div>
          <HistoryMeta at={entry.at} setInQuarter={entry.setInQuarter} savedBy={entry.savedBy} />
        </li>
      ))}
    </HistoryShell>
  );
}

export function AdminQuarterCostHistory({ entries }: { entries?: QuarterCostHistoryEntry[] }) {
  if (!entries?.length) return null;
  return (
    <HistoryShell>
      {[...entries].reverse().map((entry, idx) => (
        <li key={`${entry.at}-${idx}`} className="space-y-0.5">
          <div className="text-sm font-medium tabular-nums text-foreground">{formatBudget(entry.total)}</div>
          <HistoryMeta at={entry.at} setInQuarter={entry.setInQuarter} savedBy={entry.savedBy} />
        </li>
      ))}
    </HistoryShell>
  );
}
