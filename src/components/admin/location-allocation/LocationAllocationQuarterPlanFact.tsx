import type { AdminDataRow } from '@/lib/adminDataManager';

type Props = {
  initiative: AdminDataRow;
  quarters: string[];
};

function quarterLabel(quarter: string): string {
  const match = quarter.match(/^(\d{4})-Q([1-4])$/);
  if (!match) return quarter.replace('-', ' · ');
  return `${match[1]} · Q${match[2]}`;
}

export function LocationAllocationQuarterPlanFact({
  initiative,
  quarters,
}: Props) {
  if (initiative.isTimelineStub || quarters.length === 0) return null;

  const quarterRows = quarters.map((quarter) => {
    const data = initiative.quarterlyData[quarter];
    return {
      quarter,
      plan: data?.metricPlan?.trim() ?? '',
      fact: data?.metricFact?.trim() ?? '',
      comment: data?.comment?.trim() ?? '',
    };
  });
  const filledCount = quarterRows.filter(
    (row) => row.plan || row.fact || row.comment
  ).length;

  return (
    <section className="mb-4 space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          План и факт по кварталам
        </h3>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          записи команды · {filledCount} из {quarterRows.length}
        </span>
      </div>

      <div className="space-y-2">
        {quarterRows.map((row) => (
          <article
            key={row.quarter}
            className="rounded-lg border border-border/70 bg-muted/15 px-3 py-2.5"
          >
            <p className="mb-2 text-[11px] font-semibold text-foreground">
              {quarterLabel(row.quarter)}
            </p>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="min-w-0">
                <p className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                  План
                </p>
                <p
                  className={`mt-0.5 whitespace-pre-wrap text-xs leading-relaxed ${
                    row.plan
                      ? 'text-foreground/85'
                      : 'italic text-muted-foreground'
                  }`}
                >
                  {row.plan || 'Не заполнен'}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                  Факт
                </p>
                <p
                  className={`mt-0.5 whitespace-pre-wrap text-xs leading-relaxed ${
                    row.fact
                      ? 'text-foreground/85'
                      : 'italic text-muted-foreground'
                  }`}
                >
                  {row.fact || 'Не заполнен'}
                </p>
              </div>
            </div>

            {row.comment ? (
              <div className="mt-2 border-t border-border/50 pt-2">
                <p className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                  Комментарий команды
                </p>
                <p className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-foreground/80">
                  {row.comment}
                </p>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
