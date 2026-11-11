import { classifyCandidate } from '../sql/guard';
import { hasTopLevelOrderBy } from '../sql/lexer';
import { compareResults, type ResultSet } from './equivalence';
import { measure, type MeasureOptions } from './measure';
import { compareSentence } from './narrate';
import type { Candidate, CandidateResult, Db, EquivalenceResult, Measurement, DatasetName } from './types';

/** Thresholds for VERIFIED. Deliberately conservative; documented in docs/05. */
export const ACCEPTANCE = {
  /** WASM timings vary by ~15% run to run, so the bar is set well above noise. */
  minSpeedup: 1.5,
  /** Below this the baseline is too fast for timings to mean much. */
  minBaselineMs: 0.5,
  maxResultRows: 200_000,
};

export async function fetchResult(db: Db, sql: string): Promise<ResultSet> {
  const r = await db.query<unknown[]>(sql, [], { rowMode: 'array' });
  if (r.rows.length > ACCEPTANCE.maxResultRows)
    throw new Error(`The query returns more than ${ACCEPTANCE.maxResultRows.toLocaleString('en-US')} rows; too many to compare.`);
  return { columns: r.fields.map((f) => f.name), types: r.fields.map((f) => f.dataTypeID), rows: r.rows };
}

async function rollback(db: Db) {
  try {
    await db.exec('ROLLBACK');
  } catch {
    /* no transaction open */
  }
}

function pgMessage(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e);
  return m.replace(/^error:\s*/i, '');
}

/** Run the original query read-only: measurement and result set. */
export async function runBaseline(db: Db, query: string, opts?: MeasureOptions): Promise<{ m: Measurement; result: ResultSet }> {
  await db.exec('BEGIN READ ONLY');
  try {
    const m = await measure(db, query, opts);
    const result = await fetchResult(db, query);
    return { m, result };
  } finally {
    await rollback(db);
  }
}

/** Only the result set, for edge and empty datasets. */
export async function baselineResult(db: Db, query: string): Promise<ResultSet> {
  await db.exec('BEGIN READ ONLY');
  try {
    return await fetchResult(db, query);
  } finally {
    await rollback(db);
  }
}

interface Trial {
  testedSql: string;
  notes: string[];
  after?: Measurement;
  result: ResultSet;
  newIndexes: string[];
  indexSizeBytes?: number;
}

/**
 * Apply one candidate in a transaction that is always rolled back.
 * Indexes: CREATE INDEX, then the original query runs against it.
 * Rewrites: the rewritten query runs in a READ ONLY transaction.
 */
async function trial(db: Db, candidate: Candidate, query: string, withMeasure: boolean, opts?: MeasureOptions): Promise<Trial> {
  const cls = classifyCandidate(candidate.sql);
  if (!cls.ok) throw new Error(cls.reason);
  if (cls.kind === 'index') {
    await db.exec('BEGIN');
    try {
      const before = await db.query<{ oid: number }>(`SELECT oid::int AS oid FROM pg_class WHERE relkind = 'i'`);
      const known = new Set(before.rows.map((r) => r.oid));
      await db.exec(cls.sql);
      const created = await db.query<{ oid: number; name: string; tbl: string }>(
        `SELECT c.oid::int AS oid, c.relname AS name, format('%I.%I', n.nspname, t.relname) AS tbl
         FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid JOIN pg_class t ON t.oid = i.indrelid
         JOIN pg_namespace n ON n.oid = t.relnamespace WHERE c.relkind = 'i'`,
      );
      const fresh = created.rows.filter((r) => !known.has(r.oid));
      // expression and partial indexes need fresh statistics to be costed properly
      for (const t of new Set(fresh.map((f) => f.tbl))) await db.exec(`ANALYZE ${t}`);
      // from here on nothing in this transaction may write
      await db.exec('SET TRANSACTION READ ONLY');
      const after = withMeasure ? await measure(db, query, opts) : undefined;
      const result = await fetchResult(db, query);
      let size: number | undefined;
      if (fresh.length) {
        const s = await db.query<{ n: number }>(`SELECT sum(pg_relation_size(oid))::float8 AS n FROM pg_class WHERE oid = ANY($1::oid[])`, [fresh.map((f) => f.oid)]);
        size = Number(s.rows[0]?.n ?? 0);
      }
      return { testedSql: cls.sql, notes: cls.notes, after, result, newIndexes: fresh.map((f) => f.name), indexSizeBytes: size };
    } finally {
      await rollback(db);
    }
  }
  await db.exec('BEGIN READ ONLY');
  try {
    const after = withMeasure ? await measure(db, cls.sql, opts) : undefined;
    const result = await fetchResult(db, cls.sql);
    return { testedSql: cls.sql, notes: [], after, result, newIndexes: [] };
  } finally {
    await rollback(db);
  }
}

