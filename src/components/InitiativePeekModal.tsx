import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  RawDataRow,
  calculateBudget,
  formatBudget,
  hasPreliminaryQuarterInPeriod,
  PRELIMINARY_COST_USER_MESSAGE,
} from '@/lib/dataManager';
import { AlertCircle, AlertTriangle, CheckCircle2, ExternalLink, Pencil } from 'lucide-react';
import { DescriptionMarkdown } from '@/components/DescriptionMarkdown';

interface InitiativePeekModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: RawDataRow | null;
  selectedQuarters: string[];
  /** If false, hide the cost section */
  showMoney?: boolean;
  /** С дашборда: перейти на вкладку таймлайна */
  onGoToTimeline?: (initiativeName: string) => void;
  /** Quick flow: после просмотра как у пользователя — открыть редактирование карточки */
  onEditCard?: () => void;
  /**
   * Шаг проверки карточки в quick flow: список незаполненных обязательных полей (`getMissingInitiativeFields`).
   * Если передан (в т.ч. пустой массив) — показываем блок проверки; если `undefined` — как на дашборде, без блока.
   */
  missingCardFields?: string[];
}

export function InitiativePeekModal({
  open,
  onOpenChange,
  row,
  selectedQuarters,
  showMoney = true,
  onGoToTimeline,
  onEditCard,
  missingCardFields,
}: InitiativePeekModalProps) {
  const handleGoToTimeline = () => {
    if (row && onGoToTimeline) {
      onGoToTimeline(row.initiative);
      onOpenChange(false);
    }
  };

  const handleEditCard = () => {
    onEditCard?.();
    onOpenChange(false);
  };

  const fieldLabel = (code: string) =>
    code === 'Тип' ? 'тип инициативы' : code === 'Стейкх.' ? 'стейкхолдеры' : code === 'Описание' ? 'описание' : code;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-lg max-h-[85vh] flex flex-col p-0 gap-0"
      >
        <DialogHeader className="flex-shrink-0 px-6 pt-6 pb-2">
          <DialogTitle className="text-xl pr-8">
            {row ? row.initiative : 'Инициатива'}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Описание и ссылка на документацию
          </DialogDescription>
        </DialogHeader>

        {!row ? (
          <div className="px-6 py-4 text-muted-foreground text-sm">
            Инициатива не найдена.
          </div>
        ) : (
          <>
            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-2 space-y-4">
              {missingCardFields != null ? (
                missingCardFields.length > 0 ? (
                  <div
                    role="alert"
                    className="rounded-lg border border-destructive/55 bg-destructive/10 px-3 py-3 text-sm dark:bg-destructive/15"
                  >
                    <div className="flex gap-2.5">
                      <AlertCircle
                        className="h-5 w-5 shrink-0 text-destructive"
                        strokeWidth={2.25}
                        aria-hidden
                      />
                      <div className="min-w-0 space-y-1.5">
                        <p className="font-semibold leading-snug text-destructive">
                          Не заполнены обязательные поля карточки
                        </p>
                        <ul className="list-inside list-disc space-y-0.5 text-foreground/95">
                          {missingCardFields!.map((code) => (
                            <li key={code} className="pl-0.5">
                              {fieldLabel(code)}
                            </li>
                          ))}
                        </ul>
                        {onEditCard ? (
                          <p className="pt-1 text-xs text-muted-foreground">
                            Нажмите «Редактировать карточку» ниже, чтобы заполнить.
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 rounded-lg border border-emerald-500/45 bg-emerald-500/[0.09] px-3 py-2.5 text-sm dark:border-emerald-500/35 dark:bg-emerald-500/10">
                    <CheckCircle2
                      className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-500"
                      aria-hidden
                    />
                    <p className="leading-snug text-foreground">
                      Обязательные поля карточки для этого шага заполнены.
                    </p>
                  </div>
                )
              ) : null}
              {showMoney &&
              selectedQuarters.length > 0 &&
              hasPreliminaryQuarterInPeriod(row, selectedQuarters) ? (
                <div
                  role="status"
                  className="rounded-lg border border-amber-500/45 bg-amber-500/[0.14] px-3 py-2.5 text-xs leading-snug dark:border-amber-500/40 dark:bg-amber-500/20"
                >
                  <div className="flex gap-2">
                    <AlertTriangle
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-400"
                      aria-hidden
                    />
                    <p className="font-semibold text-amber-950 dark:text-amber-50">
                      {PRELIMINARY_COST_USER_MESSAGE}
                    </p>
                  </div>
                </div>
              ) : null}
              {showMoney && (
                <section>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">
                    Стоимость за выбранный период
                  </h3>
                  <p className="text-sm font-medium">
                    {selectedQuarters.length > 0
                      ? formatBudget(calculateBudget(row, selectedQuarters))
                      : '—'}
                  </p>
                </section>
              )}

              {/* Description */}
              <section>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">Описание</h3>
                {row.description?.trim() ? (
                  <DescriptionMarkdown content={row.description} className="text-sm" />
                ) : (
                  <p className="text-sm text-muted-foreground italic">Описание не добавлено</p>
                )}
              </section>

              {/* Documentation link */}
              <section>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">Документация</h3>
                {row.documentationLink?.trim() ? (
                  <a
                    href={row.documentationLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Открыть ссылку
                  </a>
                ) : (
                  <p className="text-sm text-muted-foreground italic">Документация не указана</p>
                )}
              </section>
            </div>

            <DialogFooter className="flex-shrink-0 flex-wrap gap-2 px-6 py-4 border-t border-border sm:justify-end">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Закрыть
              </Button>
              {onEditCard ? (
                <Button type="button" className="gap-1.5" onClick={handleEditCard}>
                  <Pencil className="h-4 w-4 shrink-0" aria-hidden />
                  Редактировать карточку
                </Button>
              ) : null}
              {onGoToTimeline ? (
                <Button type="button" onClick={handleGoToTimeline}>
                  Перейти к инициативе на таймлайне
                </Button>
              ) : null}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
