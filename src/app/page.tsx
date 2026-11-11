'use client';

import { useEffect, useRef, useState } from 'react';
import { fetchAiStatus } from '@/lib/ai/client';
import type { AiStatus } from '@/lib/ai/schema';
import { EXAMPLES, type Example } from '@/lib/examples';
import { Results, VERDICT_HELP } from './components/Results';
import { ErrorPanel, Progress } from './components/RunStatus';
import { useVerifier } from './useVerifier';

const REPO = 'https://github.com/Shash-176/planproof';

export default function Home() {
  const first = EXAMPLES[0];
  const [schemaSql, setSchema] = useState(first.schemaSql);
  const [seedSql, setSeed] = useState(first.seedSql);
  const [query, setQuery] = useState(first.query);
  const [suggestion, setSuggestion] = useState(first.suggestion);
  const [activeExample, setActiveExample] = useState<string | null>(first.id);
  const [ai, setAi] = useState<AiStatus | null>(null);
  const [useAi, setUseAi] = useState(false);
  const { state, run, cancel } = useVerifier();
  const resultsRef = useRef<HTMLHeadingElement>(null);
  const running = state.status === 'running';

  useEffect(() => {
    fetchAiStatus().then((s) => {
      setAi(s);
      setUseAi(s.configured);
    });
  }, []);

  useEffect(() => {
    if (state.status === 'running' && state.steps.length === 0) resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (state.status === 'done' || state.status === 'error') resultsRef.current?.focus({ preventScroll: true });
  }, [state]);

  const load = (ex: Example) => {
    setSchema(ex.schemaSql);
    setSeed(ex.seedSql);
    setQuery(ex.query);
    setSuggestion(ex.suggestion);
    setActiveExample(ex.id);
  };

  const start = (input?: Example) => {
    const src = input ?? { schemaSql, seedSql, query, suggestion };
    run({ schemaSql: src.schemaSql, seedSql: src.seedSql.trim() || undefined, query: src.query, suggestion: src.suggestion.trim() || undefined, useAi: useAi && !!ai?.configured });
  };

  const runExample = (ex: Example) => {
    load(ex);
    start(ex);
  };

  const edited = (set: (v: string) => void) => (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    set(e.target.value);
    setActiveExample(null);
  };

  const aiModel = ai?.providers[0];

  return (
    <>
      <a href="#workbench" className="skip">
        Skip to the tester
      </a>
      <header className="topbar">
        <div className="wrap topbar-inner">
          <span className="brand">PlanProof</span>
          <nav aria-label="Project links">
            <a href="#how">How it works</a>
            <a href={REPO} target="_blank" rel="noreferrer">
              GitHub
            </a>
          </nav>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="wrap">
            <p className="eyebrow">Open source · PostgreSQL runs in your browser</p>
            <h1>
              AI proposes.
              <br />
              PostgreSQL proves.
            </h1>
            <p className="lede">
              Your AI assistant suggested an index or a rewritten query. PlanProof runs it against your query in a real PostgreSQL inside this tab,
              measures the difference, and checks that the results are exactly the same.
            </p>
            <div className="hero-actions">
              <button type="button" className="btn btn-primary" onClick={() => runExample(first)} disabled={running}>
                Run the demo
              </button>
              <a className="btn" href="#workbench">
                Test your own SQL
              </a>
            </div>
            <ul className="hero-facts">
              <li>No sign-up, no database to install</li>
              <li>Your rows never leave this tab</li>
              <li>Verdicts come from execution, never from the model</li>
            </ul>
          </div>
        </section>

        <section className="wrap section" aria-labelledby="examples-h">
          <h2 id="examples-h">Four AI suggestions, four outcomes</h2>
          <p className="muted">Each one is the kind of answer an AI assistant gives. Run one to see what PlanProof finds.</p>
          <div className="examples">
            {EXAMPLES.map((ex) => (
              <article key={ex.id} className={`example ${activeExample === ex.id ? 'example-active' : ''}`}>
                <h3>{ex.title}</h3>
                <p className="muted small">{ex.prompt}</p>
                <button type="button" className="btn btn-small" onClick={() => runExample(ex)} disabled={running} aria-label={`Run example: ${ex.title}`}>
                  Run this example
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="wrap section" aria-labelledby="results-h">
          <h2 id="results-h" ref={resultsRef} tabIndex={-1} className={state.status === 'idle' ? 'visually-hidden' : ''}>
            Results
          </h2>
          {state.status === 'running' && <Progress steps={state.steps} startedAt={state.startedAt} useAi={useAi && !!ai?.configured} onCancel={cancel} />}
          {state.status === 'error' && <ErrorPanel stage={state.stage} message={state.message} />}
          {state.status === 'done' && <Results report={state.report} />}
        </section>

        <section id="workbench" className="wrap section" aria-labelledby="workbench-h">
          <h2 id="workbench-h">Test your own SQL</h2>
          <form
            className="workbench"
            onSubmit={(e) => {
              e.preventDefault();
              start();
            }}
          >
            <div className="field">
              <label htmlFor="suggestion">What your AI suggested</label>
              <p className="hint" id="suggestion-hint">
                Paste the SQL, or the whole answer from ChatGPT, Claude, Copilot or Cursor. Code blocks are extracted automatically.
              </p>
              <textarea id="suggestion" aria-describedby="suggestion-hint" value={suggestion} onChange={edited(setSuggestion)} rows={7} spellCheck={false} />
            </div>
            <div className="field">
              <label htmlFor="query">The slow query</label>
              <p className="hint" id="query-hint">
                One read-only SELECT.
              </p>
              <textarea id="query" aria-describedby="query-hint" className="mono" value={query} onChange={edited(setQuery)} rows={7} spellCheck={false} />
            </div>
            <div className="field field-wide">
              <label htmlFor="schema">Schema</label>
              <p className="hint" id="schema-hint">
                CREATE TABLE statements. They run in this tab, not on a server.
              </p>
              <textarea id="schema" aria-describedby="schema-hint" className="mono" value={schemaSql} onChange={edited(setSchema)} rows={9} spellCheck={false} />
            </div>
            <details className="field field-wide">
              <summary>Test data (optional)</summary>
              <p className="hint" id="seed-hint">
                INSERT statements or generate_series. Leave empty and PlanProof generates realistic rows from the schema, including foreign keys.
              </p>
              <textarea id="seed" aria-label="Test data script" aria-describedby="seed-hint" className="mono" value={seedSql} onChange={edited(setSeed)} rows={9} spellCheck={false} />
            </details>

            <div className="field-wide ai-toggle">
              {ai === null ? (
                <p className="muted small">Checking whether AI analysis is available…</p>
              ) : ai.configured ? (
                <>
                  <label className="check">
                    <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />
                    Also ask {aiModel ? `${aiModel.model} (${aiModel.provider})` : 'an AI model'} to explain the plan and propose its own fix
                  </label>
                  <p className="hint">
                    When on, your schema, query, pasted suggestion and a summary of the plan are sent to {aiModel?.provider ?? 'the AI provider'}. Row data is never sent.
                  </p>
                </>
              ) : (
                <p className="muted small">AI analysis is not configured on this deployment. Pasted SQL is still fully verified.</p>
              )}
            </div>

            <div className="field-wide form-actions">
              <button type="submit" className="btn btn-primary" disabled={running}>
                {running ? 'Testing…' : 'Test the suggestion'}
              </button>
              {activeExample && <span className="muted small">Loaded: {EXAMPLES.find((e) => e.id === activeExample)?.title}</span>}
            </div>
          </form>
        </section>

        <section id="how" className="wrap section" aria-labelledby="how-h">
          <h2 id="how-h">How it works</h2>
          <ol className="how">
            <li>
              <h3>Load</h3>
              <p>Your schema and data go into PostgreSQL compiled to WebAssembly (PGlite), running in a worker in this tab. No data is generated server-side.</p>
            </li>
            <li>
              <h3>Measure</h3>
              <p>The original query and each suggestion run under EXPLAIN ANALYZE. Indexes are created in a transaction that is always rolled back; rewrites run read-only.</p>
            </li>
            <li>
              <h3>Compare</h3>
              <p>Result sets are compared row by row, on your data, on a hostile dataset full of NULLs and duplicates, and on empty tables.</p>
            </li>
            <li>
              <h3>Decide</h3>
              <p>A deterministic rule gives the verdict. An AI model can explain and propose, but nothing it says counts as evidence.</p>
            </li>
          </ol>
          <dl className="verdict-legend">
            {(Object.keys(VERDICT_HELP) as (keyof typeof VERDICT_HELP)[]).map((v) => (
              <div key={v} className={`legend v-${v.toLowerCase()}`}>
                <dt>
                  <span className="badge">{v}</span>
                </dt>
                <dd>{VERDICT_HELP[v]}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>

      <footer className="footer">
        <div className="wrap">
          <p>
            PlanProof is open source (MIT) ·{' '}
            <a href={REPO} target="_blank" rel="noreferrer">
              Source on GitHub
            </a>{' '}
            · PostgreSQL in the browser by{' '}
            <a href="https://pglite.dev" target="_blank" rel="noreferrer">
              PGlite
            </a>
          </p>
          <p className="muted small">Timings come from WebAssembly PostgreSQL on generated or sample data. Always confirm on your own database before shipping a migration.</p>
        </div>
      </footer>
    </>
  );
}
