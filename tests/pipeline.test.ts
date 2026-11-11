import { describe, expect, it } from 'vitest';
import { runPipeline, SetupError, type PipelineDeps, type PipelineInput } from '@/lib/harness/pipeline';
import { EXAMPLES } from '@/lib/examples';
import type { Report } from '@/lib/harness/types';
import { freshDb } from './helpers';

/**
 * End-to-end tests of the deterministic harness against a real Postgres
 * (PGlite). The model is replaced by stubs: these tests prove that verdicts
 * come from execution, not from anything the model says.
 */

const SCHEMA = `
CREATE TABLE accounts (id int PRIMARY KEY, region text NOT NULL, tier text);
CREATE TABLE events (
  id int PRIMARY KEY,
  account_id int REFERENCES accounts (id),
  kind text NOT NULL,
  amount numeric(10,2),
  at timestamptz NOT NULL
);`;

// 2,000 accounts, 60,000 events; some account_id NULL; some amounts NULL
const SEED = `
SELECT setseed(0.5);
INSERT INTO accounts SELECT i, (ARRAY['north','south','east','west'])[1 + i % 4], CASE WHEN i % 10 = 0 THEN NULL ELSE 'gold' END
FROM generate_series(1, 2000) i;
INSERT INTO events SELECT i,
  CASE WHEN i % 50 = 0 THEN NULL ELSE 1 + floor(random() * 2000)::int END,
  (ARRAY['click','view','buy'])[1 + floor(random() * 3)::int],
  CASE WHEN i % 7 = 0 THEN NULL ELSE round((random() * 100)::numeric, 2) END,
  timestamptz '2025-01-01' + random() * interval '300 days'
FROM generate_series(1, 60000) i;`;

const fast: Partial<PipelineDeps> = { measure: { runs: 3 } };

async function run(input: Partial<PipelineInput> & { query: string }, deps: Partial<PipelineDeps> = {}): Promise<Report> {
  return runPipeline(
    { schemaSql: SCHEMA, seedSql: SEED, useAi: false, ...input },
    { createDb: freshDb, ...fast, ...deps },
  );
}

const verdicts = (r: Report) => r.results.map((x) => x.verdict);

describe('bundled examples produce their documented verdicts', () => {
  for (const ex of EXAMPLES) {
    it(`${ex.id} → ${ex.expected}`, async () => {
      const r = await runPipeline(
        { schemaSql: ex.schemaSql, seedSql: ex.seedSql, query: ex.query, suggestion: ex.suggestion, useAi: false },
        { createDb: freshDb },
      );
      expect(r.results).toHaveLength(1);
      expect(r.results[0].verdict).toBe(ex.expected);
    });
  }
});

describe('verdicts', () => {
  it('VERIFIED: an index that improves the query and keeps results', async () => {
    const r = await run({
      query: 'SELECT id, amount FROM events WHERE account_id = 77 ORDER BY id',
      suggestion: 'CREATE INDEX ev_acc ON events (account_id);',
    });
    const res = r.results[0];
    expect(res.verdict).toBe('VERIFIED');
    expect(res.after!.rowsRead).toBeLessThan(r.baseline.rowsRead);
    expect(res.equivalence.map((e) => e.dataset)).toEqual(['main', 'edge', 'empty']);
    expect(res.migration?.down).toMatch(/DROP INDEX IF EXISTS ev_acc/);
  });

  it('INEFFECTIVE: an index on a column the query does not filter on', async () => {
    const r = await run({ query: "SELECT count(*) FROM events WHERE kind = 'buy'", suggestion: 'CREATE INDEX ev_at ON events (at);' });
    expect(verdicts(r)).toEqual(['INEFFECTIVE']);
  });

  it('INEFFECTIVE: a rewrite that is the same query', async () => {
    const q = 'SELECT id FROM accounts WHERE region = \'north\'';
    const r = await run({ query: q, suggestion: `select id from accounts where region = 'north'` });
    expect(r.results[0].verdict).toBe('INEFFECTIVE');
    expect(r.results[0].headline).toMatch(/same way/);
  });

  it('UNSAFE: a rewrite that changes results (JOIN duplicates rows)', async () => {
    const r = await run({
      query: "SELECT a.id FROM accounts a WHERE a.id IN (SELECT account_id FROM events WHERE kind = 'buy')",
      suggestion: "SELECT a.id FROM accounts a JOIN events e ON e.account_id = a.id WHERE e.kind = 'buy'",
    });
    expect(verdicts(r)).toEqual(['UNSAFE']);
    expect(r.results[0].equivalence[0].difference).toBe('rows');
  });

  it('UNSAFE: NOT IN → NOT EXISTS differs when the subquery yields NULL', async () => {
    const r = await run({
      query: 'SELECT id FROM accounts WHERE id NOT IN (SELECT account_id FROM events)',
      suggestion: 'SELECT a.id FROM accounts a WHERE NOT EXISTS (SELECT 1 FROM events e WHERE e.account_id = a.id)',
    });
    expect(verdicts(r)).toEqual(['UNSAFE']);
  });

  it('UNSAFE: same rows but a different order when the original has ORDER BY', async () => {
    const r = await run({ query: 'SELECT id FROM accounts ORDER BY id', suggestion: 'SELECT id FROM accounts ORDER BY id DESC' });
    expect(r.results[0].verdict).toBe('UNSAFE');
    expect(r.results[0].equivalence[0].difference).toBe('order');
  });

  it('UNSAFE only on empty tables: GROUP BY drops the zero-count row', async () => {
    const r = await run({
      query: "SELECT count(*) FROM events WHERE kind = 'buy'",
      suggestion: "SELECT count(*) FROM events WHERE kind = 'buy' GROUP BY kind",
    });
    const res = r.results[0];
    expect(res.verdict).toBe('UNSAFE');
    expect(res.equivalence.find((e) => e.dataset === 'main')?.equivalent).toBe(true);
    expect(res.equivalence.find((e) => e.dataset === 'empty')?.equivalent).toBe(false);
  });

  it('handles NULLs and duplicate rows without false alarms', async () => {
    const r = await run({
      query: 'SELECT region, tier FROM accounts',
      suggestion: 'SELECT region, tier FROM accounts WHERE true',
    });
    expect(r.results[0].equivalence.every((e) => e.equivalent)).toBe(true);
  });

  it('INVALID: SQL that does not run', async () => {
    const r = await run({
      query: 'SELECT id FROM accounts',
      suggestion: 'SELECT id FROM acounts;\nCREATE INDEX x ON accounts (no_such_column);',
    });
    expect(verdicts(r)).toEqual(['INVALID', 'INVALID']);
    expect(r.results[0].reasons[0]).toMatch(/acounts/);
  });
});

