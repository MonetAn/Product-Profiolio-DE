import { cn } from '@/lib/utils';

const BASE = import.meta.env.BASE_URL;
const MASCOT_CHAR1 = `${BASE}mascots/char1.png`;
const MASCOT_CHAR2 = `${BASE}mascots/char2.png`;

type MascotCoinProps = {
  className?: string;
  onImagesError?: () => void;
  /** Какой маскот показывать; по умолчанию char1 */
  variant?: 'char1' | 'char2';
};

/** Один маскот с покачиванием (char1 или char2). */
export function MascotCoin({ className, onImagesError, variant = 'char1' }: MascotCoinProps) {
  const src = variant === 'char2' ? MASCOT_CHAR2 : MASCOT_CHAR1;
  return (
    <div
      className={cn('flex items-center justify-center', className)}
    >
      <div className="mascot-wiggle relative w-full h-full min-w-[120px] min-h-[120px]">
        <img
          src={src}
          alt=""
          className="w-full h-full object-contain"
          onError={onImagesError}
        />
      </div>
    </div>
  );
}
