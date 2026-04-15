import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ExternalLink, Info, Check, Pencil } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  AdminDataRow,
  AdminQuarterData,
  INITIATIVE_TYPES,
  STAKEHOLDERS_LIST,
  validateTeamQuarterEffort,
  quarterRequiresPlanFact,
  quarterRequiresMetricFact,
  type GeoCostSplit,
} from '@/lib/adminDataManager';
import { useMarketCountries } from '@/hooks/useMarketCountries';
import { GeoCostSplitEditor } from '@/components/admin/GeoCostSplitEditor';
import { compareQuarters, isMetricFactRequiredForQuarter } from '@/lib/quarterUtils';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// Required field label component
const RequiredLabel = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <Label className={`text-sm font-medium ${className}`}>
    {children} <span className="text-red-500">*</span>
  </Label>
);

type BlurFieldOptions = { commitOnBlur?: boolean };

// Hook for local field state; по умолчанию сохранение по blur, иначе только через commit()
function useBlurField<T extends string | number>(
  externalValue: T,
  onSave: (value: T) => void,
  options?: BlurFieldOptions
) {
  const commitOnBlur = options?.commitOnBlur !== false;
  const [localValue, setLocalValue] = useState<T>(externalValue);

  useEffect(() => {
    setLocalValue(externalValue);
  }, [externalValue]);

  const handleChange = (value: T) => setLocalValue(value);
  const handleBlur = () => {
    if (commitOnBlur) onSave(localValue);
  };
  const commit = useCallback(() => {
    onSave(localValue);
  }, [localValue, onSave]);

  return { value: localValue, onChange: handleChange, onBlur: handleBlur, commit };
}

export type QuarterFieldsVariant = 'default' | 'quickTimeline';

export type QuarterFieldsPersistMode = 'blur' | 'explicitSave';

interface QuarterFieldsProps {
  initiativeId: string;
  quarter: string;
  qData: AdminQuarterData;
  allData: AdminDataRow[];
  initiative: AdminDataRow;
  onQuarterDataChange: (
    id: string,
    quarter: string,
    field: keyof AdminQuarterData,
    value: string | number | boolean | GeoCostSplit | undefined
  ) => void;
  /** Полный режим (таблица) или только метрики/on-track + поддержка по периоду (шаг таймлайна quick flow). */
  variant?: QuarterFieldsVariant;
  /** Кварталы сценария quick flow — для вопроса «с какого квартала на поддержке». */
  scenarioQuarters?: string[];
  /** Для шага таймлайна: сохранение только по кнопке «Сохранить», не по blur. */
  persistMode?: QuarterFieldsPersistMode;
  /** Уведомление родителя о несохранённых правках (только при persistMode=explicitSave). */
  onDirtyChange?: (dirty: boolean) => void;
}

function supportScenarioSelectValue(row: AdminDataRow, sortedQs: string[]): string {
  if (sortedQs.length === 0) return 'never';
  const flags = sortedQs.map((q) => row.quarterlyData[q]?.support === true);
  if (!flags.some(Boolean)) return 'never';
  if (flags.every(Boolean)) return 'all';
  const firstTrue = flags.findIndex(Boolean);
  const fromQ = sortedQs[firstTrue];
  const expected = sortedQs.map((q) => compareQuarters(q, fromQ) >= 0);
  const matches = expected.every((e, i) => e === flags[i]);
  return matches ? `from|${fromQ}` : 'mixed';
}

/** Одно значение для UI: «все в поддержке» → первый квартал периода (эквивалентно «с Q1…»). */
function supportScenarioToggleValue(row: AdminDataRow, sortedQs: string[]): string {
  if (sortedQs.length === 0) return '';
  const raw = supportScenarioSelectValue(row, sortedQs);
  if (raw === 'never') return 'never';
  if (raw === 'all') return `from|${sortedQs[0]}`;
  if (raw.startsWith('from|')) return raw;
  return '';
}

