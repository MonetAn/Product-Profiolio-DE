export const INITIATIVE_TAGS = [
  'Стабильность системы',
  'Надёжность',
  'Стоимость хостинга и оптимизация инфраструктуры',
  'Безопасность',
  'Инструменты для ускорения разработки',
  'Авторизация',
] as const;

export type InitiativeTag = (typeof INITIATIVE_TAGS)[number];

const INITIATIVE_TAG_SET = new Set<string>(INITIATIVE_TAGS);

/** Оставляет только известные теги, убирает дубли и сохраняет порядок справочника. */
export function normalizeInitiativeTags(value: unknown): InitiativeTag[] {
  if (!Array.isArray(value)) return [];
  const selected = new Set(
    value.filter((item): item is string => typeof item === 'string' && INITIATIVE_TAG_SET.has(item))
  );
  return INITIATIVE_TAGS.filter((tag) => selected.has(tag));
}
