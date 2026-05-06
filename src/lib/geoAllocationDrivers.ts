import { rubleAmountsFromGeoPercents, type GeoCostSplitEntry } from '@/lib/adminDataManager';
import type { MarketCountryRow } from '@/hooks/useMarketCountries';

/**
 * Стабильные ключи драйверов — храним в `geo_cost_split.driverKey` для выборок в SQL/экспорте.
 * Подписи в `driverLabel` — для людей; при смене формулировок ключ не меняем.
 */
export type GeoAllocationDriverKey =
  | 'geo_driver_pizzerias'
  | 'geo_driver_units_mixed'
  | 'geo_driver_partners'
  | 'geo_driver_revenue';

/** Чем измеряется «сырой» драйвер в колонке и в справочнике: штуки или база в ₽ (выручка). */
export type GeoDriverQuantityKind = 'count' | 'money';

export type GeoAllocationDriverDef = {
  key: GeoAllocationDriverKey;
  shortLabel: string;
  fullLabel: string;
  /** Доли по `market_countries.label_ru` (как в исходных таблицах; сумма ≈ 100, нормализуем при применении). */
  weightsByLabelRu: Partial<Record<string, number>>;
  /**
   * Справочные количества (шт.) или база выручки (₽) — только для колонки «Драйвер» и таблицы в UI.
   * Распределение процентов в сплите всегда по `weightsByLabelRu`, не по этим числам.
   */
  countsByLabelRu: Partial<Record<string, number>>;
  quantityKind: GeoDriverQuantityKind;
  /** Заголовок числовой колонки в таблице (кратко). */
  quantityColumnTitle: string;
};

/** Веса согласованы со справочником `market_countries` (миграции seed + Drinkit). */
const WEIGHTS_PIZZERIAS: Partial<Record<string, number>> = {
  Россия: 76.07,
  Drinkit: 0,
  Казахстан: 8.6,
  Узбекистан: 1.32,
  ОАЭ: 0.97,
  Катар: 0.14,
  Ирак: 0.07,
  Морокко: 0,
  Турция: 1.94,
  Литва: 0.42,
  Эстония: 0.35,
  Румыния: 0.83,
  Словения: 0.28,
  Польша: 0.42,
  Сербия: 0.21,
  Кипр: 0.28,
  Хорватия: 0.14,
  Болгария: 0.28,
  Монтенегро: 0.21,
  Молдова: 0,
  Испания: 0.07,
  Беларусь: 3.74,
  Таджикистан: 0.62,
  Грузия: 0.21,
  Азербайджан: 0.14,
  Нигерия: 1.25,
  Кыргызстан: 0.97,
  Армения: 0.28,
  Индонезия: 0.07,
};

/** Штуки: пиццерии по стране (всего сеть 1442). */
const COUNTS_PIZZERIAS: Partial<Record<string, number>> = {
  Россия: 1097,
  Drinkit: 0,
  Казахстан: 124,
  Узбекистан: 19,
  ОАЭ: 14,
  Катар: 2,
  Ирак: 1,
  Морокко: 0,
  Турция: 28,
  Литва: 6,
  Эстония: 5,
  Румыния: 12,
  Словения: 4,
  Польша: 6,
  Сербия: 3,
  Кипр: 4,
  Хорватия: 2,
  Болгария: 4,
  Монтенегро: 3,
  Молдова: 0,
  Испания: 1,
  Беларусь: 54,
  Таджикистан: 9,
  Грузия: 3,
  Азербайджан: 2,
  Нигерия: 18,
  Кыргызстан: 14,
  Армения: 4,
  Индонезия: 1,
};

