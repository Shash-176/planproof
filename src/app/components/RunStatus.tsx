'use client';

import { useEffect, useState } from 'react';
import type { ProgressEvent, ProgressStep } from '@/lib/harness/pipeline';

const ORDER: { step: ProgressStep; label: string }[] = [
  { step: 'setup', label: 'Start PostgreSQL in this tab' },
  { step: 'data', label: 'Load or generate test data' },
  { step: 'baseline', label: 'Run and measure the original query' },
  { step: 'ai', label: 'Ask the AI model for analysis' },
  { step: 'verify', label: 'Run and measure each suggestion' },
  { step: 'edge', label: 'Re-check results on NULLs and duplicates' },
  { step: 'empty', label: 'Re-check results on empty tables' },
];

export function Progress({ steps, startedAt, useAi, onCancel }: { steps: ProgressEvent[]; startedAt: number; useAi: boolean; onCancel: () => void }) {
  const [now, setNow] = useState(startedAt);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const seen = new Set(steps.map((s) => s.step));
  const current = steps.at(-1);
  const list = ORDER.filter((o) => o.step !== 'ai' || useAi);
  return (
    <div className="card progress" role="status" aria-live="polite">
      <div className="progress-head">
        <p>
          <strong>Testing…</strong> <span className="muted">{((now - startedAt) / 1000).toFixed(1)} s</span>
        </p>
        <button type="button" className="btn btn-small" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <ol className="steps-list">
        {list.map((o) => {
          const isCurrent = current?.step === o.step;
          const done = seen.has(o.step) && !isCurrent;
          return (
            <li key={o.step} className={isCurrent ? 'current' : done ? 'done' : 'todo'}>
              <span className="step-mark" aria-hidden>
                {done ? '✓' : isCurrent ? '' : '·'}
              </span>
              {isCurrent && current ? current.label : o.label}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

const HINTS: Record<string, { title: string; hint: string }> = {
  schema: { title: 'The schema could not be loaded', hint: 'Use PostgreSQL CREATE TABLE statements. Other statements (DROP, INSERT) belong elsewhere or are not allowed.' },
  seed: { title: 'The test data script failed', hint: 'Seed scripts may contain INSERT, SELECT and setseed(). Leave it empty to let PlanProof generate data.' },
  data: { title: 'Test data could not be generated', hint: 'Some column types or CHECK constraints cannot be generated automatically. Provide a seed script for those tables.' },
  query: { title: 'The query cannot be tested', hint: 'PlanProof tests a single read-only SELECT (or WITH … SELECT) query.' },
  timeout: { title: 'Stopped a runaway query', hint: 'Try a smaller dataset (seed fewer rows) or a simpler query.' },
  worker: { title: 'The sandbox crashed', hint: 'Reload the page and try again. Very large datasets can exhaust the tab’s memory.' },
  browser: { title: 'This browser is not supported', hint: 'Use a current version of Chrome, Edge, Firefox or Safari.' },
};

export function ErrorPanel({ stage, message }: { stage?: string; message: string }) {
  const h = (stage && HINTS[stage]) || { title: 'Something went wrong', hint: 'Check the inputs and try again.' };
  return (
    <div className="callout callout-bad" role="alert">
      <p>
        <strong>{h.title}.</strong> {message}
      </p>
      <p className="muted small">{h.hint}</p>
    </div>
  );
}
