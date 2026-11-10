import { describe, expect, it } from 'vitest';
import { canonicalValue, compareResults, type ResultSet } from '@/lib/harness/equivalence';

const rs = (rows: unknown[][], columns = rows[0]?.map((_, i) => `c${i}`) ?? ['c0'], types?: number[]): ResultSet => ({ columns, rows, types });

describe('compareResults', () => {
  it('treats identical multisets as equal regardless of order when unordered', () => {
    expect(compareResults(rs([[1], [2], [3]]), rs([[3], [1], [2]]), false).equivalent).toBe(true);
  });

  it('detects duplicated rows (the classic IN → JOIN mistake)', () => {
    const r = compareResults(rs([[1], [2]]), rs([[1], [1], [2]]), false);
    expect(r.equivalent).toBe(false);
    expect(r.difference).toBe('rows');
    expect(r.detail).toMatch(/1 are duplicates/);
  });

  it('detects lost duplicates (e.g. DISTINCT added)', () => {
    const r = compareResults(rs([[1], [1]]), rs([[1]]), false);
    expect(r.equivalent).toBe(false);
    expect(r.detail).toMatch(/missing/);
  });

  it('distinguishes NULL from the string "null" and from empty string', () => {
    expect(compareResults(rs([[null]]), rs([['null']]), false).equivalent).toBe(false);
    expect(compareResults(rs([[null]]), rs([['']]), false).equivalent).toBe(false);
    expect(compareResults(rs([[null], [1]]), rs([[1], [null]]), false).equivalent).toBe(true);
  });

  it('compares order when the original has ORDER BY', () => {
    const r = compareResults(rs([[1], [2]]), rs([[2], [1]]), true);
    expect(r.equivalent).toBe(false);
    expect(r.difference).toBe('order');
  });

  it('flags a different number of columns', () => {
    const r = compareResults(rs([[1, 2]]), rs([[1]]), false);
    expect(r.difference).toBe('columns');
  });

  it('treats both-empty as equal', () => {
    expect(compareResults(rs([], ['a']), rs([], ['a']), false).equivalent).toBe(true);
  });

  it('normalises numeric scale only for numeric columns', () => {
    expect(compareResults(rs([['1.50']], ['x'], [1700]), rs([['1.5']], ['x'], [1700]), false).equivalent).toBe(true);
    expect(compareResults(rs([['1.50']], ['x'], [25]), rs([['1.5']], ['x'], [25]), false).equivalent).toBe(false);
  });

  it('absorbs float summation noise but not real differences', () => {
    expect(canonicalValue(0.1 + 0.2)).toBe(canonicalValue(0.3));
    expect(canonicalValue(0.3)).not.toBe(canonicalValue(0.31));
  });

  it('compares dates and json by value', () => {
    expect(canonicalValue(new Date('2024-01-01T00:00:00Z'))).toBe(canonicalValue(new Date('2024-01-01T00:00:00.000Z')));
    expect(canonicalValue({ b: 1, a: 2 })).toBe(canonicalValue({ a: 2, b: 1 }));
  });
});
