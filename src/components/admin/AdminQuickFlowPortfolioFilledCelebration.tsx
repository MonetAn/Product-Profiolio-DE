import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Картинки: `public/mascots/portfolio-celebration/` — без двойного `.png.png`. */
const DISCO_SRC = '/mascots/portfolio-celebration/disco.png';

const FALL_SRCS = [
  '/mascots/portfolio-celebration/ball-a.png',
  '/mascots/portfolio-celebration/ball-b.png',
  '/mascots/portfolio-celebration/ball-c.png',
  '/mascots/portfolio-celebration/ball-d.png',
  '/mascots/portfolio-celebration/ball-e.png',
  '/mascots/portfolio-celebration/ball-f.png',
  '/mascots/portfolio-celebration/ball-g.png',
  '/mascots/portfolio-celebration/ball-h.png',
  '/mascots/portfolio-celebration/ball-i.png',
  '/mascots/portfolio-celebration/ball-j.png',
] as const;

const DODO_SRC = '/mascots/portfolio-celebration/dodo-maskot.png';

/** Как у отрицательных коэффициентов: частичный выезд снизу. */
const DODO_Y_HIDDEN_PCT = 78;
const DODO_Y_PEEK_PCT = 38;
const DODO_SLIDE_MS = 5200;
const DODO_EXIT_MS = 4500;
const DODO_ARM_DELAY_MS = 8000;
const DODO_FLIP_MS = 1150;

const DODO_LINES = [
  'Что, смотрим на дождь из Додошиков?',
  'Серьезно, можно идти дальше по делам',
  'Тогда показываю как умею',
  'Делай вот так каждый день и спина болеть не будет',
  'Тогда я перехожу к шуткам.',
  'Как называется собака, которая умеет показывать фокусы? Лабракадабрадор.',
  'Парашютисты, которые прыгают без парашюта, делают это до конца жизни.',
  'Человек, который строго живет по уголовному кодексу — человек по ук.',
  'Чао-какао',
] as const;

const DODO_LINE_DWELL_MS = 3000;
const DODO_JOKE_DWELL_MS = 4000;

type FallingSpec = {
  id: string;
  leftPct: number;
  delaySec: number;
  durationSec: number;
  rev: boolean;
  src: string;
  sizePx: number;
};

function fallSizePx(slot: number): number {
  const r = (slot * 73 + 19) % 100;
  if (r < 68) return 26 + (r % 14);
  if (r < 90) return 42 + (r % 16);
  return 58 + (r % 34);
}

/** Чуть медленнее падение (длительность цикла), без сильного «тормоза». */
function slowerFallDuration(sec: number): number {
  return Math.min(5.35, Math.max(2.65, sec * 1.24 + 0.12));
}

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = t;
  }
}

function pickSrcAvoidAdjacent(prev: string): string {
  const len = FALL_SRCS.length;
  let k = Math.floor(Math.random() * len);
  for (let t = 0; t < len; t++) {
    const s = FALL_SRCS[(k + t) % len];
    if (s !== prev) return s;
  }
  return FALL_SRCS[0]!;
}

type MotionRow = Omit<FallingSpec, 'id' | 'src' | 'sizePx'>;

