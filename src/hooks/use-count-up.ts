import { useEffect, useState } from 'react';

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/**
 * Counts from 0 up to `target` once when a result appears, easing out over `durationMs`.
 * With reduced motion, or in a browser without requestAnimationFrame, it shows the target at once.
 * A changed target counts again from 0. Render the target itself for assistive tech and
 * anything that depends on the value (colour thresholds); this is only what the eye sees.
 */
export function useCountUp(target: number, durationMs = 900): number {
  const [shown, setShown] = useState(() => (shouldCount() ? 0 : target));

  useEffect(() => {
    if (!shouldCount()) {
      setShown(target);
      return;
    }
    let frame = 0;
    const startedAt = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      setShown(Math.round(target * easeOutCubic(progress)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);

  return shown;
}

function shouldCount() {
  return typeof window !== 'undefined'
    && typeof window.requestAnimationFrame === 'function'
    && typeof window.matchMedia === 'function'
    && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
