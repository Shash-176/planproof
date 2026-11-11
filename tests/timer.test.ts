import { describe, expect, it } from 'vitest';
import { estimateTimerResolutionMs, MAX_RESOLUTION_MS, MIN_RESOLUTION_MS } from '@/lib/harness/timer';

/** A fake clock that advances by `tick` ms but only reports multiples of `step`. */
function quantisedClock(step: number, tick = 0.013) {
  let t = 0;
  return () => {
    t += tick;
    return Math.floor(t / step) * step;
  };
}

describe('estimateTimerResolutionMs', () => {
  it('finds the 0.1 ms step browsers use without cross-origin isolation', () => {
    expect(estimateTimerResolutionMs(quantisedClock(0.1))).toBeCloseTo(0.1, 6);
  });

  it('finds a fine step, clamped to 1 µs', () => {
    expect(estimateTimerResolutionMs(quantisedClock(0.005, 0.0011))).toBeCloseTo(0.005, 6);
    expect(estimateTimerResolutionMs(quantisedClock(0.00001, 0.00001))).toBe(MIN_RESOLUTION_MS);
  });

  it('treats a clock that never moves as coarse, not as perfect', () => {
    expect(estimateTimerResolutionMs(() => 42, 1_000)).toBe(MAX_RESOLUTION_MS);
  });

  it('measures the real clock in this environment', () => {
    const r = estimateTimerResolutionMs();
    expect(r).toBeGreaterThanOrEqual(MIN_RESOLUTION_MS);
    expect(r).toBeLessThanOrEqual(1);
  });
});
