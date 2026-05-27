import { crossIdsForInitiative } from '@/lib/crossInitiativeModel';
import type { CrossInitiativeMemberRow } from '@/lib/crossInitiativeModel';

export type LinkAction =
  | { type: 'noop'; reason: 'same_initiative' | 'already_linked'; crossId?: string }
  | { type: 'create'; sourceId: string; targetId: string }
  | { type: 'add_to_cross'; crossId: string; initiativeId: string }
  | { type: 'add_both_to_cross'; crossId: string; sourceId: string; targetId: string }
  | { type: 'choose'; sourceId: string; targetId: string; sourceCrossIds: string[]; targetCrossIds: string[] };

/**
 * Решает, что сделать при «Связать» якорь → цель.
 * activeCrossId — выбранная в сайдбаре кросс-инициатива (контекст «собираю сюда»).
 */
export function resolveLinkAction(
  anchorId: string,
  targetId: string,
  members: CrossInitiativeMemberRow[],
  activeCrossId: string | null
): LinkAction {
  if (anchorId === targetId) {
    return { type: 'noop', reason: 'same_initiative' };
  }

  const anchorCrosses = crossIdsForInitiative(anchorId, members);
  const targetCrosses = crossIdsForInitiative(targetId, members);
  const shared = anchorCrosses.filter((id) => targetCrosses.includes(id));
  if (shared.length > 0) {
    return { type: 'noop', reason: 'already_linked', crossId: shared[0] };
  }

  const anchorUnlinked = anchorCrosses.length === 0;
  const targetUnlinked = targetCrosses.length === 0;

  if (activeCrossId) {
    const anchorInActive = anchorCrosses.includes(activeCrossId);
    const targetInActive = targetCrosses.includes(activeCrossId);

    if (anchorInActive && targetUnlinked) {
      return { type: 'add_to_cross', crossId: activeCrossId, initiativeId: targetId };
    }
    if (targetInActive && anchorUnlinked) {
      return { type: 'add_to_cross', crossId: activeCrossId, initiativeId: anchorId };
    }
    if (anchorUnlinked && targetUnlinked) {
      return {
        type: 'add_both_to_cross',
        crossId: activeCrossId,
        sourceId: anchorId,
        targetId,
      };
    }
  }

  if (anchorUnlinked && targetUnlinked) {
    return { type: 'create', sourceId: anchorId, targetId };
  }

  if (anchorCrosses.length === 1 && targetUnlinked) {
    return { type: 'add_to_cross', crossId: anchorCrosses[0], initiativeId: targetId };
  }

  if (targetCrosses.length === 1 && anchorUnlinked) {
    return { type: 'add_to_cross', crossId: targetCrosses[0], initiativeId: anchorId };
  }

  return {
    type: 'choose',
    sourceId: anchorId,
    targetId,
    sourceCrossIds: anchorCrosses,
    targetCrossIds: targetCrosses,
  };
}
