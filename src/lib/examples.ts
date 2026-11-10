/**
 * Bundled examples. Each is a plausible suggestion an AI assistant might
 * give. The expected verdicts are asserted in tests/examples.test.ts, so this
 * file never claims an outcome that has not been checked.
 */

export interface Example {
  id: string;
  title: string;
  /** What the user asked their AI, in their words. */
  prompt: string;
  expected: 'VERIFIED' | 'INEFFECTIVE' | 'UNSAFE';
  schemaSql: string;
  seedSql: string;
  query: string;
  suggestion: string;
}

export const SHOP_SCHEMA = `CREATE TABLE customers (
  id         integer PRIMARY KEY,
  name       text NOT NULL,
  city       text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE orders (
  id          integer PRIMARY KEY,
  customer_id integer REFERENCES customers (id),  -- NULL for guest checkout
  status      text NOT NULL,
  total       numeric(10,2) NOT NULL,
  created_at  timestamptz NOT NULL
);`;

/**
 * 20,000 customers and 200,000 orders. Every order has a customer here, so
 * the guest-checkout NULL case only appears in PlanProof's edge-case dataset.
 */
export const SHOP_SEED = `SELECT setseed(0.42);

INSERT INTO customers
SELECT i, 'Customer ' || i,
       (ARRAY['Mumbai','Delhi','Bengaluru','Chennai','Kolkata','Pune','Hyderabad','Jaipur'])[1 + (i % 8)],
       timestamptz '2023-01-01' + (i * interval '30 minutes')
FROM generate_series(1, 20000) AS g(i);

INSERT INTO orders
SELECT i,
       1 + floor(random() * 20000)::int,
       CASE WHEN random() < 0.85 THEN 'delivered'
            WHEN random() < 0.5  THEN 'shipped'
            ELSE 'pending' END,
       round((50 + random() * 4950)::numeric, 2),
       timestamptz '2024-01-01' + random() * interval '700 days'
FROM generate_series(1, 200000) AS g(i);`;

export const EXAMPLES: Example[] = [
  {
    id: 'index-works',
    title: 'An index that works',
    prompt: '“My customer order-history page is slow. How do I speed it up?”',
    expected: 'VERIFIED',
    schemaSql: SHOP_SCHEMA,
    seedSql: SHOP_SEED,
    query: `SELECT id, status, total, created_at
FROM orders
WHERE customer_id = 4242
ORDER BY created_at DESC
LIMIT 20`,
    suggestion: `Add a composite index so Postgres can find a customer's orders already sorted by date:

\`\`\`sql
CREATE INDEX orders_customer_created_idx ON orders (customer_id, created_at DESC);
\`\`\``,
  },
  {
    id: 'index-ignored',
    title: 'An index Postgres ignores',
    prompt: '“Counting delivered orders is slow. What index should I add?”',
    expected: 'INEFFECTIVE',
    schemaSql: SHOP_SCHEMA,
    seedSql: SHOP_SEED,
    query: `SELECT count(*)
FROM orders
WHERE status = 'delivered'`,
    suggestion: `You're filtering on status, so index it:

\`\`\`sql
CREATE INDEX orders_status_idx ON orders (status);
\`\`\``,
  },
  {
    id: 'join-duplicates',
    title: 'A JOIN rewrite that duplicates rows',
    prompt: '“Is there a faster way to write this IN subquery?”',
    expected: 'UNSAFE',
    schemaSql: SHOP_SCHEMA,
    seedSql: SHOP_SEED,
    query: `SELECT c.id, c.name
FROM customers c
WHERE c.id IN (SELECT customer_id FROM orders WHERE total > 4900)`,
    suggestion: `Subqueries with IN are slow. A JOIN is faster:

\`\`\`sql
SELECT c.id, c.name
FROM customers c
JOIN orders o ON o.customer_id = c.id
WHERE o.total > 4900;
\`\`\``,
  },
  {
    id: 'not-exists-nulls',
    title: 'A NOT EXISTS rewrite that breaks on NULLs',
    prompt: '“NOT IN is supposed to be bad. Rewrite this for me.”',
    expected: 'UNSAFE',
    schemaSql: SHOP_SCHEMA,
    seedSql: SHOP_SEED,
    query: `SELECT c.id, c.name
FROM customers c
WHERE c.id NOT IN (SELECT customer_id FROM orders WHERE status = 'pending')`,
    suggestion: `NOT EXISTS is the faster, recommended way to write this:

\`\`\`sql
SELECT c.id, c.name
FROM customers c
WHERE NOT EXISTS (
  SELECT 1 FROM orders o
  WHERE o.customer_id = c.id AND o.status = 'pending'
);
\`\`\``,
  },
];
