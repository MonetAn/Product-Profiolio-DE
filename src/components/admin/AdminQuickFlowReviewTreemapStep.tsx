import { useEffect, useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { TreemapContainer } from '@/components/treemap';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  type AdminDataRow,
  getQuickFlowDescriptionDocIssuesForQuarters,
  getMissingDescriptionDocFields,
} from '@/lib/adminDataManager';
import { buildEffortTreemapPreviewModel } from '@/lib/adminEffortTreemapPreviewModel';
import type { TreeNode } from '@/lib/dataManager';
import { compareQuarters } from '@/lib/quarterUtils';

const PREVIEW_ROOT = 'quick-review-root';

export type DraftField =
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
  visibleQuarters: string[];
  onInitiativeDraftChange?: (id: string, field: DraftField, value: string | string[] | boolean) => void;
};

function enrichReviewLeaves(children: TreeNode[], rows: AdminDataRow[]): TreeNode[] {
  return children.map((n) => {
    const id = n.adminInitiativeRowId;
    if (!id || n.name === 'Нераспределено') return n;
    const row = rows.find((r) => r.id === id);
    if (!row) return n;
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
    if (!id || n.name === 'Нераспределено') {
      return { ...n, adminQuickReviewIssue: false, adminQuickReviewMissing: undefined };
    }
    const row = rows.find((r) => r.id === id);
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
}: Props) {
  const draft = onInitiativeDraftChange;

  /** Кварталы периода в порядке каталога (как у матрицы коэффициентов). */
  const previewPeriodQuarters = useMemo(() => {
    const sel = new Set(visibleQuarters);
    return quartersCatalog.filter((q) => sel.has(q));
  }, [quartersCatalog, visibleQuarters]);

  const model = useMemo(
    () => buildEffortTreemapPreviewModel(rows, previewPeriodQuarters),
    [rows, previewPeriodQuarters]
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

  useEffect(() => {
    if (!dialogRow) return;
    setLocalName(dialogRow.initiative || '');
    setLocalDescription(dialogRow.description || '');
    setLocalDocLink(dialogRow.documentationLink || '');
  }, [dialogRow?.id]);

  const treemapViewKey = `quick-flow-review-${previewPeriodQuarters.join(',')}-${model.contentKey.slice(0, 80)}`;

  const scenarioDocIssues = useMemo(
    () => getQuickFlowDescriptionDocIssuesForQuarters(rows, fillQuarters),
    [rows, fillQuarters]
  );
  const hasScenarioDocIssues = scenarioDocIssues.length > 0;

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="min-w-0 flex-1 text-lg font-semibold leading-snug">
          Проверь описание и ссылки на документацию
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

      {model.note ? (
        <p className="rounded-lg border border-blue-500/35 bg-blue-500/5 px-3 py-2 text-xs text-muted-foreground">
          {model.note}
        </p>
      ) : null}

      <div className="min-h-0 min-h-[min(18rem,42vh)] w-full min-w-0 flex-1 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {previewPeriodQuarters.length === 0 || model.effectiveTotal <= 0 ? (
          <div className="flex h-full min-h-[16rem] flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
            <p>Нет данных для treemap за этот период (сумма стоимости по команде — 0 или кварталы не выбраны).</p>
          </div>
        ) : (
          <TreemapContainer
            data={treeData}
            showTeams={false}
            showInitiatives={true}
            hasData={true}
            selectedQuarters={previewPeriodQuarters}
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
              draft ? (rowId) => setDialogRowId(rowId) : undefined
            }
          />
        )}
      </div>

      <Dialog open={dialogRowId != null} onOpenChange={(o) => !o && setDialogRowId(null)}>
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
                    onBlur={() => draft(dialogRow.id, 'initiative', localName)}
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
                    onBlur={() => draft(dialogRow.id, 'description', localDescription)}
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
                      onBlur={() => draft(dialogRow.id, 'documentationLink', localDocLink)}
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
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
