# PlanProof

**Your AI suggested a SQL optimisation. Did it actually help? PlanProof proves it.**

Paste the index or rewrite that ChatGPT, Copilot or Cursor gave you. PlanProof runs it in a real
Postgres *inside your browser*, measures it against your original query, and checks that the results
are identical. You get one of four verdicts, with the evidence:

| Verdict | Meaning |
|---|---|
| **VERIFIED** | Same results on every dataset tested, a different plan, and a measured speed-up |
| **INEFFECTIVE** | Same results, but no real gain (or Postgres ignored the index) |
| **UNSAFE** | The results change, or the SQL tries to modify data (it is blocked, never run) |
| **INVALID** | The SQL could not be run |

The principle: **the model proposes, the database decides.** The BharatCode model can explain the
plan, extract SQL from a pasted chat answer and propose its own fix. Nothing it says is treated as
evidence; every candidate goes through the same execution checks.

Entry for the **BharatCode Build League, Round 1** · Category: Coding & developer tools

## Status

Updated 10 November 2026. Only items that have been run and tested are marked done.

| Area | Status |
|---|---|
| Verification harness (guard, execution, measurement, equivalence, verdicts) | **Working, tested** |
| Edge-case and empty-table re-checks | **Working, tested** |
| Synthetic test data generated from your schema | **Working, tested** |
| Plain-English description of each query plan | **Working, tested** |
| Browser app with four built-in examples | **Working** — tested in Chromium |
| BharatCode API integration (`/api/analyze`) | **Built and tested against a mock API.** Not yet run against the real API |
| Public deployment | **Not yet** |
| Shareable result cards, demo GIF | Planned |

## How it works

```
Your inputs: schema · slow query · what your AI suggested
                    │
                    ▼
  Web Worker: Postgres (PGlite, WebAssembly) — nothing leaves your browser
   1. load schema + seed data, or generate realistic rows from the schema
   2. run and measure the original query (EXPLAIN ANALYZE, several runs)
   3. find candidates: SQL in your paste (deterministic)
                       + optional BharatCode model analysis via /api/analyze
   4. apply each candidate in a transaction that is always rolled back
   5. measure it and compare result sets
   6. re-check results on an edge-case dataset (NULLs, duplicates) and on empty tables
                    │
                    ▼
  Verdict cards: before/after time, rows read, planner cost,
                 equivalence per dataset, plain-English plan, migration + rollback SQL
```

Details: [`docs/05-product-spec-and-architecture.md`](docs/05-product-spec-and-architecture.md)

### Safety model
- The original query and rewrites run in `READ ONLY` transactions. A `DELETE` hidden in a CTE is refused by Postgres itself.
- Index candidates run in a transaction that is always rolled back.
- A lexical guard blocks destructive statements and side-effect functions before they reach Postgres, so the reason can be shown clearly.
- PGlite ignores `statement_timeout`, so a watchdog stops the worker if a database step runs longer than 45 s.

### What "identical results" means
Rows are compared as a multiset, with types taken into account. Order is also compared when the
original query has a top-level `ORDER BY`. The check runs on three datasets: your data (or generated
data), an edge-case dataset with many NULLs and duplicate values, and empty tables. That is strong
evidence. It is **not** a mathematical proof of equivalence.

### What is sent to the BharatCode model
The schema, the query, your pasted suggestion and a summary of the plan. Row values are never sent.
The API key stays on the server.

## Run it locally

Requires Node 20+.

```bash
npm install
cp .env.example .env.local     # add BHARATCODE_API_KEY from https://bharatcode.ai/account
npm run dev                    # http://localhost:3000
```

Without a key the app still works: pasted SQL is verified, and the page says AI analysis is unavailable.

```bash
npm test             # 73 tests: guard, equivalence, API client, and pipeline on a real PGlite
npm run typecheck
npm run build
```

Browser smoke test (needs Playwright with Chromium):

```bash
npm run mock:api &                                   # canned stand-in for the BharatCode API
BHARATCODE_API_KEY=test BHARATCODE_BASE_URL=http://127.0.0.1:4010/v1 npm start &
npm run e2e -- http://127.0.0.1:3000 "An index that works"
```

## Tests

The suite covers the cases that matter for trust:
- an optimisation that improves and preserves results → VERIFIED
- an index Postgres ignores, and a rewrite that changes nothing → INEFFECTIVE
- a JOIN rewrite that duplicates rows, NOT IN → NOT EXISTS with NULLs, a changed ORDER BY,
  and a GROUP BY that drops the zero row on empty tables → UNSAFE
- invalid SQL → INVALID
- `DROP`, `DELETE`, `TRUNCATE`, `UPDATE` and a `DELETE` inside a CTE → UNSAFE, data intact
- a model candidate that claims to be "verified" but changes results → UNSAFE
- model timeouts, 5xx, 503 retries, truncated output, malformed JSON → handled; pasted SQL still verified
- NULLs, duplicate rows, numeric scale, float noise, empty results
- generated data across foreign keys, identity, enum, varchar, uuid and a composite-key junction table

## Known limitations

- Timings come from Postgres compiled to WebAssembly in your browser, on test data. A plan that
  wins here may not win on your production tables and hardware.
- Synthetic data is uniform. Real skew can change the planner's choices.
- Postgres dialect only. Single read-only queries only.
- If the original `ORDER BY` has ties, a correct rewrite can be reported as a different order.

## Prior art

Postgres.ai, Aiven AI Database Optimizer (EverSQL), pganalyze, Dexter and pgMustard all work on query
performance. PlanProof's aim is narrower: check *any* AI's suggestion, with no install, and show the
evidence.

## Project documents

[Rules and API notes](docs/01-hackathon-rules-and-api.md) ·
[Idea discovery](docs/02-idea-discovery.md) ·
[Shortlist](docs/03-shortlist-comparison.md) ·
[Recommendation](docs/04-recommendation.md) ·
[Spec and architecture](docs/05-product-spec-and-architecture.md) ·
[Roadmap](docs/06-roadmap.md) ·
[Community and judge strategy](docs/07-community-and-judge-strategy.md) ·
[Progress log](docs/PROGRESS.md)

## Licence

MIT — see [LICENSE](LICENSE).
