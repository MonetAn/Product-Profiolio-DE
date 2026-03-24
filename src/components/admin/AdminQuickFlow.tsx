import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  ClipboardList,
  ListChecks,
  Plus,
  ArrowLeft,
  ChevronRight,
  Pause,
  Pencil,
  Loader2,
  Calculator,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import {
  AdminDataRow,
  AdminQuarterData,
  createEmptyQuarterData,
  getQuickFlowValidationIssues,
} from '@/lib/adminDataManager';

export type SheetsPreviewRow = {
  initiativeId: string;
  initiativeName?: string;
  itog: Record<string, number>;
};

interface AdminQuickFlowProps {
  filteredData: AdminDataRow[];
  quarters: string[];
  previousQuarter: string;
  nextQuarter: string;
  unit: string;
  team: string;
  createdInQuickSession: string[];
  onQuarterDataChange: (id: string, quarter: string, field: keyof AdminQuarterData, value: string | number | boolean) => void;
  onOpenAddInitiative: () => void;
  onGoToFullTable: () => void;
  onOpenFillInitiative?: (id: string) => void;
  hasQuickDraft?: boolean;
  onSaveQuickDraft?: () => void | Promise<void>;
  isSavingQuickDraft?: boolean;
  onRequestExitQuick?: (action: 'fullTable' | 'backToStep1', onProceed: () => void) => void;
  step?: 1 | 2 | 3;
  setStep?: (step: 1 | 2 | 3) => void;
  queueProgress?: { current: number; total: number; teamName: string };
  onSaveAndContinueQueue?: () => void | Promise<void>;
  queueActionLoading?: boolean;
  /** Шаг 3 (Google): только для админов с доступом к Edge Functions */
  enableSheetsPreviewStep?: boolean;
  runSheetsPreviewCalculation?: () => Promise<{
    preview?: SheetsPreviewRow[];
    pollStable?: boolean;
    message?: string;
  }>;
  restoreSheetsInFromDatabase?: () => Promise<void>;
  applySheetCostsFromOut?: () => Promise<void>;
}

const OUT_ITOG_KEYS = ['2025-Q1', '2025-Q2', '2025-Q3', '2025-Q4'] as const;

function formatCost(n: number): string {
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
}

