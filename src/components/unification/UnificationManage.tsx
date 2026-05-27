import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Link2Off, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { AdminDataRow } from '@/lib/adminDataManager';
import { membersForCross, type CrossInitiativesBundle } from '@/lib/crossInitiativeModel';
import {
  crossMemberMatchesScope,
  crossScopeFilterActive,
} from '@/lib/crossMemberScopeFilter';
import { LogoLoader } from '@/components/LogoLoader';
import { cn } from '@/lib/utils';
import {
  UnlinkCrossMemberDialog,
  type UnlinkCrossMemberTarget,
} from '@/components/unification/UnlinkCrossMemberDialog';
import { AddCrossMemberDialog } from '@/components/unification/AddCrossMemberDialog';

interface UnificationManageProps {
  bundle: CrossInitiativesBundle | undefined;
  allInitiatives: AdminDataRow[];
  initiativeById: Map<string, AdminDataRow>;
  filterUnits: string[];
  filterTeams: string[];
  isLoading: boolean;
  onRemove: (crossId: string, initiativeId: string) => void;
  onAddMembers: (crossId: string, initiativeIds: string[]) => Promise<void>;
  removing?: boolean;
  adding?: boolean;
}

export function UnificationManage({
  bundle,
  allInitiatives,
  initiativeById,
  filterUnits,
  filterTeams,
  isLoading,
  onRemove,
  onAddMembers,
  removing,
  adding,
}: UnificationManageProps) {
  const [unlinkTarget, setUnlinkTarget] = useState<UnlinkCrossMemberTarget | null>(null);
  const [expandedCrossIds, setExpandedCrossIds] = useState<Set<string>>(() => new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [addDialogCross, setAddDialogCross] = useState<{ id: string; name: string } | null>(
    null
  );

  const scopeActive = crossScopeFilterActive(filterUnits, filterTeams);

  const groups = useMemo(() => {
    const crosses = [...(bundle?.crossInitiatives ?? [])].sort((a, b) =>
      a.name.localeCompare(b.name, 'ru')
    );
    const members = bundle?.members ?? [];
    return crosses
      .map((cross) => {
        const allMembers = [...membersForCross(cross.id, members)].sort((a, b) =>
          (a.initiative_name || '').localeCompare(b.initiative_name || '', 'ru')
        );
        const hasScopeMatch =
          !scopeActive ||
          allMembers.some((m) =>
            crossMemberMatchesScope(
              m,
              initiativeById.get(m.initiative_id),
              filterUnits,
              filterTeams
            )
          );
        return { cross, members: allMembers, hasScopeMatch };
      })
      .filter((g) => g.members.length > 0 && g.hasScopeMatch);
  }, [bundle, filterUnits, filterTeams, initiativeById, scopeActive]);

  const filteredGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(({ cross, members }) => {
      if (cross.name.toLowerCase().includes(q)) return true;
      return members.some((m) => {
        const row = initiativeById.get(m.initiative_id);
        const title = (row?.initiative ?? m.initiative_name ?? '').toLowerCase();
        const unit = (m.unit || row?.unit || '').toLowerCase();
        const team = (m.team || row?.team || '').toLowerCase();
        return title.includes(q) || unit.includes(q) || team.includes(q);
      });
    });
  }, [groups, searchQuery, initiativeById]);

  const addDialogMemberIds = useMemo(() => {
    if (!addDialogCross) return new Set<string>();
    const m = membersForCross(addDialogCross.id, bundle?.members ?? []);
    return new Set(m.map((x) => x.initiative_id));
  }, [addDialogCross, bundle?.members]);

  const toggleCross = (crossId: string, open: boolean) => {
    setExpandedCrossIds((prev) => {
      const next = new Set(prev);
      if (open) next.add(crossId);
      else next.delete(crossId);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <LogoLoader className="h-8 w-8" />
      </div>
    );
  }

  const hasAnyLinks = (bundle?.members?.length ?? 0) > 0;

  return (
    <>
      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex-1 min-h-0 overflow-auto px-4 py-4 max-w-3xl">
          {!hasAnyLinks ? (
            <p className="text-sm text-muted-foreground text-center py-16 px-6">
              Нет связей. Создайте их на вкладке «Создать новую».
            </p>
          ) : (
            <>
              <div className="relative mb-4">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Поиск по кросс-инициативе, инициативе, юниту, команде…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {groups.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-16 px-6">
                  {scopeActive
                    ? 'Нет кросс-инициатив с участием выбранного юнита или команды. Смените фильтр.'
                    : 'Нет связей. Создайте их на вкладке «Создать новую».'}
                </p>
              ) : filteredGroups.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-16 px-6">
                  По запросу «{searchQuery.trim()}» ничего не найдено.
                </p>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground mb-4">
                    Кросс-инициативы с участниками. Раскройте группу, чтобы увидеть инициативы и
                    добавить новые.
                  </p>
                  <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
                    {filteredGroups.map(({ cross, members }) => {
                      const open = expandedCrossIds.has(cross.id);
                      return (
                        <Collapsible
                          key={cross.id}
                          open={open}
                          onOpenChange={(next) => toggleCross(cross.id, next)}
                        >
                          <CollapsibleTrigger asChild>
                            <button
                              type="button"
                              className={cn(
                                'flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors',
                                'hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                                open && 'bg-muted/30'
                              )}
                            >
                              {open ? (
                                <ChevronDown
                                  className="h-4 w-4 shrink-0 text-muted-foreground"
                                  aria-hidden
                                />
                              ) : (
                                <ChevronRight
                                  className="h-4 w-4 shrink-0 text-muted-foreground"
                                  aria-hidden
                                />
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="font-semibold text-sm truncate">{cross.name}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {members.length}{' '}
                                  {members.length === 1
                                    ? 'инициатива'
                                    : members.length < 5
                                      ? 'инициативы'
                                      : 'инициатив'}
                                </p>
                              </div>
                              <span className="shrink-0 rounded-full bg-[#7B5FA8]/15 px-2.5 py-0.5 text-xs font-medium text-[#7B5FA8] tabular-nums">
                                {members.length}
                              </span>
                            </button>
                          </CollapsibleTrigger>

                          <CollapsibleContent>
                            <ul className="border-t border-border bg-muted/15">
                              {members.map((m) => {
                                const row = initiativeById.get(m.initiative_id);
                                const title = row?.initiative ?? m.initiative_name;
                                const unitTeam = `${m.unit || row?.unit || '—'} · ${m.team || row?.team || 'Без команды'}`;
                                const matchesScope =
                                  scopeActive &&
                                  crossMemberMatchesScope(m, row, filterUnits, filterTeams);
                                return (
                                  <li
                                    key={m.id}
                                    className={cn(
                                      'flex items-start justify-between gap-3 border-b border-border/60 px-4 py-3 last:border-b-0 pl-11',
                                      matchesScope && 'bg-[#7B5FA8]/8'
                                    )}
                                  >
                                    <div className="min-w-0 flex-1">
                                      <p className="text-sm font-medium leading-tight truncate">
                                        {title}
                                      </p>
                                      <p className="text-sm text-muted-foreground mt-0.5 truncate">
                                        {unitTeam}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <span className="text-sm tabular-nums text-muted-foreground w-12 text-right">
                                        {m.cost_share_pct}%
                                      </span>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                        disabled={removing}
                                        title="Отвязать от кросс-инициативы"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setUnlinkTarget({
                                            crossId: cross.id,
                                            initiativeId: m.initiative_id,
                                            crossName: cross.name,
                                            initiativeName: title,
                                          });
                                        }}
                                      >
                                        <Link2Off className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                            <div className="border-t border-border bg-muted/10 px-4 py-3 pl-11">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="gap-1.5 border-[#7B5FA8]/40 text-[#7B5FA8] hover:bg-[#7B5FA8]/10"
                                disabled={adding}
                                onClick={() =>
                                  setAddDialogCross({ id: cross.id, name: cross.name })
                                }
                              >
                                <Plus className="h-4 w-4" />
                                Добавить инициативу
                              </Button>
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      <UnlinkCrossMemberDialog
        target={unlinkTarget}
        onOpenChange={(open) => {
          if (!open) setUnlinkTarget(null);
        }}
        removing={removing}
        onConfirm={(crossId, initiativeId) => onRemove(crossId, initiativeId)}
      />

      {addDialogCross ? (
        <AddCrossMemberDialog
          open={addDialogCross != null}
          onOpenChange={(open) => {
            if (!open) setAddDialogCross(null);
          }}
          crossName={addDialogCross.name}
          allInitiatives={allInitiatives}
          memberInitiativeIds={addDialogMemberIds}
          adding={adding}
          onAddMembers={(ids) => onAddMembers(addDialogCross.id, ids)}
        />
      ) : null}
    </>
  );
}
