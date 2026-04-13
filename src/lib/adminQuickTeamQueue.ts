/** Очередь команд для пошагового заполнения (одна команда в URL за раз). */

export const QUICK_TEAM_QUEUE_KEY = 'admin_quick_team_queue_v2';
const LEGACY_QUEUE_KEY = 'admin_quick_team_queue_v1';

export type QuickTeamQueueState = {
  unit: string;
  /** Порядок прохождения */
  teams: string[];
  currentIndex: number;
  /** Выбранные кварталы для заполнения по имени команды (перед шагами quick flow). */
  quartersByTeam: Record<string, string[]>;
  /** Экран состава перед выбором кварталов пройден (по команде). */
  rosterPreflightDoneByTeam?: Record<string, boolean>;
};

function normalizeRosterPreflightDone(raw: unknown): Record<string, boolean> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v === true) out[k] = true;
  }
  return out;
}

function normalizeQuartersByTeam(raw: unknown): Record<string, string[]> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(v)) continue;
    const arr = v.filter((x) => typeof x === 'string' && x.trim()) as string[];
    if (arr.length > 0) out[k] = arr;
  }
  return out;
}

export function readQuickTeamQueue(): QuickTeamQueueState | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    let raw = sessionStorage.getItem(QUICK_TEAM_QUEUE_KEY);
    let fromLegacy = false;
    if (!raw) {
      raw = sessionStorage.getItem(LEGACY_QUEUE_KEY);
      fromLegacy = true;
    }
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
    const quartersByTeam = fromLegacy ? {} : normalizeQuartersByTeam(p.quartersByTeam);
    const rosterPreflightDoneByTeam = fromLegacy
      ? {}
      : normalizeRosterPreflightDone(p.rosterPreflightDoneByTeam);

    const state: QuickTeamQueueState = {
      unit: p.unit,
      teams: p.teams,
      currentIndex: Math.max(0, Math.min(p.currentIndex, p.teams.length - 1)),
      quartersByTeam,
      rosterPreflightDoneByTeam,
    };

    if (fromLegacy) {
      try {
        sessionStorage.removeItem(LEGACY_QUEUE_KEY);
        sessionStorage.setItem(QUICK_TEAM_QUEUE_KEY, JSON.stringify(state));
      } catch {
        /* ignore */
      }
    }

    return state;
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
    sessionStorage.removeItem(LEGACY_QUEUE_KEY);
  } catch {
    /* ignore */
  }
}

export function initQuickTeamQueue(unit: string, teams: string[]): QuickTeamQueueState {
  return { unit, teams: [...teams], currentIndex: 0, quartersByTeam: {} };
}
