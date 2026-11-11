# PlanProof: interview guide

A guide for explaining PlanProof in a technical interview. It is meant to be understood, not
memorised. Where a claim depends on a measurement, it points to the file that produced it.

---

## 1. What it is, in 30 seconds

AI assistants suggest SQL optimisations all the time: "add this index", "rewrite the IN as a JOIN".
They sound confident, but nobody checks two things: **does it actually make the query faster**, and
**does it still return the same rows**? PlanProof checks both by running the suggestion. It loads
your schema into a real PostgreSQL that runs inside the browser (PGlite, Postgres compiled to
WebAssembly), measures the original query and the suggestion with `EXPLAIN ANALYZE`, compares the
result sets on three datasets, and gives a deterministic verdict: VERIFIED, INEFFECTIVE, UNSAFE or
INVALID. An LLM can explain and propose, but it never decides the verdict.

**Tagline:** AI proposes. PostgreSQL proves.

## 2. Why it exists

- Index advice is easy to get wrong in ways that are invisible: the planner may ignore the index,
  or the index helps one query and costs every write.
- Rewrites are worse: `IN` → `JOIN` can duplicate rows; `NOT IN` → `NOT EXISTS` behaves differently
  when the subquery contains NULL; dropping a `GROUP BY` or adding `DISTINCT` changes results.
  These look like style changes and pass code review.
- Existing tools (pganalyze, Aiven/EverSQL, Postgres.ai, pgMustard) are good at analysing your
  production database. PlanProof's niche is narrower: check *any* suggestion, with no install, and
  show the evidence.

## 3. Why LLM output cannot be trusted directly

- An LLM produces plausible text. It has no access to your data distribution, your statistics or the
  planner's cost model, so "this index will help" is a guess.
- It can't execute the query, so it can't know whether two queries are equivalent on your data,
  especially around NULLs, duplicates and empty inputs.
- Its confidence is not calibrated: it will explain a wrong answer as fluently as a right one.
- It can be steered by the input (prompt injection: a pasted answer that says "call this verified").

So PlanProof treats model output as **untrusted input**: validated with a schema, then put through the
same guard and execution as anything the user pastes. The model's rationale is shown, labelled
"not evidence", and never read by the code that decides.

## 4. Architecture

```
Browser tab
  React UI ── Web Worker ── pipeline ── PGlite (Postgres in WASM)
     │                        │
     │ watchdog               └─ POST /api/analyze (only schema, query, suggestion, plan summary)
     │                                │
Server (Vercel function)              ▼
  handler → analysis service → OpenAI-compatible adapter → Groq (gpt-oss-120b, fallback qwen3.8-27b)
```

Details and diagrams: [ARCHITECTURE.md](ARCHITECTURE.md).

Key decisions:
- **Database in the browser**: zero install, rows never leave the tab, and hosting is one tiny
  function. Cost: WebAssembly timings are not production timings, and memory limits dataset size.
- **Pipeline in a Web Worker**: keeps the UI responsive and makes runaway queries stoppable (terminate
  the worker).
- **One model call per run**, not an agent loop. A single structured-output call is easier to make
  reliable on a free model and enough for the job.

## 5. How PGlite works (enough to answer follow-ups)

- PGlite is PostgreSQL compiled to WebAssembly, packaged as a JS library. It runs the real Postgres
  parser, planner and executor, so plans and `EXPLAIN` output are genuine Postgres (version 18.6 here).
- It runs **single-user, in one thread**, in memory (or IndexedDB). There is no server process.
- Consequence 1: `statement_timeout` does nothing (no timer signal in that environment). I checked
  this: a 3 s `pg_sleep` ran to completion with a 500 ms timeout. Hence the watchdog.
- Consequence 2: timings vary run to run (~15% observed), so verdict rules can't depend on small
  timing differences.
- The CSP needs `'wasm-unsafe-eval'` so the browser may compile the WebAssembly module.

## 6. Query plans in one page

- Postgres turns SQL into a **plan**: a tree of nodes (Seq Scan, Index Scan, Bitmap Heap Scan,
  Hash Join, Nested Loop, Sort, Aggregate, Limit…). Rows flow from the leaves up.
