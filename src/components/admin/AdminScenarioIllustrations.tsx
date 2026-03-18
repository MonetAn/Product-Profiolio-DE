/**
 * 5 лап по дуге снизу-слева вверх-вправо (ходьба), зона только над текстом.
 * Чередование L/R, лёгкая перспектива (scale). Hover: мягкий оранжевый акцент.
 */

type StepConfig = {
  leftPct: number;
  bottomPct: number;
  rot: number;
  flip: 1 | -1;
  scale: number;
  z: number;
};

/** bottomPct выше = след выше; дуга в верхней 2/3 зоны, чтобы после поворота низ не резался overflow */
const STEPS: readonly StepConfig[] = [
  { leftPct: 7, bottomPct: 30, rot: 82, flip: 1, scale: 0.88, z: 1 },
  { leftPct: 26, bottomPct: 62, rot: 94, flip: -1, scale: 0.93, z: 2 },
  { leftPct: 44, bottomPct: 32, rot: 88, flip: 1, scale: 0.9, z: 3 },
  { leftPct: 62, bottomPct: 64, rot: 90, flip: -1, scale: 0.97, z: 4 },
  { leftPct: 82, bottomPct: 36, rot: 86, flip: 1, scale: 0.94, z: 5 },
];

function StepPrint({ reducedMotion }: { reducedMotion: boolean }) {
  if (reducedMotion) {
    return (
      <div
        className="admin-scenario-step-print flex flex-col items-center w-[2.85rem] sm:w-[3.1rem] shrink-0"
        aria-hidden
      >
        <div className="flex justify-center items-end gap-0.5 sm:gap-1">
          <div className="size-[1rem] sm:size-[1.1rem] rounded-full border-2 border-primary/40 bg-primary/20" />
          <div className="size-[1rem] sm:size-[1.1rem] rounded-full border-2 border-primary/40 bg-primary/20 translate-y-px" />
          <div className="size-[1rem] sm:size-[1.1rem] rounded-full border-2 border-primary/40 bg-primary/20" />
        </div>
        <div className="h-1 sm:h-1.5 w-2 shrink-0" aria-hidden />
        <div className="w-[2.45rem] sm:w-[2.7rem] h-[2.75rem] sm:h-12 rounded-t-md rounded-b-[1.5rem] sm:rounded-b-[1.65rem] border-2 border-primary/40 bg-primary/15" />
      </div>
    );
  }

  return (
    <div
      className="admin-scenario-step-print flex flex-col items-center w-[2.95rem] sm:w-[3.35rem] shrink-0"
      aria-hidden
    >
      <div className="admin-scenario-step-toes-row flex justify-center items-end gap-0.5 sm:gap-1">
        <div className="admin-scenario-step-toe size-[1.02rem] sm:size-[1.14rem] rounded-full shrink-0" />
        <div className="admin-scenario-step-toe size-[1.02rem] sm:size-[1.14rem] rounded-full shrink-0 translate-y-px sm:translate-y-0.5" />
        <div className="admin-scenario-step-toe size-[1.02rem] sm:size-[1.14rem] rounded-full shrink-0" />
      </div>
      <div className="shrink-0 h-1 sm:h-1.5 w-2 min-h-[4px]" aria-hidden />
      <div className="admin-scenario-step-pad w-[2.6rem] sm:w-[2.95rem] h-[2.85rem] sm:h-[3.2rem] rounded-t-[0.4rem] sm:rounded-t-md rounded-b-[1.55rem] sm:rounded-b-[1.85rem]" />
    </div>
  );
}

export function ScenarioFootstepsIllustration({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <div
      className="scenario-footsteps-root w-full max-w-full shrink-0 px-2 sm:px-4 box-border"
      aria-hidden
    >
      <div
        className="admin-scenario-bird-trail relative w-full h-[11.75rem] sm:h-[13rem] pointer-events-none overflow-hidden rounded-lg pb-2 box-border"
      >
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
              <StepPrint reducedMotion={reducedMotion} />
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
