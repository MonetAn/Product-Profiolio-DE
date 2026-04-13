import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, ExternalLink, Info, Pencil } from 'lucide-react';
import { TreemapContainer } from '@/components/treemap';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  type AdminDataRow,
  getQuickFlowCardOnlyIssuesForQuarters,
  getMissingInitiativeFields,
  INITIATIVE_TYPES,
  STAKEHOLDERS_LIST,
} from '@/lib/adminDataManager';
import { buildEffortTreemapPreviewModel } from '@/lib/adminEffortTreemapPreviewModel';
import { convertFromDB } from '@/lib/dataManager';
import type { TreeNode } from '@/lib/dataManager';
import { InitiativePeekModal } from '@/components/InitiativePeekModal';
import { compareQuarters, filterQuartersInRange } from '@/lib/quarterUtils';
import { cn } from '@/lib/utils';

const PREVIEW_ROOT = 'quick-review-root';

type DraftField =
  | 'initiative'
  | 'initiativeType'
  | 'stakeholdersList'
  | 'description'
  | 'documentationLink'
  | 'isTimelineStub';

type Props = {
  rows: AdminDataRow[];
  fillQuarters: string[];
  quartersCatalog: string[];
  onInitiativeDraftChange?: (id: string, field: DraftField, value: string | string[] | boolean) => void;
};

const RequiredLabel = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <Label className={cn('text-sm font-medium', className)}>
    {children} <span className="text-red-500">*</span>
  </Label>
);

/** Рядом с подписью обязательного поля: «не заполнено» (паттерн alert-in-circle). */
function RequiredFieldAttention({ show, fieldLabel }: { show: boolean; fieldLabel: string }) {
  if (!show) return null;
  return (
    <span
      className="inline-flex shrink-0 text-destructive"
      title={`Обязательное поле: укажите ${fieldLabel}`}
    >
      <AlertCircle className="h-4 w-4" strokeWidth={2.25} aria-hidden />
      <span className="sr-only">Не заполнено: {fieldLabel}</span>
    </span>
  );
}

function applyReviewFlags(children: TreeNode[], issueIds: Set<string>): TreeNode[] {
  return children.map((n) => {
    const id = n.adminInitiativeRowId;
    if (!id || n.name === 'Нераспределено') {
      return { ...n, adminQuickReviewIssue: false, adminQuickReviewMissing: undefined };
    }
    const has = issueIds.has(id);
    return {
      ...n,
      adminQuickReviewIssue: has,
      adminQuickReviewMissing: undefined,
    };
  });
}

