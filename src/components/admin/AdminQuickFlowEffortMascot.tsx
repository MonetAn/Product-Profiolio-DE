import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { X } from 'lucide-react';
import type { AdminDataRow } from '@/lib/adminDataManager';
import { cn } from '@/lib/utils';

const MASCOT_SRC = '/Quick-flow/maskot-Quick-flow.png';

const TEXT_NEGATIVE = 'Удоли отрицательное значаение';
const TEXT_SUCCESS = 'Ю ар зе бест!';

/** Длительность слайда маскота (вход = выход, совпадает с CSS transition). */
const MASCOT_SLIDE_MS = 4200;
const ENTER_MS = MASCOT_SLIDE_MS;
const SUCCESS_MS = 2000;
const EXIT_MS = MASCOT_SLIDE_MS;
const DEBOUNCE_MS = 450;

/** translateY(%): больше — ниже, меньше в окне. «Пик» — примерно половина персонажа в клипе. */
const MASCOT_Y_HIDDEN_PCT = 78;
const MASCOT_Y_PEEK_PCT = 38;

function anyNegativeEffort(rows: AdminDataRow[], quarterKeys: string[]): boolean {
  for (const row of rows) {
    if (row.isTimelineStub) continue;
    for (const q of quarterKeys) {
      const v = row.quarterlyData[q]?.effortCoefficient;
      if (typeof v === 'number' && v < 0) return true;
    }
  }
  return false;
}

type Props = {
  rows: AdminDataRow[];
  visibleQuarterKeys: string[];
};

type UiPhase =
  | 'off'
  | 'enter'
  | 'warn'
  | 'exit_tap'
  | 'success'
  | 'exit_ok';