function applySupportScenario(
  initiativeId: string,
  sortedQs: string[],
  mode: 'never' | 'from',
  fromQuarter: string | undefined,
  onQuarterDataChange: QuarterFieldsProps['onQuarterDataChange']
) {
  for (const q of sortedQs) {
    const support = mode === 'from' && fromQuarter ? compareQuarters(q, fromQuarter) >= 0 : false;
    onQuarterDataChange(initiativeId, q, 'support', support);
  }
}

const QuarterFields = ({
  initiativeId,
  quarter,
  qData,
  allData,
  initiative,
  onQuarterDataChange,
  variant = 'default',
  scenarioQuarters = [],
  persistMode = 'blur',
  onDirtyChange,
}: QuarterFieldsProps) => {
  const { data: marketCountries = [] } = useMarketCountries({ includeInactive: false });
  const useExplicit = persistMode === 'explicitSave' && variant === 'quickTimeline';
  const save = (field: keyof AdminQuarterData) => (value: string | number | boolean) =>
    onQuarterDataChange(initiativeId, quarter, field, value);

  const blurCommit = { commitOnBlur: !useExplicit };
  const otherCosts = useBlurField(qData.otherCosts, save('otherCosts'), blurCommit);
  const costValue = useBlurField(qData.cost ?? 0, save('cost'), blurCommit);
  const metricPlan = useBlurField(qData.metricPlan, save('metricPlan'), blurCommit);
  const metricFact = useBlurField(qData.metricFact, save('metricFact'), blurCommit);
  const comment = useBlurField(qData.comment, save('comment'), blurCommit);
  const effort = useBlurField(qData.effortCoefficient || 0, save('effortCoefficient'), blurCommit);

  const totalCost = (qData.cost ?? 0) + qData.otherCosts;
  const teamEffort = validateTeamQuarterEffort(allData, initiative.unit, initiative.team, quarter);
  const requiresMetricPlan = quarterRequiresPlanFact(qData);
  const requiresMetricFact = quarterRequiresMetricFact(qData, quarter);

  const sortedScenarioQs = useMemo(
    () => [...scenarioQuarters].filter(Boolean).sort(compareQuarters),
    [scenarioQuarters]
  );

  const scenarioSupportFingerprint = useMemo(
    () =>
      sortedScenarioQs.map((q) => (initiative.quarterlyData[q]?.support === true ? '1' : '0')).join(''),
    [initiative.quarterlyData, sortedScenarioQs]
  );

  const supportSelectValue = useMemo(
    () => supportScenarioSelectValue(initiative, sortedScenarioQs),
    [initiative, sortedScenarioQs, scenarioSupportFingerprint]
  );

  const supportToggleValue = useMemo(
    () => supportScenarioToggleValue(initiative, sortedScenarioQs),
    [initiative, sortedScenarioQs, scenarioSupportFingerprint]
  );

  const [draftOnTrack, setDraftOnTrack] = useState(() => qData.onTrack);
  const [supportDraft, setSupportDraft] = useState(() =>
    supportToggleValue === '' ? 'never' : supportToggleValue
  );
  /** Локальная обратная связь по кнопке «Сохранить» (explicitSave). */
  const [saveFeedback, setSaveFeedback] = useState<'idle' | 'saved' | 'unchanged'>('idle');
  const saveFeedbackTimerRef = useRef<number | null>(null);

  const clearSaveFeedbackTimer = useCallback(() => {
    if (saveFeedbackTimerRef.current != null) {
      window.clearTimeout(saveFeedbackTimerRef.current);
      saveFeedbackTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearSaveFeedbackTimer(), [clearSaveFeedbackTimer]);

  useEffect(() => {
    setSaveFeedback('idle');
    clearSaveFeedbackTimer();
  }, [initiativeId, quarter, clearSaveFeedbackTimer]);

  useEffect(() => {
    if (!useExplicit) return;
    setDraftOnTrack(qData.onTrack);
    setSupportDraft(supportToggleValue === '' ? 'never' : supportToggleValue);
  }, [useExplicit, qData, supportToggleValue]);

  const effectiveSupportThisQuarter = useMemo(() => {
    if (!useExplicit) return qData.support === true;
    if (supportDraft === 'never') return false;
    if (supportDraft.startsWith('from|')) {
      const fromQ = supportDraft.slice(5);
      return compareQuarters(quarter, fromQ) >= 0;
    }
    return qData.support === true;
  }, [useExplicit, supportDraft, quarter, qData.support]);

  const qDataForQuickUi = useMemo(
    () => ({ ...qData, support: effectiveSupportThisQuarter }),
    [qData, effectiveSupportThisQuarter]
  );

  const explicitDirty = useMemo(() => {
    if (!useExplicit) return false;
    const committedSupport = supportToggleValue === '' ? 'never' : supportToggleValue;
    return (
      metricPlan.value !== (qData.metricPlan ?? '') ||
      metricFact.value !== (qData.metricFact ?? '') ||
      comment.value !== (qData.comment ?? '') ||
      draftOnTrack !== qData.onTrack ||
      supportDraft !== committedSupport
    );
  }, [
    useExplicit,
    metricPlan.value,
    metricFact.value,
    comment.value,
    draftOnTrack,
    qData.metricPlan,
    qData.metricFact,
    qData.comment,
    qData.onTrack,
    supportDraft,
    supportToggleValue,
  ]);

  useEffect(() => {
    onDirtyChange?.(explicitDirty);
  }, [explicitDirty, onDirtyChange]);

  useEffect(() => {
    if (!useExplicit) return;
    if (explicitDirty && (saveFeedback === 'saved' || saveFeedback === 'unchanged')) {
      clearSaveFeedbackTimer();
      setSaveFeedback('idle');
    }
  }, [useExplicit, explicitDirty, saveFeedback, clearSaveFeedbackTimer]);

  const handleExplicitSave = useCallback(() => {
    if (!useExplicit) return;
    metricPlan.commit();
    metricFact.commit();
    comment.commit();
    if (draftOnTrack !== qData.onTrack) {
      onQuarterDataChange(initiativeId, quarter, 'onTrack', draftOnTrack);
    }
    const committedSupport = supportToggleValue === '' ? 'never' : supportToggleValue;
    if (supportDraft !== committedSupport) {
      if (supportDraft === 'never') {
        applySupportScenario(initiativeId, sortedScenarioQs, 'never', undefined, onQuarterDataChange);
      } else if (supportDraft.startsWith('from|')) {
        applySupportScenario(
          initiativeId,
          sortedScenarioQs,
          'from',
          supportDraft.slice(5),
          onQuarterDataChange
        );
      }
    }
  }, [
    useExplicit,
    metricPlan,
    metricFact,
    comment,
    draftOnTrack,
    qData.onTrack,
    supportDraft,
    supportToggleValue,
    initiativeId,
    quarter,
    sortedScenarioQs,
    onQuarterDataChange,
  ]);

  const handleExplicitSaveClick = useCallback(() => {
    if (!useExplicit) return;
    clearSaveFeedbackTimer();
    if (!explicitDirty) {
      setSaveFeedback('unchanged');
      saveFeedbackTimerRef.current = window.setTimeout(() => {
        saveFeedbackTimerRef.current = null;
        setSaveFeedback('idle');
      }, 1400);
      return;
    }
    handleExplicitSave();
    setSaveFeedback('saved');
    saveFeedbackTimerRef.current = window.setTimeout(() => {
      saveFeedbackTimerRef.current = null;
      setSaveFeedback('idle');
    }, 2200);
  }, [useExplicit, explicitDirty, handleExplicitSave, clearSaveFeedbackTimer]);

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M ₽`;
    if (value >= 1000) return `${(value / 1000).toFixed(0)}K ₽`;
    return `${Math.round(value).toLocaleString('ru-RU')} ₽`;
  };

  const formatCurrencyFull = (value: number) =>
    `${Math.round(value).toLocaleString('ru-RU')} ₽`;

  if (variant === 'quickTimeline') {
    const showMetricBlock =
      quarterRequiresPlanFact(qDataForQuickUi) || qDataForQuickUi.support;
    const metricsMandatory = quarterRequiresPlanFact(qDataForQuickUi);
    const showFactInput = showMetricBlock && isMetricFactRequiredForQuarter(quarter);
    const factNoteOnly = showMetricBlock && !showFactInput;
    const requiresMetricFactUi = quarterRequiresMetricFact(qDataForQuickUi, quarter);
    const supportChipSelected =
      'data-[state=on]:border-violet-500 data-[state=on]:bg-violet-100 data-[state=on]:text-violet-950 data-[state=on]:shadow-sm dark:data-[state=on]:border-violet-500 dark:data-[state=on]:bg-violet-950/90 dark:data-[state=on]:text-violet-50';

    const onSupportToggleChange = (v: string) => {
      if (v === 'never') applySupportScenario(initiativeId, sortedScenarioQs, 'never', undefined, onQuarterDataChange);
      else if (v.startsWith('from|')) {
        applySupportScenario(initiativeId, sortedScenarioQs, 'from', v.slice(5), onQuarterDataChange);
      }
    };

    const supportQuarterChips = sortedScenarioQs.length > 0 && (
      <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-3 dark:bg-muted/10">
        <h3 className="text-sm font-semibold text-foreground">В каком квартале инициатива переходит на поддержку?</h3>
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
          До выбранного квартала — разработка, с выбранного и до конца периода — поддержка.
        </p>
        {supportSelectValue === 'mixed' ? (
          <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-500">
            Сейчас настройка по кварталам различается — выберите один вариант.
          </p>
        ) : null}
        <ToggleGroup
          type="single"
          variant="outline"
          className="mt-3 flex flex-wrap justify-start gap-1.5"
          value={useExplicit ? supportDraft : supportToggleValue === '' ? undefined : supportToggleValue}
          onValueChange={(v) => {
            if (!v) return;
            if (useExplicit) setSupportDraft(v);
            else onSupportToggleChange(v);
          }}
        >
          <ToggleGroupItem
            value="never"
            aria-label="Не в поддержке в периоде"
            className={cn(
              'h-8 shrink-0 px-2.5 text-xs font-medium transition-colors',
              supportChipSelected
            )}
          >
            Не в поддержке
          </ToggleGroupItem>
          {sortedScenarioQs.map((q) => (
            <ToggleGroupItem
              key={q}
              value={`from|${q}`}
              aria-label={`Поддержка с ${q}`}
              className={cn(
                'h-8 min-w-[3.25rem] shrink-0 px-2 text-xs font-medium tabular-nums transition-colors',
                supportChipSelected
              )}
            >
              {q.replace('-', ' ')}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    );

    const quickBody = (
      <TooltipProvider delayDuration={200}>
        <div className="space-y-6">
          {showMetricBlock ? (
            <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
              <p className="text-sm font-semibold text-foreground">План и факт метрики</p>
              {effectiveSupportThisQuarter ? (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Квартал в поддержке — план и факт по желанию; без обязательной подсветки.
                </p>
              ) : null}
              <div
                className={cn('mt-3 grid gap-4', showFactInput ? 'md:grid-cols-2' : 'md:grid-cols-1')}
              >
                <div className={cn('space-y-1.5', !showFactInput && 'md:max-w-none')}>
                  {metricsMandatory ? (
                    <RequiredLabel className="text-xs">План метрики</RequiredLabel>
                  ) : (
                    <Label className="text-xs text-muted-foreground">План метрики</Label>
                  )}
                  <Textarea
                    value={metricPlan.value}
                    onChange={(e) => metricPlan.onChange(e.target.value)}
                    onBlur={metricPlan.onBlur}
                    placeholder="Планируемое значение метрики..."
                    className={cn(
                      'min-h-[120px] resize-y',
                      metricsMandatory && !metricPlan.value?.trim() && 'ring-2 ring-destructive/40'
                    )}
                  />
                </div>
                {showFactInput ? (
                  <div className="space-y-1.5">
                    {metricsMandatory ? (
                      <RequiredLabel className="text-xs">Факт метрики</RequiredLabel>
                    ) : (
                      <Label className="text-xs text-muted-foreground">Факт метрики</Label>
                    )}
                    <Textarea
                      value={metricFact.value}
                      onChange={(e) => metricFact.onChange(e.target.value)}
                      onBlur={metricFact.onBlur}
                      placeholder="Фактическое значение метрики..."
                      className={cn(
                        'min-h-[120px] resize-y',
                        metricsMandatory &&
                          requiresMetricFactUi &&
                          !metricFact.value?.trim() &&
                          'ring-2 ring-destructive/40'
                      )}
                    />
                  </div>
                ) : null}
              </div>
              {factNoteOnly ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  Факт метрики заполняется после окончания квартала; для текущего и будущих кварталов поле скрыто.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-3 rounded-xl border border-border/80 bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Label className="text-sm font-semibold text-foreground">Инициатива on-track?</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="rounded-full text-muted-foreground outline-none ring-offset-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Что значит on-track"
                  >
                    <Info className="h-4 w-4" aria-hidden />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-[280px] text-sm leading-snug">
                  On-track — экспертная оценка лидера: попадаем ли мы в ожидания в этом квартале по этой инициативе.
                </TooltipContent>
              </Tooltip>
            </div>
            <ToggleGroup
              type="single"
              variant="outline"
              value={(useExplicit ? draftOnTrack : qData.onTrack) ? 'on' : 'off'}
              onValueChange={(v) => {
                if (!v) return;
                if (useExplicit) {
                  setDraftOnTrack(v === 'on');
                } else if (v === 'on') {
                  onQuarterDataChange(initiativeId, quarter, 'onTrack', true);
                } else if (v === 'off') {
                  onQuarterDataChange(initiativeId, quarter, 'onTrack', false);
                }
              }}
              className="grid w-full grid-cols-2 gap-2"
            >
              <ToggleGroupItem value="on" className="h-10 flex-1 text-sm font-medium">
                Да, on-track
              </ToggleGroupItem>
              <ToggleGroupItem value="off" className="h-10 flex-1 text-sm font-medium">
                Нет, не on-track
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {supportQuarterChips}

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Комментарий</Label>
            <Textarea
              value={comment.value}
              onChange={(e) => comment.onChange(e.target.value)}
              onBlur={comment.onBlur}
              placeholder="По желанию — контекст по кварталу…"
              className="min-h-[72px] resize-y"
            />
          </div>
        </div>
      </TooltipProvider>
    );

    if (useExplicit) {
      return (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto [-webkit-overflow-scrolling:touch]">{quickBody}</div>
          <div className="shrink-0 border-t border-border/70 bg-background/95 px-1 py-3 backdrop-blur-sm sm:px-0">
            <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
              <p
                className="order-2 max-w-full text-right text-[11px] leading-snug text-muted-foreground sm:order-1"
                aria-live="polite"
              >
                {saveFeedback === 'saved' ? (
                  <span className="font-medium text-emerald-700 dark:text-emerald-400">Изменения записаны.</span>
                ) : saveFeedback === 'unchanged' ? (
                  <span>Нечего сохранять.</span>
                ) : null}
              </p>
              <Button
                type="button"
                variant={saveFeedback === 'saved' ? 'outline' : 'default'}
                disabled={saveFeedback === 'saved'}
                className={cn(
                  'order-1 min-w-[10.5rem] touch-manipulation transition-transform active:scale-[0.97] active:brightness-95',
                  saveFeedback === 'saved' &&
                    'border-emerald-600/45 bg-emerald-600/[0.08] text-emerald-900 hover:bg-emerald-600/[0.12] dark:border-emerald-500/45 dark:bg-emerald-500/10 dark:text-emerald-50'
                )}
                onClick={handleExplicitSaveClick}
              >
                {saveFeedback === 'saved' ? (
                  <>
                    <Check className="mr-2 h-4 w-4 shrink-0" aria-hidden />
                    Сохранено
                  </>
                ) : (
                  'Сохранить'
                )}
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return quickBody;
  }

  return (
    <div
      className={`rounded-lg border p-4 space-y-4 ${
        qData.support ? 'opacity-75 border-muted' : qData.onTrack ? 'border-border' : 'border-destructive/50 bg-destructive/5'
      }`}
    >
      {/* Quarter Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h4 className="font-semibold text-lg">{quarter}</h4>
          {qData.support && (
            <Badge variant="secondary" className="text-xs">Поддержка</Badge>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="font-medium">{formatCurrency(totalCost)}</div>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-sm">On-Track</Label>
            <Switch
              checked={qData.onTrack}
              onCheckedChange={(checked) => onQuarterDataChange(initiativeId, quarter, 'onTrack', checked)}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/20 px-3 py-2">
        <Label htmlFor={`q-finance-${initiativeId}-${quarter}`} className="text-xs text-muted-foreground">
          Провалидировано финансами
        </Label>
        <Switch
          id={`q-finance-${initiativeId}-${quarter}`}
          checked={qData.costFinanceConfirmed !== false}
          onCheckedChange={(v) => onQuarterDataChange(initiativeId, quarter, 'costFinanceConfirmed', v)}
        />
      </div>

      {/* Effort Coefficient */}
      <div className="space-y-2 p-3 rounded-md bg-muted/30">
        <Label className="text-xs text-muted-foreground">Коэффициент трудозатрат</Label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={effort.value || ''}
            onChange={(e) => effort.onChange(parseInt(e.target.value) || 0)}
            onBlur={effort.onBlur}
            min={0}
            max={100}
            className="w-20 h-8"
          />
          <span className="text-xs text-muted-foreground">%</span>
        </div>
        <div className={`text-xs ${teamEffort.isValid ? 'text-muted-foreground' : 'text-red-600'}`}>
          Команда {initiative.team} в {quarter}: {teamEffort.total}% из 100%
          {!teamEffort.isValid && ' ⚠ Превышение!'}
        </div>
      </div>

      {/* Quarter Fields */}
      <div className="grid grid-cols-2 gap-4">
        {/* Cost (editable) */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Стоимость (из CSV)</Label>
          <Input
            type="number"
            min={0}
            value={costValue.value ?? ''}
            onChange={(e) => costValue.onChange(parseFloat(e.target.value) || 0)}
            onBlur={costValue.onBlur}
            placeholder="0"
          />
        </div>

        {/* Other Costs */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Доп. расходы</Label>
          <Input
            type="number"
            value={otherCosts.value || ''}
            onChange={(e) => otherCosts.onChange(parseFloat(e.target.value) || 0)}
            onBlur={otherCosts.onBlur}
            placeholder="0"
          />
        </div>

        {/* Metric Plan */}
        <div className="space-y-1">
          {requiresMetricPlan ? (
            <RequiredLabel className="text-xs text-muted-foreground">План метрики</RequiredLabel>
          ) : (
            <Label className="text-xs text-muted-foreground">План метрики</Label>
          )}
          <Textarea
            value={metricPlan.value}
            onChange={(e) => metricPlan.onChange(e.target.value)}
            onBlur={metricPlan.onBlur}
            placeholder="Планируемое значение метрики..."
            className={`min-h-[120px] resize-y ${requiresMetricPlan && !qData.metricPlan?.trim() ? 'ring-2 ring-primary/55' : ''}`}
          />
        </div>

        {/* Metric Fact */}
        <div className="space-y-1">
          {requiresMetricFact ? (
            <RequiredLabel className="text-xs text-muted-foreground">Факт метрики</RequiredLabel>
          ) : (
            <Label className="text-xs text-muted-foreground">Факт метрики</Label>
          )}
          <Textarea
            value={metricFact.value}
            onChange={(e) => metricFact.onChange(e.target.value)}
            onBlur={metricFact.onBlur}
            placeholder="Фактическое значение метрики..."
            className={`min-h-[120px] resize-y ${requiresMetricFact && !qData.metricFact?.trim() ? 'ring-2 ring-primary/55' : ''}`}
          />
        </div>
      </div>

      {/* Comment */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Комментарий</Label>
        <Textarea
          value={comment.value}
          onChange={(e) => comment.onChange(e.target.value)}
          onBlur={comment.onBlur}
          placeholder="Комментарии к кварталу..."
          className="min-h-[80px] resize-y"
        />
      </div>

      {(qData.cost ?? 0) > 0 && marketCountries.length > 0 ? (
        <div className="space-y-2 border-t border-border/60 pt-4">
          <Label className="text-xs font-medium text-muted-foreground">
            Распределение стоимости по странам и кластерам
          </Label>
          <GeoCostSplitEditor
            cost={qData.cost ?? 0}
            value={qData.geoCostSplit}
            countries={marketCountries}
            onChange={(next) => onQuarterDataChange(initiativeId, quarter, 'geoCostSplit', next)}
            bulkAddQuarterLabel={quarter}
          />
        </div>
      ) : null}
    </div>
  );
};

interface InitiativeDetailDialogProps {
  initiative: AdminDataRow | null;
  allData: AdminDataRow[];
  quarters: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDataChange: (id: string, field: keyof AdminDataRow, value: string | string[] | number | boolean) => void;
  onQuarterDataChange: (
    id: string,
    quarter: string,
    field: keyof AdminQuarterData,
    value: string | number | boolean | GeoCostSplit | undefined
  ) => void;
  /** Если false — только поля карточки (без блока кварталов), для quick flow поверх таймлайна */
  showQuarterSection?: boolean;
}

const InitiativeDetailDialog = ({
  initiative,
  allData,
  quarters,
  open,
  onOpenChange,
  onDataChange,
  onQuarterDataChange,
  showQuarterSection = true,
}: InitiativeDetailDialogProps) => {
  const [localStakeholders, setLocalStakeholders] = useState<string[]>([]);

  // Top-level text fields with save-on-blur
  const [localName, setLocalName] = useState('');
  const [localDescription, setLocalDescription] = useState('');
  const [localDocLink, setLocalDocLink] = useState('');

  useEffect(() => {
    if (initiative) {
      setLocalStakeholders(initiative.stakeholdersList || []);
      setLocalName(initiative.initiative || '');
      setLocalDescription(initiative.description || '');
      setLocalDocLink(initiative.documentationLink || '');
    }
  }, [initiative?.id]);

  if (!initiative) return null;

  const handleStakeholderToggle = (stakeholder: string, checked: boolean) => {
    const newList = checked
      ? [...localStakeholders, stakeholder]
      : localStakeholders.filter(s => s !== stakeholder);
    setLocalStakeholders(newList);
    onDataChange(initiative.id, 'stakeholdersList', newList);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline">{initiative.unit}</Badge>
            <span>→</span>
            <Badge variant="outline">{initiative.team}</Badge>
          </div>
          <DialogTitle className="text-xl">
            <div className="flex items-center gap-2 group">
              <Input
                value={localName}
                onChange={(e) => setLocalName(e.target.value)}
                onBlur={() => onDataChange(initiative.id, 'initiative', localName)}
                className="text-xl font-semibold border border-transparent hover:border-input focus-visible:border-primary focus-visible:ring-1 px-2 py-1 -mx-2 -my-1 rounded min-w-0 flex-1"
                placeholder="Название инициативы"
                aria-label="Название инициативы (можно редактировать)"
                autoFocus
              />
              <Pencil size={16} className="text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" aria-hidden />
            </div>
            <p className="text-xs text-muted-foreground mt-1">Можно редактировать</p>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Редактирование инициативы {initiative.initiative}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-2 space-y-6 pb-4">
          {/* Initiative Type */}
          <div className="space-y-2">
            <RequiredLabel>Тип инициативы</RequiredLabel>
            <TooltipProvider delayDuration={100}>
              <Select
                value={initiative.initiativeType || ''}
                onValueChange={(v) => onDataChange(initiative.id, 'initiativeType', v)}
              >
                <SelectTrigger className={`w-full focus:ring-0 focus-visible:ring-0 ${!initiative.initiativeType ? 'ring-2 ring-primary/55' : ''}`}>
                  <SelectValue placeholder="Выберите тип" />
                </SelectTrigger>
                <SelectContent>
                  {INITIATIVE_TYPES.map(type => (
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

          {/* Stakeholders */}
          <div className="space-y-2">
            <RequiredLabel>Стейкхолдеры</RequiredLabel>
            <div className={`flex flex-wrap gap-2 p-2 rounded-md transition-all ${
              localStakeholders.length === 0 ? 'ring-2 ring-primary/55 bg-primary/[0.08]' : ''
            }`}>
              {STAKEHOLDERS_LIST.map(stakeholder => {
                const isSelected = localStakeholders.includes(stakeholder);
                return (
                  <button
                    key={stakeholder}
                    type="button"
                    onClick={() => handleStakeholderToggle(stakeholder, !isSelected)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border cursor-pointer transition-all text-sm ${
                      isSelected
                        ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                        : 'bg-background hover:bg-muted border-border'
                    }`}
                  >
                    {isSelected && <Check size={14} className="flex-shrink-0" />}
                    {stakeholder}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <RequiredLabel>Описание</RequiredLabel>
            <Textarea
              value={localDescription}
              onChange={(e) => setLocalDescription(e.target.value)}
              onBlur={() => onDataChange(initiative.id, 'description', localDescription)}
              placeholder="Подробное описание инициативы..."
              className={`min-h-[100px] resize-y ${!initiative.description?.trim() ? 'ring-2 ring-primary/55' : ''}`}
            />
          </div>

          {/* Documentation Link */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Ссылка на документацию</Label>
            <div className="flex gap-2">
              <Input
                value={localDocLink}
                onChange={(e) => setLocalDocLink(e.target.value)}
                onBlur={() => onDataChange(initiative.id, 'documentationLink', localDocLink)}
                placeholder="https://..."
                className="flex-1"
              />
              {initiative.documentationLink && (
                <a
                  href={initiative.documentationLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center w-10 h-10 rounded-md border border-input bg-background hover:bg-accent"
                >
                  <ExternalLink size={16} />
                </a>
              )}
            </div>
          </div>

          {/* Timeline stub (show at bottom in timeline) */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label className="text-sm font-medium">Заглушка в таймлайне</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Показывать внизу таймлайна (кварталы без расписанных инициатив или цели без инициатив)
              </p>
            </div>
            <Switch
              checked={initiative.isTimelineStub === true}
              onCheckedChange={(checked) => onDataChange(initiative.id, 'isTimelineStub', checked)}
            />
          </div>

          {showQuarterSection ? (
            <>
              <Separator />

              {/* Quarters */}
              <div className="space-y-4">
                <Label className="text-sm font-medium">Квартальные данные</Label>
                <div className="space-y-4">
                  {quarters.map((quarter) => {
                    const qData = initiative.quarterlyData[quarter] || {
                      cost: 0,
                      otherCosts: 0,
                      support: false,
                      onTrack: true,
                      metricPlan: '',
                      metricFact: '',
                      comment: '',
                      effortCoefficient: 0
                    };

                    return (
                      <QuarterFields
                        key={quarter}
                        initiativeId={initiative.id}
                        quarter={quarter}
                        qData={qData}
                        allData={allData}
                        initiative={initiative}
                        onQuarterDataChange={onQuarterDataChange}
                      />
                    );
                  })}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export { QuarterFields };
export default InitiativeDetailDialog;
