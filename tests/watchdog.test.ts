import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DB_STEP_LIMIT_MS, limitFromSearch, Watchdog } from '@/lib/watchdog';

/**
 * Runaway queries: PGlite ignores statement_timeout, so the watchdog is the
 * only thing that stops one. These tests use fake timers.
 */
describe('Watchdog', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fires when a database step makes no progress within the limit', () => {
    const onExpire = vi.fn();
    const dog = new Watchdog(1_000, onExpire);
    dog.observe({ label: 'Testing suggestion 1 of 1', db: true });
    vi.advanceTimersByTime(999);
    expect(onExpire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onExpire).toHaveBeenCalledWith('Testing suggestion 1 of 1', 1_000);
    expect(dog.hasExpired).toBe(true);
  });

  it('restarts the clock on every progress event', () => {
    const onExpire = vi.fn();
    const dog = new Watchdog(1_000, onExpire);
    for (let i = 0; i < 5; i++) {
      dog.observe({ label: `step ${i}`, db: true });
      vi.advanceTimersByTime(900);
    }
    expect(onExpire).not.toHaveBeenCalled();
  });

  it('does not time non-database steps such as the AI call', () => {
    const onExpire = vi.fn();
    const dog = new Watchdog(1_000, onExpire);
    dog.observe({ label: 'Asking the AI model', db: false });
    vi.advanceTimersByTime(60_000);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it('can be disarmed and fires at most once', () => {
    const onExpire = vi.fn();
    const dog = new Watchdog(1_000, onExpire);
    dog.observe({ label: 'a', db: true });
    dog.disarm();
    vi.advanceTimersByTime(5_000);
    expect(onExpire).not.toHaveBeenCalled();
    dog.observe({ label: 'b', db: true });
    vi.advanceTimersByTime(1_000);
    dog.observe({ label: 'c', db: true });
    vi.advanceTimersByTime(5_000);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });
});

describe('limitFromSearch', () => {
  it('defaults, parses and clamps', () => {
    expect(limitFromSearch('')).toBe(DEFAULT_DB_STEP_LIMIT_MS);
    expect(limitFromSearch('?dbStepLimitMs=3000')).toBe(3000);
    expect(limitFromSearch('?dbStepLimitMs=1')).toBe(1000);
    expect(limitFromSearch('?dbStepLimitMs=999999999')).toBe(120000);
    expect(limitFromSearch('?dbStepLimitMs=abc')).toBe(DEFAULT_DB_STEP_LIMIT_MS);
  });
});