const WEIGHTS_UNITS_MIXED: Partial<Record<string, number>> = {
  Россия: 67.14,
  Drinkit: 11.75,
  Казахстан: 7.59,
  Узбекистан: 1.16,
  ОАЭ: 0.86,
  Катар: 0.12,
  Ирак: 0.06,
  Морокко: 0,
  Турция: 1.71,
  Литва: 0.37,
  Эстония: 0.31,
  Румыния: 0.73,
  Словения: 0.24,
  Польша: 0.37,
  Сербия: 0.18,
  Кипр: 0.24,
  Хорватия: 0.12,
  Болгария: 0.24,
  Монтенегро: 0.18,
  Молдова: 0,
  Испания: 0.06,
  Беларусь: 3.3,
  Таджикистан: 0.55,
  Грузия: 0.18,
  Азербайджан: 0.12,
  Нигерия: 1.1,
  Кыргызстан: 0.86,
  Армения: 0.24,
  Индонезия: 0.06,
};

/** Штуки: юниты (пиццерии + кофейни), всего 1634; по Drinkit — сумма бренда. */
const COUNTS_UNITS_MIXED: Partial<Record<string, number>> = {
  Россия: 1097,
  Drinkit: 192,
  Казахстан: 124,
  Узбекистан: 19,
  ОАЭ: 14,
  Катар: 2,
  Ирак: 1,
  Морокко: 0,
  Турция: 28,
  Литва: 6,
  Эстония: 5,
  Румыния: 12,
  Словения: 4,
  Польша: 6,
  Сербия: 3,
  Кипр: 4,
  Хорватия: 2,
  Болгария: 4,
  Монтенегро: 3,
  Молдова: 0,
  Испания: 1,
  Беларусь: 54,
  Таджикистан: 9,
  Грузия: 3,
  Азербайджан: 2,
  Нигерия: 18,
  Кыргызстан: 14,
  Армения: 4,
  Индонезия: 1,
};

const WEIGHTS_PARTNERS: Partial<Record<string, number>> = {
  Россия: 56.09,
  Drinkit: 15.87,
  Казахстан: 5.9,
  Узбекистан: 1.11,
  ОАЭ: 4.06,
  Катар: 0.74,
  Ирак: 0.37,
  Морокко: 0,
  Турция: 0.74,
  Литва: 0.74,
  Эстония: 0.37,
  Румыния: 0.74,
  Словения: 0.37,
  Польша: 0.37,
  Сербия: 0.74,
  Кипр: 0.37,
  Хорватия: 0.37,
  Болгария: 0.37,
  Монтенегро: 0.74,
  Молдова: 0.37,
  Испания: 0.74,
  Беларусь: 1.85,
  Таджикистан: 0.37,
  Грузия: 0.74,
  Азербайджан: 0.37,
  Нигерия: 0.74,
  Кыргызстан: 0.74,
  Армения: 0.37,
  Индонезия: 0.37,
};

/** Штуки: партнёры по стране (всего 271 в исходной сводке). */
const COUNTS_PARTNERS: Partial<Record<string, number>> = {
  Россия: 152,
  Drinkit: 43,
  Казахстан: 16,
  Узбекистан: 3,
  ОАЭ: 11,
  Катар: 2,
  Ирак: 1,
  Морокко: 0,
  Турция: 2,
  Литва: 2,
  Эстония: 1,
  Румыния: 2,
  Словения: 1,
  Польша: 1,
  Сербия: 2,
  Кипр: 1,
  Хорватия: 1,
  Болгария: 1,
  Монтенегро: 2,
  Молдова: 1,
  Испания: 2,
  Беларусь: 5,
  Таджикистан: 1,
  Грузия: 2,
  Азербайджан: 1,
  Нигерия: 2,
  Кыргызстан: 2,
  Армения: 1,
  Индонезия: 1,
};

