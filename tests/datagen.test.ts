import { describe, expect, it } from 'vitest';
import { EDGE_DATA, generateData, introspect, MAIN_DATA, topoSort, type GenerateOptions } from '@/lib/harness/datagen';
import { stringLiterals } from '@/lib/sql/lexer';
import { freshDb } from './helpers';

/** Small sizes keep these fast; the shape of the data is what matters here. */
const small: GenerateOptions = { ...MAIN_DATA, baseRows: 200, childMultiplier: 3, maxRowsPerTable: 1_000 };

async function load(schema: string, opts: GenerateOptions = small) {
  const db = await freshDb();
  await db.exec(schema);
  const tables = await introspect(db);
  const result = await generateData(db, tables, opts);
  return { db, tables, result };
}

describe('synthetic data generation', () => {
  it('orders tables so parents are filled before children', async () => {
    const { tables, result } = await load(`
      CREATE TABLE a (id int PRIMARY KEY);
      CREATE TABLE b (id int PRIMARY KEY, a_id int NOT NULL REFERENCES a (id));
      CREATE TABLE c (id int PRIMARY KEY, b_id int NOT NULL REFERENCES b (id));`);
    // introspection returns tables alphabetically; reverse them to prove the sort does the work
    tables.reverse();
    expect(topoSort(tables).map((t) => t.name)).toEqual(['a', 'b', 'c']);
    expect(result.problems).toEqual([]);
  });

  it('keeps every foreign key valid, including text and uuid keys', async () => {
    const { db, result } = await load(`
      CREATE TABLE accounts (code text PRIMARY KEY, ext uuid UNIQUE NOT NULL);
      CREATE TABLE logins (id bigint PRIMARY KEY, account_code text NOT NULL REFERENCES accounts (code), account_ext uuid REFERENCES accounts (ext));`);
    expect(result.problems).toEqual([]);
    const orphans = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM logins l LEFT JOIN accounts a ON a.code = l.account_code WHERE a.code IS NULL`);
    expect(orphans.rows[0].n).toBe(0);
  });

  it('handles quoted identifiers, a non-public schema and a self-reference', async () => {
    const { db, result } = await load(`
      CREATE SCHEMA app;
      CREATE TABLE app."Order Items" ("Id" int PRIMARY KEY, "Parent" int REFERENCES app."Order Items" ("Id"), "Name" varchar(3) NOT NULL);`);
    expect(result.problems).toEqual([]);
    const r = await db.query<{ n: number; maxlen: number }>(`SELECT count(*)::int AS n, max(length("Name"))::int AS maxlen FROM app."Order Items"`);
    expect(r.rows[0].n).toBe(600); // a self-reference counts as a foreign key, so the child multiplier applies
    expect(r.rows[0].maxlen).toBeLessThanOrEqual(3);
  });

  it('fills a composite-key junction table without duplicate keys', async () => {
    const { result } = await load(`
      CREATE TABLE u (id int PRIMARY KEY);
      CREATE TABLE g (id int PRIMARY KEY);
      CREATE TABLE ug (u_id int REFERENCES u (id), g_id int REFERENCES g (id), PRIMARY KEY (u_id, g_id));`);
    expect(result.problems).toEqual([]);
    expect(result.tables.find((t) => t.name === 'ug')?.rows).toBe(600);
  });

  it('respects NOT NULL, identity, generated columns and enums', async () => {
    const { db, result } = await load(`
      CREATE TYPE mood AS ENUM ('ok', 'meh');
      CREATE TABLE t (
        id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        price numeric(6,2) NOT NULL,
        doubled numeric GENERATED ALWAYS AS (price * 2) STORED,
        m mood NOT NULL,
        note text
      );`);
    expect(result.problems).toEqual([]);
    const r = await db.query<{ bad: number; nulls: number }>(`SELECT count(*) FILTER (WHERE doubled <> price * 2)::int AS bad, count(*) FILTER (WHERE note IS NULL)::int AS nulls FROM t`);
    expect(r.rows[0].bad).toBe(0);
    expect(r.rows[0].nulls).toBeGreaterThan(0); // nullable columns get some NULLs
  });

  it('reports a CHECK constraint it cannot satisfy instead of crashing', async () => {
    const { result } = await load(`CREATE TABLE p (id int PRIMARY KEY, qty int NOT NULL CHECK (qty > 50000));`);
    expect(result.problems.join(' ')).toMatch(/p: .*check constraint/i);
    expect(result.tables[0].rows).toBe(0);
  });

  it('reports a NOT NULL column of an unsupported type', async () => {
    const { result } = await load(`CREATE TABLE geo (id int PRIMARY KEY, pos point NOT NULL);`);
    expect(result.problems.join(' ')).toMatch(/Cannot generate values for geo\.pos/);
  });

  it('mixes query literals into text columns so filters match rows', async () => {
    const pool = stringLiterals("SELECT * FROM o WHERE status = 'refunded'");
    const { db } = await load(`CREATE TABLE o (id int PRIMARY KEY, status text NOT NULL);`, { ...small, textPool: pool });
    const r = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM o WHERE status = 'refunded'`);
    expect(r.rows[0].n).toBeGreaterThan(0);
  });

  it('makes the edge dataset hostile: many NULLs and few distinct values', async () => {
    const { db } = await load(`CREATE TABLE e (id int PRIMARY KEY, k text, v int);`, EDGE_DATA);
    const r = await db.query<{ nulls: number; distinct_k: number; n: number }>(
      `SELECT count(*) FILTER (WHERE k IS NULL)::int AS nulls, count(DISTINCT k)::int AS distinct_k, count(*)::int AS n FROM e`,
    );
    expect(r.rows[0].nulls / r.rows[0].n).toBeGreaterThan(0.25);
    expect(r.rows[0].distinct_k).toBeLessThanOrEqual(3);
  });

  it('is reproducible with the same seed', async () => {
    const schema = `CREATE TABLE r (id int PRIMARY KEY, x int, s text);`;
    const a = await load(schema);
    const b = await load(schema);
    const q = `SELECT md5(string_agg(id || ':' || coalesce(x::text,'') || ':' || coalesce(s,''), ',' ORDER BY id)) AS h FROM r`;
    expect((await a.db.query<{ h: string }>(q)).rows[0].h).toBe((await b.db.query<{ h: string }>(q)).rows[0].h);
  });
});
