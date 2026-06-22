import { formatBudget } from '@/lib/dataManager';
import {
  formatHistoryContext,
  formatHistoryTimestamp,
  type QuarterCostHistoryEntry,
  type QuarterMoneyHistoryEntry,
} from '@/lib/quarterValueHistory';

interface QuarterMoneyHistoryListProps {
  entries?: QuarterMoneyHistoryEntry[];
  className?: string;
}

export function QuarterMoneyHistoryList({ entries, className }: QuarterMoneyHistoryListProps) {
  if (!entries?.length) return null;
  return (
    <ul className={className ?? 'gantt-quarter-history'}>
      {entries.map((entry, idx) => (
        <li key={`${entry.at}-${idx}`} className="gantt-quarter-history-item">
          {formatBudget(entry.value)}
          <span className="gantt-quarter-history-meta">
            · {formatHistoryTimestamp(entry.at)} · {formatHistoryContext(entry.setInQuarter, 'short')}
            {entry.savedBy ? <> · {entry.savedBy}</> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

interface QuarterCostHistoryListProps {
  entries?: QuarterCostHistoryEntry[];
  className?: string;
}

export function QuarterCostHistoryList({ entries, className }: QuarterCostHistoryListProps) {
  if (!entries?.length) return null;
  return (
    <ul className={className ?? 'gantt-quarter-history'}>
      {entries.map((entry, idx) => (
        <li key={`${entry.at}-${idx}`} className="gantt-quarter-history-item">
          {formatBudget(entry.total)}
          <span className="gantt-quarter-history-meta">
            · {formatHistoryTimestamp(entry.at)} · {formatHistoryContext(entry.setInQuarter, 'short')}
            {entry.savedBy ? <> · {entry.savedBy}</> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}
