import { classifyCandidate } from '../sql/guard';
import { normalizeForCompare, splitStatements, firstKeyword } from '../sql/lexer';
import type { Candidate, CandidateSource } from './types';

const SQL_STARTS = /^(SELECT|WITH|CREATE|DROP|ALTER|DELETE|UPDATE|INSERT|TRUNCATE|VALUES|TABLE|EXPLAIN|GRANT|REVOKE|VACUUM|REINDEX|CLUSTER|SET|MERGE)$/;

export interface ExtractedStatement {
  sql: string;
}

/**
 * Deterministically pull SQL statements out of pasted text: either the
 * contents of fenced code blocks, or, if there are none, the text itself.
 * Prose that is not SQL is ignored here; the model may extract SQL from it.
 */
export function extractStatements(text: string): ExtractedStatement[] {
  const fences = [...text.matchAll(/```[a-zA-Z]*\s*\n?([\s\S]*?)```/g)].map((m) => m[1]);
  const sources = fences.length ? fences : [text];
  const out: ExtractedStatement[] = [];
  for (const src of sources) {
    for (const stmt of splitStatements(src)) {
      const kw = firstKeyword(stmt);
      if (kw && SQL_STARTS.test(kw)) out.push({ sql: stmt.trim() });
    }
  }
  return out;
}

export function toCandidate(sql: string, source: CandidateSource, n: number, rationale?: string): Candidate {
  const c = classifyCandidate(sql);
  const kind = c.ok ? (c.kind === 'index' ? 'index' : 'rewrite') : /^\s*CREATE\s+(UNIQUE\s+)?INDEX/i.test(sql) ? 'index' : 'rewrite';
  return { id: `c${n}`, kind, sql: sql.trim().replace(/;\s*$/, ''), source, rationale };
}

/**
 * Remove duplicates, keeping the first occurrence (pasted before AI).
 * A candidate identical to the original query is kept: it will be reported
 * as INEFFECTIVE, which is more useful than silently dropping it.
 */
export function dedupe(cands: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const c of cands) {
    const key = normalizeForCompare(c.sql);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out.map((c, i) => ({ ...c, id: `c${i + 1}` }));
}
