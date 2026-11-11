import { EXAMPLES, SHOP_SCHEMA, SHOP_SEED } from '../src/lib/examples';
import type { Verdict } from '../src/lib/harness/types';

/**
 * Evaluation scenarios. Each has the verdict a reviewer would expect, decided
 * from SQL semantics before running PlanProof (the reasoning is in `why`).
 * The eval checks that PlanProof reaches the same verdict, consistently,
 * across repeated runs. It is a regression suite for known traps, not a
 * measure of accuracy on arbitrary real-world queries.
 */
export interface Scenario {
  id: string;
  category: 'helps' | 'no-effect' | 'semantic-change' | 'null-trap' | 'blocked' | 'invalid';
  expected: Verdict;
  why: string;
  schemaSql: string;
  seedSql?: string;
  query: string;
  suggestion: string;
}

const fromExamples: Scenario[] = EXAMPLES.map((e) => ({
  id: e.id,
  category: e.id === 'index-works' ? 'helps' : e.id === 'index-ignored' ? 'no-effect' : e.id === 'not-exists-nulls' ? 'null-trap' : 'semantic-change',
  expected: e.expected,
  why: e.title,
  schemaSql: e.schemaSql,
  seedSql: e.seedSql,
  query: e.query,
  suggestion: e.suggestion,
}));

const shop = { schemaSql: SHOP_SCHEMA, seedSql: SHOP_SEED };

export const SCENARIOS: Scenario[] = [
  ...fromExamples,
  {
    id: 'expression-index',
    category: 'helps',
    expected: 'VERIFIED',
    why: 'lower(name) cannot use a plain index; an expression index on lower(name) matches the predicate exactly.',
    ...shop,
    query: "SELECT id, city FROM customers WHERE lower(name) = 'customer 4242'",
    suggestion: 'CREATE INDEX customers_lower_name_idx ON customers (lower(name));',
  },
  {
    id: 'partial-index-rare-status',
    category: 'helps',
    expected: 'VERIFIED',
    why: "'pending' is a small slice of orders; a partial index ordered by created_at serves the filter, sort and LIMIT.",
    ...shop,
    query: "SELECT id, total FROM orders WHERE status = 'pending' ORDER BY created_at DESC LIMIT 50",
    suggestion: "CREATE INDEX orders_pending_recent_idx ON orders (created_at DESC) WHERE status = 'pending';",
  },
  {
    id: 'index-wrong-column-order',
    category: 'no-effect',
    expected: 'INEFFECTIVE',
    why: 'The filter is on city alone; an index leading with created_at cannot be used for it.',
    ...shop,
    query: "SELECT count(*) FROM customers WHERE city = 'Pune'",
    suggestion: 'CREATE INDEX customers_created_city_idx ON customers (created_at, city);',
  },
  {
    id: 'cosmetic-rewrite',
    category: 'no-effect',
    expected: 'INEFFECTIVE',
    why: 'Swapping the order of AND conditions does not change the plan.',
    ...shop,
    query: "SELECT id FROM orders WHERE status = 'shipped' AND total > 4000",
    suggestion: "SELECT id FROM orders WHERE total > 4000 AND status = 'shipped'",
  },
  {
    id: 'distinct-removes-duplicates',
    category: 'semantic-change',
    expected: 'UNSAFE',
    why: 'Several customers share a city; adding DISTINCT collapses rows the original returns.',
    ...shop,
    query: 'SELECT c.city FROM customers c WHERE c.id < 100',
    suggestion: 'SELECT DISTINCT c.city FROM customers c WHERE c.id < 100',
  },
  {
    id: 'changed-sort-direction',
    category: 'semantic-change',
    expected: 'UNSAFE',
    why: 'The rewrite returns the oldest orders instead of the newest: the ORDER BY direction is part of the answer.',
    ...shop,
    query: 'SELECT id, created_at FROM orders WHERE customer_id = 17 ORDER BY created_at DESC LIMIT 5',
    suggestion: 'SELECT id, created_at FROM orders WHERE customer_id = 17 ORDER BY created_at LIMIT 5',
  },
  {
    id: 'count-group-by-empty',
    category: 'semantic-change',
    expected: 'UNSAFE',
    why: 'count(*) with GROUP BY returns no row on empty tables, where the original returns 0.',
    ...shop,
    query: "SELECT count(*) FROM orders WHERE status = 'pending'",
    suggestion: "SELECT count(*) FROM orders WHERE status = 'pending' GROUP BY status",
  },
  {
    id: 'drop-index-advice',
    category: 'blocked',
    expected: 'UNSAFE',
    why: 'An assistant suggesting DROP or DELETE must never have it executed.',
    ...shop,
    query: 'SELECT id FROM customers WHERE id = 5',
    suggestion: 'DROP INDEX customers_pkey;',
  },
  {
    id: 'hallucinated-column',
    category: 'invalid',
    expected: 'INVALID',
    why: 'The suggested index references a column that does not exist.',
    ...shop,
    query: "SELECT id FROM customers WHERE city = 'Pune'",
    suggestion: 'CREATE INDEX customers_region_idx ON customers (region);',
  },
];
