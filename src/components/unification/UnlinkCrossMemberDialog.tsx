import { Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

export type UnlinkCrossMemberTarget = {
  crossId: string;
  initiativeId: string;
  crossName: string;
  initiativeName: string;
};

interface UnlinkCrossMemberDialogProps {
  target: UnlinkCrossMemberTarget | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (crossId: string, initiativeId: string) => void | Promise<unknown>;
  removing?: boolean;
}

export function UnlinkCrossMemberDialog({
  target,
  onOpenChange,
  onConfirm,
  removing,
}: UnlinkCrossMemberDialogProps) {
  const handleConfirm = async () => {
    if (!target || removing) return;
    try {
      await Promise.resolve(onConfirm(target.crossId, target.initiativeId));
      onOpenChange(false);
    } catch {
      /* ошибка показана снаружи; диалог остаётся открытым */
    }
  };

  return (
    <AlertDialog open={target != null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Отвязать инициативу?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <p className="text-sm text-muted-foreground text-left">
              Инициатива{' '}
              <span className="font-medium text-foreground">{target?.initiativeName}</span> будет
              удалена из кросс-инициативы{' '}
              <span className="font-medium text-foreground">{target?.crossName}</span>. Доли
              участников могут потребовать пересчёта.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={removing}>Отмена</AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            disabled={removing}
            onClick={handleConfirm}
          >
            {removing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                Отвязка…
              </>
            ) : (
              'Отвязать'
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
