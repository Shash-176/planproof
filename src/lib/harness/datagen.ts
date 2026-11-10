import type { Db } from './types';

/**
 * Synthetic data from a schema. The schema is loaded into Postgres first and
 * then read back from the catalog, so PlanProof never has to parse DDL itself.
 * Generation happens inside Postgres with INSERT … SELECT generate_series,
 * seeded with setseed() so runs are reproducible.
 */

export interface ColumnInfo {
  name: string;
  type: string; // format_type output
  category: string; // pg_type.typcategory of the base type
  baseType: string;
  notNull: boolean;
  hasDefault: boolean;
  identity: string; // '' | 'a' | 'd'
  generated: string; // '' | 's'
  isEnum: boolean;
  maxLength: number | null;
}

export interface ForeignKey {
  columns: string[];
  refTable: string;
  refColumns: string[];
}

export interface TableInfo {
  schema: string;
  name: string;
  qualified: string;
  columns: ColumnInfo[];
  keyColumns: string[][]; // primary key and unique constraints
  foreignKeys: ForeignKey[];
}

export interface GenerateOptions {
  /** Rows for tables that nothing else depends on and that reference nothing. */
  baseRows: number;
  /** Multiplier for tables with foreign keys (child tables are usually larger). */
  childMultiplier: number;
  maxRowsPerTable: number;
  /** Fraction of NULLs in nullable, non-key columns. */
  nullFraction: number;
  /** Distinct values for ordinary text columns. */
  textCardinality: number;
  /** Distinct values for text columns that look categorical (status, type …). */
  categoricalCardinality: number;
  seed: number;
  /**
   * String literals taken from the query and the suggestions. Mixed into text
   * columns so that filters such as status = 'pending' actually match rows.
   */
  textPool?: string[];
  /** Share of text values drawn from textPool. */
  poolFraction?: number;
}

export const MAIN_DATA: GenerateOptions = {
  baseRows: 10_000,
  childMultiplier: 5,
  maxRowsPerTable: 100_000,
  nullFraction: 0.05,
  textCardinality: 2_000,
  categoricalCardinality: 6,
  seed: 0.42,
  poolFraction: 0.3,
};

/** Small, hostile data: many NULLs and duplicates. Used only to check equivalence. */
export const EDGE_DATA: GenerateOptions = {
  baseRows: 200,
  childMultiplier: 4,
  maxRowsPerTable: 2_000,
  nullFraction: 0.4,
  textCardinality: 3,
  categoricalCardinality: 2,
  seed: 0.17,
  poolFraction: 0.6,
};

const q = (ident: string) => `"${ident.replace(/"/g, '""')}"`;
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

