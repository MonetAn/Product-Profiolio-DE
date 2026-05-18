import { formatBuildLabel } from '@/lib/buildInfo';

/** Сверка версии UI с GitHub Pages (main). */
export function AdminBuildStamp() {
  return (
    <span
      className="hidden shrink-0 text-[10px] tabular-nums text-muted-foreground sm:inline"
      title="Хеш коммита main. Должен совпадать с продом после git pull и деплоя."
    >
      Сборка {formatBuildLabel()}
    </span>
  );
}
