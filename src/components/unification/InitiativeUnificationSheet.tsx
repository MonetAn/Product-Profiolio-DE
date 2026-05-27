import { useEffect, useMemo, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AdminDataRow } from '@/lib/adminDataManager';
import {
  crossInitiativeTotalCost,
  initiativeFullCost,
  initiativeRowToRaw,
  membersForInitiative,
  type CrossInitiativeMemberRow,
  type CrossInitiativesBundle,
} from '@/lib/crossInitiativeModel';
import { calculateBudget, formatBudget } from '@/lib/dataManager';
import { DescriptionMarkdown } from '@/components/DescriptionMarkdown';
import { getCrossName } from '@/hooks/useCrossInitiatives';
import {
  UnlinkCrossMemberDialog,
  type UnlinkCrossMemberTarget,
} from '@/components/unification/UnlinkCrossMemberDialog';
import { Loader2, Unlink } from 'lucide-react';

interface InitiativeUnificationSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initiativeId: string | null;
  initiativeRow: AdminDataRow | undefined;
  bundle: CrossInitiativesBundle | undefined;
  initiativeById: Map<string, AdminDataRow>;
  selectedQuarters: string[];
  showMoney: boolean;
  onRemoveFromCross: (crossId: string, initiativeId: string) => void;
  onSaveShares: (updates: { id: string; cost_share_pct: number }[]) => Promise<void>;
  removing?: boolean;
  savingShares?: boolean;
}