export async function introspect(db: Db): Promise<TableInfo[]> {
  const tables = await db.query<{ oid: number; schema: string; name: string }>(`
    SELECT c.oid::int AS oid, n.nspname AS schema, c.relname AS name
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r','p') AND NOT c.relispartition
      AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
    ORDER BY n.nspname, c.relname`);

  const out: TableInfo[] = [];
  for (const t of tables.rows) {
    const cols = await db.query<{
      name: string; type: string; category: string; basetype: string; notnull: boolean;
      hasdefault: boolean; identity: string; generated: string; isenum: boolean; maxlen: number | null;
    }>(`
      SELECT a.attname AS name,
             format_type(a.atttypid, a.atttypmod) AS type,
             bt.typcategory AS category,
             format_type(bt.oid, NULL) AS basetype,
             a.attnotnull AS notnull,
             a.atthasdef AS hasdefault,
             a.attidentity AS identity,
             a.attgenerated AS generated,
             (bt.typtype = 'e') AS isenum,
             CASE WHEN a.atttypmod > 4 AND bt.typcategory = 'S' THEN a.atttypmod - 4 ELSE NULL END AS maxlen
      FROM pg_attribute a
      JOIN pg_type t ON t.oid = a.atttypid
      JOIN pg_type bt ON bt.oid = CASE WHEN t.typtype = 'd' THEN t.typbasetype ELSE t.oid END
      WHERE a.attrelid = $1 AND a.attnum > 0 AND NOT a.attisdropped
      ORDER BY a.attnum`, [t.oid]);

    const cons = await db.query<{ contype: string; cols: string[]; reftable: string | null; refcols: string[] | null }>(`
      SELECT c.contype AS contype,
             ARRAY(SELECT attname FROM unnest(c.conkey) WITH ORDINALITY k(n, i)
                   JOIN pg_attribute ON attrelid = c.conrelid AND attnum = k.n ORDER BY k.i)::text[] AS cols,
             CASE WHEN c.contype = 'f' THEN format('%I.%I', rn.nspname, rc.relname) END AS reftable,
             CASE WHEN c.contype = 'f' THEN ARRAY(SELECT attname FROM unnest(c.confkey) WITH ORDINALITY k(n, i)
                   JOIN pg_attribute ON attrelid = c.confrelid AND attnum = k.n ORDER BY k.i)::text[] END AS refcols
      FROM pg_constraint c
      LEFT JOIN pg_class rc ON rc.oid = c.confrelid
      LEFT JOIN pg_namespace rn ON rn.oid = rc.relnamespace
      WHERE c.conrelid = $1 AND c.contype IN ('p','u','f')`, [t.oid]);

    // unique indexes not backed by a constraint also need unique values
    const uidx = await db.query<{ cols: string[] }>(`
      SELECT ARRAY(SELECT attname FROM unnest(i.indkey::int2[]) WITH ORDINALITY k(n, o)
                   JOIN pg_attribute ON attrelid = i.indrelid AND attnum = k.n ORDER BY k.o)::text[] AS cols
      FROM pg_index i
      WHERE i.indrelid = $1 AND i.indisunique AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = i.indexrelid)
        AND 0 <> ALL (i.indkey::int2[])`, [t.oid]);

    out.push({
      schema: t.schema,
      name: t.name,
      qualified: `${q(t.schema)}.${q(t.name)}`,
      columns: cols.rows.map((c) => ({
        name: c.name, type: c.type, category: c.category, baseType: c.basetype, notNull: c.notnull,
        hasDefault: c.hasdefault, identity: c.identity, generated: c.generated, isEnum: c.isenum, maxLength: c.maxlen,
      })),
      keyColumns: [...cons.rows.filter((c) => c.contype !== 'f').map((c) => c.cols), ...uidx.rows.map((r) => r.cols)],
      foreignKeys: cons.rows
        .filter((c) => c.contype === 'f')
        .map((c) => ({ columns: c.cols, refTable: c.reftable!, refColumns: c.refcols! })),
    });
  }
  return out;
}

/** Order tables so that referenced tables come first. Self-references are ignored. */
export function topoSort(tables: TableInfo[]): TableInfo[] {
  const byName = new Map(tables.map((t) => [t.qualified, t]));
  const unquoted = (s: string) => s; // format('%I.%I') matches q() for ordinary names
  const done = new Set<string>();
  const visiting = new Set<string>();
  const out: TableInfo[] = [];
  const visit = (t: TableInfo) => {
    if (done.has(t.qualified)) return;
    if (visiting.has(t.qualified)) return; // cycle: break it
    visiting.add(t.qualified);
    for (const fk of t.foreignKeys) {
      const ref = findTable(byName, unquoted(fk.refTable));
      if (ref && ref !== t) visit(ref);
    }
    visiting.delete(t.qualified);
    done.add(t.qualified);
    out.push(t);
  };
  tables.forEach(visit);
  return out;
}

function findTable(byName: Map<string, TableInfo>, ref: string): TableInfo | undefined {
  // format('%I.%I') leaves simple identifiers unquoted; q() always quotes.
  for (const t of byName.values()) {
    const simple = `${t.schema}.${t.name}`;
    if (ref === simple || ref === t.qualified || ref === `${maybeQuote(t.schema)}.${maybeQuote(t.name)}`) return t;
  }
  return undefined;
}

function maybeQuote(s: string) {
  return /^[a-z_][a-z0-9_$]*$/.test(s) ? s : q(s);
}

const CATEGORICAL = /(status|state|type|kind|category|level|role|tier|plan|gender|country|region|city|currency|channel|source|priority|flag)/i;

/** SQL expression for a key value derived from the row number `i`. */
function keyExpr(col: ColumnInfo, i: string, table: string): string {
  const cat = col.category;
  if (cat === 'N') return `(${i})::${col.type}`;
  if (col.baseType === 'uuid') return `md5(${lit(table + '.' + col.name)} || ${i})::uuid`;
  if (cat === 'D') {
    if (/^time/.test(col.baseType) && !/^timestamp/.test(col.baseType)) return `(time '00:00' + (${i}) * interval '1 second')::${col.type}`;
    return `(timestamp '2020-01-01' + (${i}) * interval '1 minute')::${col.type}`;
  }
  if (cat === 'S') return truncate(`${lit(col.name + '_')} || ${i}`, col);
  if (col.isEnum) return `(enum_range(NULL::${col.type}))[1 + ((${i}) - 1) % array_length(enum_range(NULL::${col.type}), 1)]`;
  return `(${i})::text::${col.type}`;
}

