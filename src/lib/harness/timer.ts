/**
 * Clock resolution. Browsers coarsen performance.now() unless the page is
 * cross-origin isolated (Chrome and Firefox step in 0.1 ms otherwise), and
 * PGlite's EXPLAIN ANALYZE timings come from that clock. A timing below the
 * clock's step is not a measurement, so speed-ups computed from it are
 * reported as lower bounds instead of exact ratios.
 */

export const MIN_RESOLUTION_MS = 0.001;
export const MAX_RESOLUTION_MS = 5;

/** Smallest observable step of `now`, sampled by spinning briefly. */
export function estimateTimerResolutionMs(now: () => number = () => performance.now(), maxSamples = 200_000): number {
  let smallest = Infinity;
  let steps = 0;
  let last = now();
  for (let i = 0; i < maxSamples && steps < 25; i++) {
    const t = now();
    if (t !== last) {
      smallest = Math.min(smallest, t - last);
      last = t;
      steps++;
    }
  }
  if (!Number.isFinite(smallest)) return MAX_RESOLUTION_MS;
  return Math.min(MAX_RESOLUTION_MS, Math.max(MIN_RESOLUTION_MS, smallest));
}
