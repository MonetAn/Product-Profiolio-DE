/**
 * Production diagnostics for animation performance.
 * Active only when URL contains ?perf=1 (e.g. https://yourapp.com/?perf=1).
 *
 * - Logs long tasks (>50ms) to console
 * - Shows FPS overlay when it drops below 30
 * - Use Chrome DevTools → Performance, record while reproducing lag, look for
 *   "treemap-animation-*" marks and long tasks
 */

const PERF_FLAG = 'perf=1';
const LONG_TASK_MS = 50;
const FPS_WARN_THRESHOLD = 30;
const FPS_SAMPLE_MS = 500;

function isPerfEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.search.includes(PERF_FLAG);
}

let fpsOverlay: HTMLDivElement | null = null;

function ensureFpsOverlay(): HTMLDivElement {
  if (fpsOverlay) return fpsOverlay;
  const el = document.createElement('div');
  el.id = 'perf-fps-overlay';
  el.setAttribute('aria-hidden', 'true');
  Object.assign(el.style, {
    position: 'fixed',
    top: '8px',
    right: '8px',
    zIndex: 2147483647,
    padding: '4px 8px',
    fontFamily: 'monospace',
    fontSize: '12px',
    background: 'rgba(0,0,0,0.75)',
    color: '#0f0',
    borderRadius: '4px',
    pointerEvents: 'none',
  });
  document.body.appendChild(el);
  fpsOverlay = el;
  return el;
}

function updateFpsOverlay(fps: number): void {
  const el = ensureFpsOverlay();
  const isLow = fps < FPS_WARN_THRESHOLD;
  el.textContent = `FPS: ${fps.toFixed(0)}`;
  el.style.color = isLow ? '#f80' : '#0f0';
}

function hideFpsOverlay(): void {
  if (fpsOverlay && fpsOverlay.parentNode) {
    fpsOverlay.parentNode.removeChild(fpsOverlay);
    fpsOverlay = null;
  }
}

export function initPerfDiagnostics(): void {
  if (!isPerfEnabled()) return;

  console.info('[perf] Диагностика включена (?perf=1). Длительные задачи и просадки FPS будут в консоли.');

  // Long tasks (main thread blocked > 50ms → animation jank)
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const duration = entry.duration;
        if (duration >= LONG_TASK_MS) {
          console.warn(
            `[perf] Длинная задача ${duration.toFixed(0)}ms`,
            entry.name ? `(${entry.name})` : '',
            entry
          );
        }
      }
    });
    observer.observe({ type: 'longtask', buffered: true });
  } catch {
    // longtask not supported in all browsers
  }

  // FPS sampling
  let lastTime = performance.now();
  let frames = 0;
  let accumulated = 0;

  function tick(now: number): void {
    if (!isPerfEnabled()) {
      hideFpsOverlay();
      return;
    }
    frames += 1;
    const delta = now - lastTime;
    accumulated += delta;
    if (accumulated >= FPS_SAMPLE_MS) {
      const fps = (frames * 1000) / accumulated;
      if (fps < FPS_WARN_THRESHOLD) {
        console.warn(`[perf] Низкий FPS: ${fps.toFixed(1)}`);
      }
      updateFpsOverlay(fps);
      frames = 0;
      accumulated = 0;
    }
    lastTime = now;
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/** Call from app to add a mark to the Performance timeline (always, negligible cost). */
export function perfMark(name: string): void {
  try {
    performance.mark(name);
  } catch {
    // ignore
  }
}