/** Main dataset: measure and compare. Produces a provisional verdict. */
export async function verifyOnMain(
  db: Db,
  candidate: Candidate,
  query: string,
  baseline: { m: Measurement; result: ResultSet },
  opts?: MeasureOptions,
  timerResolutionMs = 0.001,
): Promise<CandidateResult> {
  const base: CandidateResult = { candidate, verdict: 'INVALID', headline: '', reasons: [], equivalence: [], notes: [] };
  const cls = classifyCandidate(candidate.sql);
  if (!cls.ok) {
    if (cls.category === 'destructive') {
      return { ...base, verdict: 'UNSAFE', headline: 'Unsafe: this SQL would modify your database.', reasons: [cls.reason, 'PlanProof blocked it. It was never executed.'] };
    }
    return { ...base, verdict: 'INVALID', headline: 'Not testable.', reasons: [cls.reason] };
  }

  let t: Trial;
  try {
    t = await trial(db, candidate, query, true, opts);
  } catch (e) {
    const msg = pgMessage(e);
    if (/read-only transaction/i.test(msg)) {
      return { ...base, verdict: 'UNSAFE', headline: 'Unsafe: this SQL tried to modify data.', reasons: ['Postgres refused to run it inside a read-only transaction.', msg] };
    }
    return { ...base, verdict: 'INVALID', headline: 'Could not run this SQL.', reasons: [`Postgres error: ${msg}`] };
  }

  const ordered = hasTopLevelOrderBy(query);
  const cmp = compareResults(baseline.result, t.result, ordered);
  const eq: EquivalenceResult = {
    dataset: 'main',
    equivalent: cmp.equivalent,
    difference: cmp.difference,
    rowsBefore: baseline.result.rows.length,
    rowsAfter: t.result.rows.length,
    detail: cmp.detail,
  };
  const after = t.after!;
  // A median below the clock's step is not a measurement: compute the ratio
  // against the step and report it as a lower bound.
  const floor = Math.max(timerResolutionMs, 0.001);
  const speedupIsLowerBound = after.medianMs <= floor;
  const speedup = baseline.m.medianMs / Math.max(after.medianMs, floor);
  const res: CandidateResult = {
    ...base,
    testedSql: t.testedSql,
    after,
    speedup,
    speedupIsLowerBound,
    equivalence: [eq],
    notes: [...t.notes],
    indexSizeBytes: t.indexSizeBytes,
  };
  if (cls.kind === 'index') {
    const name = t.newIndexes[0];
    res.migration = { up: candidate.sql.replace(/;?\s*$/, ';'), down: name ? `DROP INDEX IF EXISTS ${quoteIdent(name)};` : '-- no index was created' };
  }

  if (!cmp.equivalent) {
    return {
      ...res,
      verdict: 'UNSAFE',
      headline: cmp.difference === 'order' ? 'Unsafe: same rows, different order.' : 'Unsafe: the results change.',
      reasons: [cmp.detail ?? 'Results differ.', 'Tested on the main dataset.'],
    };
  }
  return { ...res, ...judgePerformance(cls.kind, baseline.m, after, speedup, t.newIndexes, speedupIsLowerBound ? floor : undefined) };
}

