/**
 * Reproducible evaluation: runs every scenario several times on a fresh
 * PGlite instance and records verdicts and measurements.
 *
 *   npm run eval                 # 5 runs per scenario
 *   EVAL_RUNS=10 npm run eval
 *
 * Writes docs/benchmarks/results.json and docs/benchmarks/RESULTS.md.
 * Timings are from PostgreSQL compiled to WebAssembly running in Node.js on
 * this machine. They are not production PostgreSQL numbers.
 */
import { PGlite } from '@electric-sql/pglite';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runPipeline } from '../src/lib/harness/pipeline';
import type { Db } from '../src/lib/harness/types';
import { SCENARIOS } from './scenarios';

const RUNS = Number(process.env.EVAL_RUNS) || 5;
const OUT = path.resolve(import.meta.dirname, '..', 'docs', 'benchmarks');

interface RunRecord {
  verdict: string;
  speedup?: number;
  beforeMs: number;
  afterMs?: number;
  rowsBefore: number;
  rowsAfter?: number;
  costBefore: number;
  costAfter?: number;
  failedOn?: string;
  elapsedMs: number;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

async function main() {
  const pkg = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '..', 'package.json'), 'utf8'));
  const lock = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '..', 'package-lock.json'), 'utf8'));
  const env = {
    date: new Date().toISOString(),
    planproof: pkg.version,
    pglite: lock.packages?.['node_modules/@electric-sql/pglite']?.version ?? 'unknown',
    node: process.version,
    platform: `${os.platform()} ${os.arch()}`,
    cpu: os.cpus()[0]?.model ?? 'unknown',
    cpus: os.cpus().length,
    runsPerScenario: RUNS,
  };
  console.log(`PlanProof eval: ${SCENARIOS.length} scenarios × ${RUNS} runs`, env);

  const results = [];
  for (const s of SCENARIOS) {
    const runs: RunRecord[] = [];
    for (let i = 0; i < RUNS; i++) {
      const report = await runPipeline(
        { schemaSql: s.schemaSql, seedSql: s.seedSql, query: s.query, suggestion: s.suggestion, useAi: false },
        { createDb: async () => (await PGlite.create()) as unknown as Db },
      );
      const r = report.results[0];
      runs.push({
        verdict: r?.verdict ?? 'NONE',
        speedup: r?.speedup !== undefined && Number.isFinite(r.speedup) ? r.speedup : undefined,
        beforeMs: report.baseline.medianMs,
        afterMs: r?.after?.medianMs,
        rowsBefore: report.baseline.rowsRead,
        rowsAfter: r?.after?.rowsRead,
        costBefore: report.baseline.totalCost,
        costAfter: r?.after?.totalCost,
        failedOn: r?.equivalence.find((e) => !e.equivalent)?.dataset,
        elapsedMs: report.elapsedMs,
      });
    }
    const verdicts = runs.map((r) => r.verdict);
    const matches = verdicts.filter((v) => v === s.expected).length;
    const speedups = runs.map((r) => r.speedup).filter((x): x is number => x !== undefined);
    const row = {
      id: s.id,
      category: s.category,
      expected: s.expected,
      verdicts,
      matches,
      stable: new Set(verdicts).size === 1,
      speedup: speedups.length ? { min: Math.min(...speedups), median: median(speedups), max: Math.max(...speedups) } : null,
      rowsRead: { before: runs[0].rowsBefore, after: runs[0].rowsAfter ?? null },
      planCost: { before: runs[0].costBefore, after: runs[0].costAfter ?? null },
      failedOn: runs[0].failedOn ?? null,
      medianElapsedMs: Math.round(median(runs.map((r) => r.elapsedMs))),
      why: s.why,
    };
    results.push(row);
    console.log(`${s.id.padEnd(30)} expected ${s.expected.padEnd(11)} got ${[...new Set(verdicts)].join('/')} (${matches}/${RUNS})`);
  }

  const totalRuns = results.length * RUNS;
  const totalMatches = results.reduce((a, r) => a + r.matches, 0);
  const summary = {
    scenarios: results.length,
    runs: totalRuns,
    matchingRuns: totalMatches,
    scenariosAllMatching: results.filter((r) => r.matches === RUNS).length,
    unstableScenarios: results.filter((r) => !r.stable).map((r) => r.id),
    semanticRegressionsCaught: results.filter((r) => (r.category === 'semantic-change' || r.category === 'null-trap') && r.matches === RUNS).length,
    semanticRegressionScenarios: results.filter((r) => r.category === 'semantic-change' || r.category === 'null-trap').length,
  };

  mkdirSync(OUT, { recursive: true });
  writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ env, summary, results }, null, 2) + '\n');
  writeFileSync(path.join(OUT, 'RESULTS.md'), markdown(env, summary, results));
  console.log('\nSummary', summary);
  if (totalMatches !== totalRuns) process.exitCode = 1;
}

