export type LocationAllocationPeriodOption = {
  value: string;
  label: string;
  year: number;
  quarters: string[];
};

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
