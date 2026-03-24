import { useId } from 'react';

/** Силуэт лапы: SVG Repo «paw-print-bold» (копия в `public/admin-icons/paw-print-bold.svg`), заливка градиентом. */
const PAW_PRINT_BOLD_PATH =
  'M189.02051,145.33984A31.35052,31.35052,0,0,1,174.0918,126.606a47.99847,47.99847,0,0,0-92.18262-.00635,31.35,31.35,0,0,1-14.92969,18.74023,44.00739,44.00739,0,0,0,38.11719,79.21094,60.16331,60.16331,0,0,1,45.80664,0,44.00678,44.00678,0,0,0,38.11719-79.21094ZM168,204a19.86485,19.86485,0,0,1-7.80078-1.57568c-.04395-.019-.08887-.0376-.13379-.05616a84.02637,84.02637,0,0,0-64.13086,0c-.04492.01856-.08984.03711-.13379.05616a20.00673,20.00673,0,0,1-17.31445-36.02246c.03515-.01954.07129-.03907.10644-.05909A55.21137,55.21137,0,0,0,104.957,133.29541a23.99908,23.99908,0,0,1,46.08887.00439,55.20367,55.20367,0,0,0,26.36133,33.043c.03515.02.07129.03955.10644.05909A20.00364,20.00364,0,0,1,168,204Zm64-100a24,24,0,1,1-24-24A23.99994,23.99994,0,0,1,232,104ZM48,128a24,24,0,1,1,24-24A23.99994,23.99994,0,0,1,48,128ZM72,56A24,24,0,1,1,96,80,23.99994,23.99994,0,0,1,72,56Zm64,0a24,24,0,1,1,24,24A23.99994,23.99994,0,0,1,136,56Z';

/**
 * 5 следов: жирный силуэт лапы + градиент. Без hover следы скрыты; по hover — короткий fade по opacity (index.css).
 */

type StepConfig = {
  leftPct: number;
  bottomPct: number;
  rot: number;
  flip: 1 | -1;
  scale: number;
  z: number;
};

/** Позиции вдоль ширины контейнера тропы (тот же max-w-sm, что у заголовка). */
const STEPS: readonly StepConfig[] = [
  { leftPct: 10, bottomPct: 28, rot: 82, flip: 1, scale: 0.82, z: 1 },
  { leftPct: 28, bottomPct: 58, rot: 94, flip: -1, scale: 0.86, z: 2 },
  { leftPct: 50, bottomPct: 30, rot: 88, flip: 1, scale: 0.84, z: 3 },
  { leftPct: 72, bottomPct: 60, rot: 90, flip: -1, scale: 0.9, z: 4 },
  { leftPct: 90, bottomPct: 34, rot: 86, flip: 1, scale: 0.87, z: 5 },
];

function CatPawPrint() {
  const rawId = useId();
  const gradId = `paw-grad-${rawId.replace(/:/g, '')}`;

  return (
    <div
      className="admin-scenario-step-print flex items-center justify-center w-[10.5rem] h-[10.5rem] sm:w-[12rem] sm:h-[12rem] shrink-0 bg-transparent"
      aria-hidden
    >
      <div className="admin-scenario-paw-wrap flex h-full w-full items-center justify-center overflow-visible bg-transparent">
        <svg
          aria-hidden
          className="admin-scenario-paw-svg block h-full w-full min-h-0 min-w-0"
          viewBox="0 0 256 256"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient
              id={gradId}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
              gradientUnits="objectBoundingBox"
            >
              <stop offset="0%" stopColor="var(--paw-g0)" />
              <stop offset="55%" stopColor="var(--paw-g1)" />
              <stop offset="100%" stopColor="var(--paw-g2)" />
            </linearGradient>
          </defs>
          <path d={PAW_PRINT_BOLD_PATH} fill={`url(#${gradId})`} />
        </svg>
      </div>
    </div>
  );
}

export function ScenarioFootstepsIllustration() {
  return (
    <div
      className="scenario-footsteps-root w-full max-w-sm mx-auto shrink-0 px-0 box-border overflow-visible"
      aria-hidden
    >
      <div className="admin-scenario-bird-trail relative w-full h-[11.75rem] sm:h-[13rem] pointer-events-none overflow-visible rounded-lg px-0 py-1 box-border">
        {STEPS.map((s, i) => (
          <div
            key={i}
            className="absolute flex flex-col justify-end items-center w-0"
            style={{
              left: `${s.leftPct}%`,
              bottom: `${s.bottomPct}%`,
              transform: 'translateX(-50%)',
              zIndex: s.z,
            }}
          >
            <div
              className="admin-scenario-step-rotate"
              style={{
                transform: `rotate(${s.rot}deg) scaleX(${s.flip}) scale(${s.scale})`,
                transformOrigin: '50% 100%',
              }}
            >
              <CatPawPrint />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ScenarioTableIllustrationSlot({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <div
      className="flex h-full min-h-[10.75rem] sm:min-h-[12rem] w-full items-center justify-center pointer-events-none shrink-0 px-3 sm:px-4 box-border"
      aria-hidden
    >
      <ScenarioTableGridIllustration reducedMotion={reducedMotion} />
    </div>
  );
}

const TABLE_GRID_COLS = 5;
const TABLE_GRID_ROWS = 3;

function ScenarioTableGridIllustration({ reducedMotion }: { reducedMotion: boolean }) {
  const cells = Array.from({ length: TABLE_GRID_COLS * TABLE_GRID_ROWS }, (_, i) => i);

  if (reducedMotion) {
    return (
      <div
        className="shrink-0 grid grid-cols-5 gap-2 w-[9.25rem] sm:w-[11.5rem] [&>div]:aspect-square [&>div]:rounded-md [&>div]:border [&>div]:border-primary/35 [&>div]:bg-primary/15"
        aria-hidden
      >
        {cells.map((i) => (
          <div key={i} />
        ))}
      </div>
    );
  }

  return (
    <div
      className="shrink-0 grid grid-cols-5 gap-2 w-[9.25rem] sm:w-[11.5rem] admin-scenario-table-grid"
      aria-hidden
    >
      {cells.map((i) => (
        <div
          key={i}
          className="admin-scenario-table-cell aspect-square rounded-md border border-border/70 bg-muted/25"
        />
      ))}
    </div>
  );
}
