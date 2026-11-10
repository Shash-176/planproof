import { checkSetupScript, classifyQuery } from '../sql/guard';
import { stringLiterals } from '../sql/lexer';
import type { AiOutput, AnalyzeRequest } from '../model/schema';
import { dedupe, extractStatements, toCandidate } from './candidates';
import { countRows, EDGE_DATA, generateData, introspect, MAIN_DATA, truncateAll, type GenerateOptions } from './datagen';
import type { MeasureOptions } from './measure';
import { baselineResult, checkEquivalenceOn, runBaseline, verifyOnMain } from './verify';
import type { AiInfo, Candidate, CandidateResult, Db, Report } from './types';

export interface PipelineInput {
  schemaSql: string;
  /** Optional seed script. Without it, data is generated from the schema. */
  seedSql?: string;
  query: string;
  /** What the user's AI suggested: SQL or prose. */
  suggestion?: string;
  useAi: boolean;
}

export type ProgressStep = 'setup' | 'data' | 'baseline' | 'ai' | 'verify' | 'edge' | 'empty' | 'done';

export interface ProgressEvent {
  step: ProgressStep;
  label: string;
  /** True while a database operation is running (the watchdog only times these). */
  db: boolean;
}

export interface PipelineDeps {
  createDb: () => Promise<Db>;
  /** Calls the BharatCode model. May throw; the pipeline continues without it. */
  analyze?: (req: AnalyzeRequest) => Promise<{ output: AiOutput; model: string }>;
  onProgress?: (e: ProgressEvent) => void;
  mainData?: GenerateOptions;
  edgeData?: GenerateOptions;
  measure?: MeasureOptions;
}

/** A problem with the user's input that prevents any verification. */
export class SetupError extends Error {
  constructor(public readonly stage: 'schema' | 'seed' | 'query' | 'data', message: string) {
    super(message);
    this.name = 'SetupError';
  }
}

const MAX_AI_PROPOSALS = 3;

