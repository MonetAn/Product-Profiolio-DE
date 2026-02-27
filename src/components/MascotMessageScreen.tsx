import { useMemo, ReactNode } from 'react';
import { MascotCoin } from '@/components/MascotCoin';
import { cn } from '@/lib/utils';

type MascotMessageScreenProps = {
  /** Основное сообщение крупно, например «Упс, у вас нет доступа» */
  title: string;
  /** Пояснение ниже */
  description: string;
  /** Кнопка или ссылка (опционально) */
  action?: ReactNode;
  className?: string;
};

/** Экран в едином стиле: слева маскот (char1 или char2 случайно), справа заголовок «Упс…» + пояснение + действие */
export function MascotMessageScreen({ title, description, action, className }: MascotMessageScreenProps) {
  const variant = useMemo(() => (Math.random() < 0.5 ? 'char1' : 'char2'), []);

  return (
    <div
      className={cn(
        'min-h-screen bg-background flex flex-col md:flex-row',
        className
      )}
    >
      <div className="w-full md:w-1/2 min-h-[40vh] md:min-h-screen flex items-center justify-center p-6 md:p-8">
        <MascotCoin
          variant={variant}
          className="w-full max-w-[280px] h-[280px] md:max-w-[50vw] md:h-[50vw] md:max-h-[min(50vw,70vh)]"
        />
      </div>
      <div className="w-full md:w-1/2 flex flex-col items-center justify-center p-6 md:p-12 text-center md:text-left">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-foreground mb-4">
          {title}
        </h1>
        <p className="text-muted-foreground text-lg md:text-xl mb-8 max-w-md">
          {description}
        </p>
        {action}
      </div>
    </div>
  );
}
