import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AdminDataRow } from '@/lib/adminDataManager';
import {
  crossInitiativeTotalCost,
  initiativeFullCost,
  membersForInitiative,
  type CrossInitiativesBundle,
} from '@/lib/crossInitiativeModel';
import {
  initiativeTreemapValue,
  type UnificationBudgetContext,
} from '@/lib/unificationBudget';
import { formatBudget } from '@/lib/dataManager';
import { DescriptionMarkdown } from '@/components/DescriptionMarkdown';
import { getCrossName } from '@/hooks/useCrossInitiatives';
import {
  UnlinkCrossMemberDialog,
  type UnlinkCrossMemberTarget,
} from '@/components/unification/UnlinkCrossMemberDialog';
import { ChevronDown, ChevronRight, Link2Off, Loader2 } from 'lucide-react';

interface InitiativeUnificationPanelProps {
  initiativeId: string;
  initiativeRow: AdminDataRow | undefined;
  bundle: CrossInitiativesBundle | undefined;
  initiativeById: Map<string, AdminDataRow>;
  selectedQuarters: string[];
  budgetCtx?: UnificationBudgetContext;
  showMoney: boolean;
  highlightCrossId?: string | null;
  onRemoveFromCross: (crossId: string, initiativeId: string) => void;
  onSaveShares: (updates: { id: string; cost_share_pct: number }[]) => Promise<void>;
  removing?: boolean;
  savingShares?: boolean;
}

export function InitiativeUnificationPanel({
  initiativeId,
  initiativeRow,
  bundle,
  initiativeById,
  selectedQuarters,
  budgetCtx,
  showMoney,
  highlightCrossId,
  onRemoveFromCross,
  onSaveShares,
  removing,
  savingShares,
}: InitiativeUnificationPanelProps) {
  const [unlinkTarget, setUnlinkTarget] = useState<UnlinkCrossMemberTarget | null>(null);

  const memberships = useMemo(() => {
    if (!initiativeId || !bundle) return [];
    return membersForInitiative(initiativeId, bundle.members);
  }, [initiativeId, bundle]);

  const [shareDraft, setShareDraft] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const m of memberships) {
      next[m.id] = String(m.cost_share_pct);
    }
    setShareDraft(next);
    setExpanded(true);
  }, [memberships]);

  const shareSum = useMemo(() => {
    return memberships.reduce((s, m) => {
      const v = Number(shareDraft[m.id]);
      return s + (Number.isFinite(v) ? v : 0);
    }, 0);
  }, [memberships, shareDraft]);

  const fullCost = initiativeRow
    ? Math.max(
        initiativeFullCost(initiativeRow, selectedQuarters, budgetCtx),
        initiativeTreemapValue(initiativeRow, selectedQuarters, budgetCtx)
      )
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
  const needsRebalance = memberships.length > 1;

  return (
    <div className="p-5 space-y-5 overflow-y-auto h-full">
      <div>
        <h2 className="text-lg font-semibold leading-tight">{title}</h2>
        {showMoney && canViewDetails && initiativeRow && (
          <p className="text-sm text-muted-foreground mt-1 tabular-nums">
            Стоимость за период: {formatBudget(fullCost)}
          </p>
        )}
      </div>

      {canViewDetails && initiativeRow?.description?.trim() ? (
        <div>
          <p className="text-sm font-medium mb-1.5">Описание</p>
          <div className="text-sm text-muted-foreground">
            <DescriptionMarkdown content={initiativeRow.description} />
          </div>
        </div>
      ) : !canViewDetails ? (
        <p className="text-sm text-muted-foreground">
          Нет доступа к полному описанию инициативы.
        </p>
      ) : null}

      <div>
        <button
          type="button"
          className="flex items-center gap-1.5 text-sm font-medium mb-2 w-full text-left"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0" />
          )}
          Распределение по кросс-инициативам
          {needsRebalance && (
            <span className="text-xs font-normal text-muted-foreground ml-1">
              (сумма 100%)
            </span>
          )}
        </button>

        {expanded && (
          <>
            {memberships.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Не привязана ни к одной кросс-инициативе.
              </p>
            ) : (
              <ul className="space-y-2">
                {memberships.map((m) => {
                  const crossName = getCrossName(m.cross_initiative_id, bundle);
                  const isHighlighted = highlightCrossId === m.cross_initiative_id;
                  const contribution =
                    showMoney && initiativeRow
                      ? (fullCost * (Number(shareDraft[m.id]) || 0)) / 100
                      : null;
                  const crossTotal = bundle
                    ? crossInitiativeTotalCost(
                        m.cross_initiative_id,
                        bundle.members,
                    initiativeById,
                    selectedQuarters,
                    budgetCtx
                  )
                    : 0;
                  return (
                    <li
                      key={m.id}
                      className={`rounded-lg border p-3 space-y-2 ${
                        isHighlighted ? 'border-primary/50 bg-primary/5' : 'border-border'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{crossName}</p>
                          {showMoney && contribution != null && (
                            <p className="text-sm text-muted-foreground tabular-nums mt-0.5">
                              Вклад {formatBudget(contribution)}
                              <span className="ml-1">
                                · зонтик {formatBudget(crossTotal)}
                              </span>
                            </p>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="shrink-0 h-8 w-8 text-muted-foreground hover:text-destructive"
                          title="Отвязать от кросс-инициативы"
                          disabled={removing}
                          onClick={() =>
                            setUnlinkTarget({
                              crossId: m.cross_initiative_id,
                              initiativeId,
                              crossName,
                              initiativeName: title,
                            })
                          }
                        >
                          <Link2Off className="h-4 w-4" />
                        </Button>
                      </div>
                      {needsRebalance && (
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
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {needsRebalance && (
              <div className="mt-3 flex items-center justify-between gap-2">
                <span
                  className={`text-xs ${
                    Math.abs(shareSum - 100) > 0.05 ? 'text-destructive' : 'text-muted-foreground'
                  }`}
                >
                  Сумма долей: {shareSum.toFixed(2)}%
                </span>
                <Button
                  type="button"
                  size="sm"
                  disabled={savingShares || Math.abs(shareSum - 100) > 0.05}
                  onClick={() => void handleSaveShares()}
                >
                  {savingShares ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Сохранить доли'
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      <UnlinkCrossMemberDialog
        target={unlinkTarget}
        onOpenChange={(open) => {
          if (!open) setUnlinkTarget(null);
        }}
        removing={removing}
        onConfirm={(crossId, initiativeId) => onRemoveFromCross(crossId, initiativeId)}
      />
    </div>
  );
}