export async function runPipeline(input: PipelineInput, deps: PipelineDeps): Promise<Report> {
  const started = Date.now();
  const progress = (step: ProgressStep, label: string, db = true) => deps.onProgress?.({ step, label, db });
  const warnings: string[] = [];

  // ---- inputs
  const q = classifyQuery(input.query);
  if (!q.ok) throw new SetupError('query', `The query to check must be a single read-only SELECT. ${q.reason}`);
  const query = q.sql;
  const schemaProblem = checkSetupScript(input.schemaSql, 'schema');
  if (schemaProblem) throw new SetupError('schema', schemaProblem);
  if (input.seedSql?.trim()) {
    const seedProblem = checkSetupScript(input.seedSql, 'seed');
    if (seedProblem) throw new SetupError('seed', seedProblem);
  }

  // ---- database
  progress('setup', 'Starting Postgres in your browser');
  const db = await deps.createDb();
  try {
    await db.exec(input.schemaSql);
  } catch (e) {
    throw new SetupError('schema', `The schema failed to load: ${msg(e)}`);
  }
  const tables = await introspect(db);
  if (tables.length === 0) throw new SetupError('schema', 'The schema does not create any tables.');

  progress('data', input.seedSql?.trim() ? 'Loading your seed data' : 'Generating realistic test data');
  let source: 'seed' | 'generated';
  if (input.seedSql?.trim()) {
    try {
      await db.exec(input.seedSql);
    } catch (e) {
      throw new SetupError('seed', `The seed script failed: ${msg(e)}`);
    }
    source = 'seed';
  } else {
    const pool = stringLiterals(`${input.query}\n${input.suggestion ?? ''}`);
    const g = await generateData(db, tables, { ...(deps.mainData ?? MAIN_DATA), textPool: pool });
    if (g.problems.length) warnings.push(...g.problems.map((p) => `Data generation: ${p}`));
    if (g.tables.every((t) => t.rows === 0)) throw new SetupError('data', `Could not generate any data. ${g.problems.join(' ')} Provide a seed script instead.`);
    source = 'generated';
  }
  await db.exec('ANALYZE');
  const counts = await countRows(db, tables);

  // ---- baseline
  progress('baseline', 'Running your original query');
  let baseline: Awaited<ReturnType<typeof runBaseline>>;
  try {
    baseline = await runBaseline(db, query, deps.measure);
  } catch (e) {
    throw new SetupError('query', `The original query failed: ${msg(e)}`);
  }

  // ---- candidates: pasted SQL first (deterministic), then the model
  const pasted = input.suggestion?.trim() ? extractStatements(input.suggestion) : [];
  let candidates: Candidate[] = pasted.map((s, i) => toCandidate(s.sql, 'pasted', i + 1));
  let ai: AiInfo = { status: 'skipped', message: 'AI analysis was turned off.' };

  if (input.useAi && deps.analyze) {
    progress('ai', 'Asking the BharatCode model for analysis', false);
    try {
      const res = await deps.analyze({
        schemaSql: input.schemaSql.slice(0, 20_000),
        query,
        suggestion: input.suggestion?.slice(0, 10_000) || undefined,
        planSummary: planSummary(baseline.m),
        needsExtraction: !!input.suggestion?.trim() && pasted.length === 0,
      });
      ai = { status: 'ok', explanation: res.output.explanation, model: res.model };
      const fromUser = res.output.candidates.filter((c) => c.origin === 'user_suggestion');
      const fromModel = res.output.candidates.filter((c) => c.origin === 'model').slice(0, MAX_AI_PROPOSALS);
      // AI-extracted SQL is only used when PlanProof could not find SQL in the paste itself
      if (pasted.length === 0) candidates.push(...fromUser.map((c, i) => toCandidate(c.sql, 'ai-extracted', 100 + i, c.rationale)));
      candidates.push(...fromModel.map((c, i) => toCandidate(c.sql, 'ai-proposed', 200 + i, c.rationale)));
    } catch (e) {
      ai = { status: isNotConfigured(e) ? 'unavailable' : 'error', message: msg(e) };
    }
  } else if (input.useAi) {
    ai = { status: 'unavailable', message: 'AI analysis is not configured.' };
  }
  candidates = dedupe(candidates);
  if (input.suggestion?.trim() && pasted.length === 0 && !candidates.some((c) => c.source === 'ai-extracted'))
    warnings.push('No SQL was found in the pasted suggestion. Paste the SQL itself (CREATE INDEX … or the rewritten SELECT).');
  if (candidates.length === 0) warnings.push('There was nothing to test.');

  // ---- main dataset: measure + compare
  const results: CandidateResult[] = [];
  for (const [i, c] of candidates.entries()) {
    progress('verify', `Testing suggestion ${i + 1} of ${candidates.length}`);
    results.push(await verifyOnMain(db, c, query, baseline, deps.measure));
  }

  // ---- edge-case and empty datasets: equivalence only
  const live = () => results.some((r) => r.verdict === 'VERIFIED' || r.verdict === 'INEFFECTIVE');
  if (live()) {
    progress('edge', 'Re-checking results on data with NULLs and duplicates');
    await truncateAll(db, tables);
    const pool = stringLiterals([query, ...candidates.map((c) => c.sql)].join('\n'));
    const g = await generateData(db, tables, { ...(deps.edgeData ?? EDGE_DATA), textPool: pool });
    if (g.problems.length) {
      warnings.push(`The edge-case dataset could not be fully generated, so that check was skipped. ${g.problems.join(' ')}`);
    } else {
      await db.exec('ANALYZE');
      const base = await baselineResult(db, query);
      for (const [i, r] of results.entries()) results[i] = await checkEquivalenceOn(db, 'edge', r, query, base);
    }
  }
  if (live()) {
    progress('empty', 'Re-checking results on empty tables');
    await truncateAll(db, tables);
    await db.exec('ANALYZE');
    const base = await baselineResult(db, query);
    for (const [i, r] of results.entries()) results[i] = await checkEquivalenceOn(db, 'empty', r, query, base);
  }

  progress('done', 'Done', false);
  return {
    dataset: { source, tables: counts },
    baseline: baseline.m,
    query,
    ai,
    results,
    warnings,
    elapsedMs: Date.now() - started,
  };
}

/** Compact plan description sent to the model. No row values. */
export function planSummary(m: Report['baseline']): string {
  const lines = [
    `Execution time (median): ${m.medianMs.toFixed(2)} ms; planner total cost ${m.totalCost}; rows read by scans ${m.rowsRead}; rows returned ${m.rowsReturned}.`,
    'Plan (indented by depth):',
    ...m.nodes.map((n) =>
      `${'  '.repeat(n.depth)}${n.nodeType}${n.relation ? ` on ${n.relation}` : ''}${n.index ? ` using ${n.index}` : ''} rows=${n.actualRows} loops=${n.loops}${n.removedByFilter ? ` removed=${n.removedByFilter}` : ''}${n.detail ? ` [${n.detail}]` : ''}`,
    ),
  ];
  return lines.join('\n').slice(0, 8_000);
}

function msg(e: unknown) {
  return ((e as { message?: string })?.message ?? String(e)).replace(/^error:\s*/i, '');
}

function isNotConfigured(e: unknown) {
  return (e as { code?: string })?.code === 'not_configured';
}