export function AdminQuickFlowEffortMascot({ rows, visibleQuarterKeys }: Props) {
  const hasNegative = useMemo(
    () => anyNegativeEffort(rows, visibleQuarterKeys),
    [rows, visibleQuarterKeys]
  );

  const [debouncedNegative, setDebouncedNegative] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedNegative(hasNegative), DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [hasNegative]);

  const prevDebounced = useRef<boolean | null>(null);
  const [phase, setPhase] = useState<UiPhase>('off');
  const phaseRef = useRef<UiPhase>('off');
  phaseRef.current = phase;

  const [entered, setEntered] = useState(false);
  const [permanentDismiss, setPermanentDismiss] = useState(false);
  const suppressedUntilClearRef = useRef(false);
  /** Только таймеры «успех → выход» — не трогаем clearAll из других эффектов. */
  const successChainRef = useRef<number[]>([]);
  const enterTimerRef = useRef<number | null>(null);

  const clearSuccessChain = useCallback(() => {
    successChainRef.current.forEach((id) => window.clearTimeout(id));
    successChainRef.current = [];
  }, []);

  const clearEnterTimer = useCallback(() => {
    if (enterTimerRef.current != null) {
      window.clearTimeout(enterTimerRef.current);
      enterTimerRef.current = null;
    }
  }, []);

  const prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const tEnter = prefersReducedMotion ? 0 : ENTER_MS;
  const tExit = prefersReducedMotion ? 0 : EXIT_MS;
  const tSuccess = prefersReducedMotion ? 0 : SUCCESS_MS;

  const scheduleSuccessStep = useCallback((ms: number, fn: () => void) => {
    const id = window.setTimeout(fn, ms);
    successChainRef.current.push(id);
  }, []);

  useEffect(() => {
    return () => {
      clearEnterTimer();
      clearSuccessChain();
    };
  }, [clearEnterTimer, clearSuccessChain]);

  /** Вход: дебаунс-минус, не навсегда скрыт, не «ждём очистки» после тапа. */
  useEffect(() => {
    if (permanentDismiss) return;
    if (!debouncedNegative) return;
    if (suppressedUntilClearRef.current) return;
    if (phase !== 'off') return;

    setPhase('enter');
    setEntered(false);
  }, [debouncedNegative, permanentDismiss, phase]);

  /** После фазы enter — запустить CSS-переход «въезда». */
  useLayoutEffect(() => {
    if (phase !== 'enter') return;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setEntered(true));
    });
    return () => cancelAnimationFrame(id);
  }, [phase]);

  /** Enter → warn по таймеру (отдельный таймер, без clearAll). */
  useEffect(() => {
    if (phase !== 'enter') {
      clearEnterTimer();
      return;
    }
    clearEnterTimer();
    enterTimerRef.current = window.setTimeout(() => {
      enterTimerRef.current = null;
      setPhase('warn');
    }, tEnter);
    return () => {
      clearEnterTimer();
    };
  }, [phase, tEnter, clearEnterTimer]);

  /** Успех: дебаунс true→false; phase берём из ref, чтобы не терять из-за порядка эффектов. */
  useEffect(() => {
    const prev = prevDebounced.current;
    prevDebounced.current = debouncedNegative;

    if (prev === null) return;
    if (permanentDismiss) return;

    if (prev === true && debouncedNegative === false) {
      suppressedUntilClearRef.current = false;
      const p = phaseRef.current;
      if (p === 'warn' || p === 'enter') {
        clearEnterTimer();
        clearSuccessChain();
        setPhase('success');
        setEntered(true);
        scheduleSuccessStep(tSuccess, () => {
          setPhase('exit_ok');
          scheduleSuccessStep(400, () => {
            setEntered(false);
            scheduleSuccessStep(tExit + 80, () => {
              setPhase('off');
            });
          });
        });
      }
    }
  }, [debouncedNegative, permanentDismiss, tSuccess, tExit, scheduleSuccessStep, clearEnterTimer, clearSuccessChain]);

  const handleBubbleTap = useCallback(
    (e: React.MouseEvent | React.KeyboardEvent) => {
      e.stopPropagation();
      if (phase !== 'warn' && phase !== 'enter') return;
      clearEnterTimer();
      clearSuccessChain();
      suppressedUntilClearRef.current = true;
      setPhase('exit_tap');
      setEntered(false);
      const id = window.setTimeout(() => setPhase('off'), tExit + 80);
      successChainRef.current.push(id);
    },
    [phase, tExit, clearEnterTimer, clearSuccessChain]
  );

  const handlePermanentDismiss = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      clearEnterTimer();
      clearSuccessChain();
      setPermanentDismiss(true);
      suppressedUntilClearRef.current = false;
      setPhase('exit_tap');
      setEntered(false);
      const id = window.setTimeout(() => setPhase('off'), tExit + 80);
      successChainRef.current.push(id);
    },
    [tExit, clearEnterTimer, clearSuccessChain]
  );

  if (permanentDismiss && phase === 'off') {
    return null;
  }

  const onScreen = phase !== 'off';

  const bubbleText = phase === 'success' || phase === 'exit_ok' ? TEXT_SUCCESS : TEXT_NEGATIVE;
  const bubbleInteractive = phase === 'warn' || phase === 'enter';

  const mascotImgClass = cn('block w-[min(52vw,220px)] max-w-none select-none');

  const mascotImgStyle: CSSProperties | undefined = prefersReducedMotion
    ? { transform: `translateY(${entered ? MASCOT_Y_PEEK_PCT : MASCOT_Y_HIDDEN_PCT}%)` }
    : {
        transform: `translateY(${entered ? MASCOT_Y_PEEK_PCT : MASCOT_Y_HIDDEN_PCT}%)`,
        transitionProperty: 'transform',
        transitionDuration: `${MASCOT_SLIDE_MS}ms`,
        transitionTimingFunction: 'cubic-bezier(0.33, 1, 0.68, 1)',
      };

  return (
    <div
      className={cn(
        'pointer-events-none fixed bottom-0 left-0 z-[80]',
        onScreen ? 'opacity-100' : 'pointer-events-none opacity-0'
      )}
    >
      <div className="flex flex-col items-start gap-2 pl-2 pb-0 sm:pl-3">
        {(phase === 'warn' ||
          phase === 'enter' ||
          phase === 'success' ||
          phase === 'exit_ok') && (
          <div
            role="dialog"
            aria-live="polite"
            className={cn(
              'pointer-events-auto relative z-[2] ml-[min(2vw,12px)] max-w-[min(18rem,calc(100vw-5rem))] rounded-2xl border-2 border-foreground/20 bg-card px-3 py-2.5 text-sm font-medium leading-snug text-foreground shadow-lg transition-opacity duration-300',
              phase === 'exit_ok' && 'pointer-events-none opacity-0',
              bubbleInteractive && 'cursor-pointer pr-9',
              !bubbleInteractive && 'pr-3'
            )}
            onClick={bubbleInteractive ? (e) => handleBubbleTap(e) : undefined}
            onKeyDown={
              bubbleInteractive
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') handleBubbleTap(e);
                  }
                : undefined
            }
            tabIndex={bubbleInteractive ? 0 : -1}
          >
            {bubbleInteractive ? (
              <button
                type="button"
                className="absolute right-1.5 top-1.5 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Не показывать подсказку снова"
                onClick={handlePermanentDismiss}
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
            <span className="block pr-1">{bubbleText}</span>
            {phase !== 'exit_ok' ? (
              <div
                className="absolute -bottom-2 left-6 z-[2] h-3 w-3 rotate-45 border-b-2 border-r-2 border-foreground/20 bg-card"
                aria-hidden
              />
            ) : null}
          </div>
        )}

        <div
          className="pointer-events-none relative -mt-2 h-[min(24vh,180px)] w-[min(52vw,220px)] overflow-hidden"
          aria-hidden
        >
          <img
            src={MASCOT_SRC}
            alt=""
            className={cn('absolute bottom-0 left-0 origin-bottom', mascotImgClass)}
            style={mascotImgStyle}
            draggable={false}
            decoding="async"
            loading="eager"
          />
        </div>
      </div>
    </div>
  );
}
