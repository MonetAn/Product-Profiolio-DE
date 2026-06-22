/** Компактные суммы на странице аллокаций: 84М, 2 042М */
export function formatLocationCompactM(rub: number): string {
  const n = Math.round(Math.abs(rub));
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toLocaleString('ru-RU', { maximumFractionDigits: 0 })}М`;
  }
  if (n >= 1_000) {
    return `${Math.round(n / 1_000).toLocaleString('ru-RU')}K`;
  }
  return n.toLocaleString('ru-RU');
}

/** Δ в таблицах: +84М / −12М или K для мелких сумм */
export function formatLocationDeltaM(rub: number): string {
  if (Math.abs(rub) < 500_000) {
    if (rub === 0) return '—';
    const k = rub / 1_000;
    return `${rub > 0 ? '+' : ''}${k.toFixed(0)}K`;
  }
  const sign = rub > 0 ? '+' : '−';
  return `${sign}${formatLocationCompactM(Math.abs(rub))}`;
}

/** Полная сумма для тултипов */
export function formatLocationFullAmount(rub: number): string {
  return Math.round(rub).toLocaleString('ru-RU');
}
