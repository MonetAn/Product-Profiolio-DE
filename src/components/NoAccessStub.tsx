import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LogOut } from 'lucide-react';

export function NoAccessStub() {
  const { signOut } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Нет доступа к инструменту</CardTitle>
          <CardDescription>
            У вас нет прав для просмотра Product Portfolio. Чтобы получить доступ, напишите в Loop Сергею Пинчуку.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button variant="outline" onClick={() => signOut()} className="gap-2">
            <LogOut size={16} />
            Выйти
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
