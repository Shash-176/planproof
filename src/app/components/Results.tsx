'use client';

import type { CandidateResult, DatasetName, Measurement, Report, Verdict } from '@/lib/harness/types';
import { fmtMs } from '@/lib/harness/narrate';
import { fmtSpeedup } from '@/lib/harness/verify';
import { CopyButton } from './CopyButton';
import { maxTouched, PlanTree } from './PlanTree';

const n = (x: number) => Math.round(x).toLocaleString('en-US');

const SOURCE_LABEL: Record<CandidateResult['candidate']['source'], string> = {
  pasted: 'Suggestion you pasted',
  'ai-extracted': 'Suggestion you pasted (SQL extracted by the AI model)',
  'ai-proposed': 'Proposed by the AI model',
};

const DATASET_LABEL: Record<DatasetName, string> = {
  main: 'Main dataset',
  edge: 'Edge cases: NULLs and duplicates',
  empty: 'Empty tables',
};

const VERDICT_ICON: Record<Verdict, string> = { VERIFIED: '✓', INEFFECTIVE: '–', UNSAFE: '✕', INVALID: '?' };

export const VERDICT_HELP: Record<Verdict, string> = {
  VERIFIED: 'Same results on every dataset tested, a different plan, and at least 1.5× faster with lower cost or fewer rows read.',
  INEFFECTIVE: 'Same results, but no meaningful improvement, or Postgres did not use the index.',
  UNSAFE: 'The results change on at least one dataset, or the SQL tries to modify data.',
  INVALID: 'The SQL could not be run.',
};