export default function AdminQuickFlow({
  filteredData,
  quarters,
  previousQuarter,
  nextQuarter,
  unit,
  team,
  createdInQuickSession,
  onQuarterDataChange,
  onOpenAddInitiative,
  onGoToFullTable,
  onOpenFillInitiative,
  hasQuickDraft,
  onSaveQuickDraft,
  isSavingQuickDraft,
  onRequestExitQuick,
  step: stepProp,
  setStep: setStepProp,
  queueProgress,
  onSaveAndContinueQueue,
  queueActionLoading,
  enableSheetsPreviewStep = false,
  runSheetsPreviewCalculation,
  restoreSheetsInFromDatabase,
  applySheetCostsFromOut,
}: AdminQuickFlowProps) {
  const { toast } = useToast();
  const [stepLocal, setStepLocal] = useState<1 | 2 | 3>(1);
  const step = stepProp ?? stepLocal;
  const setStep = setStepProp ?? setStepLocal;

  const maxStep = enableSheetsPreviewStep ? 3 : 2;

  const [previewRows, setPreviewRows] = useState<SheetsPreviewRow[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [restoreInLoading, setRestoreInLoading] = useState(false);
  const [applyOutLoading, setApplyOutLoading] = useState(false);
  const [previewMeta, setPreviewMeta] = useState<{ pollStable?: boolean; message?: string } | null>(null);

  useEffect(() => {
    if (!enableSheetsPreviewStep && step === 3) {
      setStep(2);
    }
  }, [enableSheetsPreviewStep, step, setStep]);

  useEffect(() => {
    if (step !== 3) {
      setPreviewRows(null);
      setPreviewMeta(null);
    }
  }, [step]);

  const prevInQuarters = quarters.includes(previousQuarter);
  const nextInQuarters = quarters.includes(nextQuarter);

  const nextQuarterEffortSum = useMemo(() => {
    return filteredData.reduce(
      (sum, row) => sum + (row.quarterlyData[nextQuarter]?.effortCoefficient ?? 0),
      0
    );
  }, [filteredData, nextQuarter]);

  const nextQuarterIsValid = nextQuarterEffortSum <= 100;

  const newInitiativeRows = useMemo(
    () => filteredData.filter((row) => createdInQuickSession.includes(row.id)),
    [filteredData, createdInQuickSession]
  );

  const { orderedForDisplay, activeInPrevQuarter, dormantInPrevQuarter } = useMemo(() => {
    const newRows = filteredData.filter((row) => createdInQuickSession.includes(row.id));
    const rest = filteredData.filter((row) => !createdInQuickSession.includes(row.id));
    const prevPct = (row: AdminDataRow) => row.quarterlyData[previousQuarter]?.effortCoefficient ?? 0;
    const active = rest.filter((row) => prevPct(row) > 0);
    const dormant = rest.filter((row) => prevPct(row) === 0);
    return {
      orderedForDisplay: [...newRows, ...active, ...dormant],
      activeInPrevQuarter: active,
      dormantInPrevQuarter: dormant,
    };
  }, [filteredData, previousQuarter, createdInQuickSession]);

  const validationIssues = useMemo(
    () => getQuickFlowValidationIssues(filteredData, nextQuarter),
    [filteredData, nextQuarter]
  );

  const teamInitiativeIds = useMemo(() => new Set(filteredData.map((r) => r.id)), [filteredData]);

  const handleExitClick = useCallback(() => {
    if (onRequestExitQuick) onRequestExitQuick('fullTable', onGoToFullTable);
    else onGoToFullTable();
  }, [onRequestExitQuick, onGoToFullTable]);

  const handleBackToStep1 = useCallback(() => {
    if (onRequestExitQuick) onRequestExitQuick('backToStep1', () => setStep(1));
    else setStep(1);
  }, [onRequestExitQuick, setStep]);

  const handleRunPreview = useCallback(async () => {
    if (!runSheetsPreviewCalculation) return;
    setPreviewLoading(true);
    try {
      const res = await runSheetsPreviewCalculation();
      const raw = res.preview ?? [];
      const scoped = raw.filter((r) => teamInitiativeIds.has(r.initiativeId));
      setPreviewRows(scoped);
      setPreviewMeta({ pollStable: res.pollStable, message: res.message });
      if (scoped.length === 0) {
        toast({
          title: 'Нет строк для команды',
          description:
            'На листе OUT не найдено итогов по UUID инициатив этой команды. Проверьте выгрузку и колонки O–R.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Предпросчёт готов',
          description: res.pollStable
            ? 'Значения на листе стабилизировались после пересчёта.'
            : 'Показаны последние прочитанные значения (пересчёт мог ещё идти).',
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({
        variant: 'destructive',
        title: 'Ошибка предпросчёта',
        description: msg,
      });
    } finally {
      setPreviewLoading(false);
    }
  }, [runSheetsPreviewCalculation, teamInitiativeIds, toast]);

  const handleRestoreIn = useCallback(async () => {
    if (!restoreSheetsInFromDatabase) return;
    setRestoreInLoading(true);
    try {
      await restoreSheetsInFromDatabase();
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Не удалось восстановить IN',
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setRestoreInLoading(false);
    }
  }, [restoreSheetsInFromDatabase, toast]);

  const handleApplyOut = useCallback(async () => {
    if (!applySheetCostsFromOut) return;
    setApplyOutLoading(true);
    try {
      await applySheetCostsFromOut();
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Не удалось записать стоимости',
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setApplyOutLoading(false);
    }
  }, [applySheetCostsFromOut, toast]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleExitClick();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleExitClick]);

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={handleExitClick}>
                <ArrowLeft size={16} />
                Выйти в полную таблицу
              </Button>
              <span className="text-sm text-muted-foreground">
                Шаг {step > maxStep ? maxStep : step} из {maxStep}
              </span>
            </div>
          </div>
          {queueProgress && queueProgress.total > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
              <span className="font-semibold text-foreground">
                Команда {queueProgress.current} из {queueProgress.total}
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="font-medium">{queueProgress.teamName || '—'}</span>
              {unit && (
                <span className="text-xs text-muted-foreground w-full sm:w-auto sm:ml-auto">
                  {unit}
                </span>
              )}
            </div>
          )}
        </div>

        {step === 1 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="rounded-xl border border-border bg-card p-6 order-2 lg:order-1">
              <div className="flex items-center gap-2 mb-4">
                <ClipboardList size={20} className="text-muted-foreground" />
                <h2 className="text-lg font-semibold">Прошлый квартал: {previousQuarter}</h2>
              </div>
              {!prevInQuarters ? (
                <p className="text-sm text-muted-foreground">Нет данных за этот квартал в выгрузке.</p>
              ) : (
                <p className="text-sm text-muted-foreground mb-4">Редактировать можно в полной таблице.</p>
              )}
              {prevInQuarters && orderedForDisplay.length > 0 && (
                <ul className="space-y-2">
                  {orderedForDisplay.map((row, idx) => {
                    const qd = row.quarterlyData[previousQuarter];
                    const pct = qd?.effortCoefficient ?? 0;
                    const isFirstActive = idx === newInitiativeRows.length;
                    const isFirstDormant = idx === newInitiativeRows.length + activeInPrevQuarter.length;
                    const showSeparator = (isFirstActive && activeInPrevQuarter.length > 0) || (isFirstDormant && dormantInPrevQuarter.length > 0);
                    return (
                      <li
                        key={row.id}
                        className={`text-sm py-2 border-b border-border/50 last:border-0 ${showSeparator ? 'border-t border-border/50 mt-2 pt-2' : ''}`}
                      >
                        <div className="flex justify-between items-center gap-4">
                          <span className="truncate flex-1 min-w-0">{row.initiative || '—'}</span>
                          <span className="text-muted-foreground shrink-0">{pct}%</span>
                        </div>
                        {(qd?.metricPlan ?? qd?.metricFact) && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {qd?.metricPlan && (
                              <span>План: {qd.metricPlan.length > 50 ? `${qd.metricPlan.slice(0, 50)}…` : qd.metricPlan}</span>
                            )}
                            {qd?.metricPlan && qd?.metricFact && ' · '}
                            {qd?.metricFact && (
                              <span>Факт: {qd.metricFact.length > 50 ? `${qd.metricFact.slice(0, 50)}…` : qd.metricFact}</span>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="rounded-xl border border-border bg-card p-6 order-1 lg:order-2">
              <div className="flex items-center gap-2 mb-4">
                <ListChecks size={20} className="text-muted-foreground" />
                <h2 className="text-lg font-semibold">Следующий квартал: {nextQuarter}</h2>
              </div>
              {!nextInQuarters ? (
                <p className="text-sm text-muted-foreground">Нет данных за этот квартал в выгрузке. Добавьте квартал через импорт или полную таблицу.</p>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground mb-4">
                    Распределите усилия по инициативам (сумма 100%). При необходимости добавьте инициативу.
                  </p>

                  <div className="flex items-center justify-between gap-4 mb-4">
                    <span
                      className={`text-sm font-medium ${
                        nextQuarterEffortSum === 0
                          ? 'text-muted-foreground'
                          : !nextQuarterIsValid
                            ? 'text-destructive'
                            : nextQuarterEffortSum >= 80
                              ? 'text-green-600'
                              : 'text-muted-foreground'
                      }`}
                    >
                      Сумма: {nextQuarterEffortSum}% / 100%
                      {!nextQuarterIsValid && ' (превышение)'}
                      {nextQuarterIsValid && nextQuarterEffortSum === 100 && ' ✓'}
                    </span>
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={onOpenAddInitiative}>
                      <Plus size={14} />
                      Добавить инициативу
                    </Button>
                  </div>

                  {orderedForDisplay.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground space-y-3">
                      <p>Нет инициатив. Добавьте первую кнопкой ниже.</p>
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={onOpenAddInitiative}>
                        <Plus size={14} />
                        Добавить инициативу
                      </Button>
                    </div>
                  ) : (
                    <ul className="space-y-3">
                      {newInitiativeRows.length > 0 && (
                        <>
                          <li className="text-xs font-medium text-muted-foreground uppercase tracking-wide pb-1 border-b border-border/50">
                            Новые в этом квартале
                          </li>
                          {newInitiativeRows.map((row) => {
                            const qd = row.quarterlyData[nextQuarter] ?? createEmptyQuarterData();
                            const effort = qd.effortCoefficient ?? 0;
                            return (
                              <li key={row.id} className="flex items-center gap-2 rounded-lg border border-border p-3 border-primary/30 bg-primary/5">
                                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary rounded px-1.5 py-0.5 bg-primary/10 shrink-0">
                                  Новая
                                </span>
                                <span className="truncate flex-1 min-w-0 font-medium text-sm">{row.initiative || '—'}</span>
                                <div className="flex items-center gap-2 shrink-0">
                                  <Input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={effort === 0 ? '' : effort}
                                    onChange={(e) =>
                                      onQuarterDataChange(row.id, nextQuarter, 'effortCoefficient', parseInt(e.target.value, 10) || 0)
                                    }
                                    className="w-16 h-8 text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  />
                                  <span className="text-xs text-muted-foreground">%</span>
                                </div>
                              </li>
                            );
                          })}
                        </>
                      )}
                      {activeInPrevQuarter.length > 0 && (
                        <>
                          <li className="text-xs font-medium text-muted-foreground uppercase tracking-wide pb-1 border-b border-border/50">
                            Продолжаем (были усилия в прошлом квартале)
                          </li>
                          {activeInPrevQuarter.map((row) => {
                            const qd = row.quarterlyData[nextQuarter] ?? createEmptyQuarterData();
                            const effort = qd.effortCoefficient ?? 0;
                            return (
                              <li key={row.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                                <span className="truncate flex-1 min-w-0 font-medium text-sm">{row.initiative || '—'}</span>
                                <div className="flex items-center gap-2 shrink-0">
                                  <Input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={effort === 0 ? '' : effort}
                                    onChange={(e) =>
                                      onQuarterDataChange(row.id, nextQuarter, 'effortCoefficient', parseInt(e.target.value, 10) || 0)
                                    }
                                    className="w-16 h-8 text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  />
                                  <span className="text-xs text-muted-foreground">%</span>
                                </div>
                              </li>
                            );
                          })}
                        </>
                      )}
                      {dormantInPrevQuarter.length > 0 && (
                        <>
                          <li className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide pb-1 border-b border-border/50">
                            <Pause size={12} className="shrink-0" />
                            Без усилий в прошлом квартале
                          </li>
                          {dormantInPrevQuarter.map((row) => {
                            const qd = row.quarterlyData[nextQuarter] ?? createEmptyQuarterData();
                            const effort = qd.effortCoefficient ?? 0;
                            return (
                              <li key={row.id} className="flex items-center gap-3 rounded-lg border border-border p-3 opacity-90">
                                <span className="truncate flex-1 min-w-0 font-medium text-sm text-muted-foreground">{row.initiative || '—'}</span>
                                <div className="flex items-center gap-2 shrink-0">
                                  <Input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={effort === 0 ? '' : effort}
                                    onChange={(e) =>
                                      onQuarterDataChange(row.id, nextQuarter, 'effortCoefficient', parseInt(e.target.value, 10) || 0)
                                    }
                                    className="w-16 h-8 text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  />
                                  <span className="text-xs text-muted-foreground">%</span>
                                </div>
                              </li>
                            );
                          })}
                        </>
                      )}
                    </ul>
                  )}

                  <div className="mt-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3">
                    {hasQuickDraft && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Есть несохранённые изменения</span>
                        {onSaveQuickDraft && (
                          <Button
                            onClick={() => void onSaveQuickDraft()}
                            disabled={isSavingQuickDraft}
                            className="gap-1.5"
                          >
                            {isSavingQuickDraft ? 'Сохранение…' : 'Сохранить в базу'}
                          </Button>
                        )}
                      </div>
                    )}
                    <Button onClick={() => setStep(2)} className="gap-1.5">
                      Далее
                      <ChevronRight size={16} />
                    </Button>
                  </div>
                </>
              )}
            </section>
          </div>
        ) : step === 2 ? (
          <section className="rounded-xl border border-border bg-card p-6 max-w-2xl">
            <h2 className="text-lg font-semibold mb-2">Проверка перед завершением</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Инициативы с процентом усилий должны иметь заполненные обязательные поля. Исправьте перечисленное ниже или перейдите в полную таблицу.
            </p>

            {validationIssues.length === 0 ? (
              <div className="rounded-lg border border-border bg-muted/20 p-4 mb-6">
                <p className="text-sm font-medium text-foreground">Всё заполнено.</p>
                <p className="text-sm text-muted-foreground mt-1">Можете перейти в полную таблицу или вернуться к коэффициентам.</p>
              </div>
            ) : (
              <ul className="space-y-3 mb-6">
                {validationIssues.map(({ id, initiativeName, missing }) => (
                  <li key={id} className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg border border-border p-3">
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-sm">{initiativeName}</span>
                      <span className="text-xs text-muted-foreground block mt-0.5">
                        Не заполнено: {missing.join(', ')}
                      </span>
                    </div>
                    {onOpenFillInitiative && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0 gap-1.5"
                        onClick={() => onOpenFillInitiative(id)}
                        aria-label={`Заполнить поля инициативы ${initiativeName}`}
                      >
                        <Pencil size={14} />
                        Заполнить
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {enableSheetsPreviewStep && runSheetsPreviewCalculation && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 mb-6 space-y-2">
                <p className="text-sm font-medium text-foreground">Предварительный расчёт в Google Таблице</p>
                <p className="text-xs text-muted-foreground">
                  Одновременно расчёт должен запускать только один администратор: лист IN перезаписывается для всей книги.
                  База не меняется, пока вы не нажмёте «Записать стоимости из таблицы в базу».
                </p>
                <Button type="button" className="gap-1.5 mt-2" onClick={() => setStep(3)}>
                  Далее: предварительный расчёт
                  <ChevronRight size={16} />
                </Button>
                {validationIssues.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Есть замечания по полям — расчёт всё равно доступен; при необходимости заполните их позже в полной таблице.
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-col gap-3">
              {queueProgress && onSaveAndContinueQueue && (
                <div className="flex flex-col sm:flex-row flex-wrap gap-2">
                  <Button
                    className="gap-1.5 sm:order-first"
                    disabled={queueActionLoading || isSavingQuickDraft}
                    onClick={() => void onSaveAndContinueQueue()}
                  >
                    {queueActionLoading || isSavingQuickDraft
                      ? 'Сохранение…'
                      : queueProgress.current < queueProgress.total
                        ? 'Сохранить и перейти к следующей команде'
                        : 'Сохранить и завершить'}
                  </Button>
                  <p className="text-xs text-muted-foreground sm:self-center">
                    {queueProgress.current < queueProgress.total
                      ? 'При необходимости сначала сохраните черновик коэффициентов кнопкой ниже.'
                      : 'После завершения вы вернётесь к выбору сценария.'}
                  </p>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
                {hasQuickDraft && onSaveQuickDraft && (
                  <>
                    <span className="text-xs text-muted-foreground">Несохранённые изменения</span>
                    <Button onClick={() => void onSaveQuickDraft()} disabled={isSavingQuickDraft} variant="secondary" size="sm">
                      {isSavingQuickDraft ? 'Сохранение…' : 'Только сохранить'}
                    </Button>
                  </>
                )}
                <Button variant="outline" onClick={handleExitClick}>
                  Выйти в полную таблицу
                </Button>
                <Button onClick={handleBackToStep1} variant="ghost">
                  Назад к коэффициентам
                </Button>
              </div>
            </div>
          </section>
        ) : (
          <section className="rounded-xl border border-border bg-card p-6 max-w-4xl space-y-6">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
              <div className="flex items-center gap-2">
                <Calculator size={20} className="text-muted-foreground" />
                <h2 className="text-lg font-semibold">Предварительный расчёт (лист OUT)</h2>
              </div>
              {(unit || team) && (
                <span className="text-sm text-muted-foreground">
                  {[unit, team].filter(Boolean).join(' · ')}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Коэффициенты из этого шага (включая несохранённые в базе) отправляются на лист IN как оверрайды; после пересчёта формул читаются итоги 2025 Q1–Q4
              (колонки O–R). База данных не обновляется, пока вы явно не примените стоимости.
            </p>
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-muted-foreground">
              Не запускайте расчёт одновременно с другим администратором. Если передумали — восстановите лист IN из базы (без черновых процентов).
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                className="gap-1.5"
                disabled={previewLoading || !runSheetsPreviewCalculation}
                onClick={() => void handleRunPreview()}
              >
                {previewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
                Рассчитать предварительно
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={restoreInLoading || !restoreSheetsInFromDatabase}
                onClick={() => void handleRestoreIn()}
              >
                {restoreInLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Сбросить лист IN по базе
              </Button>
              {onSaveQuickDraft && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isSavingQuickDraft}
                  onClick={() => void onSaveQuickDraft()}
                >
                  {isSavingQuickDraft ? 'Сохранение…' : 'Сохранить коэффициенты в базу'}
                </Button>
              )}
              <Button
                type="button"
                variant="default"
                disabled={applyOutLoading || !applySheetCostsFromOut}
                onClick={() => void handleApplyOut()}
              >
                {applyOutLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Записать стоимости из таблицы в базу
              </Button>
            </div>

            {previewMeta?.message && (
              <p className="text-xs text-muted-foreground">{previewMeta.message}</p>
            )}

            {previewRows && previewRows.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="text-left p-2 font-medium">Инициатива</th>
                      {OUT_ITOG_KEYS.map((k) => (
                        <th key={k} className="text-right p-2 font-medium whitespace-nowrap">
                          Итог {k}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row) => (
                      <tr key={row.initiativeId} className="border-b border-border/60">
                        <td className="p-2 max-w-[220px] truncate" title={row.initiativeName ?? row.initiativeId}>
                          {row.initiativeName ?? row.initiativeId.slice(0, 8) + '…'}
                        </td>
                        {OUT_ITOG_KEYS.map((k) => (
                          <td key={k} className="p-2 text-right tabular-nums">
                            {row.itog[k] != null ? formatCost(row.itog[k]) : '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              <Button type="button" variant="ghost" onClick={() => setStep(2)}>
                Назад к проверке
              </Button>
              <Button type="button" variant="outline" onClick={handleExitClick}>
                Выйти в полную таблицу
              </Button>
            </div>
          </section>
        )}

        {step === 1 && (
          <div className="flex justify-end">
            <Button variant="outline" onClick={handleExitClick}>
              Перейти к полной таблице
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
