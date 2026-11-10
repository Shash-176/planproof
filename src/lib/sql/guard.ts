import { firstKeyword, keywords, maskSql, splitStatements } from './lexer';

/**
 * First line of defence. The second, stronger line is the database itself:
 * queries run in READ ONLY transactions and index candidates run in a
 * transaction that is always rolled back. This guard exists to give clear
 * reasons and to refuse obviously destructive input before it reaches Postgres.
 */

export type Classification =
  | { ok: true; kind: 'query'; sql: string }
  | { ok: true; kind: 'index'; sql: string; notes: string[] }
  | { ok: false; category: 'destructive' | 'unsupported' | 'empty' | 'multiple'; reason: string };

const QUERY_STARTS = new Set(['SELECT', 'WITH', 'VALUES', 'TABLE']);

/** Statements that change data, schema or session state. */
const DESTRUCTIVE = new Set([
  'INSERT', 'UPDATE', 'DELETE', 'MERGE', 'TRUNCATE', 'DROP', 'ALTER', 'GRANT', 'REVOKE',
  'COPY', 'VACUUM', 'CLUSTER', 'REINDEX', 'COMMENT', 'SECURITY', 'LOCK', 'CALL', 'DO',
  'EXECUTE', 'PREPARE', 'DEALLOCATE', 'LISTEN', 'NOTIFY', 'LOAD', 'IMPORT', 'REFRESH',
  'DISCARD', 'RESET', 'SET', 'BEGIN', 'COMMIT', 'ROLLBACK', 'SAVEPOINT', 'RELEASE', 'START',
  'END', 'ABORT', 'CHECKPOINT', 'REASSIGN', 'CREATE',
]);

/** Words that must never appear anywhere in a query candidate. */
const FORBIDDEN_IN_QUERY = new Set([
  'INSERT', 'UPDATE', 'DELETE', 'MERGE', 'TRUNCATE', 'DROP', 'ALTER', 'GRANT', 'REVOKE', 'COPY',
]);

/** Functions with side effects or that can stall the sandbox. */
const FORBIDDEN_FUNCTIONS = [
  'pg_sleep', 'pg_sleep_for', 'pg_sleep_until', 'set_config', 'pg_terminate_backend',
  'pg_cancel_backend', 'pg_reload_conf', 'pg_read_file', 'pg_read_binary_file', 'pg_ls_dir',
  'lo_import', 'lo_export', 'dblink', 'nextval', 'setval', 'pg_advisory_lock',
];

function single(sql: string): { ok: true; sql: string } | { ok: false; category: 'empty' | 'multiple'; reason: string } {
  const statements = splitStatements(sql);
  if (statements.length === 0) return { ok: false, category: 'empty', reason: 'No SQL statement found.' };
  if (statements.length > 1)
    return { ok: false, category: 'multiple', reason: `Expected one statement, found ${statements.length}.` };
  return { ok: true, sql: statements[0] };
}

export function classifyQuery(input: string): Classification {
  const s = single(input);
  if (!s.ok) return s;
  const first = firstKeyword(s.sql);
  if (!first || !QUERY_STARTS.has(first)) {
    if (first && DESTRUCTIVE.has(first) && first !== 'CREATE')
      return { ok: false, category: 'destructive', reason: `${first} statements modify the database and are never run.` };
    return { ok: false, category: 'unsupported', reason: 'Only read-only SELECT queries can be checked.' };
  }
  const words = keywords(s.sql);
  const bad = words.find((w) => FORBIDDEN_IN_QUERY.has(w));
  if (bad) return { ok: false, category: 'destructive', reason: `The query contains ${bad}, which modifies data.` };
  // In a plain query INTO can only mean SELECT … INTO, which creates a table.
  if (words.includes('INTO'))
    return { ok: false, category: 'destructive', reason: 'SELECT … INTO creates a table and is never run.' };
  if (words.includes('FOR') && /\bFOR\s+(UPDATE|SHARE|NO\s+KEY\s+UPDATE|KEY\s+SHARE)\b/i.test(maskSql(s.sql)))
    return { ok: false, category: 'unsupported', reason: 'Row-locking clauses (FOR UPDATE/SHARE) are not supported.' };
  const fn = forbiddenFunction(s.sql);
  if (fn) return { ok: false, category: 'destructive', reason: `The query calls ${fn}(), which is not allowed in the sandbox.` };
  return { ok: true, kind: 'query', sql: s.sql };
}