function buildFallingSpecs(): FallingSpec[] {
  const base: MotionRow[] = [
    { leftPct: 4, delaySec: 0, durationSec: 3.1, rev: false },
    { leftPct: 14, delaySec: 0.4, durationSec: 3.6, rev: true },
    { leftPct: 22, delaySec: 1.1, durationSec: 2.9, rev: false },
    { leftPct: 31, delaySec: 0.2, durationSec: 4.0, rev: true },
    { leftPct: 40, delaySec: 1.6, durationSec: 3.4, rev: false },
    { leftPct: 48, delaySec: 0.7, durationSec: 2.7, rev: true },
    { leftPct: 56, delaySec: 2.0, durationSec: 3.8, rev: false },
    { leftPct: 64, delaySec: 0.1, durationSec: 3.2, rev: true },
    { leftPct: 72, delaySec: 1.3, durationSec: 2.6, rev: false },
    { leftPct: 80, delaySec: 0.9, durationSec: 3.5, rev: true },
    { leftPct: 88, delaySec: 0.5, durationSec: 2.8, rev: false },
    { leftPct: 93, delaySec: 1.8, durationSec: 3.9, rev: true },
    { leftPct: 10, delaySec: 2.4, durationSec: 3.0, rev: false },
    { leftPct: 76, delaySec: 2.2, durationSec: 2.5, rev: true },
    { leftPct: 7, delaySec: 0.55, durationSec: 3.35, rev: false },
    { leftPct: 52, delaySec: 1.45, durationSec: 2.75, rev: true },
    { leftPct: 67, delaySec: 0.85, durationSec: 3.55, rev: false },
    { leftPct: 18, delaySec: 2.1, durationSec: 2.95, rev: true },
    { leftPct: 85, delaySec: 0.15, durationSec: 4.1, rev: false },
    { leftPct: 37, delaySec: 1.25, durationSec: 3.15, rev: true },
    { leftPct: 59, delaySec: 2.55, durationSec: 2.65, rev: false },
    { leftPct: 2, delaySec: 1.05, durationSec: 3.45, rev: true },
  ];

  const durJitter = (i: number, d: number) => {
    const j = [0, 0.06, -0.04, 0.1, -0.07, 0.03][i % 6];
    return Math.min(4.25, Math.max(2.4, d + j));
  };

  const phaseB: MotionRow[] = base.map((row, i) => {
    const left = ((row.leftPct + 41 + (i % 7) * 5) % 86) + 5;
    return {
      leftPct: Math.min(94, left),
      delaySec: row.delaySec + 2.71 + (i % 11) * 0.17,
      durationSec: durJitter(i + 9, row.durationSec),
      rev: !row.rev,
    };
  });

  const phaseC: MotionRow[] = base.map((row, i) => {
    const left = ((row.leftPct * 3 + 19 + (i % 5) * 11) % 82) + 8;
    return {
      leftPct: Math.min(93, left),
      delaySec: row.delaySec + 1.33 + (i % 9) * 0.23,
      durationSec: durJitter(i + 3, row.durationSec * 0.97),
      rev: i % 2 === 0 ? row.rev : !row.rev,
    };
  });

  const combined: MotionRow[] = [...base, ...phaseB, ...phaseC].map((row) => ({
    ...row,
    durationSec: slowerFallDuration(row.durationSec),
  }));

  shuffleInPlace(combined);

  let prevSrc = '';
  return combined.map((row, i) => {
    const src = pickSrcAvoidAdjacent(prevSrc);
    prevSrc = src;
    return {
      ...row,
      id: `f-${i}`,
      src,
      sizePx: fallSizePx(i * 17 + (src.length % 7)),
    };
  });
}

function usePrefersReducedMotion(): boolean {
  return useMemo(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    []
  );
}