- The **planner** chooses between plans using **statistics** (gathered by `ANALYZE`: row counts,
  most-common values, histograms) and a **cost model** (arbitrary units estimating I/O and CPU).
- `EXPLAIN` shows the chosen plan with estimated cost; `EXPLAIN ANALYZE` also runs the query and
  reports actual rows, loops and time per node.
- PlanProof reads `EXPLAIN (ANALYZE, FORMAT JSON)` and derives:
  - **median execution time** over several runs
  - **planner total cost** (deterministic given the data and statistics)
  - **rows read**: for scan nodes, (actual rows + rows removed by filter) × loops. This is the most
    intuitive number: "read 200,000 rows to return 9".
  - **plan shape**: node types, relations, indexes and join types, ignoring numbers. Same shape ⇒ same strategy.
- The plain-English description is generated from the tree by code (`narrate.ts`), not by the model,
  so it is always a faithful description of what Postgres did.

## 7. How indexes affect queries

- A B-tree index lets Postgres find matching rows without reading the whole table, and returns them
  in index order (which can remove a Sort).
- The planner only uses an index when it estimates it is cheaper. For a predicate matching a large
  fraction of the table (e.g. `status = 'delivered'` matching 85%), a sequential scan is cheaper, so an
  index on `status` is ignored. PlanProof's "index Postgres ignores" example shows exactly this.
- Column order matters: an index on `(created_at, city)` doesn't help `WHERE city = …`.
- Expression indexes (`lower(name)`) and partial indexes (`WHERE status = 'pending'`) need statistics;
  PlanProof runs `ANALYZE` on the table after creating the candidate index.
- Indexes cost writes and disk; PlanProof reports index size and says so.
- Index trials run inside `BEGIN … ROLLBACK`, so the database is unchanged afterwards.

## 8. How result equivalence is tested

1. Run the original and the candidate, fetch rows in array mode.
2. Same number of columns required (names may differ: `id AS account_id` is fine).
3. **Canonicalise** each value: NULL marker; integers as-is; floats rounded to 12 significant digits
   (summation order can change the last bits); `numeric` values with trailing zeros normalised, **only
   for numeric-typed columns** (text `'1.50'` stays different from `'1.5'`); dates as ISO strings; JSON
   with sorted keys.
4. Compare as a **multiset** (counts per distinct row) so duplicates matter. If the original has a
   top-level `ORDER BY`, also compare in order.