export function classifyIndex(input: string): Classification {
  const s = single(input);
  if (!s.ok) return s;
  const masked = maskSql(s.sql);
  const m = /^\s*CREATE\s+(UNIQUE\s+)?INDEX\b/i.exec(masked);
  if (!m) return { ok: false, category: 'unsupported', reason: 'Expected CREATE INDEX.' };
  const fn = forbiddenFunction(s.sql);
  if (fn) return { ok: false, category: 'destructive', reason: `The index definition calls ${fn}().` };
  const notes: string[] = [];
  let sql = s.sql;
  // CONCURRENTLY cannot run inside a transaction block. It does not change
  // what the index does, so it is removed for testing and kept in the migration.
  if (/\bCONCURRENTLY\b/i.test(masked)) {
    sql = sql.replace(/\bCONCURRENTLY\b\s*/i, '');
    notes.push('CONCURRENTLY was removed for the test; it does not change what the index does.');
  }
  return { ok: true, kind: 'index', sql, notes };
}

/** Classify a statement found in pasted text. */
export function classifyCandidate(input: string): Classification {
  const first = firstKeyword(input);
  if (first === 'CREATE' && /^\s*CREATE\s+(UNIQUE\s+)?INDEX\b/i.test(maskSql(input))) return classifyIndex(input);
  if (first && QUERY_STARTS.has(first)) return classifyQuery(input);
  if (first === 'EXPLAIN') return { ok: false, category: 'unsupported', reason: 'EXPLAIN is run by PlanProof itself; paste the query instead.' };
  if (first && DESTRUCTIVE.has(first)) {
    const isCreate = first === 'CREATE';
    return {
      ok: false,
      category: isCreate ? 'unsupported' : 'destructive',
      reason: isCreate
        ? 'Only CREATE INDEX is supported among CREATE statements.'
        : `${first} statements modify the database and are never run.`,
    };
  }
  return { ok: false, category: 'unsupported', reason: 'Not a SQL statement PlanProof can test.' };
}

function forbiddenFunction(sql: string): string | null {
  const masked = maskSql(sql).toLowerCase();
  for (const f of FORBIDDEN_FUNCTIONS) {
    if (new RegExp(`\\b${f}\\s*\\(`).test(masked)) return f;
  }
  return null;
}

/** Statements allowed in schema and seed scripts (they run before any test). */
export function checkSetupScript(sql: string, kind: 'schema' | 'seed'): string | null {
  const allowed =
    kind === 'schema'
      ? new Set(['CREATE', 'ALTER', 'COMMENT', 'SET'])
      : new Set(['INSERT', 'SELECT', 'WITH', 'COPY', 'UPDATE', 'DELETE', 'ANALYZE', 'SET']);
  for (const stmt of splitStatements(sql)) {
    const first = firstKeyword(stmt);
    if (!first || !allowed.has(first)) {
      return `${kind === 'schema' ? 'Schema' : 'Seed'} scripts may not contain ${first ?? 'that'} statements.`;
    }
    if (kind === 'seed' && first === 'COPY' && !/\bFROM\s+STDIN\b/i.test(maskSql(stmt)))
      return 'COPY is only allowed FROM STDIN.';
    const fn = forbiddenFunction(stmt);
    if (fn && fn !== 'nextval' && fn !== 'setval') return `Setup scripts may not call ${fn}().`;
  }
  return null;
}
