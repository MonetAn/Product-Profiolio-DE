import { AlertTriangle } from 'lucide-react';

/**
 * Temporary warning banner.
 * Set to false after hotfix release or remove the component usage in Index.
 */
export const SHOW_DASHBOARD_DATA_WARNING = true;

export function DashboardDataWarning() {
  return (
    <div className="mb-3 w-full border-y-2 border-amber-300 bg-amber-400 px-6 py-3 shadow-lg">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-950" />
        <div className="text-sm font-semibold text-amber-950">
          Данные на дашборде сейчас могут быть некорректными. Обновим их в ближайшее время.
        </div>
      </div>
    </div>
  );
}
