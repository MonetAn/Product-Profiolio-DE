/** Короткий хеш коммита, вшитый при сборке (vite define). Совпадает на проде и локально при одном main. */
export const BUILD_SHA = (import.meta.env.VITE_BUILD_SHA as string | undefined)?.trim() || 'dev';

export function formatBuildLabel(): string {
  return BUILD_SHA === 'dev' ? 'dev (не production build)' : BUILD_SHA;
}
