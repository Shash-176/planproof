/**
 * Result comparison. Rows are compared by position within the row (column
 * names may legitimately differ in a rewrite) and as a multiset across rows,
 * unless the original query orders its final result, in which case order is
 * part of the answer and is compared too.
 */

export type Row = unknown[];

export interface CompareOutcome {
  equivalent: boolean;
  difference?: 'rows' | 'order' | 'columns';
  detail?: string;
}

const NUMERIC_OID = 1700;

/** Canonical text for one value. Floats are rounded to absorb summation-order noise. */
export function canonicalValue(v: unknown, typeOid?: number): string {
  if (v === null || v === undefined) return '∅';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return `n:${String(v)}`;
    if (Number.isInteger(v)) return `n:${v}`;
    return `n:${Number(v.toPrecision(12))}`;
  }
  if (typeof v === 'bigint') return `n:${v.toString()}`;
  if (typeof v === 'string') {
    // numeric values arrive as strings; 1.50 and 1.5 are the same number.
    // Only applied to columns typed numeric, so text '1.50' stays text.
    if (typeOid === NUMERIC_OID && /^-?\d+(\.\d+)?$/.test(v)) return `n:${normalizeDecimal(v)}`;
    return `s:${v}`;
  }
  if (typeof v === 'boolean') return `b:${v}`;
  if (v instanceof Date) return `d:${v.toISOString()}`;
  if (v instanceof Uint8Array) return `x:${Array.from(v, (b) => b.toString(16).padStart(2, '0')).join('')}`;
  if (Array.isArray(v)) return `a:[${v.map((x) => canonicalValue(x)).join(',')}]`;
  if (typeof v === 'object') return `o:${stableJson(v)}`;
  return `?:${String(v)}`;
}

function normalizeDecimal(s: string): string {
  if (!s.includes('.')) return s.replace(/^(-?)0+(\d)/, '$1$2');
  const [i, f] = s.split('.');
  const frac = f.replace(/0+$/, '');
  const int = i.replace(/^(-?)0+(\d)/, '$1$2');
  return frac ? `${int}.${frac}` : int === '-0' ? '0' : int;
}

function stableJson(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  const keys = Object.keys(v as object).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableJson((v as Record<string, unknown>)[k])}`).join(',')}}`;
}

const UNIT_SEPARATOR = '␟';

export function canonicalRow(r: Row, types?: number[]): string {
  return r.map((v, i) => canonicalValue(v, types?.[i])).join(UNIT_SEPARATOR);
}

export interface ResultSet {
  columns: string[];
  /** Postgres type OIDs, one per column. */
  types?: number[];
  rows: Row[];
}

export function compareResults(before: ResultSet, after: ResultSet, ordered: boolean): CompareOutcome {
  if (before.columns.length !== after.columns.length) {
    return {
      equivalent: false,
      difference: 'columns',
      detail: `The original returns ${before.columns.length} column(s); the rewrite returns ${after.columns.length}.`,
    };
  }
  const a = before.rows.map((r) => canonicalRow(r, before.types));
  const b = after.rows.map((r) => canonicalRow(r, after.types));

  const counts = new Map<string, number>();
  for (const r of a) counts.set(r, (counts.get(r) ?? 0) + 1);
  for (const r of b) counts.set(r, (counts.get(r) ?? 0) - 1);
  let missing = 0;
  let extra = 0;
  for (const c of counts.values()) {
    if (c > 0) missing += c;
    else if (c < 0) extra -= c;
  }
  if (missing || extra) {
    const fmt = (x: number) => x.toLocaleString('en-US');
    const inOriginal = new Set(a);
    let duplicates = 0;
    for (const [row, c] of counts) if (c < 0 && inOriginal.has(row)) duplicates -= c;
    const parts: string[] = [`The original returns ${fmt(a.length)} row(s); the rewrite returns ${fmt(b.length)}`];
    if (duplicates) parts.push(`${fmt(duplicates)} are duplicates of rows the original returns once`);
    if (extra - duplicates > 0) parts.push(`${fmt(extra - duplicates)} are rows the original never returns`);
    if (missing) parts.push(`${fmt(missing)} row(s) of the original are missing`);
    return { equivalent: false, difference: 'rows', detail: parts.join('; ') + '.' };
  }
  if (ordered) {
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        return {
          equivalent: false,
          difference: 'order',
          detail: `Same rows, different order (first difference at row ${i + 1}). The original query has ORDER BY, so order is part of its result. If the ORDER BY has ties, make it unique to compare reliably.`,
        };
      }
    }
  }
  return { equivalent: true };
}