describe('destructive SQL is never executed', () => {
  it.each([
    'DROP TABLE events;',
    'DELETE FROM events;',
    'TRUNCATE accounts CASCADE;',
    'UPDATE events SET amount = 0;',
    'WITH gone AS (DELETE FROM events RETURNING id) SELECT id FROM gone;',
  ])('%s → UNSAFE, data intact', async (sql) => {
    let db: Awaited<ReturnType<typeof freshDb>> | null = null;
    const r = await run({ query: 'SELECT count(*) FROM events', suggestion: sql }, { createDb: async () => (db = await freshDb()) });
    expect(r.results[0].verdict).toBe('UNSAFE');
    expect(r.results[0].after).toBeUndefined();
    // the pipeline finished its own checks; the tables still exist
    const tables = await db!.query<{ n: number }>(`SELECT count(*)::int AS n FROM pg_tables WHERE tablename IN ('events','accounts')`);
    expect(tables.rows[0].n).toBe(2);
  });

  it('rejects a destructive original query before anything runs', async () => {
    await expect(run({ query: 'DELETE FROM events' })).rejects.toBeInstanceOf(SetupError);
  });

  it('rejects a schema script containing DROP', async () => {
    await expect(run({ schemaSql: SCHEMA + '\nDROP TABLE accounts;', query: 'SELECT 1' })).rejects.toThrow(/DROP/);
  });
});

describe('the model is not the source of truth', () => {
  it('a model candidate that changes results is UNSAFE whatever its rationale says', async () => {
    const r = await run(
      { query: 'SELECT id FROM accounts WHERE region = \'north\'', useAi: true },
      {
        analyze: async () => ({
          model: 'stub',
          output: {
            explanation: 'stub',
            candidates: [{ kind: 'rewrite', sql: "SELECT id FROM accounts WHERE region = 'south'", rationale: 'Verified equivalent and 10× faster.', origin: 'model' }],
          },
        }),
      },
    );
    expect(r.ai.status).toBe('ok');
    expect(verdicts(r)).toEqual(['UNSAFE']);
    expect(r.results[0].candidate.source).toBe('ai-proposed');
  });

  it('a model that throws (timeout, 5xx, malformed) does not stop pasted SQL being verified', async () => {
    const r = await run(
      { query: 'SELECT id, amount FROM events WHERE account_id = 77', suggestion: 'CREATE INDEX ev_acc ON events (account_id);', useAi: true },
      { analyze: async () => { throw Object.assign(new Error('The AI provider did not answer in time.'), { code: 'timeout' }); } },
    );
    expect(r.ai.status).toBe('error');
    expect(r.ai.message).toMatch(/did not answer/);
    expect(verdicts(r)).toEqual(['VERIFIED']);
  });

  it('extracts SQL with the model only when the paste has none, and labels it', async () => {
    const r = await run(
      { query: 'SELECT id, amount FROM events WHERE account_id = 77', suggestion: 'You should index the account foreign key on events.', useAi: true },
      {
        analyze: async (req) => {
          expect(req.needsExtraction).toBe(true);
          expect(req.planSummary).toMatch(/Seq Scan on events/);
          return { model: 'stub', output: { explanation: 'x', candidates: [{ kind: 'index', sql: 'CREATE INDEX ON events (account_id)', rationale: 'from the paste', origin: 'user_suggestion' }] } };
        },
      },
    );
    expect(r.results.map((x) => [x.candidate.source, x.verdict])).toEqual([['ai-extracted', 'VERIFIED']]);
  });

  it('never sends row values to the model', async () => {
    let sent = '';
    await run(
      { query: 'SELECT id FROM accounts WHERE id = 5', useAi: true },
      { analyze: async (req) => { sent = JSON.stringify(req); return { model: 'stub', output: { explanation: 'x', candidates: [] } }; } },
    );
    expect(sent).not.toMatch(/gold|north|south/);
  });
});

