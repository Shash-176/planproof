'use client';

import type { CandidateResult, DatasetName, Measurement, Report } from '@/lib/harness/types';
import { fmtMs } from '@/lib/harness/narrate';

const n = (x: number) => Math.round(x).toLocaleString('en-US');

const SOURCE_LABEL: Record<CandidateResult['candidate']['source'], string> = {
  pasted: 'Your AI’s suggestion',
  'ai-extracted': 'Your AI’s suggestion (SQL extracted by the BharatCode model)',
  'ai-proposed': 'Proposed by the BharatCode model',
};

const DATASET_LABEL: Record<DatasetName, string> = {
  main: 'Main dataset',
  edge: 'Edge cases (NULLs, duplicates)',
  empty: 'Empty tables',
};

export function Results({ report }: { report: Report }) {
  const verified = report.results.filter((r) => r.verdict === 'VERIFIED').length;
  return (
    <section className="results" aria-live="polite">
      <h2 className="results-title">
        {report.results.length === 0
          ? 'Nothing to test'
          : `${report.results.length} suggestion${report.results.length === 1 ? '' : 's'} tested · ${verified} verified`}
      </h2>

      {report.warnings.length > 0 && (
        <div className="notice notice-warn" role="status">
          {report.warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      )}

      {report.results.map((r) => (
        <VerdictCard key={r.candidate.id} r={r} before={report.baseline} />
      ))}

      <BaselineCard m={report.baseline} />

      <AiNote report={report} />

      <p className="fineprint">
        Measured in Postgres running in your browser (PGlite) on{' '}
        {report.dataset.source === 'seed' ? 'your seed data' : 'generated data'}:{' '}
        {report.dataset.tables.map((t) => `${t.name} ${n(t.rows)} rows`).join(', ')}. Results on your production data can differ.
        Identical results on these datasets is strong evidence, not a proof. Run took {(report.elapsedMs / 1000).toFixed(1)} s.
      </p>
    </section>
  );
}

function VerdictCard({ r, before }: { r: CandidateResult; before: Measurement }) {
  return (
    <article className={`card verdict verdict-${r.verdict.toLowerCase()}`} data-testid="verdict-card" data-verdict={r.verdict}>
      <header className="verdict-head">
        <span className="badge">{r.verdict}</span>
        <h3>{r.headline}</h3>
      </header>
      <p className="source">{SOURCE_LABEL[r.candidate.source]}</p>
      <pre className="sql">{r.candidate.sql}</pre>
      {r.candidate.rationale && <p className="rationale">Model’s rationale (not evidence): {r.candidate.rationale}</p>}

      <ul className="reasons">
        {r.reasons.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>

      {r.after && (
        <table className="metrics">
          <thead>
            <tr>
              <th scope="col">Measured</th>
              <th scope="col">Before</th>
              <th scope="col">After</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Median time</th>
              <td>{fmtMs(before.medianMs)}</td>
              <td>{fmtMs(r.after.medianMs)}</td>
            </tr>
            <tr>
              <th scope="row">Rows read</th>
              <td>{n(before.rowsRead)}</td>
              <td>{n(r.after.rowsRead)}</td>
            </tr>
            <tr>
              <th scope="row">Planner cost</th>
              <td>{n(before.totalCost)}</td>
              <td>{n(r.after.totalCost)}</td>
            </tr>
          </tbody>
        </table>
      )}

      {r.equivalence.length > 0 && (
        <div className="checks">
          <h4>Same results?</h4>
          <ul>
            {r.equivalence.map((e) => (
              <li key={e.dataset} className={e.equivalent ? 'ok' : 'bad'}>
                <span aria-hidden>{e.equivalent ? '✓' : '✗'}</span> {DATASET_LABEL[e.dataset]}: {e.equivalent ? 'identical' : 'different'} ({n(e.rowsBefore)} rows before, {n(e.rowsAfter)} after)
                {e.equivalent && e.rowsBefore === 0 && e.dataset !== 'empty' ? ' — both returned no rows, so this check says little' : ''}
                {!e.equivalent && e.detail ? ` — ${e.detail}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      {r.after && (
        <details>
          <summary>How Postgres runs it now</summary>
          <ol className="steps">
            {r.after.narration.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </details>
      )}

      {r.migration && r.verdict === 'VERIFIED' && (
        <details>
          <summary>Migration and rollback</summary>
          <pre className="sql">{`-- apply\n${r.migration.up}\n\n-- roll back\n${r.migration.down}`}</pre>
          {r.indexSizeBytes !== undefined && (
            <p className="fineprint">Index size on this data: {(r.indexSizeBytes / 1024).toFixed(0)} KB. Every index also adds a small cost to inserts and updates.</p>
          )}
        </details>
      )}
      {r.notes.map((x, i) => (
        <p key={i} className="fineprint">
          {x}
        </p>
      ))}
    </article>
  );
}

function BaselineCard({ m }: { m: Measurement }) {
  return (
    <article className="card baseline">
      <h3>How Postgres runs your original query</h3>
      <ol className="steps">
        {m.narration.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
      <p className="fineprint">
        Median {fmtMs(m.medianMs)} over {m.runsMs.length} runs · {n(m.rowsRead)} rows read · {n(m.rowsReturned)} rows returned · planner cost {n(m.totalCost)}
      </p>
    </article>
  );
}

function AiNote({ report }: { report: Report }) {
  const ai = report.ai;
  if (ai.status === 'ok')
    return (
      <aside className="card ai">
        <h3>AI explanation</h3>
        <p>{ai.explanation}</p>
        <p className="fineprint">Written by the BharatCode model ({ai.model}). It is an explanation, not evidence: only the measurements above verify anything.</p>
      </aside>
    );
  if (ai.status === 'skipped') return null;
  return (
    <aside className="notice">
      <p>
        AI analysis {ai.status === 'unavailable' ? 'is unavailable' : 'failed'}: {ai.message} Pasted SQL was still verified.
      </p>
    </aside>
  );
}
