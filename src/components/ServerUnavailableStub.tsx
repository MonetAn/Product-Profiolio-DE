import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { MascotMessageScreen } from '@/components/MascotMessageScreen';

interface ServerUnavailableStubProps {
  onRetry: () => void;
}

export function ServerUnavailableStub({ onRetry }: ServerUnavailableStubProps) {
  return (
    <MascotMessageScreen
      title="Сервер не отвечает"
      description="Возможно, бэкенд запускается (Supabase Free tier). Подождите минуту и нажмите «Повторить» или обновите страницу."
      action={
        <Button onClick={onRetry} className="gap-2">
          <RefreshCw size={16} />
          Повторить
        </Button>
      }
    />
  );
}
