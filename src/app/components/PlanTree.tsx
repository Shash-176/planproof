import type { Measurement, PlanNodeSummary } from '@/lib/harness/types';

const SCANS = new Set(['Seq Scan', 'Index Scan', 'Index Only Scan', 'Bitmap Heap Scan', 'Bitmap Index Scan']);
const fmt = (x: number) => Math.round(x).toLocaleString('en-US');

/** Rows a node touched: scans count rows read (kept + filtered out); others count rows produced. */
function touched(n: PlanNodeSummary): number {
  return SCANS.has(n.nodeType) ? (n.actualRows + n.removedByFilter) * n.loops : n.actualRows * n.loops;
}

/**
 * A compact view of an EXPLAIN ANALYZE tree. Bar length is logarithmic in
 * rows touched so that 20 rows and 200,000 rows are both visible on one scale.
 * The numbers are always shown as text; the bars are decorative.
 */
export function PlanTree({ m, scaleMax, label }: { m: Measurement; scaleMax: number; label: string }) {
  const max = Math.log10(Math.max(10, scaleMax) + 1);
  return (
    <ul className="plan" aria-label={label}>
      {m.nodes.map((n, i) => {
        const t = touched(n);
        const width = Math.max(2, (Math.log10(t + 1) / max) * 100);
        const wasteful = n.nodeType === 'Seq Scan' && n.removedByFilter > n.actualRows * 10;
        return (
          <li key={i} className="plan-node" style={{ paddingInlineStart: `${n.depth * 14}px` }}>
            <div className="plan-label">
              <span className="plan-type">{n.nodeType}</span>
              {n.relation && <span className="plan-rel"> on {n.relation}</span>}
              {n.index && <span className="plan-idx"> using {n.index}</span>}
            </div>
            <div className="plan-bar-row">
              <span className={`plan-bar ${wasteful ? 'plan-bar-warn' : ''}`} style={{ width: `${width}%` }} aria-hidden />
              <span className="plan-rows">
                {fmt(t)} {SCANS.has(n.nodeType) ? 'read' : 'rows'}
                {n.loops > 1 ? ` (${fmt(n.loops)} loops)` : ''}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function maxTouched(...ms: (Measurement | undefined)[]): number {
  let max = 0;
  for (const m of ms) for (const n of m?.nodes ?? []) max = Math.max(max, touched(n));
  return max;
}