const fmtX = (x: number) => (x >= 10 ? `${Math.round(x)}×` : `${x.toFixed(1)}×`);
const n = (x: number | null) => (x === null ? '—' : Math.round(x).toLocaleString('en-US'));

interface ResultRow {
  id: string;
  category: string;
  expected: string;
  matches: number;
  speedup: { min: number; median: number; max: number } | null;
  rowsRead: { before: number; after: number | null };
  planCost: { before: number; after: number | null };
  failedOn: string | null;
}

function markdown(env: Record<string, unknown>, summary: Record<string, unknown>, results: ResultRow[]): string {
  const lines = [
    '# Evaluation results',
    '',
    '> Generated by `npm run eval`. Do not edit by hand; re-run to update.',
    '',
    `Run on ${env.date} · PlanProof ${env.planproof} · PGlite ${env.pglite} · Node ${env.node} · ${env.platform} · ${env.cpu} (${env.cpus} CPUs) · ${env.runsPerScenario} runs per scenario, each on a fresh database.`,
    '',
    '## Summary',
    '',
    `- Scenarios: **${summary.scenarios}**, runs: **${summary.runs}**`,
    `- Runs whose verdict matched the expected verdict: **${summary.matchingRuns} / ${summary.runs}**`,
    `- Semantic-regression scenarios (result-changing rewrites, NULL trap) caught in every run: **${summary.semanticRegressionsCaught} / ${summary.semanticRegressionScenarios}**`,
    `- Scenarios whose verdict varied between runs: ${(summary.unstableScenarios as string[]).length ? (summary.unstableScenarios as string[]).join(', ') : '**none**'}`,
    '',
    '## Scenarios',
    '',
    '| Scenario | Category | Expected | Matched | Speed-up (min / median / max) | Rows read before → after | Planner cost before → after | Caught on |',
    '|---|---|---|---|---|---|---|---|',
    ...results.map((r) =>
      `| ${r.id} | ${r.category} | ${r.expected} | ${r.matches}/${env.runsPerScenario} | ${r.speedup && r.expected === 'VERIFIED' ? `${fmtX(r.speedup.min)} / ${fmtX(r.speedup.median)} / ${fmtX(r.speedup.max)}` : '—'} | ${n(r.rowsRead.before)} → ${n(r.rowsRead.after)} | ${n(r.planCost.before)} → ${n(r.planCost.after)} | ${r.failedOn ?? '—'} |`,
    ),
    '',
    '## Method',
    '',
    '- Each run creates a new PGlite (PostgreSQL compiled to WebAssembly) instance, loads the schema and seed data, runs `ANALYZE`, and runs the full PlanProof pipeline with AI analysis turned off. The suggestion under test is the pasted SQL.',
    '- Timings: `EXPLAIN (ANALYZE)` execution time, one warm-up then the median of up to five runs, per side. Speed-up is the ratio of medians. Min / median / max are across the repeated runs above.',
    '- Rows read: rows touched by scan nodes, including rows discarded by a filter, multiplied by loops. Planner cost is Postgres\'s own estimate. Both are deterministic for a given dataset; timings are not.',
    '- Expected verdicts were assigned from SQL semantics before running (see `eval/scenarios.ts`, field `why`). This suite checks known traps; it is not a measure of accuracy on arbitrary queries.',
    '- These are WebAssembly timings on this machine and synthetic data. They show relative effect, not what the same change does on a production server.',
    '',
  ];
  return lines.join('\n');
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