describe('unexpected AI output never reaches the database unchecked', () => {
  const stub = (candidates: { kind: 'index' | 'rewrite'; sql: string; origin: 'model' | 'user_suggestion' }[]) => ({
    analyze: async () => ({ model: 'stub', provider: 'stub', output: { explanation: 'x', candidates: candidates.map((c) => ({ ...c, rationale: 'trust me' })) } }),
  });

  it('a destructive statement labelled as an index is blocked and never executed', async () => {
    let db: Awaited<ReturnType<typeof freshDb>> | null = null;
    const r = await run(
      { query: 'SELECT count(*) FROM events', useAi: true },
      { ...stub([{ kind: 'index', sql: 'DROP TABLE events', origin: 'model' }]), createDb: async () => (db = await freshDb()) },
    );
    expect(verdicts(r)).toEqual(['UNSAFE']);
    const n = await db!.query<{ n: number }>('SELECT count(*)::int AS n FROM events');
    expect(n.rows[0].n).toBe(60_000); // table and all rows intact
  });

  it('multiple statements and hallucinated columns are INVALID', async () => {
    const r = await run(
      { query: 'SELECT id FROM accounts WHERE region = \'north\'', useAi: true },
      stub([
        { kind: 'index', sql: 'CREATE INDEX a ON accounts (region); CREATE INDEX b ON accounts (tier)', origin: 'model' },
        { kind: 'index', sql: 'CREATE INDEX c ON accounts (regoin)', origin: 'model' },
      ]),
    );
    expect(verdicts(r)).toEqual(['INVALID', 'INVALID']);
  });

  it('the model cannot replace SQL the user pasted', async () => {
    const r = await run(
      { query: 'SELECT id, amount FROM events WHERE account_id = 77', suggestion: 'CREATE INDEX mine ON events (amount);', useAi: true },
      stub([{ kind: 'index', sql: 'CREATE INDEX better ON events (account_id)', origin: 'user_suggestion' }]),
    );
    expect(r.results.map((x) => [x.candidate.source, x.candidate.sql])).toEqual([['pasted', 'CREATE INDEX mine ON events (amount)']]);
  });

  it('a model rewrite with a column renamed but the same values is still compared by value', async () => {
    const r = await run(
      { query: 'SELECT id FROM accounts WHERE region = \'north\'', useAi: true },
      stub([{ kind: 'rewrite', sql: 'SELECT id AS account_id FROM accounts WHERE region = \'north\'', origin: 'model' }]),
    );
    expect(r.results[0].equivalence.every((e) => e.equivalent)).toBe(true);
  });

  it('seed scripts that fail are reported as a setup problem', async () => {
    await expect(run({ query: 'SELECT 1', seedSql: 'INSERT INTO accounts VALUES (1);' })).rejects.toThrow(/seed script failed/);
  });
});

describe('generated data from a schema with no seed', () => {
  it('generates enough rows across FKs, uuid, enum, varchar and a junction table to change plans', async () => {
    const schema = `
      CREATE TYPE plan AS ENUM ('free', 'pro', 'team');
      CREATE TABLE users (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, email varchar(40) UNIQUE NOT NULL, plan plan NOT NULL, signup date, ext uuid);
      CREATE TABLE projects (id serial PRIMARY KEY, owner_id bigint NOT NULL REFERENCES users (id), name text NOT NULL, status text NOT NULL);
      CREATE TABLE members (project_id int REFERENCES projects (id), user_id bigint REFERENCES users (id), role text, PRIMARY KEY (project_id, user_id));`;
    const r = await runPipeline(
      { schemaSql: schema, query: "SELECT id, name FROM projects WHERE owner_id = 42 AND status = 'active'", suggestion: 'CREATE INDEX ON projects (owner_id);', useAi: false },
      { createDb: freshDb, ...fast },
    );
    expect(r.warnings.filter((w) => w.startsWith('Data generation'))).toEqual([]);
    expect(r.dataset.source).toBe('generated');
    expect(Object.fromEntries(r.dataset.tables.map((t) => [t.name, t.rows]))).toEqual({ users: 10_000, projects: 50_000, members: 50_000 });
    expect(r.results[0].verdict).toBe('VERIFIED');
  });
});
