import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RawDataRow, calculateBudget, formatBudget } from '@/lib/dataManager';
import { ExternalLink } from 'lucide-react';
import { DescriptionMarkdown } from '@/components/DescriptionMarkdown';

interface InitiativePeekModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: RawDataRow | null;
  selectedQuarters: string[];
  onGoToTimeline: (initiativeName: string) => void;
}

export function InitiativePeekModal({
  open,
  onOpenChange,
  row,
  selectedQuarters,
  onGoToTimeline,
}: InitiativePeekModalProps) {
  const handleGoToTimeline = () => {
    if (row) {
      onGoToTimeline(row.initiative);
      onOpenChange(false);
    }
  };

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
              {/* Cost */}
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

            <DialogFooter className="flex-shrink-0 px-6 py-4 border-t border-border">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Закрыть
              </Button>
              <Button onClick={handleGoToTimeline}>
                Перейти к инициативе на таймлайне
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