function truncate(expr: string, col: ColumnInfo) {
  return col.maxLength ? `left(${expr}, ${col.maxLength})` : expr;
}

function valueExpr(col: ColumnInfo, opts: GenerateOptions): string | null {
  const t = col.type;
  const r = 'random()';
  if (col.isEnum) return `(enum_range(NULL::${t}))[1 + floor(${r} * array_length(enum_range(NULL::${t}), 1))::int]`;
  switch (col.category) {
    case 'N': {
      if (/^(smallint|integer|bigint)/.test(col.baseType)) {
        const max = /^smallint/.test(col.baseType) ? 1000 : /_id$|^id$/i.test(col.name) ? 100_000 : 10_000;
        return `floor(${r} * ${max})::${t}`;
      }
      if (/^numeric/.test(col.baseType)) {
        const m = /numeric\((\d+),(\d+)\)/.exec(col.type);
        if (m) {
          const p = Number(m[1]);
          const s = Number(m[2]);
          const max = Math.min(10_000, 10 ** (p - s) - 1);
          return `round((${r} * ${max})::numeric, ${s})::${t}`;
        }
        return `round((${r} * 10000)::numeric, 2)::${t}`;
      }
      return `(${r} * 10000)::${t}`;
    }
    case 'S': {
      const card = CATEGORICAL.test(col.name) ? opts.categoricalCardinality : opts.textCardinality;
      const base = `${lit(col.name + '_')} || floor(${r} * ${card})::int`;
      const pool = opts.textPool ?? [];
      if (pool.length === 0) return truncate(base, col);
      const arr = `(ARRAY[${pool.map(lit).join(', ')}]::text[])`;
      const mixed = `CASE WHEN ${r} < ${opts.poolFraction ?? 0.3} THEN ${arr}[1 + floor(${r} * ${pool.length})::int] ELSE ${base} END`;
      return truncate(mixed, col);
    }
    case 'B':
      return `(${r} < 0.5)`;
    case 'D':
      if (/^date/.test(col.baseType)) return `(date '2024-01-01' + floor(${r} * 730)::int)::${t}`;
      if (/^time/.test(col.baseType) && !/^timestamp/.test(col.baseType)) return `(time '00:00' + ${r} * interval '24 hours')::${t}`;
      if (/^interval/.test(col.baseType)) return `(${r} * interval '30 days')::${t}`;
      return `(timestamp '2024-01-01' + ${r} * interval '730 days')::${t}`;
    case 'U':
      if (col.baseType === 'uuid') return `gen_random_uuid()::${t}`;
      if (/^jsonb?$/.test(col.baseType)) return `jsonb_build_object('v', floor(${r} * 100)::int)::${t}`;
      if (col.baseType === 'bytea') return `decode(md5(${r}::text), 'hex')::${t}`;
      return null;
    case 'A':
      return `'{}'::${t}`;
    case 'I':
      return `('10.0.' || floor(${r} * 255)::int || '.' || floor(${r} * 255)::int)::${t}`;
    default:
      return null;
  }
}

export interface GenerateResult {
  tables: { name: string; rows: number }[];
  problems: string[];
}

export function rowsFor(t: TableInfo, opts: GenerateOptions): number {
  const n = t.foreignKeys.length > 0 ? opts.baseRows * opts.childMultiplier : opts.baseRows;
  return Math.min(n, opts.maxRowsPerTable);
}

