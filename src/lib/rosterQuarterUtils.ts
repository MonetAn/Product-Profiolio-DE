import type { TeamSnapshot } from '@/hooks/useTeamSnapshots';
import type { Person } from '@/lib/peopleDataManager';

/** Один сотрудник числится в снимках двух разных команд за один квартал в том же юните. */
export type RosterQuarterConflict = {
  personId: string;
  personName: string;
  teams: string[];
};

/**
 * Конфликты по кварталу в рамках юнита: person_id встречается более чем в одной команде.
 * `excludeTeam` не участвует в «чужих» претензиях для текущей команды (для подсказки лидеру).
 */
export function findRosterConflictsForUnitQuarter(
  unit: string,
  quarter: string,
  snapshots: TeamSnapshot[],
  peopleById: Map<string, Person>
): RosterQuarterConflict[] {
  const byTeam = snapshots.filter((s) => s.unit === unit && s.quarter === quarter);
  const personToTeams = new Map<string, Set<string>>();
  for (const s of byTeam) {
    for (const pid of s.person_ids || []) {
      if (!personToTeams.has(pid)) personToTeams.set(pid, new Set());
      personToTeams.get(pid)!.add(s.team);
    }
  }
  const out: RosterQuarterConflict[] = [];
  for (const [personId, teamsSet] of personToTeams) {
    if (teamsSet.size < 2) continue;
    const teams = [...teamsSet].sort();
    const person = peopleById.get(personId);
    out.push({
      personId,
      personName: person?.full_name ?? personId.slice(0, 8),
      teams,
    });
  }
  return out.sort((a, b) => a.personName.localeCompare(b.personName, 'ru'));
}

/** Все person_id, у которых в каком-либо (unit, quarter) числятся в двух+ командах. */
export function findAllRosterConflictingPersonIds(
  snapshots: TeamSnapshot[],
  peopleById: Map<string, Person>
): Set<string> {
  const pairs = new Set<string>();
  for (const s of snapshots) {
    if (!s.unit || !s.quarter) continue;
    pairs.add(`${s.unit}\0${s.quarter}`);
  }
  const ids = new Set<string>();
  for (const key of pairs) {
    const [unit, quarter] = key.split('\0');
    for (const c of findRosterConflictsForUnitQuarter(unit, quarter, snapshots, peopleById)) {
      ids.add(c.personId);
    }
  }
  return ids;
}

/**
 * Сотрудники из справочника (юнит совпадает или пусто в HR), не попавшие ни в один снимок команды юнита за квартал.
 * Не «полная Свишка» — только записи в `people`.
 */
export function findPeopleUnassignedInUnitQuarter(
  unit: string,
  quarter: string,
  snapshots: TeamSnapshot[],
  allPeople: Person[]
): Person[] {
  const unitSnapshots = snapshots.filter((s) => s.unit === unit && s.quarter === quarter);
  const assigned = new Set<string>();
  for (const s of unitSnapshots) {
    for (const id of s.person_ids || []) assigned.add(id);
  }
  return allPeople.filter((p) => {
    if (assigned.has(p.id)) return false;
    if (p.terminated_at) return false;
    const u = (p.unit || '').trim();
    return u === unit.trim() || u === '';
  });
}
