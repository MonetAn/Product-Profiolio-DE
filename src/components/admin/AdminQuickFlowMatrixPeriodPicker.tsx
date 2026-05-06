import { useCallback, useMemo } from 'react';
import { Plus } from 'lucide-react';
import { ConfigProvider, DatePicker } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import type { Dayjs } from 'dayjs';
import { Button } from '@/components/ui/button';
import { compareQuarters, filterQuartersInRange } from '@/lib/quarterUtils';
import { dayjsToQuarterKey, quarterKeyToDayjs } from '@/lib/quarterDayjs';
import { antSemanticPointerStyles } from '@/lib/antPickerPointerStyles';
import { cn } from '@/lib/utils';

const { RangePicker } = DatePicker;

export type AdminQuickFlowMatrixPeriodPickerProps = {
  catalogQuarters: string[];
  visibleQuarters: string[];
  /** Раньше — подсветка при выборе диапазона двумя кликами; с Ant picker не используется. */
  previewQuarters: string[] | null;
  rangeAnchor: string | null;
  onQuarterClick: (q: string) => void;
  onQuarterHover: (q: string | null) => void;
  onReplaceSelectedQuarters: (quarters: string[]) => void;
  onDismissTransientRangeUI: () => void;
  compactPeriodPicker?: boolean;
  /** Встроен в узкую строку (сводка): без нижней границы и фона панели. */
  embedded?: boolean;
  hidePeriodPicker?: boolean;
  hideAddInitiativeButton?: boolean;
  onOpenAddInitiative?: () => void;
  /** Как у матрицы в режиме split + treemap: прозрачная панель периода. */
  splitImmersive?: boolean;
};

export function AdminQuickFlowMatrixPeriodPicker({
  catalogQuarters,
  visibleQuarters,
  previewQuarters: _previewQuarters,
  rangeAnchor: _rangeAnchor,
  onQuarterClick: _onQuarterClick,
  onQuarterHover: _onQuarterHover,
  onReplaceSelectedQuarters,
  onDismissTransientRangeUI,
  compactPeriodPicker = false,
  embedded = false,
  hidePeriodPicker = false,
  hideAddInitiativeButton = false,
  onOpenAddInitiative = () => {},
  splitImmersive = false,
}: AdminQuickFlowMatrixPeriodPickerProps) {
  void _previewQuarters;
  void _rangeAnchor;
  void _onQuarterClick;
  void _onQuarterHover;

  const catalogSorted = useMemo(
    () => [...catalogQuarters].filter(Boolean).sort(compareQuarters),
    [catalogQuarters]
  );

  const catalogMin = catalogSorted[0] ?? null;
  const catalogMax = catalogSorted.length > 0 ? catalogSorted[catalogSorted.length - 1] : null;

  const disabledDate = useCallback(
    (current: Dayjs) => {
      if (!catalogMin || !catalogMax) return true;
      const key = dayjsToQuarterKey(current);
      return compareQuarters(key, catalogMin) < 0 || compareQuarters(key, catalogMax) > 0;
    },
    [catalogMin, catalogMax]
  );

  const rangeValue: [Dayjs, Dayjs] | null = useMemo(() => {
    const sel = [...visibleQuarters].filter((q) => catalogSorted.includes(q)).sort(compareQuarters);
    if (sel.length === 0) return null;
    const a = quarterKeyToDayjs(sel[0]);
    const b = quarterKeyToDayjs(sel[sel.length - 1]);
    if (!a || !b) return null;
    return [a, b];
  }, [visibleQuarters, catalogSorted]);

  const handleRangeChange = useCallback(
    (dates: null | [Dayjs | null, Dayjs | null]) => {
      if (!dates || dates[0] == null || dates[1] == null) {
        onReplaceSelectedQuarters([]);
        onDismissTransientRangeUI();
        return;
      }
      const from = dayjsToQuarterKey(dates[0]);
      const to = dayjsToQuarterKey(dates[1]);
      const next = filterQuartersInRange(from, to, catalogSorted);
      onReplaceSelectedQuarters(next);
      onDismissTransientRangeUI();
    },
    [catalogSorted, onDismissTransientRangeUI, onReplaceSelectedQuarters]
  );

  const presets = useMemo(() => {
    if (catalogSorted.length === 0) return [];
    const start = quarterKeyToDayjs(catalogSorted[0]);
    const end = quarterKeyToDayjs(catalogSorted[catalogSorted.length - 1]);
    if (!start || !end) return [];
    return [{ label: 'Все кварталы', value: [start, end] as [Dayjs, Dayjs] }];
  }, [catalogSorted]);

  const pickerDisabled = catalogSorted.length === 0;

  return (
    <div
      className={cn(
        'relative flex shrink-0 flex-col',
        embedded
          ? 'z-[1] gap-0 border-0 bg-transparent p-0'
          : cn(
              'z-[30] border-b border-border/80 bg-muted/20',
              compactPeriodPicker ? 'gap-1 px-1.5 py-1 sm:px-2' : 'gap-2 px-2 py-2 sm:px-2.5'
            ),
        splitImmersive && !embedded && 'border-border/55 bg-transparent'
      )}
    >
      <div className={cn('flex shrink-0 items-center', compactPeriodPicker ? 'gap-1.5' : 'gap-2')}>
        {!hideAddInitiativeButton ? (
          <Button
            type="button"
            size="icon"
            variant="outline"
            className={cn('shrink-0', compactPeriodPicker ? 'h-7 w-7' : 'h-8 w-8')}
            onClick={onOpenAddInitiative}
            aria-label="Добавить инициативу"
          >
            <Plus className={compactPeriodPicker ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
          </Button>
        ) : null}
        {hidePeriodPicker ? (
          <div
            className={cn(
              'flex min-h-8 flex-1 items-center rounded-md border border-border/60 bg-muted/30 text-xs text-muted-foreground',
              compactPeriodPicker ? 'px-2 py-1' : 'px-2.5 py-1.5'
            )}
          >
            Все кварталы в выгрузке
          </div>
        ) : (
          <ConfigProvider locale={ruRU}>
            <div className="min-w-0 flex-1 [&_.ant-picker]:max-w-full">
              <RangePicker
                picker="quarter"
                inputReadOnly
                allowClear
                value={rangeValue}
                disabled={pickerDisabled}
                disabledDate={disabledDate}
                presets={presets}
                format="YYYY-[Q]Q"
                placeholder={['Начало', 'Конец']}
                size={compactPeriodPicker ? 'small' : 'middle'}
                styles={antSemanticPointerStyles(pickerDisabled)}
                className={cn('w-full min-w-0', compactPeriodPicker && '[&_.ant-picker-input]:text-xs')}
                onChange={handleRangeChange}
                onOpenChange={(open) => {
                  if (!open) onDismissTransientRangeUI();
                }}
                getPopupContainer={() => document.body}
              />
            </div>
          </ConfigProvider>
        )}
      </div>
    </div>
  );
}
