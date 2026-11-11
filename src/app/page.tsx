'use client';

import { useState } from 'react';
import { EXAMPLES, type Example } from '@/lib/examples';
import { Results } from './components/Results';
import { useVerifier } from './useVerifier';

const first = EXAMPLES[0];

export default function Home() {
  const [schemaSql, setSchema] = useState(first.schemaSql);
  const [seedSql, setSeed] = useState(first.seedSql);
  const [query, setQuery] = useState(first.query);
  const [suggestion, setSuggestion] = useState(first.suggestion);
  const [useAi, setUseAi] = useState(true);
  const [activeExample, setActiveExample] = useState<string | null>(first.id);
  const { state, run } = useVerifier();
  const running = state.status === 'running';

  const load = (ex: Example) => {
    setSchema(ex.schemaSql);
    setSeed(ex.seedSql);
    setQuery(ex.query);
    setSuggestion(ex.suggestion);
    setActiveExample(ex.id);
  };

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    run({ schemaSql, seedSql: seedSql.trim() || undefined, query, suggestion: suggestion.trim() || undefined, useAi });
  };

  return (
    <main className="wrap">
      <header className="hero">
        <h1>PlanProof</h1>
        <p className="tagline">
          Your AI suggested a SQL optimisation. <strong>Did it actually help?</strong> PlanProof runs it in a real Postgres and checks.
        </p>
        <p className="sub">
          Every suggestion is executed and measured, and its results are compared with your original query. Nothing is called
          &ldquo;verified&rdquo; because an AI said so.
        </p>
      </header>

      <section className="examples" aria-label="Examples">
        <h2>Try an example</h2>
        <div className="chips">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.id}
              type="button"
              className={`chip ${activeExample === ex.id ? 'chip-active' : ''}`}
              onClick={() => load(ex)}
              disabled={running}
            >
              <span className="chip-title">{ex.title}</span>
              <span className="chip-prompt">{ex.prompt}</span>
            </button>
          ))}
        </div>
      </section>

      <form className="form" onSubmit={submit}>
        <label className="field">
          <span>1. What your AI suggested</span>
          <small>SQL, or the answer copied from ChatGPT, Copilot or Cursor.</small>
          <textarea value={suggestion} onChange={(e) => { setSuggestion(e.target.value); setActiveExample(null); }} rows={6} spellCheck={false} />
        </label>
        <label className="field">
          <span>2. The slow query</span>
          <textarea value={query} onChange={(e) => { setQuery(e.target.value); setActiveExample(null); }} rows={6} spellCheck={false} className="mono" />
        </label>
        <label className="field">
          <span>3. Your schema</span>
          <small>CREATE TABLE statements. Nothing is sent to a database server: Postgres runs in this tab.</small>
          <textarea value={schemaSql} onChange={(e) => { setSchema(e.target.value); setActiveExample(null); }} rows={8} spellCheck={false} className="mono" />
        </label>
        <details className="field">
          <summary>Test data (optional)</summary>
          <small>INSERT statements or generate_series. Leave empty and PlanProof generates realistic rows from your schema.</small>
          <textarea value={seedSql} onChange={(e) => { setSeed(e.target.value); setActiveExample(null); }} rows={8} spellCheck={false} className="mono" />
        </details>
        <label className="check">
          <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />
          Also ask an AI model to explain the plan and propose its own fix
        </label>
        <button type="submit" className="run" disabled={running}>
          {running ? 'Testing…' : 'Test the suggestion'}
        </button>
      </form>

      {state.status === 'running' && <Progress labels={state.steps.map((s) => s.label)} />}
      {state.status === 'error' && (
        <div className="notice notice-bad" role="alert">
          <p>
            <strong>{state.stage ? `Problem with your ${state.stage}` : 'Something went wrong'}:</strong> {state.message}
          </p>
        </div>
      )}
      {state.status === 'done' && <Results report={state.report} />}

      <footer className="footer">
        <p>
          Open source ·{' '}
          <a href="https://github.com/Shash-176/planproof" target="_blank" rel="noreferrer">
            github.com/Shash-176/planproof
          </a>{' '}
          · Postgres in the browser by PGlite
        </p>
      </footer>
    </main>
  );
}

function Progress({ labels }: { labels: string[] }) {
  return (
    <ol className="progress" aria-live="polite">
      {labels.map((l, i) => (
        <li key={i} className={i === labels.length - 1 ? 'current' : 'done'}>
          {l}
        </li>
      ))}
    </ol>
  );
}