5. Repeat on **three datasets**: main data, an **edge dataset** (40% NULLs, a few distinct values per
   text column plus the query's literals), and **empty tables**.

Why three datasets: equivalence on one dataset is weak evidence. Many wrong rewrites agree on
"normal" data and differ only with NULLs, duplicates or no rows.

Limits: this is testing, not proof. Two queries can agree on every tested dataset and still differ on
some other data. PlanProof says "identical on N datasets", never "proven equivalent". (Formal SQL
equivalence is undecidable in general; tools like Cosette/SQLSolver handle restricted fragments.)

## 9. The NULL trap (be ready to explain this one)

```sql
-- original
SELECT id FROM customers WHERE id NOT IN (SELECT customer_id FROM orders WHERE status = 'pending');
-- "faster" rewrite an AI suggests
SELECT id FROM customers c WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id AND o.status = 'pending');
```

If any `customer_id` in the subquery is NULL, `x NOT IN (…, NULL)` is never TRUE (it is NULL or
FALSE, three-valued logic), so the original returns **no rows**. `NOT EXISTS` ignores the NULL and
returns customers. On the main example data there are no NULL customer ids, so the two agree there.
PlanProof catches it only on the edge dataset, where 40% of `customer_id` values are NULL.

The rewrite is arguably what the developer *meant*, but it changes the result, so it is UNSAFE: a
behaviour change should be a deliberate decision, not a side effect of "optimisation".

## 10. The duplicate-row trap

```sql
SELECT c.id, c.name FROM customers c WHERE c.id IN (SELECT customer_id FROM orders WHERE total > 4900);
-- rewrite
SELECT c.id, c.name FROM customers c JOIN orders o ON o.customer_id = c.id WHERE o.total > 4900;
```

`IN` is a semi-join: each customer appears once. The `JOIN` returns one row per matching order, so a
customer with two big orders appears twice. A set comparison would miss this; a multiset comparison
reports "N are duplicates of rows the original returns once".

## 11. Benchmark methodology

- `npm run eval` runs 13 scenarios, each several times on a fresh database, and writes
  `docs/benchmarks/RESULTS.md` and `results.json` with the environment (CPU, Node, PGlite version).
- Expected verdicts were assigned from SQL semantics **before** running (field `why` in `eval/scenarios.ts`).
- Timing: one warm-up, then the median of up to five `EXPLAIN ANALYZE` runs per side; speed-up is the ratio
  of medians; min/median/max across repeated runs are reported to show spread.
- What it is **not**: a measure of accuracy on arbitrary real-world queries, or of production speed-ups.
  Numbers are WebAssembly, synthetic data, one machine.

## 12. The verdict algorithm

In order (see `src/lib/harness/verify.ts`):

1. Guard rejects destructive SQL → **UNSAFE** (never executed). Unsupported or multiple statements → **INVALID**.
2. Postgres error during the trial → **INVALID** (a write refused by READ ONLY → **UNSAFE**).
3. Results differ on the main data → **UNSAFE**.
4. Index candidate not used by the plan, or plan shape unchanged → **INEFFECTIVE**. (Decided from the plan,
   not timings.)
5. Baseline already under 0.5 ms → **INEFFECTIVE** (nothing measurable to gain).
6. Speed-up ≥ 1.5× **and** (lower planner cost **or** fewer rows read) → **VERIFIED**, else **INEFFECTIVE**.
7. Any VERIFIED/INEFFECTIVE result is re-checked on the edge and empty datasets; a difference → **UNSAFE**.

Why 1.5×: observed run-to-run variation in WebAssembly was around 15%. Requiring a structural signal
(cost or rows read) as well stops noise alone from producing VERIFIED.

## 13. AI provider architecture

- `ChatProvider` interface: `complete({system, user, jsonSchema}) → text`. One implementation for any
  OpenAI-compatible `/chat/completions` endpoint.
- Default chain from env: Groq `openai/gpt-oss-120b`, then Groq `qwen/qwen3.8-27b` (separate per-model quotas).
- Strict `json_schema` output; if a model rejects schemas, one retry with `json_object`.
- Retries: transient errors once on the same model; a 429 with a short `Retry-After` is waited out; otherwise
  next model; overall deadline 45 s.
- Output is parsed defensively (raw JSON, fenced JSON, JSON inside prose), then validated with Zod; the browser
  validates the response again.
- Why Groq: free without a card (as far as could be verified), strict schema support, per-model limits, and terms
  that suit a public site. Gemini's free tier was rejected as the default because its terms require paid services
  for users in the EEA/UK/Switzerland and free-tier content is used for product improvement.
  Details: [AI-PROVIDER.md](AI-PROVIDER.md).

## 14. Error handling

| Failure | Behaviour |
|---|---|
| Model timeout, 5xx, 429, malformed JSON, truncation, refusal | Next model in the chain; if all fail, AI analysis is skipped with a clear message and pasted SQL is still verified |
| Invalid schema / seed / query | Setup error with a stage-specific hint |
| Runaway query | Watchdog terminates the worker after 45 s without progress |
| Data generation can't satisfy a constraint | Warning naming the table; suggestion to provide seed SQL |
| Unknown server exception | Generic message; details only in server logs |

## 15. Security

Summary (full table in [../SECURITY.md](../SECURITY.md)): user SQL only ever runs in the visitor's own
in-browser database; destructive statements are blocked and the database enforces READ ONLY; index trials roll
back; the API key stays server-side; `/api/analyze` has a same-origin check, size limits, schema validation and
rate limits; CSP and no raw HTML rendering prevent XSS; prompt injection cannot change a verdict because the model
never makes one.

## 16. Deployment

Vercel Hobby (free): a static page plus one serverless function. One secret (`GROQ_API_KEY`). No database
server. Cost with no payment methods on file: $0. Steps in [DEPLOYMENT.md](DEPLOYMENT.md).

## 17. Scaling limitations

- Browser memory caps dataset size (generated data: up to 100k rows per table by default).
- WebAssembly timings ≠ production timings; synthetic data has uniform distributions, real data is skewed.
- AI capacity is the provider's free tier, shared by all visitors.
- Rate limits are per serverless instance (in memory).
- Single read-only queries only; no write-path or concurrency effects (index maintenance cost, locking).

What I would do with more time: let users import `pg_stats`-style statistics or a sample from their real
database; test candidate combinations (index + rewrite); a CLI/GitHub Action for SQL in pull requests; a shared
rate-limit store.

## 18. Trade-offs worth discussing

| Decision | Alternative | Why this way |
|---|---|---|
| Postgres in the browser | Hosted Postgres sandbox per request | Free, private, no server state; at the cost of WASM timings and memory limits |
| Testing equivalence on 3 datasets | Formal verification (e.g. SQL solvers) | Works for all of Postgres SQL today; honest about being evidence, not proof |
| One structured LLM call | Multi-step tool-calling agent | Reliability on a free model; the agent adds little when execution is the judge |
| Deterministic plain-English narration | Ask the model to explain the plan | The description must be true; the model's explanation is shown separately as opinion |
| In-memory rate limit | Redis | No new infrastructure for a speed bump; provider quota is the real cap |
| Lexical guard + READ ONLY | Full SQL parser | The database is the enforcement; the guard exists for clear messages |

## 19. Likely questions

**Q: How do you know an optimisation is "verified"?**
It ran in Postgres, the plan changed (and an index candidate was actually used), it was at least 1.5× faster with
lower planner cost or fewer rows read, and the results were identical on the main, edge-case and empty datasets.
Each condition is shown on the result card.

**Q: Isn't "identical on three datasets" just testing? Couldn't it still be wrong?**
Yes. It's targeted testing, not proof, and the UI says so. The edge dataset is designed around the
known failure modes (NULLs, duplicates, empty input), which catches the common traps. Formal equivalence for full
SQL is undecidable.

**Q: Why not trust timings alone?**
WASM timings vary ~15%. A cosmetic rewrite can look 1.2× faster by chance. So structural checks come first (index
used? plan changed?), the speed-up bar is 1.5×, and cost or rows read must also improve.

**Q: What if the LLM returns garbage?**
Strict JSON schema at the provider, defensive parsing, Zod validation on the server and again in the browser.
Anything that fails moves to the next model, and if every model fails the run continues without AI.

**Q: What stops a pasted `DROP TABLE` from doing damage?**
Three layers: the guard refuses it before execution, rewrites run in READ ONLY transactions, index trials roll
back. And the database is a throwaway instance in the visitor's own tab holding only test data.

**Q: How does the watchdog work, and why do you need it?**
PGlite can't cancel a running statement, and `statement_timeout` doesn't work there. The worker posts progress
before each database step; the main thread starts a timer for that step and terminates the worker if no progress
arrives in 45 s.

**Q: How would you test something non-deterministic like this?**
The verdict logic is tested against a real PGlite with scenarios whose expected verdicts don't depend on timing
(index not used, results differ). The VERIFIED cases use differences large enough (orders of magnitude) to be
stable; the eval suite repeats every scenario and reports whether verdicts ever varied.

**Q: Why Groq and not OpenAI or Gemini?**
Cost and terms. Groq's free tier needs no card (as far as I could verify), supports strict JSON schemas, and has
per-model quotas, so a second model is a real fallback. Gemini's free tier terms didn't fit a public site serving
the EEA/UK. The adapter is OpenAI-compatible, so switching is configuration.

**Q: What was the hardest bug?**
The NULL-trap example passed as "INEFFECTIVE" at first: the edge dataset generated text values like `status_0`, so
`status = 'pending'` never matched and the NULL case never triggered. Fix: mix the query's own string literals
into generated text columns. Another: an unexpected exception's message (with a file path) could reach API clients;
a test now asserts internal text never leaks.

**Q: What would you change for production?**
Real statistics import, a shared rate-limit store, nonce-based CSP, and running candidates against a copy of real
data (e.g. a database branch) rather than synthetic data.
