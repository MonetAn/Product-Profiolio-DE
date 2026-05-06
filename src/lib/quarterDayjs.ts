import dayjs, { type Dayjs } from 'dayjs';
import quarterOfYear from 'dayjs/plugin/quarterOfYear';

dayjs.extend(quarterOfYear);

/** Первый день календарного квартала в формате `YYYY-Qn`. */
export function quarterKeyToDayjs(q: string): Dayjs | null {
  const m = q.match(/^(\d{4})-Q([1-4])$/i);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const qn = parseInt(m[2], 10);
  const month = (qn - 1) * 3;
  return dayjs(new Date(y, month, 1)).startOf('quarter');
}

export function dayjsToQuarterKey(d: Dayjs): string {
  const x = d.startOf('quarter');
  return `${x.year()}-Q${x.quarter()}`;
}
