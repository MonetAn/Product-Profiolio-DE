import { getUnitColor, hashString } from '@/lib/dataManager';

/** Акцент UI раздела «Объединение» (вкладки, CTA, «назад» на тремапе). */
export const CROSS_UI_ACCENT = '#7B5FA8';
export const CROSS_UI_ACCENT_HOVER = '#6B4E9A';

/** Цвет плитки «Остальное» на дашборде (нейтральный, не путается с юнитами). */
export const PORTFOLIO_REST_TILE_COLOR = '#64748b';

/**
 * Палитра кросс-инициатив (только HEX — совместимо с adjustBrightness в D3-layout).
 * Тон и насыщенность как у бюджетного тремапа: различимые, но не кислотные.
 */
const CROSS_INITIATIVE_PALETTE = [
  '#5B6FD6', // перванш
  '#7B5FA8', // сливовый
  '#2D9B6A', // изумруд
  '#D4852C', // янтарь
  '#C44E89', // роза
  '#4A90B8', // стальной синий
  '#6B4E9A', // аметист
  '#3A8F85', // морская волна
  '#B85C3C', // терракота
  '#5C7EBF', // васильковый
  '#8B5E83', // сливовая пыль
  '#4E7D9E', // пыльный синий
  '#9A6B4F', // карамель
  '#5A8F6B', // шалфей
] as const;

export function getCrossInitiativeColor(crossName: string): string {
  const idx = hashString(crossName) % CROSS_INITIATIVE_PALETTE.length;
  return CROSS_INITIATIVE_PALETTE[idx];
}

/** Цвет для StaticTreemap: кросс — своя палитра, юнит/команда — как на «Бюджете». */
export function createCrossOverviewColorGetter(
  crossNames: Iterable<string>,
  portfolioRestName = 'Остальное'
) {
  const crossSet = new Set(crossNames);
  return (name: string): string => {
    if (crossSet.has(name)) return getCrossInitiativeColor(name);
    if (name === portfolioRestName) return PORTFOLIO_REST_TILE_COLOR;
    return getUnitColor(name);
  };
}
