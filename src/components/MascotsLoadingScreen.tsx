import { useState, useEffect } from 'react';
import { LogoLoader } from '@/components/LogoLoader';
import { cn } from '@/lib/utils';

const BASE = import.meta.env.BASE_URL;
const mascotImages = [
  `${BASE}mascots/char1.png`,
  `${BASE}mascots/char2.png`,
  `${BASE}mascots/char3.png`,
  `${BASE}mascots/char4.png`,
];

/** Пары для «монеты»: (1,2) и (3,4). Меняем каждые пол-оборота → видим 1→2→3→4→1… */
const PAIRS: [string, string][] = [
  [mascotImages[0], mascotImages[1]],
  [mascotImages[2], mascotImages[3]],
];

type MascotsLoadingScreenProps = {
  className?: string;
};

/**
 * Один лоадер по всему приложению: монета переворачивается, по очереди 1→2→3→4.
 * Без текста. Если картинок нет — только спиннер.
 */
export function MascotsLoadingScreen({ className }: MascotsLoadingScreenProps) {
  const [imagesOk, setImagesOk] = useState<boolean | null>(null);
  const [pairIndex, setPairIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setPairIndex((p) => (p + 1) % 2);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const [frontSrc, backSrc] = PAIRS[pairIndex];

  return (
    <div
      className={cn(
        'min-h-screen bg-background flex items-center justify-center',
        className
      )}
    >
      {imagesOk === false ? (
        <LogoLoader className="h-8 w-8" />
      ) : (
        <div
          className="flex items-center justify-center w-32 h-32 sm:w-40 sm:h-40"
          style={{ perspective: '1000px' }}
        >
          <div
            className="mascot-coin relative w-full h-full"
            style={{ transformStyle: 'preserve-3d' }}
          >
            <div
              className="absolute inset-0 rounded-full overflow-hidden bg-transparent"
              style={{
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden',
              }}
            >
              <img
                src={frontSrc}
                alt=""
                className="w-full h-full object-contain"
                onError={() => setImagesOk(false)}
              />
            </div>
            <div
              className="absolute inset-0 rounded-full overflow-hidden bg-transparent"
              style={{
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden',
                transform: 'rotateY(180deg)',
              }}
            >
              <img
                src={backSrc}
                alt=""
                className="w-full h-full object-contain"
                onError={() => setImagesOk(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
