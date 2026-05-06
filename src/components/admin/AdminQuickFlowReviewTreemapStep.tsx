import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { TreemapContainer } from '@/components/treemap';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  type AdminDataRow,
  getQuickFlowDescriptionDocIssuesForQuarters,
  getMissingDescriptionDocFields,
} from '@/lib/adminDataManager';
import {
  buildEffortTreemapPreviewModel,
  resolveEffortPreviewQuarters,
} from '@/lib/adminEffortTreemapPreviewModel';
import type { TreeNode } from '@/lib/dataManager';
const PREVIEW_ROOT = 'quick-review-root';

export type DraftField =
  | 'initiative'
  | 'stakeholdersList'
  | 'description'
  | 'documentationLink'
  | 'isTimelineStub';

type Props = {
  rows: AdminDataRow[];
  fillQuarters: string[];
  quartersCatalog: string[];
  visibleQuarters: string[];
  onInitiativeDraftChange?: (id: string, field: DraftField, value: string | string[] | boolean) => void;
  /** Убрать заголовки и пояснения сценария (режим блоков полной таблицы). */
  compactChrome?: boolean;
};

function isUnallocatedNodeName(name: string): boolean {
  return name === 'Нераспределено' || name.startsWith('Нераспределено · ');
}

function enrichReviewLeaves(children: TreeNode[], rows: AdminDataRow[]): TreeNode[] {
  return children.map((n) => {
    const id = n.adminInitiativeRowId;
    if (!id || isUnallocatedNodeName(n.name)) return n;
    const row = rows.find((r) => r.id === id);
    if (!row) return n;
    if (row.isTimelineStub) return n;
    return {
      ...n,
      description: row.description,
      documentationLink: row.documentationLink,
    };
  });
}

function applyReviewFlags(children: TreeNode[], rows: AdminDataRow[]): TreeNode[] {
  return children.map((n) => {
    const id = n.adminInitiativeRowId;
    if (!id || isUnallocatedNodeName(n.name)) {
      return { ...n, adminQuickReviewIssue: false, adminQuickReviewMissing: undefined };
    }
    const row = rows.find((r) => r.id === id);
    if (row?.isTimelineStub) {
      return { ...n, adminQuickReviewIssue: false, adminQuickReviewMissing: undefined };
    }
    const missing = row ? getMissingDescriptionDocFields(row) : [];
    const has = missing.length > 0;
    return {
      ...n,
      adminQuickReviewIssue: has,
      adminQuickReviewMissing: has ? missing : undefined,
    };
  });
}