export function InitiativeUnificationSheet({
  open,
  onOpenChange,
  initiativeId,
  initiativeRow,
  bundle,
  initiativeById,
  selectedQuarters,
  showMoney,
  onRemoveFromCross,
  onSaveShares,
  removing,
  savingShares,
}: InitiativeUnificationSheetProps) {
  const [unlinkTarget, setUnlinkTarget] = useState<UnlinkCrossMemberTarget | null>(null);

  const memberships = useMemo(() => {
    if (!initiativeId || !bundle) return [];
    return membersForInitiative(initiativeId, bundle.members);
  }, [initiativeId, bundle]);

  const [shareDraft, setShareDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const m of memberships) {
      next[m.id] = String(m.cost_share_pct);
    }
    setShareDraft(next);
  }, [memberships]);

  const shareSum = useMemo(() => {
    return memberships.reduce((s, m) => {
      const v = Number(shareDraft[m.id]);
      return s + (Number.isFinite(v) ? v : 0);
    }, 0);
  }, [memberships, shareDraft]);

  const fullCost = initiativeRow
    ? initiativeFullCost(initiativeRow, selectedQuarters)
    : 0;

  const handleSaveShares = async () => {
    if (Math.abs(shareSum - 100) > 0.05) return;
    const updates = memberships.map((m) => ({
      id: m.id,
      cost_share_pct: Number(shareDraft[m.id]) || 0,
    }));
    await onSaveShares(updates);
  };

  const title = initiativeRow?.initiative ?? memberships[0]?.initiative_name ?? 'Инициатива';
  const canViewDetails = memberships[0]?.can_view_details ?? Boolean(initiativeRow);

  return (
    <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="pr-8">{title}</SheetTitle>
          <SheetDescription>
            {initiativeRow
              ? `${initiativeRow.unit} · ${initiativeRow.team || 'Без команды'}`
              : memberships[0]
                ? `${memberships[0].unit} · ${memberships[0].team || 'Без команды'}`
                : ''}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {showMoney && canViewDetails && initiativeRow && (
            <div className="rounded-lg border border-border bg-secondary/40 px-4 py-3">
              <div className="text-xs text-muted-foreground">Стоимость за период</div>
              <div className="text-lg font-semibold tabular-nums">
                {formatBudget(fullCost)}
              </div>
            </div>
          )}

          {canViewDetails && initiativeRow?.description?.trim() ? (
            <div>
              <h3 className="text-sm font-medium mb-2">Описание</h3>
              <DescriptionMarkdown content={initiativeRow.description} />
            </div>
          ) : !canViewDetails ? (
            <p className="text-sm text-muted-foreground">
              Нет доступа к полному описанию этой инициативы. Участие в кросс-инициативах видно ниже.
            </p>
          ) : null}

          <div>
            <h3 className="text-sm font-medium mb-3">Кросс-инициативы</h3>
            {memberships.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Не привязана к кросс-инициативам. Перетащите на другую инициативу в списке.
              </p>
            ) : (
              <ul className="space-y-4">
                {memberships.map((m) => {
                  const crossName = getCrossName(m.cross_initiative_id, bundle);
                  const contribution =
                    showMoney && initiativeRow
                      ? (fullCost * (Number(shareDraft[m.id]) || 0)) / 100
                      : null;
                  const crossTotal = bundle
                    ? crossInitiativeTotalCost(
                        m.cross_initiative_id,
                        bundle.members,
                        initiativeById,
                        selectedQuarters
                      )
                    : 0;
                  return (
                    <li
                      key={m.id}
                      className="rounded-lg border border-border p-3 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate">{crossName}</div>
                          {showMoney && contribution != null && (
                            <div className="text-xs text-muted-foreground tabular-nums">
                              Вклад: {formatBudget(contribution)}
                              {initiativeRow && (
                                <span className="ml-1">
                                  (зонтик всего: {formatBudget(crossTotal)})
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="shrink-0 h-8 w-8 text-muted-foreground hover:text-destructive"
                          disabled={removing}
                          onClick={() => {
                            if (!initiativeId) return;
                            setUnlinkTarget({
                              crossId: m.cross_initiative_id,
                              initiativeId,
                              crossName: getCrossName(m.cross_initiative_id, bundle),
                              initiativeName: title,
                            });
                          }}
                          aria-label="Отвязать"
                        >
                          <Unlink className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`share-${m.id}`} className="text-xs shrink-0">
                          Доля, %
                        </Label>
                        <Input
                          id={`share-${m.id}`}
                          type="number"
                          min={0.01}
                          max={100}
                          step={0.01}
                          className="h-8"
                          value={shareDraft[m.id] ?? ''}
                          onChange={(e) =>
                            setShareDraft((prev) => ({ ...prev, [m.id]: e.target.value }))
                          }
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {memberships.length > 1 && (
              <div className="mt-3 flex items-center justify-between gap-2">
                <span
                  className={`text-xs ${Math.abs(shareSum - 100) > 0.05 ? 'text-destructive' : 'text-muted-foreground'}`}
                >
                  Сумма долей: {shareSum.toFixed(2)}%
                </span>
                <Button
                  type="button"
                  size="sm"
                  disabled={
                    savingShares || Math.abs(shareSum - 100) > 0.05 || memberships.length === 0
                  }
                  onClick={() => void handleSaveShares()}
                >
                  {savingShares ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Сохранить доли'}
                </Button>
              </div>
            )}
          </div>

          {canViewDetails && initiativeRow && selectedQuarters.length > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-2">По кварталам</h3>
              <div className="text-sm space-y-1">
                {selectedQuarters.map((q) => {
                  const raw = initiativeRowToRaw(initiativeRow);
                  const qBudget = calculateBudget(
                    { ...raw, quarterlyData: { [q]: raw.quarterlyData[q] } },
                    [q]
                  );
                  if (!qBudget) return null;
                  return (
                    <div key={q} className="flex justify-between text-muted-foreground">
                      <span>{q}</span>
                      <span className="tabular-nums text-foreground">
                        {showMoney ? formatBudget(qBudget) : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>

    <UnlinkCrossMemberDialog
      target={unlinkTarget}
      onOpenChange={(open) => {
        if (!open) setUnlinkTarget(null);
      }}
      removing={removing}
      onConfirm={(crossId, id) => onRemoveFromCross(crossId, id)}
    />
    </>
  );
}
