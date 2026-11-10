import type { RawPlanNode } from './plan';

/**
 * Deterministic plain-English description of a plan. Generated from the
 * plan tree, not by the model, so it can be trusted as a description of
 * what Postgres actually did.
 */

const n = (x: number) => Math.round(x).toLocaleString('en-US');
const rows = (x: number) => `${n(x)} row${Math.round(x) === 1 ? '' : 's'}`;
const tbl = (p: RawPlanNode) => `\`${p['Relation Name'] ?? p.Alias ?? 'a table'}\``;

function total(p: RawPlanNode) {
  return (p['Actual Rows'] ?? 0) * (p['Actual Loops'] ?? 1);
}

function loopsNote(p: RawPlanNode) {
  const loops = p['Actual Loops'] ?? 1;
  return loops > 1 ? `, repeated ${n(loops)} times` : '';
}

function describe(p: RawPlanNode): string | null {
  const t = p['Node Type'];
  const out = total(p);
  const removed = (p['Rows Removed by Filter'] ?? 0) * (p['Actual Loops'] ?? 1);
  switch (t) {
    case 'Seq Scan': {
      const read = out + removed;
      if (removed > 0)
        return `Reads every row of ${tbl(p)} (${rows(read)}) and keeps ${rows(out)} that match; ${n(removed)} are read and thrown away${loopsNote(p)}.`;
      return `Reads every row of ${tbl(p)} (${rows(out)})${loopsNote(p)}.`;
    }
    case 'Index Scan':
      return `Uses the index \`${p['Index Name']}\` to go straight to the matching rows of ${tbl(p)} (${rows(out)})${loopsNote(p)}.`;
    case 'Index Only Scan':
      return `Answers from the index \`${p['Index Name']}\` alone, without visiting ${tbl(p)} (${rows(out)})${loopsNote(p)}.`;
    case 'Bitmap Index Scan':
      return `Looks up matching row locations in the index \`${p['Index Name']}\` (${rows(out)}).`;
    case 'Bitmap Heap Scan':
      return `Fetches those rows from ${tbl(p)} (${rows(out)} kept${removed ? `, ${n(removed)} rechecked and discarded` : ''}).`;
    case 'Sort':
      return `Sorts ${rows(out)} ${p['Sort Key'] ? `by ${p['Sort Key'].join(', ')}` : ''}${p['Sort Method'] ? ` (${p['Sort Method']})` : ''}.`.replace('  ', ' ');
    case 'Incremental Sort':
      return `Finishes sorting ${rows(out)} that were already partly in order.`;
    case 'Limit':
      return `Stops after ${rows(out)}.`;
    case 'Hash Join':
      return `Joins two inputs by building a hash table from one side and probing it (${rows(out)} result).`;
    case 'Merge Join':
      return `Joins two sorted inputs by walking them together (${rows(out)} result).`;
    case 'Nested Loop':
      return `For each row on the outer side, looks up matching rows on the inner side (${rows(out)} result).`;
    case 'Aggregate':
      return p.Strategy === 'Plain'
        ? `Combines ${rows(sumChildren(p))} into a single result.`
        : `Groups and aggregates rows into ${rows(out)}.`;
    case 'HashAggregate':
      return `Groups rows using a hash table into ${rows(out)}.`;
    case 'GroupAggregate':
      return `Groups already-sorted rows into ${rows(out)}.`;
    case 'Unique':
      return `Removes duplicate rows, leaving ${rows(out)}.`;
    case 'Materialize':
      return `Keeps ${rows(out)} in memory so they can be re-read.`;
    case 'Memoize':
      return `Caches repeated lookups (${rows(out)}).`;
    case 'Hash':
    case 'Gather':
    case 'Gather Merge':
    case 'Result':
    case 'Subquery Scan':
    case 'Append':
      return null;
    case 'CTE Scan':
      return `Reads the result of the WITH clause \`${p['CTE Name'] ?? ''}\` (${rows(out)}).`;
    case 'Function Scan':
      return `Calls a set-returning function (${rows(out)}).`;
    case 'Values Scan':
      return `Reads a VALUES list (${rows(out)}).`;
    default:
      return `Runs a ${t} step (${rows(out)}).`;
  }
}

function sumChildren(p: RawPlanNode) {
  return (p.Plans ?? []).reduce((s, c) => s + total(c), 0);
}

/** Steps in execution order (children before parents). */
export function narrate(plan: RawPlanNode): string[] {
  const steps: string[] = [];
  const visit = (p: RawPlanNode) => {
    for (const c of p.Plans ?? []) visit(c);
    const d = describe(p);
    if (d) steps.push(d);
  };
  visit(plan);
  return steps;
}

/** One-line comparison for the verdict card. */
export function compareSentence(before: { rowsRead: number; medianMs: number }, after: { rowsRead: number; medianMs: number }): string {
  return `Postgres read ${rows(before.rowsRead)} before and ${rows(after.rowsRead)} after; median time ${fmtMs(before.medianMs)} → ${fmtMs(after.medianMs)}.`;
}

export function fmtMs(ms: number): string {
  if (ms < 1) return `${ms.toFixed(2)} ms`;
  if (ms < 100) return `${ms.toFixed(1)} ms`;
  return `${Math.round(ms).toLocaleString('en-US')} ms`;
}
