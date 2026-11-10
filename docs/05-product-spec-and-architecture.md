# 05 — Product specification and architecture

**Status: approved 10 November 2026.** Positioning updated per `07-community-and-judge-strategy.md`.
Items marked **[Verify]** are assumptions still to be confirmed.

> **"Your AI suggested a SQL optimisation. Did it actually help? PlanProof proves it."**

## 1. Product specification

### Users
- Developers who received an index or rewrite suggestion from ChatGPT, Copilot, Cursor or a
  colleague and want to know whether it helps before shipping it
- Students and learners who want to understand what a query plan is saying

### Trust model (non-negotiable)
The BharatCode model may **propose, explain, classify and extract**. Only deterministic execution in
a real Postgres may **verify**. Nothing is labelled VERIFIED because the model says so.

### Core workflow
1. **Provide a database.** Pick the bundled example, or paste `CREATE TABLE` DDL. Optionally paste
   seed SQL; otherwise PlanProof generates synthetic rows from the schema.
2. **Provide the slow query.**
3. **Optionally paste what your AI suggested.** SQL (`CREATE INDEX …` or a rewritten `SELECT`) or
   prose copied from a chat.
4. **PlanProof runs:**
   1. loads the schema and data into an in-browser Postgres (PGlite) and runs `ANALYZE`
   2. runs and measures the original query
   3. extracts candidate optimisations — deterministically from pasted SQL, and via the BharatCode
      model from prose; the model may also propose its own candidates
   4. applies each candidate inside a transaction that is rolled back
   5. runs and measures the optimised version
   6. checks results are equivalent, on the main dataset and on edge-case datasets
   7. gives a verdict with evidence
5. **Plain-English explanation** of the before and after plans, generated deterministically from the
   plan tree (core). The model may add a short "why" in plain language, labelled as AI-written.

### Verdicts
| Verdict | Meaning |
|---|---|
| **VERIFIED** | Results identical on every dataset tested, plan changed, and measured improvement above the threshold |
| **INEFFECTIVE** | Results identical, but no meaningful improvement (or slower, or the planner ignored the index) |
| **UNSAFE** | Results differ on at least one dataset, or the SQL tries to modify data |
| **INVALID** | The candidate could not be run (syntax error, unknown column, unsupported statement) |

INVALID is a fourth state added during implementation: invalid SQL is neither safe nor unsafe, and
folding it into UNSAFE would overstate the danger.

### Acceptance rule (initial values, tunable)
VERIFIED requires all of:
- equivalent on all datasets
- plan shape differs from the baseline
- median execution-time speedup ≥ 1.2×
- planner cost **or** rows read by scans decreased

### MVP scope
In: single read-only `SELECT`/`WITH` queries; B-tree indexes (single, multi-column, expression,
partial); query rewrites; one bundled example database; synthetic data from DDL; verdicts with
evidence; deterministic plan explanation.

Out for MVP: write queries, production database connections, MySQL, accounts, saved history,
share cards (P1), multi-turn tool-calling agent (P1).

### Non-goals
- It never connects to anyone's production database.
- It does not claim formal equivalence; it reports equivalence on the datasets it tested.

## 2. Architecture

```
Browser                                                    Server               BharatCode API
┌──────────────────────────────────────────────────┐       ┌───────────────┐    ┌──────────────┐
│ UI (React)                                       │       │ POST          │    │ POST         │
│   inputs · progress · verdict cards · plans      │       │ /api/analyze  │    │ /responses   │
│                                                  │       │  key from env │──► │ qwen-3.8-27b │
│ Web Worker ───────────────────────────────────── │ ────► │  Zod-validated│◄── │ JSON schema  │
│   pipeline: load → baseline → candidates →       │ ◄──── │  retry on 503 │    └──────────────┘
│             verify → verdict                     │       │  timeout      │
│   harness: guard · measure · equivalence         │       │  rate limit   │
│   PGlite (Postgres in WebAssembly)               │       └───────────────┘
└──────────────────────────────────────────────────┘
  main thread watchdog terminates the worker if a database step hangs
```

### Why this shape
- **Database in the browser.** Zero install, user schemas never touch the server, and hosting is one
  small function.
- **Pipeline in a Web Worker.** Keeps the UI responsive; a runaway query can be stopped by terminating
  the worker. [Verify: whether `statement_timeout` works in PGlite — the watchdog does not depend on it.]
- **One model call per run in the MVP.** A single structured-output call (extract + propose + explain)
  is enough for the vertical slice and is easier to make reliable on a 27B model. The multi-turn
  tool-calling agent from the earlier draft moves to P1, once the harness is proven.
- **Harness is isomorphic TypeScript.** The same code runs in the worker and in Node tests against a
  real PGlite, so tests exercise the real database engine.

### Verification harness (no model involved)
- **Guard.** Lexical check after stripping comments and string literals: one statement only; queries
  must start with `SELECT`/`WITH`/`VALUES`/`TABLE`; index candidates must be `CREATE [UNIQUE] INDEX`;
  known write/DDL keywords rejected. Then the database enforces it: rewrites run in a
  `READ ONLY` transaction, index candidates run in a transaction that is always rolled back.
- **Measurement.** `EXPLAIN (ANALYZE, FORMAT JSON)`: one warm-up plus N timed runs; median execution
  time; planner total cost; rows read by scan nodes (actual rows + rows removed by filter, × loops).
- **Equivalence.** Same column count; rows normalised to canonical strings; multiset comparison by
  default; ordered comparison when the original query has a top-level `ORDER BY`. Run on the main
  dataset, on empty tables, and (for generated data) on an edge dataset with many NULLs and duplicates.
- **Verdict.** Applies the acceptance rule above and records every number used.

### BharatCode integration (`/api/analyze`)
- `POST {baseURL}/responses`, model `qwen-3.8-27b`, `store: false`, `text.format` JSON schema.
- Output parsed defensively (JSON, fenced JSON, first object in text) and validated with Zod.
- `503` → exponential backoff with jitter (bounded); timeout via `AbortController`;
  `status: "incomplete"` and `response.failed` treated as errors.
- If the model fails, the run continues: pasted SQL is still verified and the UI says AI analysis
  was unavailable.
- Simple per-IP rate limit to protect the shared daily token allowance.

### Security and privacy
- API key only in server environment variables (`BHARATCODE_API_KEY`); never in the repo or bundle.
- Sent to the model: schema DDL, query text, pasted suggestion, plan summary. Row values are not sent.

## 3. Technology stack

| Layer | Choice |
|---|---|
| Language | TypeScript (strict) |
| App | Next.js (App Router) |
| Database sandbox | `@electric-sql/pglite` in a Web Worker |
| Model client | `fetch` to the OpenAI-compatible `/responses` endpoint (no SDK needed for one call) |
| Validation | Zod |
| Tests | Vitest against real PGlite; Playwright smoke test in Chromium |
| Hosting | To be decided with the owner (requires their account) |

## 4. Open questions
1. Real behaviour of `qwen-3.8-27b` with `text.format` JSON schema — needs a real API key to test.
2. Context window and rate limits (not published).
3. Practical dataset size in a browser tab (start: up to ~200k rows total).
4. Hosting choice and free-tier limits.
