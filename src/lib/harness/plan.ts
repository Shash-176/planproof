import type { PlanNodeSummary } from './types';

/** A node from EXPLAIN (FORMAT JSON). Only the fields we use are typed. */
export interface RawPlanNode {
  'Node Type': string;
  'Relation Name'?: string;
  Alias?: string;
  'Index Name'?: string;
  'Total Cost': number;
  'Actual Rows'?: number;
  'Actual Loops'?: number;
  'Rows Removed by Filter'?: number;
  'Rows Removed by Index Recheck'?: number;
  'Sort Key'?: string[];
  'Sort Method'?: string;
  'Group Key'?: string[];
  Strategy?: string;
  'Join Type'?: string;
  'Parent Relationship'?: string;
  'Subplan Name'?: string;
  Filter?: string;
  'Index Cond'?: string;
  'Hash Cond'?: string;
  Plans?: RawPlanNode[];
  [k: string]: unknown;
}

export interface RawExplain {
  Plan: RawPlanNode;
  'Planning Time'?: number;
  'Execution Time'?: number;
}

const SCAN_TYPES = new Set([
  'Seq Scan',
  'Index Scan',
  'Index Only Scan',
  'Bitmap Heap Scan',
  'Tid Scan',
  'Tid Range Scan',
  'Sample Scan',
]);

export function flatten(plan: RawPlanNode, depth = 0, out: PlanNodeSummary[] = []): PlanNodeSummary[] {
  out.push({
    nodeType: plan['Node Type'],
    relation: plan['Relation Name'],
    alias: plan.Alias,
    index: plan['Index Name'],
    actualRows: plan['Actual Rows'] ?? 0,
    loops: plan['Actual Loops'] ?? 1,
    removedByFilter: (plan['Rows Removed by Filter'] ?? 0) + (plan['Rows Removed by Index Recheck'] ?? 0),
    depth,
    detail: describeDetail(plan),
  });
  for (const child of plan.Plans ?? []) flatten(child, depth + 1, out);
  return out;
}

function describeDetail(p: RawPlanNode): string | undefined {
  if (p['Sort Key']) return `by ${p['Sort Key'].join(', ')}`;
  if (p['Index Cond']) return p['Index Cond'];
  if (p['Hash Cond']) return p['Hash Cond'];
  if (p.Filter) return p.Filter;
  return undefined;
}

/** Rows read by scan nodes. Loops matter: an inner index scan in a nested loop runs many times. */
export function rowsRead(nodes: PlanNodeSummary[]): number {
  let total = 0;
  for (const n of nodes) {
    if (SCAN_TYPES.has(n.nodeType)) total += (n.actualRows + n.removedByFilter) * n.loops;
  }
  return Math.round(total);
}

export function usedIndexes(nodes: PlanNodeSummary[]): string[] {
  return [...new Set(nodes.map((n) => n.index).filter((x): x is string => !!x))];
}

/** Plan shape ignoring costs and timings. Same shape ⇒ same strategy. */
export function shape(plan: RawPlanNode): string {
  const parts = [plan['Node Type'], plan['Relation Name'] ?? '', plan['Index Name'] ?? '', plan['Join Type'] ?? '', plan.Strategy ?? ''];
  const kids = (plan.Plans ?? []).map(shape).join(',');
  return `${parts.join(':')}(${kids})`;
}
