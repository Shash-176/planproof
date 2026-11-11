/** The subset of the PGlite API the harness depends on. */
export interface Db {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
    options?: { rowMode?: 'object' | 'array' },
  ): Promise<{ rows: T[]; fields: { name: string; dataTypeID: number }[] }>;
  exec(sql: string): Promise<unknown>;
}

export type Verdict = 'VERIFIED' | 'INEFFECTIVE' | 'UNSAFE' | 'INVALID';

export type CandidateKind = 'index' | 'rewrite';

export type CandidateSource = 'pasted' | 'ai-extracted' | 'ai-proposed';

export interface Candidate {
  id: string;
  kind: CandidateKind;
  /** SQL exactly as it will be shown in the migration. */
  sql: string;
  source: CandidateSource;
  rationale?: string;
}

export interface PlanNodeSummary {
  nodeType: string;
  relation?: string;
  alias?: string;
  index?: string;
  actualRows: number;
  loops: number;
  removedByFilter: number;
  depth: number;
  detail?: string;
}

export interface Measurement {
  /** Median of the timed runs, from EXPLAIN ANALYZE "Execution Time". */
  medianMs: number;
  runsMs: number[];
  planningMs: number;
  totalCost: number;
  /** Rows read by scan nodes: (actual rows + rows removed by filter) × loops. */
  rowsRead: number;
  rowsReturned: number;
  /** Stable description of the plan's shape, used to detect "same plan". */
  shape: string;
  usedIndexes: string[];
  nodes: PlanNodeSummary[];
  narration: string[];
}

export type DatasetName = 'main' | 'edge' | 'empty';

export interface EquivalenceResult {
  dataset: DatasetName;
  equivalent: boolean;
  /** 'rows' | 'order' | 'columns' | 'error' */
  difference?: 'rows' | 'order' | 'columns' | 'error';
  rowsBefore: number;
  rowsAfter: number;
  detail?: string;
}

export interface CandidateResult {
  candidate: Candidate;
  verdict: Verdict;
  headline: string;
  reasons: string[];
  /** SQL actually executed (e.g. CONCURRENTLY removed). */
  testedSql?: string;
  after?: Measurement;
  speedup?: number;
  /** True when the optimised median was below the clock's step; speedup is then a minimum. */
  speedupIsLowerBound?: boolean;
  equivalence: EquivalenceResult[];
  migration?: { up: string; down: string };
  indexSizeBytes?: number;
  notes: string[];
}

export interface DatasetInfo {
  source: 'seed' | 'generated';
  tables: { name: string; rows: number }[];
}

export interface AiInfo {
  status: 'ok' | 'unavailable' | 'error' | 'skipped';
  message?: string;
  explanation?: string;
  /** Present for transparency; never used as evidence. */
  model?: string;
  provider?: string;
  latencyMs?: number;
}

export interface Report {
  dataset: DatasetInfo;
  baseline: Measurement;
  query: string;
  ai: AiInfo;
  results: CandidateResult[];
  warnings: string[];
  elapsedMs: number;
  /** Smallest step of the clock used for timings in this environment. */
  timerResolutionMs: number;
}