export function Results({ report }: { report: Report }) {
  const counts = report.results.reduce<Record<string, number>>((a, r) => ((a[r.verdict] = (a[r.verdict] ?? 0) + 1), a), {});
  const totalRows = report.dataset.tables.reduce((s, t) => s + t.rows, 0);
  const anyMeasured = report.results.some((r) => r.after);
  return (
    <div className="results">
      <div className="results-summary">
        <p className="summary-line">
          {report.results.length === 0 ? (
            'Nothing to test.'
          ) : (
            <>
              Tested {report.results.length} suggestion{report.results.length === 1 ? '' : 's'} on {n(totalRows)} rows:{' '}
              {(['VERIFIED', 'INEFFECTIVE', 'UNSAFE', 'INVALID'] as Verdict[])
                .filter((v) => counts[v])
                .map((v) => `${counts[v]} ${v.toLowerCase()}`)
                .join(', ')}
              .
            </>
          )}
        </p>
        <p className="muted small">
          {report.dataset.source === 'seed' ? 'Your seed data' : 'Generated data'}: {report.dataset.tables.map((t) => `${t.name} (${n(t.rows)})`).join(', ')} · finished in{' '}
          {(report.elapsedMs / 1000).toFixed(1)} s
        </p>
      </div>

      {report.warnings.length > 0 && (
        <div className="callout callout-warn" role="status">
          {report.warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      )}

      {report.results.map((r) => (
        <VerdictCard key={r.candidate.id} r={r} before={report.baseline} />
      ))}

      {!anyMeasured && <BaselineCard m={report.baseline} />}

      <AiPanel report={report} />

      <p className="muted small method-note">
        Measured with EXPLAIN ANALYZE in PostgreSQL {`(PGlite, WebAssembly)`} in this browser tab: one warm-up, then the median of up to five runs.
        Results on your production database and hardware can differ. Identical results on these datasets is strong evidence, not a proof of equivalence.
      </p>
    </div>
  );
}

function VerdictCard({ r, before }: { r: CandidateResult; before: Measurement }) {
  const after = r.after;
  const datasetsOk = r.equivalence.filter((e) => e.equivalent).length;
  const scale = maxTouched(before, after);
  return (
    <article className={`card verdict v-${r.verdict.toLowerCase()}`} data-testid="verdict-card" data-verdict={r.verdict} aria-labelledby={`${r.candidate.id}-h`}>
      <header className="verdict-head">
        <span className="badge" title={VERDICT_HELP[r.verdict]}>
          <span aria-hidden>{VERDICT_ICON[r.verdict]}</span> {r.verdict}
        </span>
        <div>
          <h3 id={`${r.candidate.id}-h`}>{r.headline}</h3>
          <p className="muted small">{SOURCE_LABEL[r.candidate.source]}</p>
        </div>
      </header>

      <div className="code-wrap">
        <pre className="code">{r.candidate.sql}</pre>
        <CopyButton text={r.candidate.sql} />
      </div>
      {r.candidate.rationale && <p className="muted small">Model’s rationale (not evidence): {r.candidate.rationale}</p>}

      {after && (
        <dl className="stats">
          <Stat label="Median time" before={fmtMs(before.medianMs)} after={fmtMs(after.medianMs)} note={r.speedup !== undefined ? speedNote(r.speedup) : undefined} help="Median of the timed EXPLAIN ANALYZE runs, in this browser." />
          <Stat label="Rows read" before={n(before.rowsRead)} after={n(after.rowsRead)} help="Rows the scan steps touched, including rows read and then discarded by a filter." />
          <Stat label="Planner cost" before={n(before.totalCost)} after={n(after.totalCost)} help="Postgres's own estimate of the work, in arbitrary units. Lower is cheaper." />
          <div className="stat">
            <dt>Same results?</dt>
            <dd className={datasetsOk === r.equivalence.length ? 'ok' : 'bad'}>
              {datasetsOk === r.equivalence.length ? `Identical on ${datasetsOk} of ${r.equivalence.length}` : `Different on ${r.equivalence.length - datasetsOk} of ${r.equivalence.length}`}
            </dd>
            <span className="muted small">datasets</span>
          </div>
        </dl>
      )}

      <ul className="reasons">
        {r.reasons.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>

      {r.equivalence.length > 0 && (
        <section className="sub">
          <h4>Result checks</h4>
          <ul className="checks">
            {r.equivalence.map((e) => (
              <li key={e.dataset} className={e.equivalent ? 'ok' : 'bad'}>
                <span className="check-mark" aria-hidden>
                  {e.equivalent ? '✓' : '✕'}
                </span>
                <span>
                  <strong>{DATASET_LABEL[e.dataset]}</strong>: {e.equivalent ? 'identical' : 'different'} — {n(e.rowsBefore)} rows before, {n(e.rowsAfter)} after
                  {e.equivalent && e.rowsBefore === 0 && e.dataset !== 'empty' ? '. Both returned no rows, so this check says little.' : ''}
                  {!e.equivalent && e.detail ? `. ${e.detail}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {after && (
        <section className="sub">
          <h4>Query plan: before and after</h4>
          <div className="compare">
            <div>
              <p className="compare-title">Original</p>
              <PlanTree m={before} scaleMax={scale} label="Original query plan" />
              <PlainSteps steps={before.narration} />
            </div>
            <div>
              <p className="compare-title">With this suggestion</p>
              <PlanTree m={after} scaleMax={scale} label="Query plan with the suggestion" />
              <PlainSteps steps={after.narration} />
            </div>
          </div>
        </section>
      )}

      {r.migration && r.verdict === 'VERIFIED' && (
        <section className="sub">
          <h4>Migration</h4>
          <div className="code-wrap">
            <pre className="code">{`-- apply\n${r.migration.up}\n\n-- roll back\n${r.migration.down}`}</pre>
            <CopyButton text={`${r.migration.up}\n`} label="Copy apply SQL" />
          </div>
          {r.indexSizeBytes !== undefined && (
            <p className="muted small">
              Index size on this data: {(r.indexSizeBytes / 1024).toFixed(0)} KB. Every index also slows inserts and updates slightly. On a large production table, use CREATE INDEX CONCURRENTLY.
            </p>
          )}
        </section>
      )}

      {after && (
        <details className="sub raw">
          <summary>Raw timings</summary>
          <p className="muted small mono">
            original: {before.runsMs.map((x) => x.toFixed(2)).join(', ')} ms
            <br />
            suggestion: {after.runsMs.map((x) => x.toFixed(2)).join(', ')} ms
          </p>
        </details>
      )}

      {r.notes.map((x, i) => (
        <p key={i} className="muted small">
          {x}
        </p>
      ))}
    </article>
  );
}

function speedNote(s: number): string {
  if (!Number.isFinite(s)) return 'faster';
  if (s >= 1) return `${fmtSpeedup(s)} faster`;
  return `${fmtSpeedup(1 / s)} slower`;
}

function Stat({ label, before, after, note, help }: { label: string; before: string; after: string; note?: string; help: string }) {
  return (
    <div className="stat">
      <dt title={help}>{label}</dt>
      <dd>
        <span className="muted">{before}</span> <span aria-label="to">→</span> <strong>{after}</strong>
      </dd>
      {note && <span className="small">{note}</span>}
    </div>
  );
}

function PlainSteps({ steps }: { steps: string[] }) {
  return (
    <details className="plain" open>
      <summary>In plain English</summary>
      <ol>
        {steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
    </details>
  );
}

function BaselineCard({ m }: { m: Measurement }) {
  return (
    <article className="card">
      <h3>How Postgres runs your original query</h3>
      <PlanTree m={m} scaleMax={maxTouched(m)} label="Original query plan" />
      <PlainSteps steps={m.narration} />
      <p className="muted small">
        Median {fmtMs(m.medianMs)} over {m.runsMs.length} runs · {n(m.rowsRead)} rows read · {n(m.rowsReturned)} rows returned · planner cost {n(m.totalCost)}
      </p>
    </article>
  );
}

function AiPanel({ report }: { report: Report }) {
  const ai = report.ai;
  if (ai.status === 'skipped') return null;
  if (ai.status === 'ok')
    return (
      <aside className="card ai" aria-label="AI explanation">
        <h3>AI explanation</h3>
        <p>{ai.explanation}</p>
        <p className="muted small">
          Written by {ai.model} via {ai.provider}
          {ai.latencyMs !== undefined ? ` in ${(ai.latencyMs / 1000).toFixed(1)} s` : ''}. This is an explanation, not evidence. Only the measurements above verify anything.
        </p>
      </aside>
    );
  return (
    <aside className="callout" role="status">
      <p>
        <strong>AI analysis {ai.status === 'unavailable' ? 'unavailable' : 'failed'}.</strong> {ai.message} Your pasted SQL was still tested.
      </p>
    </aside>
  );
}
