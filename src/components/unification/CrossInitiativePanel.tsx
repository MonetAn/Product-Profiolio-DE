import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { AdminDataRow } from '@/lib/adminDataManager';
import {
  contributionToCross,
  crossInitiativeTotalCost,
  membersForCross,
  type CrossInitiativeRow,
  type CrossInitiativesBundle,
} from '@/lib/crossInitiativeModel';
import { formatBudget } from '@/lib/dataManager';
import type { UnificationBudgetContext } from '@/lib/unificationBudget';
import { DescriptionMarkdown } from '@/components/DescriptionMarkdown';
import { AddCrossMemberDialog } from '@/components/unification/AddCrossMemberDialog';
import {
  UnlinkCrossMemberDialog,
  type UnlinkCrossMemberTarget,
} from '@/components/unification/UnlinkCrossMemberDialog';
import { Link2Off, Loader2, Pencil, Plus } from 'lucide-react';

interface CrossInitiativePanelProps {
  cross: CrossInitiativeRow;
  bundle: CrossInitiativesBundle;
  allInitiatives: AdminDataRow[];
  initiativeById: Map<string, AdminDataRow>;
  selectedQuarters: string[];
  budgetPeriodLabel?: string;
  budgetCtx?: UnificationBudgetContext;
  showMoney: boolean;
  onEditInitiativeShares: (initiativeId: string) => void;
  onAddMember: (initiativeId: string) => Promise<void>;
  onRemoveFromCross: (crossId: string, initiativeId: string) => void;
  onSaveName: (name: string) => Promise<void>;
  onSaveDescription: (description: string) => Promise<void>;
  savingName?: boolean;
  savingDescription?: boolean;
  removing?: boolean;
  addingMember?: boolean;
}

export function CrossInitiativePanel({
  cross,
  bundle,
  allInitiatives,
  initiativeById,
  selectedQuarters,
  budgetPeriodLabel,
  budgetCtx,
  showMoney,
  onEditInitiativeShares,
  onAddMember,
  onRemoveFromCross,
  onSaveName,
  onSaveDescription,
  savingName,
  savingDescription,
  removing,
  addingMember,
}: CrossInitiativePanelProps) {
  const members = useMemo(
    () => membersForCross(cross.id, bundle.members),
    [cross.id, bundle.members]
  );

  const memberIds = useMemo(
    () => new Set(members.map((m) => m.initiative_id)),
    [members]
  );

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [unlinkTarget, setUnlinkTarget] = useState<UnlinkCrossMemberTarget | null>(null);
  const [nameDraft, setNameDraft] = useState(cross.name);
  const [descriptionDraft, setDescriptionDraft] = useState(cross.description ?? '');
  const [editingDescription, setEditingDescription] = useState(false);

  useEffect(() => {
    setNameDraft(cross.name);
    setDescriptionDraft(cross.description ?? '');
    setEditingDescription(false);
  }, [cross.id, cross.name, cross.description]);

  const crossTotal = useMemo(
    () =>
      crossInitiativeTotalCost(
        cross.id,
        bundle.members,
        initiativeById,
        selectedQuarters,
        budgetCtx
      ),
    [cross.id, bundle.members, initiativeById, selectedQuarters, budgetCtx]
  );

  const handleSaveName = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === cross.name) return;
    await onSaveName(trimmed);
  };

  const handleSaveDescription = async () => {
    const next = descriptionDraft.trim();
    if (next === (cross.description ?? '')) {
      setEditingDescription(false);
      return;
    }
    await onSaveDescription(next);
    setEditingDescription(false);
  };

  return (
    <div className="p-5 space-y-5 overflow-y-auto h-full">
      <div className="space-y-2">
        <Input
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={() => void handleSaveName()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleSaveName();
          }}
          className="text-lg font-semibold h-auto py-1.5 border-transparent shadow-none px-0 focus-visible:ring-0 focus-visible:border-border"
          aria-label="Название кросс-инициативы"
        />
        {showMoney && (
          <p className="text-sm text-muted-foreground tabular-nums">
            Стоимость за период
            {budgetPeriodLabel ? ` (${budgetPeriodLabel})` : ''}: {formatBudget(crossTotal)}
          </p>
        )}
      </div>

      <div>
        <p className="text-sm font-medium mb-1.5">Описание</p>
        {editingDescription ? (
          <div className="space-y-2">
            <Textarea
              value={descriptionDraft}
              onChange={(e) => setDescriptionDraft(e.target.value)}
              rows={4}
              className="text-sm"
              placeholder="Зачем объединены эти инициативы…"
            />
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                disabled={savingDescription}
                onClick={() => void handleSaveDescription()}
              >
                {savingDescription ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Сохранить'
                )}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setDescriptionDraft(cross.description ?? '');
                  setEditingDescription(false);
                }}
              >
                Отмена
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="w-full text-left text-sm text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setEditingDescription(true)}
          >
            {cross.description?.trim() ? (
              <DescriptionMarkdown content={cross.description} />
            ) : (
              <span className="italic">Добавить описание…</span>
            )}
          </button>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-sm font-medium">Участники</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => setAddDialogOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            Добавить
          </Button>
        </div>
        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground">Пока никого не связано.</p>
        ) : (
          <ul className="space-y-2">
            {members.map((m) => {
              const row = initiativeById.get(m.initiative_id);
              const title = row?.initiative ?? m.initiative_name;
              const contribution = contributionToCross(
                m.initiative_id,
                cross.id,
                bundle.members,
                initiativeById,
                selectedQuarters,
                budgetCtx
              );
              return (
                <li
                  key={m.id}
                  className="rounded-lg border border-border px-3 py-2.5 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold leading-tight truncate">{title}</p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {m.unit} · {m.team || 'Без команды'}
                        {showMoney && (
                          <span className="tabular-nums">
                            {' '}
                            · {formatBudget(contribution)} ({m.cost_share_pct}%)
                          </span>
                        )}
                        {!showMoney && (
                          <span className="tabular-nums"> · {m.cost_share_pct}%</span>
                        )}
                      </p>
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
                          crossId: cross.id,
                          initiativeId: m.initiative_id,
                          crossName: cross.name,
                          initiativeName: title,
                        })
                      }
                    >
                      <Link2Off className="h-4 w-4" />
                    </Button>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-8 gap-1.5"
                    onClick={() => onEditInitiativeShares(m.initiative_id)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Распределить доли
                  </Button>
                </li>
              );
            })}
          </ul>
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

      <AddCrossMemberDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        crossName={cross.name}
        allInitiatives={allInitiatives}
        memberInitiativeIds={memberIds}
        adding={addingMember}
        onAddMembers={async (ids) => {
          for (const id of ids) {
            await onAddMember(id);
          }
        }}
      />
    </div>
  );
}