const WEIGHTS_REVENUE: Partial<Record<string, number>> = {
  Россия: 80.9979,
  Drinkit: 4.32,
  Казахстан: 6.9089,
  Узбекистан: 0.2737,
  ОАЭ: 0.2461,
  Катар: 0.0352,
  Ирак: 0.0176,
  Морокко: 0,
  Турция: 0.5886,
  Литва: 0.105,
  Эстония: 0.5683,
  Румыния: 0.5565,
  Словения: 0.1833,
  Польша: 0,
  Сербия: 0.0981,
  Кипр: 0.1388,
  Хорватия: 0.0711,
  Болгария: 0.0743,
  Монтенегро: 0.0227,
  Молдова: 0,
  Испания: 0.0114,
  Беларусь: 2.8722,
  Таджикистан: 0.4766,
  Грузия: 0.1729,
  Азербайджан: 0.0386,
  Нигерия: 0.158,
  Кыргызстан: 0.8346,
  Армения: 0.1722,
  Индонезия: 0.0218,
};

/** База выручки по стране, ₽ (из той же сводки, что и доли %). */
const COUNTS_REVENUE_RUB: Partial<Record<string, number>> = {
  Россия: 10_834_110_307,
  Drinkit: 577_801_864,
  Казахстан: 924_121_638,
  Узбекистан: 36_604_733,
  ОАЭ: 32_923_958,
  Катар: 4_703_423,
  Ирак: 2_351_711,
  Морокко: 0,
  Турция: 78_724_645,
  Литва: 14_043_479,
  Эстония: 76_018_761,
  Румыния: 74_431_249,
  Словения: 24_516_746,
  Польша: 0,
  Сербия: 13_117_993,
  Кипр: 18_559_841,
  Хорватия: 9_510_602,
  Болгария: 9_934_075,
  Монтенегро: 3_032_057,
  Молдова: 0,
  Испания: 1_531_239,
  Беларусь: 384_184_290,
  Таджикистан: 63_751_050,
  Грузия: 23_122_315,
  Азербайджан: 5_162_505,
  Нигерия: 21_129_840,
  Кыргызстан: 111_637_740,
  Армения: 23_038_495,
  Индонезия: 2_921_464,
};

export const GEO_ALLOCATION_DRIVERS: readonly GeoAllocationDriverDef[] = [
  {
    key: 'geo_driver_pizzerias',
    shortLabel: 'Пиццерии',
    fullLabel: 'Драйвер: пиццерии (доли по числу пиццерий)',
    weightsByLabelRu: WEIGHTS_PIZZERIAS,
    countsByLabelRu: COUNTS_PIZZERIAS,
    quantityKind: 'count',
    quantityColumnTitle: 'Драйвер',
  },
  {
    key: 'geo_driver_units_mixed',
    shortLabel: 'Юниты',
    fullLabel: 'Драйвер: юниты (пиццерии + кофейни)',
    weightsByLabelRu: WEIGHTS_UNITS_MIXED,
    countsByLabelRu: COUNTS_UNITS_MIXED,
    quantityKind: 'count',
    quantityColumnTitle: 'Драйвер',
  },
  {
    key: 'geo_driver_partners',
    shortLabel: 'Партнёры',
    fullLabel: 'Драйвер: партнёры',
    weightsByLabelRu: WEIGHTS_PARTNERS,
    countsByLabelRu: COUNTS_PARTNERS,
    quantityKind: 'count',
    quantityColumnTitle: 'Драйвер',
  },
  {
    key: 'geo_driver_revenue',
    shortLabel: 'Выручка',
    fullLabel: 'Драйвер: выручка',
    weightsByLabelRu: WEIGHTS_REVENUE,
    countsByLabelRu: COUNTS_REVENUE_RUB,
    quantityKind: 'money',
    quantityColumnTitle: 'Драйвер',
  },
] as const;

export const GEO_ALLOCATION_DRIVER_BY_KEY = Object.fromEntries(
  GEO_ALLOCATION_DRIVERS.map((d) => [d.key, d])
) as Readonly<Record<GeoAllocationDriverKey, GeoAllocationDriverDef>>;

