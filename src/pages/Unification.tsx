import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import AdminHeader from '@/components/admin/AdminHeader';
import { UnificationOverview } from '@/components/unification/UnificationOverview';
import { UnificationLinkMode } from '@/components/unification/UnificationLinkMode';
import { UnificationManage } from '@/components/unification/UnificationManage';
import { CrossOverviewLevelToggles } from '@/components/unification/CrossOverviewLevelToggles';
import ScopeSelector from '@/components/admin/ScopeSelector';
import { getTeamsForUnits, getUniqueUnits } from '@/lib/adminDataManager';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/hooks/useAuth';
import { useAccess } from '@/hooks/useAccess';
import { canManageCrossInitiatives } from '@/lib/crossInitiativeAccess';
import { useBudgetTruth2026 } from '@/hooks/useBudgetTruth2026';
import { useInitiatives, extractQuartersFromData } from '@/hooks/useInitiatives';
import {
  useCrossInitiatives,
  useCrossInitiativeMutations,
  getCrossName,
} from '@/hooks/useCrossInitiatives';
import { crossIdsForInitiative, membersForCross } from '@/lib/crossInitiativeModel';
import { getCurrentQuarter } from '@/lib/quarterUtils';
import type { AdminDataRow } from '@/lib/adminDataManager';

function mutationErrorMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) {
    const msg = String((e as { message: string }).message);
    if (msg) return msg;
  }
  return 'Не удалось связать инициативы';
}

type LastMemberState = {
  crossId: string;
  initiativeId: string;
  crossName: string;
};

