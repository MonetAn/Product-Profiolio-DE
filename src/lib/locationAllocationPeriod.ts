export type LocationAllocationPeriodOption = {
  value: string;
  label: string;
  year: number;
  quarters: string[];
};

const QUARTER_PATTERN = /^(\d{4})-Q([1-4])$/;

function normalizeQuarterKeys(quarters: string[]): string[] {
  return [...new Set(quarters.filter((quarter) => QUARTER_PATTERN.test(quarter)))].sort();
}

function quarterIndex(year: number, quarter: number): number {
  return year * 4 + quarter - 1;
}

function quarterFromIndex(index: number): string {
  const year = Math.floor(index / 4);
  const quarter = (index % 4) + 1;
  return `${year}-Q${quarter}`;
}

function expandQuarterRange(
  startYear: number,
  startQuarter: number,
  endYear: number,
  endQuarter: number
): string[] {
  const start = quarterIndex(startYear, startQuarter);
  const end = quarterIndex(endYear, endQuarter);
  if (end < start || end - start > 40) return [];
  return Array.from({ length: end - start + 1 }, (_, offset) =>
    quarterFromIndex(start + offset)
  );
}

function quarterRangeFromDates(
  periodStart: string | null | undefined,
  periodEnd: string | null | undefined
): string[] {
  const start = /^(\d{4})-(\d{2})-\d{2}$/.exec(periodStart ?? '');
  const end = /^(\d{4})-(\d{2})-\d{2}$/.exec(periodEnd ?? '');
  if (!start || !end) return [];

  const startYear = Number(start[1]);
  const startMonth = Number(start[2]);
  const endYear = Number(end[1]);
  const endMonth = Number(end[2]);
  if (
    startMonth < 1 ||
    startMonth > 12 ||
    endMonth < 1 ||
    endMonth > 12
  ) {
    return [];
  }

  return expandQuarterRange(
    startYear,
    Math.floor((startMonth - 1) / 3) + 1,
    endYear,
    Math.floor((endMonth - 1) / 3) + 1
  );
}

function quarterRangeFromDatasetLabel(label: string | null | undefined): string[] {
  const normalized = label?.toUpperCase() ?? '';
  const year = /\b(20\d{2})\b/.exec(normalized);
  const quarterMatches = [...normalized.matchAll(/\bQ([1-4])\b/g)];
  if (!year || quarterMatches.length === 0) return [];

  const startQuarter = Number(quarterMatches[0][1]);
  const endQuarter = Number(quarterMatches[quarterMatches.length - 1][1]);
  return expandQuarterRange(
    Number(year[1]),
    Math.min(startQuarter, endQuarter),
    Number(year[1]),
    Math.max(startQuarter, endQuarter)
  );
}

export function resolveLocationAllocationDatasetQuarters({
  availableQuarters,
  periodStart,
  periodEnd,
  datasetLabel,
}: {
  availableQuarters: string[];
  periodStart?: string | null;
  periodEnd?: string | null;
  datasetLabel?: string | null;
}): string[] {
  const available = normalizeQuarterKeys(availableQuarters);
  const dateRange = quarterRangeFromDates(periodStart, periodEnd);
  const datasetRange =
    dateRange.length > 0
      ? dateRange
      : quarterRangeFromDatasetLabel(datasetLabel);

  if (datasetRange.length === 0) return available;
  if (available.length === 0) return datasetRange;

  const availableSet = new Set(available);
  const intersection = datasetRange.filter((quarter) => availableSet.has(quarter));
  return intersection.length > 0 ? intersection : available;
}

export function isCompleteLocationAllocationYear(
  year: string | number,
  quarters: string[]
): boolean {
  const value = String(year);
  const quarterSet = new Set(quarters);
  return [1, 2, 3, 4].every((quarter) =>
    quarterSet.has(`${value}-Q${quarter}`)
  );
}

export function formatLocationAllocationQuarterSpan(quarters: string[]): string {
  const normalized = normalizeQuarterKeys(quarters);
  if (normalized.length === 0) return '';

  const labels = normalized.map((quarter) => quarter.slice(5));
  const sameYear = normalized.every(
    (quarter) => quarter.slice(0, 4) === normalized[0].slice(0, 4)
  );
  const indexes = normalized.map((quarter) => {
    const match = QUARTER_PATTERN.exec(quarter);
    return match ? quarterIndex(Number(match[1]), Number(match[2])) : -1;
  });
  const contiguous = indexes.every(
    (index, position) => position === 0 || index === indexes[position - 1] + 1
  );

  if (sameYear && contiguous && labels.length > 1) {
    return `${labels[0]}–${labels[labels.length - 1]}`;
  }
  return labels.join(', ');
}

export function buildLocationAllocationPeriodOptions(
  quarters: string[]
): LocationAllocationPeriodOption[] {
  const normalized = normalizeQuarterKeys(quarters);
  const years = [...new Set(normalized.map((quarter) => Number(quarter.slice(0, 4))))]
    .filter(Number.isFinite)
    .sort((a, b) => b - a);

  return years.flatMap((year) => {
    const yearQuarters = normalized.filter((quarter) =>
      quarter.startsWith(`${year}-`)
    );
    const completeYear = isCompleteLocationAllocationYear(year, yearQuarters);
    return [
      {
        value: String(year),
        label: completeYear
          ? `${year} · весь год`
          : `${year} · ${formatLocationAllocationQuarterSpan(yearQuarters)}`,
        year,
        quarters: yearQuarters,
      },
      ...yearQuarters.map((quarter) => ({
        value: quarter,
        label: quarter.replace('-', ' · '),
        year,
        quarters: [quarter],
      })),
    ];
  });
}

export function resolveLocationAllocationPeriod(
  value: string,
  options: LocationAllocationPeriodOption[]
): LocationAllocationPeriodOption | null {
  const exact = options.find((option) => option.value === value);
  if (exact) return exact;

  const match = /^(\d{4}-Q[1-4])\.\.(\d{4}-Q[1-4])$/.exec(value);
  if (!match || match[1].slice(0, 4) !== match[2].slice(0, 4)) return null;

  const catalog = [
    ...new Set(options.flatMap((option) => option.quarters)),
  ].sort();
  const startIndex = catalog.indexOf(match[1]);
  const endIndex = catalog.indexOf(match[2]);
  if (startIndex < 0 || endIndex < 0) return null;

  const [from, to] =
    startIndex <= endIndex
      ? [startIndex, endIndex]
      : [endIndex, startIndex];
  const quarters = catalog.slice(from, to + 1);
  if (
    quarters.length === 0 ||
    quarters.some((quarter) => quarter.slice(0, 4) !== match[1].slice(0, 4))
  ) {
    return null;
  }

  const start = quarters[0];
  const end = quarters[quarters.length - 1];
  const year = Number(start.slice(0, 4));
  return {
    value: `${start}..${end}`,
    label: `${year} · ${start.slice(5)}–${end.slice(5)}`,
    year,
    quarters,
  };
}