function judgePerformance(
  kind: 'index' | 'query',
  before: Measurement,
  after: Measurement,
  speedup: number,
  newIndexes: string[],
  /** Set when the after-time was below the clock's step: the speed-up is then a minimum. */
  belowResolutionMs?: number,
): Pick<CandidateResult, 'verdict' | 'headline' | 'reasons'> {
  const lowerBound = belowResolutionMs !== undefined;
  const evidence = compareSentence(before, after, belowResolutionMs);
  if (kind === 'index' && newIndexes.length === 0)
    return { verdict: 'INEFFECTIVE', headline: 'No effect: no new index was created.', reasons: ['An identical index probably exists already.'] };
  if (kind === 'index' && !newIndexes.some((n) => after.usedIndexes.includes(n)))
    return {
      verdict: 'INEFFECTIVE',
      headline: 'No effect: Postgres did not use this index.',
      reasons: ['The query plan is unchanged apart from costs; the planner judged the index not worth using on this data.', evidence],
    };
  if (after.shape === before.shape)
    return { verdict: 'INEFFECTIVE', headline: 'No effect: Postgres runs it exactly the same way.', reasons: ['The query plan is identical to the original.', evidence] };
  if (before.medianMs < ACCEPTANCE.minBaselineMs)
    return {
      verdict: 'INEFFECTIVE',
      headline: 'Nothing to gain: the original is already very fast on this data.',
      reasons: [`The original takes under ${ACCEPTANCE.minBaselineMs} ms, too fast to measure a real improvement.`, evidence],
    };
  const cheaper = after.totalCost < before.totalCost || after.rowsRead < before.rowsRead;
  if (speedup >= ACCEPTANCE.minSpeedup && cheaper)
    return {
      verdict: 'VERIFIED',
      headline: `Verified: ${lowerBound ? 'at least ' : ''}${fmtSpeedup(speedup)} faster, identical results.`,
      reasons: lowerBound ? [evidence, 'The optimised query finished faster than this clock can measure, so the speed-up is a lower bound.'] : [evidence],
    };
  if (speedup < 1 / ACCEPTANCE.minSpeedup)
    return { verdict: 'INEFFECTIVE', headline: `Slower: ${fmtSpeedup(speedup)} the original speed.`, reasons: [evidence] };
  return {
    verdict: 'INEFFECTIVE',
    headline: `No meaningful improvement (${fmtSpeedup(speedup)}).`,
    reasons: [`VERIFIED needs at least ${ACCEPTANCE.minSpeedup}× faster and lower cost or fewer rows read.`, evidence],
  };
}

/** Edge and empty datasets: equivalence only. Downgrades to UNSAFE on any difference. */
export async function checkEquivalenceOn(
  db: Db,
  dataset: DatasetName,
  result: CandidateResult,
  query: string,
  baseline: ResultSet,
): Promise<CandidateResult> {
  if (result.verdict === 'UNSAFE' || result.verdict === 'INVALID') return result;
  let t: Trial;
  try {
    t = await trial(db, result.candidate, query, false);
  } catch (e) {
    const eq: EquivalenceResult = { dataset, equivalent: false, difference: 'error', rowsBefore: baseline.rows.length, rowsAfter: 0, detail: pgMessage(e) };
    return { ...result, verdict: 'UNSAFE', headline: `Unsafe: fails on the ${label(dataset)}.`, reasons: [`Postgres error on the ${label(dataset)}: ${pgMessage(e)}`, ...result.reasons], equivalence: [...result.equivalence, eq] };
  }
  const cmp = compareResults(baseline, t.result, hasTopLevelOrderBy(query));
  const eq: EquivalenceResult = { dataset, equivalent: cmp.equivalent, difference: cmp.difference, rowsBefore: baseline.rows.length, rowsAfter: t.result.rows.length, detail: cmp.detail };
  if (cmp.equivalent) return { ...result, equivalence: [...result.equivalence, eq] };
  return {
    ...result,
    verdict: 'UNSAFE',
    headline: `Unsafe: results change on the ${label(dataset)}.`,
    reasons: [
      `${cmp.detail ?? 'Results differ.'}`,
      dataset === 'edge'
        ? 'The edge-case dataset has many NULLs and duplicate values. The rewrite only looked correct on the main data.'
        : 'With empty tables the rewrite returns a different answer.',
      // performance notes from the main dataset no longer matter once results differ
    ],
    equivalence: [...result.equivalence, eq],
  };
}

function label(d: DatasetName) {
  return d === 'edge' ? 'edge-case dataset' : d === 'empty' ? 'empty tables' : 'main dataset';
}

export function fmtSpeedup(x: number): string {
  if (!Number.isFinite(x)) return '∞×';
  if (x >= 10) return `${Math.round(x).toLocaleString('en-US')}×`;
  return `${x.toFixed(x >= 1 ? 1 : 2)}×`;
}

function quoteIdent(s: string) {
  return /^[a-z_][a-z0-9_$]*$/.test(s) ? s : `"${s.replace(/"/g, '""')}"`;
}