export default function Unification() {
  const { user } = useAuth();
  const { canViewMoney, hasEarlyAccess } = useAccess();
  const canManageCrosses = canManageCrossInitiatives({ hasEarlyAccess });
  const { data: budgetTruth2026 } = useBudgetTruth2026();

  const budgetCtx = useMemo(
    () => ({ baselineByTeam: budgetTruth2026?.baselineByTeam }),
    [budgetTruth2026?.baselineByTeam]
  );

  const { data: allInitiatives = [], isLoading: initiativesLoading } = useInitiatives({
    tableAll: true,
  });
  const { data: bundle, isLoading: crossLoading } = useCrossInitiatives({
    enabled: canManageCrosses,
  });
  const mutations = useCrossInitiativeMutations();

  const [mode, setMode] = useState<'overview' | 'link' | 'manage'>('overview');
  const [lastMember, setLastMember] = useState<LastMemberState | null>(null);
  const [overviewShowUnits, setOverviewShowUnits] = useState(false);
  const [overviewShowTeams, setOverviewShowTeams] = useState(false);
  const [overviewShowInitiatives, setOverviewShowInitiatives] = useState(false);
  const [overviewFocusedPathLength, setOverviewFocusedPathLength] = useState(0);
  const [portfolioFilterUnits, setPortfolioFilterUnits] = useState<string[]>([]);
  const [portfolioFilterTeams, setPortfolioFilterTeams] = useState<string[]>([]);

  const portfolioFilterUnitOptions = useMemo(
    () => getUniqueUnits(allInitiatives),
    [allInitiatives]
  );
  const portfolioFilterTeamOptions = useMemo(
    () => getTeamsForUnits(allInitiatives, portfolioFilterUnits),
    [allInitiatives, portfolioFilterUnits]
  );

  const resetOverviewLevels = useCallback(() => {
    setOverviewShowUnits(false);
    setOverviewShowTeams(false);
    setOverviewShowInitiatives(false);
  }, []);

  const availableQuarters = useMemo(
    () => extractQuartersFromData(allInitiatives),
    [allInitiatives]
  );
  const selectedQuarters = useMemo(() => {
    const current = getCurrentQuarter();
    if (availableQuarters.includes(current)) return [current];
    return availableQuarters.length > 0
      ? [availableQuarters[availableQuarters.length - 1]]
      : [];
  }, [availableQuarters]);

  const initiativeById = useMemo(() => {
    const m = new Map<string, AdminDataRow>();
    for (const r of allInitiatives) m.set(r.id, r);
    return m;
  }, [allInitiatives]);

  const members = bundle?.members ?? [];
  const isLoading = initiativesLoading || crossLoading;

  const performLink = useCallback(
    async (
      linkMode: 'create' | 'add' | 'add_both',
      sourceId: string,
      targetId: string,
      crossId?: string,
      name?: string
    ): Promise<string | void> => {
      try {
        if (linkMode === 'create' && name) {
          const newId = await mutations.createCrossWithMembers.mutateAsync({
            name,
            initiativeIds: [sourceId, targetId],
            createdBy: user?.email ?? null,
          });
          toast.success(`Создана «${name.trim()}»`);
          return newId;
        }
        if (linkMode === 'add' && crossId) {
          const anchorIn = crossIdsForInitiative(sourceId, members).includes(crossId);
          const initiativeId = anchorIn ? targetId : sourceId;
          await mutations.addToCross.mutateAsync({
            crossInitiativeId: crossId,
            initiativeId,
          });
          toast.success(`Добавлено в «${getCrossName(crossId, bundle)}»`);
          return crossId;
        }
        if (linkMode === 'add_both' && crossId) {
          if (!crossIdsForInitiative(sourceId, members).includes(crossId)) {
            await mutations.addToCross.mutateAsync({
              crossInitiativeId: crossId,
              initiativeId: sourceId,
            });
          }
          if (!crossIdsForInitiative(targetId, members).includes(crossId)) {
            await mutations.addToCross.mutateAsync({
              crossInitiativeId: crossId,
              initiativeId: targetId,
            });
          }
          toast.success(`Обе в «${getCrossName(crossId, bundle)}»`);
          return crossId;
        }
      } catch (e) {
        toast.error(mutationErrorMessage(e));
      }
    },
    [mutations, user?.email, bundle, members]
  );

  const requestRemoveFromCross = (crossId: string, initiativeId: string) => {
    const inCross = membersForCross(crossId, members);
    if (inCross.length <= 1) {
      setLastMember({
        crossId,
        initiativeId,
        crossName: getCrossName(crossId, bundle),
      });
      return;
    }
    return mutations.removeFromCross
      .mutateAsync({ crossInitiativeId: crossId, initiativeId })
      .then(() => toast.success('Инициатива отвязана'))
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : 'Ошибка');
        throw e;
      });
  };

  if (!canManageCrosses) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Нет доступа к разделу «Объединение».</p>
      </div>
    );
  }

  return (
    <div className="unification-workspace h-screen overflow-hidden bg-background flex flex-col">
      <AdminHeader currentView="unification" hasData={allInitiatives.length > 0} />

      <Tabs
        value={mode}
        onValueChange={(v) => setMode(v as 'overview' | 'link' | 'manage')}
        className="flex flex-col flex-1 min-h-0"
      >
        <div className="px-4 sm:px-6 pt-3 shrink-0 flex flex-wrap items-center gap-x-4 gap-y-2">
          <TabsList className="bg-muted/80 shrink-0">
            <TabsTrigger
              value="overview"
              className="data-[state=active]:bg-[#7B5FA8] data-[state=active]:text-white data-[state=active]:shadow-sm"
            >
              Кросс-инициативы
            </TabsTrigger>
            <TabsTrigger
              value="link"
              className="data-[state=active]:bg-[#7B5FA8] data-[state=active]:text-white data-[state=active]:shadow-sm"
            >
              Связать
            </TabsTrigger>
            <TabsTrigger
              value="manage"
              className="data-[state=active]:bg-[#7B5FA8] data-[state=active]:text-white data-[state=active]:shadow-sm"
            >
              Связи
            </TabsTrigger>
          </TabsList>
          {(mode === 'overview' || mode === 'manage') && (
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2 lg:flex-nowrap">
              <ScopeSelector
                units={portfolioFilterUnitOptions}
                teams={portfolioFilterTeamOptions}
                selectedUnits={portfolioFilterUnits}
                selectedTeams={portfolioFilterTeams}
                onUnitsChange={setPortfolioFilterUnits}
                onTeamsChange={setPortfolioFilterTeams}
                allData={allInitiatives}
                adminViewAll
                selectionMode="multi"
              />
              {mode === 'overview' && (
                <CrossOverviewLevelToggles
                  showUnits={overviewShowUnits}
                  showTeams={overviewShowTeams}
                  showInitiatives={overviewShowInitiatives}
                  focusedPathLength={overviewFocusedPathLength}
                  onShowUnitsChange={(v) => {
                    setOverviewShowUnits(v);
                    if (!v) {
                      setOverviewShowTeams(false);
                      setOverviewShowInitiatives(false);
                    }
                  }}
                  onShowTeamsChange={(v) => {
                    setOverviewShowTeams(v);
                    if (v) setOverviewShowUnits(true);
                    if (!v) setOverviewShowInitiatives(false);
                  }}
                  onShowInitiativesChange={(v) => {
                    setOverviewShowInitiatives(v);
                    if (v) setOverviewShowUnits(true);
                  }}
                />
              )}
            </div>
          )}
        </div>

        <TabsContent
          value="overview"
          className="flex-1 min-h-0 mt-0 flex flex-col data-[state=inactive]:hidden"
        >
          <UnificationOverview
            bundle={bundle}
            allInitiatives={allInitiatives}
            initiativeById={initiativeById}
            selectedQuarters={selectedQuarters}
            showMoney={canViewMoney}
            isLoading={isLoading}
            budgetCtx={budgetCtx}
            filterUnits={portfolioFilterUnits}
            filterTeams={portfolioFilterTeams}
            levelState={{
              showUnits: overviewShowUnits,
              showTeams: overviewShowTeams,
              showInitiatives: overviewShowInitiatives,
            }}
            onLevelStateReset={resetOverviewLevels}
            onFocusedPathLengthChange={setOverviewFocusedPathLength}
            onAutoEnableUnits={() => setOverviewShowUnits(true)}
            onAutoEnableTeams={() => setOverviewShowTeams(true)}
            onAutoEnableInitiatives={() => setOverviewShowInitiatives(true)}
            onAutoDisableUnits={() => setOverviewShowUnits(false)}
            onAutoDisableTeams={() => setOverviewShowTeams(false)}
            onAutoDisableInitiatives={() => setOverviewShowInitiatives(false)}
            onSwitchToLink={() => setMode('link')}
            onAddToCross={async (crossId, initiativeId) => {
              try {
                await mutations.addToCross.mutateAsync({
                  crossInitiativeId: crossId,
                  initiativeId,
                });
                toast.success('Инициатива добавлена');
              } catch (e) {
                toast.error(mutationErrorMessage(e));
                throw e;
              }
            }}
            onRemoveFromCross={requestRemoveFromCross}
            addingToCross={mutations.addToCross.isPending}
            onSaveShares={async (updates) => {
              await mutations.updateMemberShares.mutateAsync(updates);
              toast.success('Доли сохранены');
            }}
            onSaveCrossName={async (crossId, name) => {
              await mutations.updateCrossName.mutateAsync({ id: crossId, name });
              toast.success('Название сохранено');
            }}
            onSaveCrossDescription={async (crossId, description) => {
              await mutations.updateCrossDescription.mutateAsync({
                id: crossId,
                description,
              });
              toast.success('Описание сохранено');
            }}
            removing={mutations.removeFromCross.isPending}
            savingShares={mutations.updateMemberShares.isPending}
            savingCrossName={mutations.updateCrossName.isPending}
            savingCrossDescription={mutations.updateCrossDescription.isPending}
          />
        </TabsContent>

        <TabsContent
          value="link"
          className="flex-1 min-h-0 mt-0 flex flex-col data-[state=inactive]:hidden"
        >
          <UnificationLinkMode
            allInitiatives={allInitiatives}
            bundle={bundle}
            initiativeById={initiativeById}
            selectedQuarters={selectedQuarters}
            showMoney={canViewMoney}
            isLoading={isLoading}
            budgetCtx={budgetCtx}
            onLink={(sourceId, targetId, linkMode, crossId, name) =>
              performLink(linkMode, sourceId, targetId, crossId, name)
            }
          />
        </TabsContent>

        <TabsContent
          value="manage"
          className="flex-1 min-h-0 mt-0 flex flex-col data-[state=inactive]:hidden"
        >
          <UnificationManage
            bundle={bundle}
            initiativeById={initiativeById}
            isLoading={isLoading}
            filterUnits={portfolioFilterUnits}
            filterTeams={portfolioFilterTeams}
            onRemove={requestRemoveFromCross}
            removing={mutations.removeFromCross.isPending}
          />
        </TabsContent>
      </Tabs>

      <AlertDialog open={lastMember != null} onOpenChange={(o) => !o && setLastMember(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить кросс-инициативу?</AlertDialogTitle>
            <AlertDialogDescription>
              Последняя инициатива в «{lastMember?.crossName}». Группа будет удалена.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!lastMember) return;
                void mutations.removeFromCross
                  .mutateAsync({
                    crossInitiativeId: lastMember.crossId,
                    initiativeId: lastMember.initiativeId,
                  })
                  .then(() => {
                    toast.success('Удалено');
                    setLastMember(null);
                  });
              }}
            >
              Отвязать
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
