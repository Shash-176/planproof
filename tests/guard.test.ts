import { describe, expect, it } from 'vitest';
import { classifyCandidate, classifyIndex, classifyQuery, checkSetupScript } from '@/lib/sql/guard';
import { hasTopLevelOrderBy, maskSql, splitStatements, stringLiterals } from '@/lib/sql/lexer';
import { extractStatements } from '@/lib/harness/candidates';

describe('lexer', () => {
  it('ignores semicolons and keywords inside strings, comments and dollar quotes', () => {
    const sql = `SELECT 'a;b' AS x -- DROP TABLE t;
      /* DELETE FROM t; */ FROM t WHERE y = $$;$$`;
    expect(splitStatements(sql)).toHaveLength(1);
    expect(maskSql(sql)).not.toMatch(/DROP|DELETE/);
  });

  it('splits real statements', () => {
    expect(splitStatements('SELECT 1; SELECT 2;')).toEqual(['SELECT 1', 'SELECT 2']);
  });

  it('detects ORDER BY only at the top level', () => {
    expect(hasTopLevelOrderBy('SELECT * FROM t ORDER BY a')).toBe(true);
    expect(hasTopLevelOrderBy('SELECT * FROM (SELECT * FROM t ORDER BY a) s')).toBe(false);
    expect(hasTopLevelOrderBy('SELECT row_number() OVER (ORDER BY a) FROM t')).toBe(false);
    expect(hasTopLevelOrderBy("SELECT 'order by' FROM t")).toBe(false);
  });

  it('collects plain string literals, unescaping quotes, skipping E-prefixed ones', () => {
    expect(stringLiterals(`SELECT * FROM t WHERE s = 'pending' OR s = 'it''s' OR s = E'\\x41'`)).toEqual(['pending', "it's"]);
  });
});

describe('guard: queries', () => {
  it('accepts read-only SELECT and WITH', () => {
    expect(classifyQuery('SELECT 1').ok).toBe(true);
    expect(classifyQuery('WITH x AS (SELECT 1) SELECT * FROM x;').ok).toBe(true);
  });

  it.each([
    ['DELETE FROM orders', 'destructive'],
    ['UPDATE orders SET total = 0', 'destructive'],
    ['DROP TABLE orders', 'destructive'],
    ['TRUNCATE orders', 'destructive'],
    ['WITH d AS (DELETE FROM orders RETURNING *) SELECT * FROM d', 'destructive'],
    ['SELECT * INTO copy FROM orders', 'destructive'],
    ['SELECT pg_sleep(10)', 'destructive'],
    ["SELECT set_config('x', 'y', false)", 'destructive'],
    ['SELECT 1; DROP TABLE orders', 'multiple'],
    ['', 'empty'],
    ['SELECT * FROM orders FOR UPDATE', 'unsupported'],
  ])('rejects %s', (sql, category) => {
    const r = classifyQuery(sql);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.category).toBe(category);
  });

  it('is not fooled by keywords inside strings', () => {
    expect(classifyQuery("SELECT * FROM logs WHERE msg = 'DROP TABLE users'").ok).toBe(true);
  });
});

describe('guard: indexes and pasted candidates', () => {
  it('removes CONCURRENTLY for the test and says so', () => {
    const r = classifyIndex('CREATE INDEX CONCURRENTLY i ON t (a)');
    expect(r.ok && r.kind === 'index' && r.sql).toBe('CREATE INDEX i ON t (a)');
    expect(r.ok && r.kind === 'index' && r.notes.length).toBe(1);
  });

  it('classifies destructive pasted SQL as destructive, other DDL as unsupported', () => {
    const drop = classifyCandidate('DROP INDEX orders_pkey');
    expect(!drop.ok && drop.category).toBe('destructive');
    const table = classifyCandidate('CREATE TABLE x (a int)');
    expect(!table.ok && table.category).toBe('unsupported');
  });

  it('extracts SQL from fenced blocks and ignores prose', () => {
    const text = "Try this:\n```sql\nCREATE INDEX a ON t (x);\nSELECT 1;\n```\nThat's it.";
    expect(extractStatements(text).map((s) => s.sql)).toEqual(['CREATE INDEX a ON t (x)', 'SELECT 1']);
    expect(extractStatements('You should add an index on the customer column.')).toEqual([]);
  });
});

describe('guard: setup scripts', () => {
  it('allows DDL in schema but not DROP', () => {
    expect(checkSetupScript('CREATE TABLE t (a int); ALTER TABLE t ADD b int;', 'schema')).toBeNull();
    expect(checkSetupScript('CREATE TABLE t (a int); DROP TABLE t;', 'schema')).toMatch(/DROP/);
  });
  it('allows INSERT in seed but not DDL', () => {
    expect(checkSetupScript("SELECT setseed(0.1); INSERT INTO t VALUES (1);", 'seed')).toBeNull();
    expect(checkSetupScript('CREATE TABLE z (a int);', 'seed')).toMatch(/CREATE/);
  });
});
