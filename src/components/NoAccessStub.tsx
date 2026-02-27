import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';
import { MascotMessageScreen } from '@/components/MascotMessageScreen';

export function NoAccessStub() {
  const { signOut } = useAuth();

  return (
    <MascotMessageScreen
      title="Упс, у вас нет доступа"
      description="Чтобы получить доступ, напишите Сергею Пинчуку."
      action={
        <Button variant="outline" onClick={() => signOut()} className="gap-2">
          <LogOut size={16} />
          Выйти
        </Button>
      }
    />
  );
}
