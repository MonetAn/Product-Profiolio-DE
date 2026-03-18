/** Очередь команд для пошагового заполнения (одна команда в URL за раз). */

export const QUICK_TEAM_QUEUE_KEY = 'admin_quick_team_queue_v1';

export type QuickTeamQueueState = {
  unit: string;
  /** Порядок прохождения */
  teams: string[];
  currentIndex: number;
};

export function readQuickTeamQueue(): QuickTeamQueueState | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(QUICK_TEAM_QUEUE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<QuickTeamQueueState>;
    if (
      typeof p.unit !== 'string' ||
      !Array.isArray(p.teams) ||
      p.teams.some((t) => typeof t !== 'string') ||
      typeof p.currentIndex !== 'number'
    ) {
      return null;
    }
    return {
      unit: p.unit,
      teams: p.teams,
      currentIndex: Math.max(0, Math.min(p.currentIndex, p.teams.length - 1)),
    };
  } catch {
    return null;
  }
}

export function writeQuickTeamQueue(state: QuickTeamQueueState): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(QUICK_TEAM_QUEUE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota */
  }
}

export function clearQuickTeamQueue(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(QUICK_TEAM_QUEUE_KEY);
  } catch {
    /* ignore */
  }
}

export function initQuickTeamQueue(unit: string, teams: string[]): QuickTeamQueueState {
  return { unit, teams: [...teams], currentIndex: 0 };
}