/**
 * Пересчитывает проценты по текущему набору строк (только `kind: 'country'`), в порядке как в сплите.
 * Не поддерживает строки `kind: 'cluster'` — вернёт null.
 */
export function applyGeoDriverToSplitEntries(
  entries: GeoCostSplitEntry[],
  countriesById: Map<string, MarketCountryRow>,
  driver: GeoAllocationDriverDef
): GeoCostSplitEntry[] | null {
  if (entries.some((e) => e.kind === 'cluster')) return null;
  if (!entries.every((e) => e.kind === 'country')) return null;

  /** Только доли пресета в %; количества из `countsByLabelRu` не смешиваем с расчётом сплита. */
  const raws = entries.map((e) => {
    const c = countriesById.get(e.countryId);
    if (!c) return 0;
    const w = driver.weightsByLabelRu[c.label_ru];
    return typeof w === 'number' && Number.isFinite(w) ? w : 0;
  });
  const sumRaw = raws.reduce((a, b) => a + b, 0);
  if (sumRaw <= 0) return null;

  const percents = rubleAmountsFromGeoPercents(100, raws);
  return entries.map((e, i) => ({ ...e, percent: percents[i] ?? 0 }));
}

export function getDriverDefByStorageKey(key: string | undefined): GeoAllocationDriverDef | undefined {
  if (!key) return undefined;
  return GEO_ALLOCATION_DRIVER_BY_KEY[key as GeoAllocationDriverKey];
}

export function getDriverQuantityForLabel(
  def: GeoAllocationDriverDef,
  labelRu: string | null | undefined
): number | undefined {
  if (!labelRu) return undefined;
  const q = def.countsByLabelRu[labelRu];
  return typeof q === 'number' && Number.isFinite(q) ? q : undefined;
}

export function formatDriverQuantityDisplay(
  def: GeoAllocationDriverDef,
  value: number | undefined
): string {
  if (value === undefined || !Number.isFinite(value)) return '—';
  const s = Math.round(value).toLocaleString('ru-RU');
  if (def.quantityKind === 'money') return `${s}\u00A0₽`;
  return s;
}

export type DriverReferenceTableRow = {
  labelRu: string;
  clusterKey: string;
  sortOrder: number;
  quantity: number;
  quantityKind: GeoDriverQuantityKind;
  /** Доля в пресете, % — для сопоставления с базой. */
  presetPercent: number;
};

/** Полный перечень: база драйвера (штуки или ₽) и доля пресета % — в порядке справочника рынков. */
export function buildDriverReferenceTable(
  def: GeoAllocationDriverDef,
  countries: MarketCountryRow[]
): DriverReferenceTableRow[] {
  const byLabel = new Map(countries.map((c) => [c.label_ru, c]));
  const labelSet = new Set([
    ...Object.keys(def.countsByLabelRu),
    ...Object.keys(def.weightsByLabelRu),
  ]);
  const out: DriverReferenceTableRow[] = [];
  for (const labelRu of labelSet) {
    const rawQ = def.countsByLabelRu[labelRu];
    const rawW = def.weightsByLabelRu[labelRu];
    const quantity = typeof rawQ === 'number' && Number.isFinite(rawQ) ? rawQ : 0;
    const presetPercent = typeof rawW === 'number' && Number.isFinite(rawW) ? rawW : 0;
    if (!labelRu.trim()) continue;
    const c = byLabel.get(labelRu);
    out.push({
      labelRu,
      clusterKey: c?.cluster_key ?? '—',
      sortOrder: typeof c?.sort_order === 'number' ? c.sort_order : 100000,
      quantity,
      quantityKind: def.quantityKind,
      presetPercent,
    });
  }
  out.sort((a, b) => a.sortOrder - b.sortOrder || a.labelRu.localeCompare(b.labelRu, 'ru'));
  return out;
}

/** @deprecated используйте formatDriverQuantityDisplay / доля пресета из таблицы */
export function formatDriverReferencePercent(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '—';
  return value.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}