export function AdminQuickFlowReviewTreemapStep({
  rows,
  fillQuarters,
  quartersCatalog,
  visibleQuarters,
  onInitiativeDraftChange,
  compactChrome = false,
}: Props) {
  const draft = onInitiativeDraftChange;

  /** Кварталы периода в порядке каталога (как у матрицы коэффициентов). */
  const previewPeriodQuarters = useMemo(() => {
    const sel = new Set(visibleQuarters);
    return quartersCatalog.filter((q) => sel.has(q));
  }, [quartersCatalog, visibleQuarters]);

  /** Если матрица смотрит на 2025–26 без сумм, а стоимость в более ранних кварталах — подставляем их. */
  const resolvedPreviewQuarters = useMemo(
    () => resolveEffortPreviewQuarters(rows, previewPeriodQuarters, fillQuarters),
    [rows, previewPeriodQuarters, fillQuarters]
  );

  const model = useMemo(
    () => buildEffortTreemapPreviewModel(rows, resolvedPreviewQuarters),
    [rows, resolvedPreviewQuarters]
  );

  const treeData: TreeNode = useMemo(() => {
    const enriched = enrichReviewLeaves(model.treeChildren, rows);
    const children = applyReviewFlags(enriched, rows);
    return { name: PREVIEW_ROOT, isRoot: true, children };
  }, [model.treeChildren, rows]);

  const getColor = model.getPreviewColor;

  const [dialogRowId, setDialogRowId] = useState<string | null>(null);
  const dialogRow = useMemo(
    () => (dialogRowId ? rows.find((r) => r.id === dialogRowId) ?? null : null),
    [dialogRowId, rows]
  );

  const [localName, setLocalName] = useState('');
  const [localDescription, setLocalDescription] = useState('');
  const [localDocLink, setLocalDocLink] = useState('');
  const [localStub, setLocalStub] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);

  useEffect(() => {
    if (!dialogRowId) return;
    const row = rows.find((r) => r.id === dialogRowId);
    if (!row) {
      setDialogRowId(null);
      return;
    }
    setLocalName(row.initiative || '');
    setLocalDescription(row.description || '');
    setLocalDocLink(row.documentationLink || '');
    setLocalStub(row.isTimelineStub === true);
    // Только при открытии по id — не привязываемся к rows, иначе сбросим ввод при каждом ререндере родителя
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogRowId]);

  const isDirty = useMemo(() => {
    if (!dialogRow) return false;
    return (
      localName !== (dialogRow.initiative || '') ||
      localDescription !== (dialogRow.description || '') ||
      localDocLink !== (dialogRow.documentationLink || '') ||
      localStub !== (dialogRow.isTimelineStub === true)
    );
  }, [dialogRow, localName, localDescription, localDocLink, localStub]);

  const closeDialog = useCallback(() => {
    setDialogRowId(null);
    setDiscardConfirmOpen(false);
  }, []);

  const requestCloseDialog = useCallback(() => {
    if (isDirty) {
      setDiscardConfirmOpen(true);
    } else {
      closeDialog();
    }
  }, [closeDialog, isDirty]);

  const saveAndClose = useCallback(() => {
    if (!dialogRow || !draft) return;
    draft(dialogRow.id, 'initiative', localName);
    draft(dialogRow.id, 'description', localDescription);
    draft(dialogRow.id, 'documentationLink', localDocLink);
    if (localStub !== (dialogRow.isTimelineStub === true)) {
      draft(dialogRow.id, 'isTimelineStub', localStub);
    }
    closeDialog();
  }, [closeDialog, dialogRow, draft, localDescription, localDocLink, localName, localStub]);

  const treemapViewKey = `quick-flow-review-${resolvedPreviewQuarters.join(',')}-${model.contentKey.slice(0, 80)}`;

  const scenarioDocIssues = useMemo(
    () => getQuickFlowDescriptionDocIssuesForQuarters(rows, fillQuarters),
    [rows, fillQuarters]
  );
  const hasScenarioDocIssues = scenarioDocIssues.length > 0;

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="min-w-0 flex-1 text-base font-semibold leading-snug sm:text-lg">
          Описание и документация
        </h2>
        {hasScenarioDocIssues ? (
          <span
            className="inline-flex items-center gap-2 rounded-md border-2 border-destructive/70 bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive dark:border-destructive/60 dark:bg-destructive/15"
            role="status"
          >
            <span
              className="h-3 w-4 shrink-0 rounded-sm bg-background shadow-[inset_0_0_0_2px_hsl(0_72%_48%)]"
              aria-hidden
            />
            Нет описания у части инициатив
          </span>
        ) : null}
      </div>

      {!compactChrome && model.note ? (
        <p className="rounded-lg border border-blue-500/35 bg-blue-500/5 px-3 py-2 text-xs text-muted-foreground">
          {model.note}
        </p>
      ) : null}

      <div
        className="flex w-full min-w-0 shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm"
        style={{
          minHeight: 'min(24rem, calc(100dvh - 10.5rem))',
          height: 'min(70vh, calc(100dvh - 10.5rem))',
        }}
      >
        {resolvedPreviewQuarters.length === 0 || model.effectiveTotal <= 0 ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
            <p>Нет данных для treemap за этот период (сумма стоимости по команде — 0 или кварталы не выбраны).</p>
          </div>
        ) : (
          <div className="min-h-0 min-w-0 w-full flex-1">
            <TreemapContainer
              data={treeData}
              showTeams={false}
              showInitiatives={true}
              hasData={true}
              selectedQuarters={resolvedPreviewQuarters}
              selectedUnitsCount={1}
              getColor={getColor}
              showDistributionInTooltip={true}
              contentKey={model.contentKey}
              viewKey={treemapViewKey}
              showMoney={true}
              tooltipInitiativeVariant="descriptionDocReview"
              treemapQuarterCatalog={quartersCatalog}
              emptyStateTitle="Нет долей"
              emptyStateSubtitle="Проверьте коэффициенты на предыдущем шаге"
              onAdminInitiativeRowClick={
                draft
                  ? (rowId) => {
                      const row = rows.find((r) => r.id === rowId);
                      if (row?.isTimelineStub) return;
                      setDialogRowId(rowId);
                    }
                  : undefined
              }
            />
          </div>
        )}
      </div>

      <Dialog
        open={dialogRowId != null}
        onOpenChange={(open) => {
          if (open) return;
          requestCloseDialog();
        }}
      >
        <DialogContent className="max-w-lg gap-0 border-border p-0 sm:max-w-lg">
          {dialogRow && draft ? (
            <>
              <DialogTitle className="sr-only">
                {dialogRow.initiative?.trim() || 'Инициатива'}: название, описание и документация
              </DialogTitle>
              <div className="flex flex-col gap-5 px-6 py-6">
                <div className="space-y-2">
                  <Label htmlFor={`review-name-${dialogRow.id}`} className="text-sm font-medium">
                    Название инициативы
                  </Label>
                  <Input
                    id={`review-name-${dialogRow.id}`}
                    value={localName}
                    onChange={(e) => setLocalName(e.target.value)}
                    className="text-base font-medium"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`review-desc-${dialogRow.id}`} className="text-sm font-medium">
                    Описание
                  </Label>
                  <Textarea
                    id={`review-desc-${dialogRow.id}`}
                    value={localDescription}
                    onChange={(e) => setLocalDescription(e.target.value)}
                    className="min-h-[120px] resize-y"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Label htmlFor={`review-doc-${dialogRow.id}`} className="text-sm font-medium">
                      Ссылка на документацию
                    </Label>
                    <Badge variant="secondary" className="text-xs font-normal">
                      необязательно
                    </Badge>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      id={`review-doc-${dialogRow.id}`}
                      value={localDocLink}
                      onChange={(e) => setLocalDocLink(e.target.value)}
                      placeholder="https://…"
                      className="min-w-0 flex-1"
                    />
                    {localDocLink.trim() ? (
                      <a
                        href={localDocLink.trim()}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-input bg-background hover:bg-accent"
                        aria-label="Открыть ссылку"
                      >
                        <ExternalLink size={16} aria-hidden />
                      </a>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                  <Label htmlFor={`review-stub-${dialogRow.id}`} className="text-sm font-medium">
                    Заглушка
                  </Label>
                  <Switch
                    id={`review-stub-${dialogRow.id}`}
                    checked={localStub}
                    onCheckedChange={(v) => setLocalStub(Boolean(v))}
                  />
                </div>
              </div>
              <DialogFooter className="flex-col gap-3 border-t border-border bg-muted/20 px-6 py-4 sm:justify-end">
                {compactChrome ? (
                  <p className="w-full text-left text-xs text-muted-foreground">
                    Это только черновик на экране. Чтобы записать в базу и обновить галочку на обзоре, нажмите
                    «Сохранить» вверху.
                  </p>
                ) : null}
                <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button type="button" variant="outline" onClick={requestCloseDialog}>
                    Отмена
                  </Button>
                  <Button type="button" onClick={saveAndClose}>
                    {compactChrome ? 'В черновик' : 'Сохранить'}
                  </Button>
                </div>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={discardConfirmOpen} onOpenChange={setDiscardConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Закрыть без сохранения?</AlertDialogTitle>
            <AlertDialogDescription>
              Изменения не будут применены к черновику.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Остаться</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={closeDialog}
            >
              Закрыть без сохранения
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
