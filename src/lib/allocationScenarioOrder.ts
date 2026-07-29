export type AllocationScenarioDropPosition = 'before' | 'after';

export function reorderAllocationScenarioTeamIds({
  teamIds,
  draggedTeamId,
  targetTeamId,
  position,
}: {
  teamIds: string[];
  draggedTeamId: string;
  targetTeamId: string;
  position: AllocationScenarioDropPosition;
}): string[] {
  if (
    draggedTeamId === targetTeamId ||
    !teamIds.includes(draggedTeamId) ||
    !teamIds.includes(targetTeamId)
  ) {
    return teamIds;
  }

  const nextTeamIds = teamIds.filter((id) => id !== draggedTeamId);
  const targetIndex = nextTeamIds.indexOf(targetTeamId);
  nextTeamIds.splice(
    targetIndex + (position === 'after' ? 1 : 0),
    0,
    draggedTeamId
  );
  return nextTeamIds;
}