export function AdminQuickFlowReviewTreemapStep({
  rows,
  fillQuarters,
  quartersCatalog,
  onInitiativeDraftChange,
}: Props) {
  const draft = onInitiativeDraftChange;

  const [previewSelectedQuarters, setPreviewSelectedQuarters] = useState<string[]>([]);
  const [rangeAnchor, setRangeAnchor] = useState<string | null>(null);
  const [hoverQuarter, setHoverQuarter] = useState<string | null>(null);

  const catalogKey = quartersCatalog.join('|');
  const fillSortedKey = useMemo(
    () => [...fillQuarters].filter(Boolean).sort(compareQuarters).join('|'),
    [fillQuarters]
  );

  useEffect(() => {
    setRangeAnchor(null);
    setHoverQuarter(null);
    const fromScenario = [...fillQuarters]
      .filter((q) => quartersCatalog.includes(q))
      .sort(compareQuarters);
    if (fromScenario.length > 0) {
      setPreviewSelectedQuarters(fromScenario);
    } else if (quartersCatalog.length > 0) {
      setPreviewSelectedQuarters([...quartersCatalog].sort(compareQuarters));
    } else {
      setPreviewSelectedQuarters([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fillQuarters / quartersCatalog синхронны с fillSortedKey / catalogKey
  }, [catalogKey, fillSortedKey]);

  const previewSortedQs = useMemo(
    () => [...previewSelectedQuarters].filter(Boolean).sort(compareQuarters),
    [previewSelectedQuarters]
  );

  const previewQuartersBand = useMemo(() => {
    if (!rangeAnchor || !hoverQuarter) return null;
    return filterQuartersInRange(rangeAnchor, hoverQuarter, quartersCatalog);
  }, [rangeAnchor, hoverQuarter, quartersCatalog]);

  const handleQuarterClick = useCallback(
    (q: string) => {
      if (rangeAnchor == null) {
        setRangeAnchor(q);
        setPreviewSelectedQuarters([q]);
      } else {
        setPreviewSelectedQuarters(filterQuartersInRange(rangeAnchor, q, quartersCatalog));
        setRangeAnchor(null);
      }
      setHoverQuarter(null);
    },
    [rangeAnchor, quartersCatalog]
  );

  const previewValidationIssues = useMemo(
    () => getQuickFlowCardOnlyIssuesForQuarters(rows, previewSortedQs),
    [rows, previewSortedQs]
  );

  const issueIds = useMemo(
    () => new Set(previewValidationIssues.map((i) => i.id)),
    [previewValidationIssues]
  );

  const model = useMemo(
    () => buildEffortTreemapPreviewModel(rows, previewSortedQs),
    [rows, previewSortedQs]
  );

  const treeData: TreeNode = useMemo(() => {
    const children = applyReviewFlags(model.treeChildren, issueIds);
    return { name: PREVIEW_ROOT, isRoot: true, children };
  }, [model.treeChildren, issueIds]);

  const getColor = model.getPreviewColor;

  const rawRowsForPeek = useMemo(() => convertFromDB(rows).rawData, [rows]);

  const [peekRowId, setPeekRowId] = useState<string | null>(null);
  const peekRawRow = useMemo(
    () => (peekRowId ? rawRowsForPeek.find((r) => r.adminInitiativeRowId === peekRowId) ?? null : null),
    [peekRowId, rawRowsForPeek]
  );

  /** Первое окно (peek): сразу показать, чего не хватает по правилам карточки для сценария. */
  const peekMissingCardFields = useMemo(() => {
    if (!peekRowId) return undefined;
    const r = rows.find((x) => x.id === peekRowId);
    if (!r) return undefined;
    return getMissingInitiativeFields(r);
  }, [peekRowId, rows]);

  const [dialogRowId, setDialogRowId] = useState<string | null>(null);
  const dialogRow = useMemo(
    () => (dialogRowId ? rows.find((r) => r.id === dialogRowId) ?? null : null),
    [dialogRowId, rows]
  );

  const [localName, setLocalName] = useState('');
  const [localDescription, setLocalDescription] = useState('');
  const [localDocLink, setLocalDocLink] = useState('');
  const [localStakeholders, setLocalStakeholders] = useState<string[]>([]);

  useEffect(() => {
    if (!dialogRow) return;
    setLocalStakeholders(dialogRow.stakeholdersList || []);
    setLocalName(dialogRow.initiative || '');
    setLocalDescription(dialogRow.description || '');
    setLocalDocLink(dialogRow.documentationLink || '');
  }, [dialogRow?.id]);

  const dialogMergedRow = useMemo((): AdminDataRow | null => {
    if (!dialogRow) return null;
    return {
      ...dialogRow,
      initiative: localName,
      description: localDescription,
      documentationLink: localDocLink,
      stakeholdersList: localStakeholders,
    };
  }, [dialogRow, localName, localDescription, localDocLink, localStakeholders]);

  const dialogCardMissingLabels = useMemo(
    () => (dialogMergedRow ? getMissingInitiativeFields(dialogMergedRow) : []),
    [dialogMergedRow]
  );

  const missingCardType = dialogCardMissingLabels.includes('Тип');
  const missingCardStakeholders = dialogCardMissingLabels.includes('Стейкх.');
  const missingCardDescription = dialogCardMissingLabels.includes('Описание');

  const treemapViewKey = `quick-flow-review-${previewSortedQs.join(',')}-${model.contentKey.slice(0, 80)}`;

  const handleStakeholderToggle = (stakeholder: string, checked: boolean) => {
    if (!dialogRow || !draft) return;
    const newList = checked
      ? [...localStakeholders, stakeholder]
      : localStakeholders.filter((s) => s !== stakeholder);
    setLocalStakeholders(newList);
    draft(dialogRow.id, 'stakeholdersList', newList);
  };

  const scenarioCardIssues = useMemo(
    () => getQuickFlowCardOnlyIssuesForQuarters(rows, fillQuarters),
    [rows, fillQuarters]
  );
  const hasScenarioCardIssues = scenarioCardIssues.length > 0;

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-lg font-semibold leading-snug">
          Проверка заполнения обязательных полей в бюджете
        </h2>
        {hasScenarioCardIssues ? (
          <span
            className="inline-flex items-center gap-2 rounded-md border-2 border-destructive/70 bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive dark:border-destructive/60 dark:bg-destructive/15"
            role="status"
          >
            <span
              className="h-3 w-4 shrink-0 rounded-sm bg-background shadow-[inset_0_0_0_2px_hsl(0_72%_48%)]"
              aria-hidden
            />
            Незаполнены обязательные поля
          </span>
        ) : null}
      </div>

      <p className="text-sm text-muted-foreground">
        Ниже можно посмотреть, как будет выглядеть ваша вкладка «Бюджет».
      </p>

      {quartersCatalog.length > 0 ? (
        <div className="flex flex-col gap-1 rounded-xl border border-border/80 bg-muted/10 p-2 dark:bg-muted/5">
          <div
            className="flex min-w-0 flex-col gap-1"
            role="group"
            aria-label="Кварталы превью treemap: первое нажатие — начало диапазона, второе — конец"
          >
            <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto overflow-y-hidden py-0.5 [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5">
              {quartersCatalog.map((q) => {
                const on = previewSelectedQuarters.includes(q);
                const inBand = previewQuartersBand != null && previewQuartersBand.includes(q);
                const isRangeAnchor = rangeAnchor === q;

                return (
                  <Button
                    key={q}
                    type="button"
                    size="sm"
                    variant={on ? 'default' : 'outline'}
                    title={`${q}: два клика — выбрать диапазон для treemap`}
                    onClick={() => handleQuarterClick(q)}
                    onMouseEnter={() => setHoverQuarter(q)}
                    onMouseLeave={() => setHoverQuarter(null)}
                    aria-pressed={on}
                    className={cn(
                      'h-8 min-h-0 min-w-[4.25rem] shrink-0 px-2.5 py-1 text-xs font-medium tabular-nums',
                      isRangeAnchor && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
                      inBand && !on && 'bg-primary/15 ring-1 ring-primary/40 dark:bg-primary/20'
                    )}
                  >
                    {q}
                  </Button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {model.note ? (
        <p className="rounded-lg border border-blue-500/35 bg-blue-500/5 px-3 py-2 text-xs text-muted-foreground">
          {model.note}
        </p>
      ) : null}

      <div className="min-h-0 min-h-[min(18rem,42vh)] w-full min-w-0 flex-1 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {previewSortedQs.length === 0 || model.effectiveTotal <= 0 ? (
          <div className="flex h-full min-h-[16rem] flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
            <p>Нет данных для treemap за этот период (сумма стоимости по команде — 0 или кварталы не выбраны).</p>
          </div>
        ) : (
          <TreemapContainer
            data={treeData}
            showTeams={false}
            showInitiatives={true}
            hasData={true}
            selectedQuarters={previewSortedQs}
            selectedUnitsCount={1}
            getColor={getColor}
            showDistributionInTooltip={true}
            contentKey={model.contentKey}
            viewKey={treemapViewKey}
            showMoney={true}
            emptyStateTitle="Нет долей"
            emptyStateSubtitle="Проверьте коэффициенты на предыдущем шаге"
            onAdminInitiativeRowClick={(rowId) => setPeekRowId(rowId)}
          />
        )}
      </div>

      <InitiativePeekModal
        open={peekRowId != null}
        onOpenChange={(open) => !open && setPeekRowId(null)}
        row={peekRawRow}
        selectedQuarters={previewSortedQs}
        showMoney
        missingCardFields={peekMissingCardFields}
        onEditCard={() => {
          if (peekRowId) setDialogRowId(peekRowId);
        }}
      />

      <Dialog open={dialogRowId != null} onOpenChange={(o) => !o && setDialogRowId(null)}>
        <DialogContent
          className="flex max-h-[min(90vh,880px)] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl"
          aria-describedby={undefined}
        >
          {dialogRow && draft ? (
            <>
              <DialogHeader className="shrink-0 border-b border-border px-6 py-4 text-left">
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <Badge variant="outline">{dialogRow.unit}</Badge>
                  <span aria-hidden>→</span>
                  <Badge variant="outline">{dialogRow.team}</Badge>
                </div>
                <DialogTitle className="mt-2 pr-8 text-xl leading-snug">
                  <div className="flex items-center gap-2 group">
                    <Input
                      value={localName}
                      onChange={(e) => setLocalName(e.target.value)}
                      onBlur={() => draft(dialogRow.id, 'initiative', localName)}
                      className="text-xl font-semibold border border-transparent hover:border-input focus-visible:border-primary focus-visible:ring-1 px-2 py-1 -mx-2 -my-1 rounded min-w-0 flex-1"
                      placeholder="Название инициативы"
                      aria-label="Название инициативы"
                    />
                    <Pencil size={16} className="text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" aria-hidden />
                  </div>
                </DialogTitle>
                {dialogCardMissingLabels.length > 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Рядом с обязательными полями показан значок — заполните их, чтобы продолжить сценарий. Ссылка на
                    документацию — по желанию.
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Обязательные поля карточки в порядке (план/факт по кварталам — на следующем шаге).
                  </p>
                )}
              </DialogHeader>

              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4 pt-3">
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <RequiredLabel className="mb-0">Тип инициативы</RequiredLabel>
                        <RequiredFieldAttention show={missingCardType} fieldLabel="тип инициативы" />
                      </div>
                      <TooltipProvider delayDuration={100}>
                        <Select
                          value={dialogRow.initiativeType || ''}
                          onValueChange={(v) => draft(dialogRow.id, 'initiativeType', v)}
                        >
                          <SelectTrigger className="w-full focus:ring-0 focus-visible:ring-0">
                            <SelectValue placeholder="Выберите тип" />
                          </SelectTrigger>
                          <SelectContent>
                            {INITIATIVE_TYPES.map((type) => (
                              <SelectItem key={type.value} value={type.value}>
                                <div className="flex items-center gap-2">
                                  {type.label}
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Info size={12} className="text-muted-foreground" />
                                    </TooltipTrigger>
                                    <TooltipContent side="right" className="max-w-[200px]">
                                      <p className="text-xs">{type.description}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TooltipProvider>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <RequiredLabel className="mb-0">Стейкхолдеры</RequiredLabel>
                        <RequiredFieldAttention show={missingCardStakeholders} fieldLabel="стейкхолдеров" />
                      </div>
                      <div className="flex flex-wrap gap-2 rounded-md border border-border/60 bg-muted/5 p-2">
                        {STAKEHOLDERS_LIST.map((stakeholder) => {
                          const isSelected = localStakeholders.includes(stakeholder);
                          return (
                            <button
                              key={stakeholder}
                              type="button"
                              onClick={() => handleStakeholderToggle(stakeholder, !isSelected)}
                              className={cn(
                                'flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-all',
                                isSelected
                                  ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                                  : 'border-border bg-background hover:bg-muted'
                              )}
                            >
                              {isSelected && <Check size={14} className="shrink-0" aria-hidden />}
                              {stakeholder}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <RequiredLabel className="mb-0">Описание</RequiredLabel>
                        <RequiredFieldAttention show={missingCardDescription} fieldLabel="описание" />
                      </div>
                      <Textarea
                        value={localDescription}
                        onChange={(e) => setLocalDescription(e.target.value)}
                        onBlur={() => draft(dialogRow.id, 'description', localDescription)}
                        placeholder="Подробное описание инициативы..."
                        className="min-h-[100px] resize-y"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Ссылка на документацию</Label>
                      <div className="flex gap-2">
                        <Input
                          value={localDocLink}
                          onChange={(e) => setLocalDocLink(e.target.value)}
                          onBlur={() => draft(dialogRow.id, 'documentationLink', localDocLink)}
                          placeholder="https://..."
                          className="flex-1"
                        />
                        {dialogRow.documentationLink?.trim() ? (
                          <a
                            href={dialogRow.documentationLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-input bg-background hover:bg-accent"
                          >
                            <ExternalLink size={16} aria-hidden />
                          </a>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex items-center justify-between rounded-lg border p-4">
                      <div>
                        <Label className="text-sm font-medium">Заглушка в таймлайне</Label>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Показывать внизу таймлайна при отсутствии инициатив в квартале
                        </p>
                      </div>
                      <Switch
                        checked={dialogRow.isTimelineStub === true}
                        onCheckedChange={(checked) => draft(dialogRow.id, 'isTimelineStub', checked)}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <DialogFooter className="shrink-0 flex-col gap-2 border-t border-border px-6 py-4 sm:flex-row sm:justify-end">
                <Button type="button" variant="secondary" onClick={() => setDialogRowId(null)}>
                  Закрыть
                </Button>
              </DialogFooter>
            </>
          ) : dialogRow && !draft ? (
            <p className="p-6 text-sm text-muted-foreground">Редактирование недоступно.</p>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
