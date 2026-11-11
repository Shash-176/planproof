/**
 * Stops runaway database work. PGlite runs Postgres in a single WebAssembly
 * thread and ignores statement_timeout, so a query cannot be cancelled from
 * inside. The only reliable stop is to terminate the Web Worker that hosts
 * it. The pipeline reports when a database step starts; if no progress
 * arrives within the limit, onExpire fires and the caller terminates.
 */

export interface Timers {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
}

const realTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export const DEFAULT_DB_STEP_LIMIT_MS = 45_000;
export const MIN_DB_STEP_LIMIT_MS = 1_000;
export const MAX_DB_STEP_LIMIT_MS = 120_000;

export class Watchdog {
  private handle: unknown = null;
  private expired = false;

  constructor(
    private readonly limitMs: number,
    private readonly onExpire: (label: string, limitMs: number) => void,
    private readonly timers: Timers = realTimers,
  ) {}

  /** Call on every progress event. Database steps are timed; others are not. */
  observe(step: { label: string; db: boolean }): void {
    if (this.expired) return;
    this.disarm();
    if (!step.db) return;
    this.handle = this.timers.set(() => {
      this.handle = null;
      this.expired = true;
      this.onExpire(step.label, this.limitMs);
    }, this.limitMs);
  }

  disarm(): void {
    if (this.handle !== null) this.timers.clear(this.handle);
    this.handle = null;
  }

  get hasExpired(): boolean {
    return this.expired;
  }
}

/** Limit from a URL parameter (?dbStepLimitMs=…), clamped to a safe range. */
export function limitFromSearch(search: string): number {
  const raw = new URLSearchParams(search).get('dbStepLimitMs');
  const n = raw === null ? NaN : Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_DB_STEP_LIMIT_MS;
  return Math.min(MAX_DB_STEP_LIMIT_MS, Math.max(MIN_DB_STEP_LIMIT_MS, Math.round(n)));
}
