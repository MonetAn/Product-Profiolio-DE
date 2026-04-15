import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, Check, ChevronDown, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { compareQuarters } from '@/lib/quarterUtils';
import { cn } from '@/lib/utils';

export type AdminQuickFlowMatrixPeriodPickerProps = {
  catalogQuarters: string[];
  visibleQuarters: string[];
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
  previewQuarters,
  rangeAnchor,
  onQuarterClick,
  onQuarterHover,
  onReplaceSelectedQuarters,
  onDismissTransientRangeUI,
  compactPeriodPicker = false,
  embedded = false,
  hidePeriodPicker = false,
  hideAddInitiativeButton = false,
  onOpenAddInitiative = () => {},
  splitImmersive = false,
}: AdminQuickFlowMatrixPeriodPickerProps) {
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    for (const q of catalogQuarters) {
      const m = q.match(/^(\d{4})-Q[1-4]$/);
      if (m) years.add(m[1]);
    }
    return [...years].sort();
  }, [catalogQuarters]);

  const periodRef = useRef<HTMLDivElement>(null);
  const [periodMenuOpen, setPeriodMenuOpen] = useState(false);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (periodRef.current && !periodRef.current.contains(e.target as Node)) {
        setPeriodMenuOpen(false);
        onDismissTransientRangeUI();
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [onDismissTransientRangeUI]);

  const periodLabel = useMemo(() => {
    const sel = visibleQuarters;
    const cat = catalogQuarters;
    if (sel.length === 0) return 'Период';
    if (
      cat.length > 0 &&
      sel.length === cat.length &&
      sel.every((q) => cat.includes(q))
    ) {
      if (availableYears.length === 0) return 'Все кварталы';
      return `${availableYears[0]}–${availableYears[availableYears.length - 1]}`;
    }
    if (sel.length === 1) return sel[0].replace('-', ' ');
    return `${sel.length} кв.`;
  }, [visibleQuarters, catalogQuarters, availableYears]);

  const handleToggleYear = useCallback(
    (year: string) => {
      const yearQs = catalogQuarters.filter((q) => q.startsWith(`${year}-`)).sort(compareQuarters);
      if (yearQs.length === 0) return;
      const allIn = yearQs.every((q) => visibleQuarters.includes(q));
      if (allIn) {
        onReplaceSelectedQuarters(
          visibleQuarters.filter((q) => !q.startsWith(`${year}-`)).sort(compareQuarters)
        );
      } else {
        const set = new Set(visibleQuarters);
        yearQs.forEach((q) => set.add(q));
        onReplaceSelectedQuarters(catalogQuarters.filter((q) => set.has(q)).sort(compareQuarters));
      }
    },
    [catalogQuarters, visibleQuarters, onReplaceSelectedQuarters]
  );

  const handleSelectAllCatalog = useCallback(() => {
    onReplaceSelectedQuarters([...catalogQuarters].sort(compareQuarters));
  }, [catalogQuarters, onReplaceSelectedQuarters]);

  const handleResetQuarters = useCallback(() => {
    onReplaceSelectedQuarters([]);
  }, [onReplaceSelectedQuarters]);

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
      <div className={cn('flex shrink-0 items-start', compactPeriodPicker ? 'gap-1.5' : 'gap-2')}>
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
          <div ref={periodRef} className="relative min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setPeriodMenuOpen((o) => !o)}
              aria-expanded={periodMenuOpen}
              aria-haspopup="dialog"
              className={cn(
                'flex w-full min-w-0 max-w-full items-center gap-1.5 rounded-md border border-border bg-card text-left text-xs font-medium hover:border-muted-foreground',
                compactPeriodPicker ? 'px-2 py-1' : 'px-2.5 py-1.5',
                periodMenuOpen && 'border-muted-foreground'
              )}
            >
              <Calendar className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{periodLabel}</span>
              <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
            </button>
            {periodMenuOpen ? (
              <div
                className={cn(
                  'absolute left-0 top-full z-[60] mt-1 rounded-lg border border-border bg-card shadow-lg animate-in fade-in slide-in-from-top-1',
                  compactPeriodPicker
                    ? 'min-w-[min(100%,260px)] max-w-[min(100vw-1rem,280px)] p-1.5'
                    : 'min-w-[min(100%,300px)] max-w-[min(100vw-1rem,320px)] p-2'
                )}
                role="dialog"
                aria-label="Период таблицы"
              >
                <div
                  className={cn(
                    'mb-1.5 flex justify-between border-b border-border',
                    compactPeriodPicker ? 'pb-1.5' : 'pb-2'
                  )}
                >
                  <button
                    type="button"
                    className="text-[11px] text-primary underline"
                    onClick={handleSelectAllCatalog}
                  >
                    Все
                  </button>
                  <button
                    type="button"
                    className="text-[11px] text-primary underline"
                    onClick={handleResetQuarters}
                  >
                    Сброс
                  </button>
                </div>
                <p className="mb-1.5 text-[10px] leading-snug text-muted-foreground">
                  {rangeAnchor
                    ? `Второй клик — конец диапазона (${rangeAnchor.replace('-', ' ')})`
                    : 'Два клика по кварталам — диапазон; год — весь год'}
                </p>
                <div className="max-h-[min(44vh,14rem)] overflow-y-auto pr-0.5 [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1">
                  {availableYears.map((year) => {
                    const yearQuarters = catalogQuarters
                      .filter((q) => q.startsWith(year))
                      .sort(compareQuarters);
                    const allYearSelected =
                      yearQuarters.length > 0 && yearQuarters.every((q) => visibleQuarters.includes(q));
                    return (
                      <div key={year} className={cn(compactPeriodPicker ? 'mb-1.5' : 'mb-2', 'last:mb-0')}>
                        <div
                          role="button"
                          tabIndex={0}
                          className={cn(
                            'flex cursor-pointer items-center gap-1.5 rounded px-1 font-semibold hover:bg-secondary',
                            compactPeriodPicker ? 'py-0.5 text-[11px]' : 'px-1.5 py-1 text-xs'
                          )}
                          onClick={() => handleToggleYear(year)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleToggleYear(year);
                            }
                          }}
                        >
                          <span
                            className={cn(
                              'flex shrink-0 items-center justify-center rounded border',
                              compactPeriodPicker ? 'h-3 w-3' : 'h-3.5 w-3.5',
                              allYearSelected
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-border'
                            )}
                          >
                            {allYearSelected ? <Check size={compactPeriodPicker ? 8 : 10} aria-hidden /> : null}
                          </span>
                          {year}
                        </div>
                        <div
                          className={cn(
                            'mt-0.5 grid grid-cols-4 gap-0.5 px-1',
                            !compactPeriodPicker && 'gap-1 px-1.5'
                          )}
                        >
                          {yearQuarters.map((q) => {
                            const qLabel = q.split('-')[1] ?? q;
                            const isSelected = visibleQuarters.includes(q);
                            const isHovered = previewQuarters != null && previewQuarters.includes(q);
                            const isStart = rangeAnchor === q;
                            return (
                              <button
                                key={q}
                                type="button"
                                onClick={() => onQuarterClick(q)}
                                onMouseEnter={() => onQuarterHover(q)}
                                onMouseLeave={() => onQuarterHover(null)}
                                className={cn(
                                  'rounded border transition-all',
                                  compactPeriodPicker ? 'px-1 py-0.5 text-[9px]' : 'px-1.5 py-1 text-[10px]',
                                  isStart
                                    ? 'border-primary bg-primary text-primary-foreground ring-1 ring-primary/30'
                                    : isSelected
                                      ? 'border-foreground bg-foreground text-background'
                                      : isHovered
                                        ? 'border-primary/50 bg-primary/30'
                                        : 'border-border bg-secondary hover:border-muted-foreground'
                                )}
                              >
                                {qLabel}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
