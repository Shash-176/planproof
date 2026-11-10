# 05 — Preliminary product specification, architecture and stack

**Status: preliminary, for approval. Nothing here is implemented.**
Items marked **[Verify]** are assumptions to confirm in the first hours of Phase 2.

## 1. Product specification

### Users
- Backend developers and students with a slow Postgres query and no DBA to ask
- Learners who want to understand what a query plan is telling them

### Core flow
1. **Load a database.** Pick a bundled example, or paste `CREATE TABLE` DDL and optionally sample rows.
2. **Paste a query.**
3. **Watch the agent.** A live trace shows each step: plan read, hypothesis, experiment, result.
4. **Get proof cards.** Each accepted suggestion shows:
   - before and after plan (cost, rows scanned, median time)
   - equivalence result: "identical on N rows across K datasets"
   - migration SQL and rollback SQL
   - trade-offs: index size, extra write cost, when it would not help
5. **Rejected ideas are shown too**, with the reason (no gain, or results differed).

### MVP scope
In: single `SELECT` statements; B-tree single and multi-column indexes; common rewrites (predicate
sargability, `IN`/`EXISTS`, redundant `DISTINCT`, join order hints through restructuring, `LIMIT`
pushdown); one bundled example database; proof card; eval suite.

Out for MVP: write queries, production database connections, MySQL, user accounts, saved history.

### Non-goals
- It does not connect to anyone's production database.
- It does not claim formal equivalence; it reports empirical equivalence on test data.

### Success measures
- Benchmark pass rate (target: at least 70% of scenarios produce an accepted, verified improvement)
- Zero accepted suggestions that change results on the benchmark
- Time from page load to first proof card on the example: under 60 seconds when the API is not queueing

## 2. Architecture

```
Browser                                              Server (one route)        BharatCode API
┌───────────────────────────────────────────┐        ┌──────────────────┐      ┌──────────────┐
│ UI (React)                                │        │ POST /api/turn   │      │ /responses   │
│   query editor · live trace · proof cards │        │  - adds API key  │ ───► │ qwen-3.8-27b │
│                                           │ ─────► │  - validates body│ ◄─── │ SSE stream   │
│ Agent loop (client)                       │ ◄───── │  - 503 backoff   │      └──────────────┘
│   holds history, replays it each turn     │  SSE   │  - rate limit    │
│                                           │        └──────────────────┘
│ Tool executor ──► Verification harness    │
│                    ├ SQL guard            │
│                    ├ measurement          │
│                    └ equivalence checker  │
│ Web Worker: PGlite (Postgres in WASM)     │
└───────────────────────────────────────────┘
```

### Why the agent loop lives in the client
The API is stateless and hosted tools are unsupported, so someone must hold the history and run
the tools. The database is in the browser, so the tools run there. The server then only needs to
do one model turn per request, which keeps it inside serverless time limits **[Verify]** and keeps
user data off the server. The API key never reaches the browser.

### Model-facing tools (function tools, `strict: true`)

| Tool | Purpose | Executed by |
|---|---|---|
| `get_schema()` | Tables, columns, existing indexes, row counts | Worker |
| `explain(sql)` | `EXPLAIN (FORMAT JSON)` plus measured run | Harness |
| `sample_rows(table, n)` | Small sample so the model sees value shapes | Worker |
| `try_index(ddl)` | Create candidate index, re-measure target query, report delta, then roll back | Harness |
| `try_rewrite(sql)` | Measure rewrite and run equivalence check against the original | Harness |
| `submit(recommendations)` | Final structured output; ends the loop | Client |

Every tool argument is validated with a schema before execution. Tool results are compact JSON,
with long plans summarised to stay within context.

### Verification harness (deterministic, no model involved)
- **SQL guard.** Only `SELECT`, `EXPLAIN`, `CREATE INDEX` are accepted; one statement per call;
  runs inside a transaction that is rolled back; statement timeout. A parser-based check is
  preferred **[Verify: a Postgres parser that runs in the browser]**; fallback is the
  transaction + read-only settings.
- **Measurement.** Planner total cost, rows scanned, and median wall time over N runs. Cost is the
  headline number because WASM timings are noisy.
- **Equivalence.** Run original and rewrite; compare as multisets via per-row hash, respecting
  `ORDER BY` only when the query specifies one. Repeat on K seeded datasets including edge cases
  (NULLs, duplicates, empty tables).
- **Acceptance rule.** Accept only if equivalent on all datasets and cost improves beyond a threshold.

### Reliability against the BharatCode API
- `503` → exponential backoff with jitter, visible "model is busy, retrying" state
- `response.failed` mid-stream → retry the turn from the last complete history
- `status: "incomplete"` → never execute a partial tool call; retry with a larger output budget or
  reduced reasoning effort
- Hard limits: maximum steps per run, maximum tokens per run, per-IP request rate on the server
- `x-request-id` logged for every call

### Security and privacy
- API key only in server environment variables; never in the repo or the bundle
- User schema and query text are sent to the model; sample row values are sent only via
  `sample_rows`, which can be switched off
- The public demo is rate-limited so one visitor cannot exhaust the daily token allowance

## 3. Technology stack

| Layer | Choice | Reason |
|---|---|---|
| Language | TypeScript (strict) | One language across client, worker, server |
| App | Next.js (App Router) | UI plus one streaming route; simple deploy |
| Database sandbox | PGlite in a Web Worker | Real Postgres planner, no server |
| Model client | OpenAI SDK with `baseURL` set to BharatCode | Documented as supported |
| Model | `qwen-3.8-27b` via `/responses` | The model available on student access |
| Validation | Zod | Tool arguments and structured output |
| Tests | Vitest (unit), Playwright (one end-to-end smoke test) | Harness is pure logic and very testable |
| CI | GitHub Actions: lint, typecheck, test | Visible engineering hygiene |
| Hosting | Vercel or equivalent free tier **[Verify limits]** | Streaming route + static assets |

No database server, no auth, no vector store, no queue. Each would be weight without benefit here.

## 4. Open questions to resolve first

1. Does PGlite support `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` and how large a dataset is practical in a browser tab?
2. How reliable is `qwen-3.8-27b` at multi-step tool calling with `strict` schemas? (Measure with the eval suite.)
3. What are the context window and real rate limits? (Not published.)
4. How long does student verification take?
5. Will the organisers confirm whether commits after the deadline are considered?
