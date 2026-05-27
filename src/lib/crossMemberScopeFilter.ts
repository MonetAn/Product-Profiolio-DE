import type { AdminDataRow } from '@/lib/adminDataManager';
import type { CrossInitiativeMemberRow } from '@/lib/crossInitiativeModel';

export function crossMemberMatchesScope(
  m: CrossInitiativeMemberRow,
  row: AdminDataRow | undefined,
  selectedUnits: string[],
  selectedTeams: string[]
): boolean {
  if (selectedUnits.length === 0 && selectedTeams.length === 0) return true;
  const unit = m.unit || row?.unit || '';
  const team = m.team || row?.team || '';
  if (selectedUnits.length > 0 && !selectedUnits.includes(unit)) return false;
  if (selectedTeams.length > 0 && !selectedTeams.includes(team)) return false;
  return true;
}

export function crossScopeFilterActive(
  selectedUnits: string[],
  selectedTeams: string[]
): boolean {
  return selectedUnits.length > 0 || selectedTeams.length > 0;
}
