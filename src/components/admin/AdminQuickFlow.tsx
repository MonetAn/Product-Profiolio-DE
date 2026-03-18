import { useState, useMemo, useEffect, useCallback } from 'react';
import { ClipboardList, ListChecks, Plus, ArrowLeft, ChevronRight, Pause, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AdminDataRow,
  AdminQuarterData,
  createEmptyQuarterData,
  getQuickFlowValidationIssues,
} from '@/lib/adminDataManager';

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
  onSaveQuickDraft?: () => void;
  isSavingQuickDraft?: boolean;
  onRequestExitQuick?: (action: 'fullTable' | 'backToStep1', onProceed: () => void) => void;
  step?: 1 | 2;
  setStep?: (step: 1 | 2) => void;
  queueProgress?: { current: number; total: number; teamName: string };
  onSaveAndContinueQueue?: () => void | Promise<void>;
  queueActionLoading?: boolean;
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
}: AdminQuickFlowProps) {
  const [stepLocal, setStepLocal] = useState<1 | 2>(1);
  const step = stepProp ?? stepLocal;
  const setStep = setStepProp ?? setStepLocal;

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

  // Single source of order: new → had effort in previous quarter → zero in previous quarter. Same order for left and right columns.
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

  const handleExitClick = useCallback(() => {
    if (onRequestExitQuick) onRequestExitQuick('fullTable', onGoToFullTable);
    else onGoToFullTable();
  }, [onRequestExitQuick, onGoToFullTable]);

  const handleBackToStep1 = useCallback(() => {
    if (onRequestExitQuick) onRequestExitQuick('backToStep1', () => setStep(1));
    else setStep(1);
  }, [onRequestExitQuick]);

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
        {/* Exit at top + step progress */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={handleExitClick}>
                <ArrowLeft size={16} />
                Выйти в полную таблицу
              </Button>
              <span className="text-sm text-muted-foreground">Шаг {step} из 2</span>
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
          /* Step 1: two columns on desktop — left: past quarter, right: next quarter (coefficients + add) */
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Past quarter */}
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

            {/* Right: Next quarter — coefficients only */}
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
                            onClick={onSaveQuickDraft}
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
        ) : (
          /* Step 2: validation — list initiatives with effort but missing required fields */
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
                      ? 'Сначала устраните замечания, при необходимости сохранятся черновики коэффициентов.'
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