/** Build the INSERT statement for one table. Exported for tests. */
export function buildInsert(t: TableInfo, rowCounts: Map<string, number>, opts: GenerateOptions, all: TableInfo[]): string {
  const rows = rowsFor(t, opts);
  rowCounts.set(t.qualified, rows);
  const byName = new Map(all.map((x) => [x.qualified, x]));
  const keyCols = new Set(t.keyColumns.flat());
  const fkCols = new Map<string, { fk: ForeignKey; pos: number }>();
  t.foreignKeys.forEach((fk) => fk.columns.forEach((c, pos) => fkCols.set(c, { fk, pos })));

  const names: string[] = [];
  const exprs: string[] = [];
  // one random parent row number per foreign key, shared by its columns
  const fkPick = (fkIndex: number) => `fk${fkIndex}`;
  const lateral: string[] = [];

  // Foreign keys that are part of a primary/unique key (junction tables) must
  // not repeat combinations, so they enumerate parents deterministically:
  // the first walks parent rows, the next advances once per full cycle, etc.
  let divisor = 1;
  t.foreignKeys.forEach((fk, idx) => {
    const parent = findTable(byName, fk.refTable);
    const self = parent === t;
    const parentRows = Math.max(1, self ? rows : parent ? rowCounts.get(parent.qualified) ?? rowsFor(parent, opts) : 1);
    const inKey = fk.columns.some((c) => keyCols.has(c));
    let pick: string;
    if (self) pick = `GREATEST(1, floor(random() * i)::int)`; // an earlier row always exists
    else if (inKey) {
      pick = `1 + ((i - 1) / ${divisor}) % ${parentRows}`;
      divisor *= parentRows;
    } else pick = `1 + floor(random() * ${parentRows})::int`;
    lateral.push(`${pick} AS ${fkPick(idx)}`);
  });

  for (const col of t.columns) {
    if (col.generated) continue;
    const fkRef = fkCols.get(col.name);
    let expr: string | null;
    if (fkRef) {
      const parent = findTable(byName, fkRef.fk.refTable);
      const parentCol = parent?.columns.find((c) => c.name === fkRef.fk.refColumns[fkRef.pos]);
      const idx = t.foreignKeys.indexOf(fkRef.fk);
      expr = parentCol && parent ? keyExpr({ ...parentCol, type: col.type }, `s.${fkPick(idx)}`, parent.name) : null;
      // a nullable FK can also be NULL (e.g. guest orders)
      if (expr && !col.notNull && !keyCols.has(col.name) && opts.nullFraction > 0)
        expr = `CASE WHEN random() < ${opts.nullFraction} THEN NULL ELSE ${expr} END`;
    } else if (keyCols.has(col.name)) {
      expr = keyExpr(col, 's.i', t.name);
    } else {
      const v = valueExpr(col, opts);
      if (v === null) {
        if (col.hasDefault || col.identity) continue;
        expr = col.notNull ? null : 'NULL';
      } else {
        expr = !col.notNull && opts.nullFraction > 0 ? `CASE WHEN random() < ${opts.nullFraction} THEN NULL ELSE ${v} END` : v;
      }
    }
    if (expr === null) throw new Error(`Cannot generate values for ${t.name}.${col.name} (${col.type}). Provide seed SQL for this table.`);
    names.push(q(col.name));
    exprs.push(expr);
  }
  const from = lateral.length
    ? `FROM (SELECT i, ${lateral.join(', ')} FROM generate_series(1, ${rows}) AS g(i)) AS s`
    : `FROM generate_series(1, ${rows}) AS s(i)`;
  return `INSERT INTO ${t.qualified} (${names.join(', ')}) OVERRIDING SYSTEM VALUE SELECT ${exprs.join(', ')} ${from}`;
}

export async function generateData(db: Db, tables: TableInfo[], opts: GenerateOptions): Promise<GenerateResult> {
  const ordered = topoSort(tables);
  const rowCounts = new Map<string, number>();
  const problems: string[] = [];
  await db.query(`SELECT setseed($1)`, [opts.seed]);
  for (const t of ordered) {
    try {
      const sql = buildInsert(t, rowCounts, opts, tables);
      await db.exec(sql);
    } catch (e) {
      problems.push(`${t.name}: ${(e as Error).message}`);
      rowCounts.set(t.qualified, 0);
    }
  }
  return {
    tables: ordered.map((t) => ({ name: t.name, rows: rowCounts.get(t.qualified) ?? 0 })),
    problems,
  };
}

export async function truncateAll(db: Db, tables: TableInfo[]): Promise<void> {
  if (tables.length === 0) return;
  await db.exec(`TRUNCATE ${tables.map((t) => t.qualified).join(', ')} CASCADE`);
}

export async function countRows(db: Db, tables: TableInfo[]): Promise<{ name: string; rows: number }[]> {
  const out: { name: string; rows: number }[] = [];
  for (const t of tables) {
    const r = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${t.qualified}`);
    out.push({ name: t.name, rows: r.rows[0].n });
  }
  return out;
}
