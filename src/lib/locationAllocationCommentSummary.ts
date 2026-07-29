import type { AdminDataRow } from '@/lib/adminDataManager';
import { locationTeamKey } from '@/lib/locationAllocationPlanning';

export type LocationAllocationCommentCount = {
  openCount: number;
  unreadCount: number;
};

export type LocationAllocationCommentSummary = {
  byInitiative: Map<string, LocationAllocationCommentCount>;
  /** Собственные комментарии команды, без комментариев её инициатив. */
  byTeamDirect: Map<string, LocationAllocationCommentCount>;
  /** Комментарии инициатив команды, без собственных комментариев команды. */
  byTeamInitiatives: Map<string, LocationAllocationCommentCount>;
  /** Агрегат собственных комментариев команды и комментариев её инициатив. */
  byTeam: Map<string, LocationAllocationCommentCount>;
  byUnit: Map<string, LocationAllocationCommentCount>;
};

export type LocationAllocationSummaryComment = {
  id: string;
  scopeType: 'initiative' | 'team' | 'unit';
  initiativeId: string | null;
  scopeUnit: string | null;
  scopeTeam: string | null;
  isOpen: boolean;
  unreadCount: number;
};

export const EMPTY_LOCATION_COMMENT_COUNT: LocationAllocationCommentCount = {
  openCount: 0,
  unreadCount: 0,
};

function increment(
  index: Map<string, LocationAllocationCommentCount>,
  key: string | null | undefined,
  openCount: number,
  unreadCount: number
) {
  const normalizedKey = key?.trim();
  if (!normalizedKey) return;
  const previous = index.get(normalizedKey) ?? EMPTY_LOCATION_COMMENT_COUNT;
  index.set(normalizedKey, {
    openCount: previous.openCount + openCount,
    unreadCount: previous.unreadCount + unreadCount,
  });
}

export function buildLocationAllocationCommentSummary(
  comments: LocationAllocationSummaryComment[],
  initiatives: AdminDataRow[]
): LocationAllocationCommentSummary {
  const byInitiative = new Map<string, LocationAllocationCommentCount>();
  const byTeamDirect = new Map<string, LocationAllocationCommentCount>();
  const byTeamInitiatives = new Map<string, LocationAllocationCommentCount>();
  const byTeam = new Map<string, LocationAllocationCommentCount>();
  const byUnit = new Map<string, LocationAllocationCommentCount>();
  const initiativesById = new Map(initiatives.map((row) => [row.id, row]));

  for (const comment of comments) {
    const openCount = comment.isOpen ? 1 : 0;
    if (comment.scopeType === 'initiative' && comment.initiativeId) {
      increment(
        byInitiative,
        comment.initiativeId,
        openCount,
        comment.unreadCount
      );
      const initiative = initiativesById.get(comment.initiativeId);
      if (!initiative) continue;
      const team = initiative.team.trim() || 'Без команды';
      const teamKey = locationTeamKey(initiative.unit, team);
      increment(
        byTeamInitiatives,
        teamKey,
        openCount,
        comment.unreadCount
      );
      increment(
        byTeam,
        teamKey,
        openCount,
        comment.unreadCount
      );
      increment(byUnit, initiative.unit, openCount, comment.unreadCount);
      continue;
    }

    if (comment.scopeType === 'team' && comment.scopeUnit) {
      const teamKey = locationTeamKey(
        comment.scopeUnit,
        comment.scopeTeam?.trim() || 'Без команды'
      );
      increment(
        byTeamDirect,
        teamKey,
        openCount,
        comment.unreadCount
      );
      increment(
        byTeam,
        teamKey,
        openCount,
        comment.unreadCount
      );
      increment(byUnit, comment.scopeUnit, openCount, comment.unreadCount);
      continue;
    }

    if (comment.scopeType === 'unit') {
      increment(
        byUnit,
        comment.scopeUnit,
        openCount,
        comment.unreadCount
      );
    }
  }

  return {
    byInitiative,
    byTeamDirect,
    byTeamInitiatives,
    byTeam,
    byUnit,
  };
}
