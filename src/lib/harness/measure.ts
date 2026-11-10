import { flatten, rowsRead, shape, usedIndexes, type RawExplain } from './plan';
import { narrate } from './narrate';
import type { Db, Measurement } from './types';

export interface MeasureOptions {
  /** Timed runs after one warm-up. */
  runs?: number;
  /** If the warm-up is slower than this, use fewer runs. */
  slowThresholdMs?: number;
}

export async function explainAnalyze(db: Db, sql: string): Promise<RawExplain> {
  const res = await db.query<Record<string, unknown>>(`EXPLAIN (ANALYZE, FORMAT JSON) ${sql}`);
  const raw = res.rows[0]?.['QUERY PLAN'];
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!Array.isArray(parsed) || !parsed[0]?.Plan) throw new Error('Unexpected EXPLAIN output.');
  return parsed[0] as RawExplain;
}

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Measure a query with EXPLAIN ANALYZE. The caller is responsible for the
 * transaction (READ ONLY for queries; rolled-back for index candidates).
 */
export async function measure(db: Db, sql: string, opts: MeasureOptions = {}): Promise<Measurement> {
  const runs = opts.runs ?? 5;
  const warm = await explainAnalyze(db, sql);
  const warmMs = warm['Execution Time'] ?? 0;
  const n = warmMs > (opts.slowThresholdMs ?? 400) ? Math.min(2, runs) : runs;
  const times: number[] = [];
  let last = warm;
  for (let i = 0; i < n; i++) {
    last = await explainAnalyze(db, sql);
    times.push(last['Execution Time'] ?? 0);
  }
  if (times.length === 0) times.push(warmMs);
  const nodes = flatten(last.Plan);
  return {
    medianMs: median(times),
    runsMs: times,
    planningMs: last['Planning Time'] ?? 0,
    totalCost: last.Plan['Total Cost'],
    rowsRead: rowsRead(nodes),
    rowsReturned: last.Plan['Actual Rows'] ?? 0,
    shape: shape(last.Plan),
    usedIndexes: usedIndexes(nodes),
    nodes,
    narration: narrate(last.Plan),
  };
}