function CelebrationDodoTeaser({ overlayOpen }: { overlayOpen: boolean }) {
  const reduced = usePrefersReducedMotion();
  const [shellVisible, setShellVisible] = useState(false);
  const [entered, setEntered] = useState(false);
  const [lineIndex, setLineIndex] = useState<number | null>(null);
  const [flipping, setFlipping] = useState(false);

  const tSlide = reduced ? 0 : DODO_SLIDE_MS;
  const tExit = reduced ? 0 : DODO_EXIT_MS;
  const tFlip = reduced ? 0 : DODO_FLIP_MS;
  const tArm = reduced ? 800 : DODO_ARM_DELAY_MS;

  useEffect(() => {
    if (!overlayOpen) {
      setShellVisible(false);
      setEntered(false);
      setLineIndex(null);
      setFlipping(false);
      return;
    }

    let cancelled = false;
    const timers: number[] = [];
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        timers.push(window.setTimeout(() => resolve(), ms));
      });

    const run = async () => {
      await sleep(tArm);
      if (cancelled || !overlayOpen) return;

      setShellVisible(true);
      setEntered(false);
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      if (cancelled) return;
      setEntered(true);

      await sleep(tSlide);
      if (cancelled) return;

      for (let i = 0; i < 4; i++) {
        setLineIndex(i);
        await sleep(reduced ? 600 : DODO_LINE_DWELL_MS);
        if (cancelled) return;
      }

      setFlipping(true);
      await sleep(tFlip);
      if (cancelled) return;
      setFlipping(false);

      for (let i = 4; i < 9; i++) {
        setLineIndex(i);
        const dwell = reduced ? 500 : i >= 5 ? DODO_JOKE_DWELL_MS : DODO_LINE_DWELL_MS;
        await sleep(dwell);
        if (cancelled) return;
      }

      setLineIndex(null);
      setEntered(false);
      await sleep(tExit);
      if (cancelled) return;
      setShellVisible(false);
    };

    void run();

    return () => {
      cancelled = true;
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [overlayOpen, tArm, tSlide, tExit, tFlip, reduced]);

  const bubbleText =
    flipping ? DODO_LINES[3] : lineIndex !== null && lineIndex >= 0 ? DODO_LINES[lineIndex] : null;

  const slideWrapStyle: CSSProperties | undefined = reduced
    ? { transform: `translateY(${entered ? DODO_Y_PEEK_PCT : DODO_Y_HIDDEN_PCT}%)` }
    : {
        transform: `translateY(${entered ? DODO_Y_PEEK_PCT : DODO_Y_HIDDEN_PCT}%)`,
        transitionProperty: 'transform',
        transitionDuration: `${DODO_SLIDE_MS}ms`,
        transitionTimingFunction: 'cubic-bezier(0.33, 1, 0.68, 1)',
      };

  if (!shellVisible) return null;

  return (
    <div className="pointer-events-none fixed bottom-0 left-0 z-[30] w-full max-w-[100vw]">
      <div className="flex w-[min(92vw,32rem)] max-w-[100vw] flex-col items-start gap-0 pb-0 pl-2 sm:pl-3">
        {bubbleText ? (
          <div
            role="dialog"
            aria-live="polite"
            className="pointer-events-auto relative z-[2] max-w-[min(22rem,calc(100vw-2.5rem))] self-start rounded-2xl border-2 border-foreground/20 bg-card px-3 py-2.5 text-left text-sm font-medium leading-snug text-foreground shadow-lg"
          >
            <span className="block text-pretty pr-1">{bubbleText}</span>
            <div
              className="absolute -bottom-1.5 left-[2.75rem] z-[2] h-3 w-3 rotate-45 border-b-2 border-r-2 border-foreground/20 bg-card sm:left-[3.25rem]"
              aria-hidden
            />
          </div>
        ) : null}

        <div
          className="pointer-events-none relative -mt-9 h-[min(24vh,200px)] w-[min(56vw,240px)] shrink-0 self-start overflow-hidden"
          aria-hidden
        >
          <div className="absolute bottom-0 left-0 w-[min(56vw,240px)] origin-bottom" style={slideWrapStyle}>
            <div className={cn('origin-center', flipping && 'admin-pf-celebrate-dodo-flip')}>
              <img
                src={DODO_SRC}
                alt=""
                className="block w-[min(56vw,240px)] max-w-none select-none"
                draggable={false}
                decoding="async"
                loading="eager"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type Props = {
  open: boolean;
  onDismiss: () => void;
  /** Подсказка под кнопкой (например при завершении quick flow). */
  continueSubtext?: string;
};

export function AdminQuickFlowPortfolioFilledCelebration({
  open,
  onDismiss,
  continueSubtext,
}: Props) {
  const falling = useMemo(() => buildFallingSpecs(), []);

  if (!open) return null;

  return (
    <div
      className="admin-pf-celebrate-root fixed inset-0 z-[220] flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-pf-celebrate-title"
    >
      <div className="pointer-events-none absolute inset-0 bg-background/80 backdrop-blur-[2px]" aria-hidden />

      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        {falling.map((m) => (
          <img
            key={m.id}
            src={m.src}
            alt=""
            decoding="async"
            draggable={false}
            className={cn(
              'admin-pf-celebrate-faller absolute top-0 w-auto select-none object-contain opacity-90',
              m.rev ? 'admin-pf-celebrate-fall-rev' : 'admin-pf-celebrate-fall'
            )}
            style={{
              left: `${m.leftPct}%`,
              width: m.sizePx,
              height: m.sizePx,
              animationDuration: `${m.durationSec}s`,
              animationDelay: `${m.delaySec}s`,
            }}
          />
        ))}
      </div>

      <div
        className="admin-pf-celebrate-disco-pendulum pointer-events-none absolute left-1/2 top-3 z-[2] flex w-[min(7.5rem,22vw)] -translate-x-1/2 flex-col items-center"
        aria-hidden
      >
        <div className="h-9 w-px shrink-0 rounded-full bg-gradient-to-b from-transparent via-border to-border" />
        <div className="admin-pf-celebrate-disco-arm flex shrink-0 justify-center pt-0.5">
          <img
            src={DISCO_SRC}
            alt=""
            decoding="async"
            draggable={false}
            className="admin-pf-celebrate-disco-img h-[min(5.5rem,18vw)] w-[min(5.5rem,18vw)] object-contain drop-shadow-md"
          />
        </div>
      </div>

      <CelebrationDodoTeaser overlayOpen={open} />

      <div className="relative z-[40] flex min-h-0 flex-1 flex-col items-center justify-center px-4 py-16 sm:px-6">
        <div className="max-w-lg rounded-2xl border border-border bg-card/95 p-6 text-center shadow-lg backdrop-blur-sm sm:p-8">
          <h2
            id="admin-pf-celebrate-title"
            className="font-juneau text-balance text-xl font-medium leading-snug tracking-tight text-foreground sm:text-2xl"
          >
            Вы успешно заполнили продуктовый портфель!
          </h2>
          {continueSubtext ? (
            <p className="mt-3 text-xs text-muted-foreground">{continueSubtext}</p>
          ) : null}
          <Button type="button" className="mt-6" size="lg" onClick={onDismiss}>
            Продолжить
          </Button>
        </div>
      </div>
    </div>
  );
}
