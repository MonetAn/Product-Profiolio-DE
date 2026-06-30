/** Базовый URL embed-страницы (без auth). */
export function buildPublicEmbedUrl(slug: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const basePath = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  return `${origin}${basePath}/embed/${encodeURIComponent(slug)}`;
}

export type EmbedView = 'budget' | 'timeline';

export const KNOWN_EMBED_SLUGS = ['tech-platform', 'b2b-pizza'] as const;

export type KnownEmbedSlug = (typeof KNOWN_EMBED_SLUGS)[number];
