# Resume evidence (internal)

Not marketing. A ledger of facts that a resume bullet could rest on, each with where to verify it.
If a number here changes, update it from its source; never round up.

_Last updated: 11 Nov 2026, version 1.0.0-rc.1._

## Status at a glance

| Item | Value | Evidence |
|---|---|---|
| Automated tests | **115 passing** in 6 files | `npm test`; per-suite counts below |
| Evaluation | **65 / 65 runs** matched the expected verdict (13 scenarios × 5 runs); no scenario's verdict varied | `docs/benchmarks/RESULTS.md`, `results.json` |
| Semantic regressions caught | **5 / 5** result-changing scenarios flagged UNSAFE in every run | same |
| Lint / types | ESLint (Next.js + typescript-eslint) clean; `tsc --strict` clean | `npm run lint`, `npm run typecheck` |
| Dependencies | `npm audit`: 0 vulnerabilities | `npm audit` |
| CI | Workflow with lint, typecheck, tests, build, audit, browser smoke test (mock AI). **No GitHub run yet** at time of writing | `.github/workflows/ci.yml`; Actions tab after push |
| Deployment | **Not deployed yet.** Prepared for Vercel Hobby | `docs/DEPLOYMENT.md` |
| Real AI provider call | **Not yet made.** All AI paths tested against mocks | `tests/ai.test.ts` |

## Technology (actually used)

TypeScript (strict) · Next.js 16 App Router · React 19 · PGlite 0.5.16 (PostgreSQL 18.6 compiled to WebAssembly) ·
Web Workers · Zod 4 · Vitest · Playwright (smoke script) · ESLint 9 · GitHub Actions · Vercel (target) ·
Groq API via an OpenAI-compatible adapter (`openai/gpt-oss-120b`, `qwen/qwen3.8-27b`).

Not used, and should not be claimed: LangChain, vector databases, Redis, Docker, Kubernetes, auth, a server-side database.

## Architecture facts

- Deterministic verification engine runs entirely in the browser: guard → PGlite execution in rolled-back /
  READ ONLY transactions → `EXPLAIN ANALYZE` measurement → multiset result comparison on 3 datasets → rule-based verdict.
  (`src/lib/harness/`, `docs/ARCHITECTURE.md`)
- AI layer is provider-neutral: one OpenAI-compatible adapter, 4 presets, ordered fallback chain, typed errors,
  Zod validation on server and client. (`src/lib/ai/`, `docs/AI-PROVIDER.md`)
- The model never decides a verdict; enforced structurally (model output enters only as `Candidate` objects) and by tests
  (`tests/pipeline.test.ts` → "the model is not the source of truth", "unexpected AI output…").

## Measured outcomes (from `docs/benchmarks/RESULTS.md`)

All timings: PostgreSQL in WebAssembly (PGlite), Node v22.23.4, Intel(R) Xeon(R) Processor @ 2.10GHz (2 CPUs), synthetic data, median of up to 5
`EXPLAIN ANALYZE` runs per side, repeated 5 times on fresh databases. **Not production numbers.**

| Scenario | Speed-up min / median / max | Rows read before → after | Planner cost before → after |
|---|---|---|---|
| index-works | 172× / 187× / 208× | 200,000 → 9 | 4,140 → 42 |
| expression-index | 332× / 417× / 1043× | 20,000 → 1 | 464 → 8 |
| partial-index-rare-status | 269× / 318× / 335× | 200,000 → 50 | 4,653 → 22 |

Deterministic (do not vary between runs): rows read and planner cost, shown in the results file.

**Quote rows read, not speed-up ratios.** When the optimised query takes a fraction of a millisecond, small timing
noise produces large swings in the ratio (expression-index: 332× to 1,043× across runs). "200,000 rows read → 9"
is exact and reproducible; "~187× faster in WebAssembly on synthetic data" needs all of its qualifiers.

## Test suites

| Suite | Tests | Covers |
|---|---|---|
| `tests/ai.test.ts` | 38 | Provider adapter, fallback chain, retries, timeouts, parsing, config, handler, browser client |
| `tests/datagen.test.ts` | 10 | Synthetic data generation edge cases (real PGlite) |
| `tests/equivalence.test.ts` | 10 | Result comparison: duplicates, NULLs, ordering, types |
| `tests/guard.test.ts` | 22 | Lexer and SQL guard |
| `tests/pipeline.test.ts` | 30 | Full verification pipeline on real PGlite: verdicts, destructive SQL, untrusted AI output |
| `tests/watchdog.test.ts` | 5 | Runaway-query watchdog (fake timers) |

What the suites cover (named in the test titles): destructive SQL including a `DELETE` hidden in a CTE; NULL,
duplicate-row, ordering and empty-table traps; invalid SQL; generated data across FKs, identity, enum, uuid,
composite keys, quoted identifiers and unsatisfiable CHECK constraints; provider timeout, 5xx, 429 with
`Retry-After`, truncation, refusal, malformed JSON, schema violations; cross-site and oversized requests;
rate limits; secrets never appearing in responses; runaway-query watchdog.

Browser checks (Chromium, `scripts/e2e-smoke.mjs`, run manually this session and configured in CI): demo → VERIFIED;
NULL trap → UNSAFE; ignored index on a mobile viewport → INEFFECTIVE; a 200k × 200k cross join stopped by the
watchdog; no console errors or CSP violations.

## Engineering challenges solved (with evidence)

1. **No query cancellation in PGlite.** Found by experiment: `statement_timeout = 500ms` did not stop
   `pg_sleep(3)`. Solution: run Postgres in a Web Worker and terminate it from a main-thread watchdog.
   (`src/lib/watchdog.ts`, `tests/watchdog.test.ts`, `--runaway` smoke test)
2. **Timing noise in WebAssembly** (~15% run to run observed). Solution: structural checks first (index used, plan
   shape), then a 1.5× threshold plus a deterministic signal (cost or rows read). Eval shows no verdict flips across runs.
3. **Edge-case data that never triggered the bug.** The NULL-trap example was first judged INEFFECTIVE because generated
   text values (`status_0`) never matched `'pending'`. Fix: mix the query's string literals into generated text.
   (`src/lib/harness/datagen.ts`, test "mixes query literals into text columns")
4. **Type-aware result comparison.** `numeric` scale normalised only for numeric columns, float rounding for
   summation-order noise, multiset counts for duplicates. (`src/lib/harness/equivalence.ts`, `tests/equivalence.test.ts`)
5. **Data generation without parsing DDL.** Load schema into Postgres, read the catalog back, order by foreign keys,
   generate with `generate_series` inside Postgres; junction tables enumerate key combinations deterministically.
   (`datagen.ts`, `tests/datagen.test.ts`)
6. **Free-tier-friendly AI design.** Strict JSON schema, per-model fallback on one key, short-`Retry-After` handling,
   overall deadline; verification never depends on the model. (`src/lib/ai/analyze.ts`, `tests/ai.test.ts`)

## Bugs found by tests or review

- Internal exception text (including a file path) could reach `/api/analyze` clients. Found by a test written for it;
  fixed in `analyze.ts`. (commit "refactor: decouple AI provider…")
- UNSAFE verdict cards repeated irrelevant performance notes. Found in a screenshot review; fixed in `verify.ts`.
- `Date.now()` called during render (React purity). Found by ESLint; fixed in `RunStatus.tsx`.
- Guard labelled `FOR UPDATE` "destructive" because the `UPDATE` keyword check ran first. Found by a test; reordered.

## Safety mechanisms (each tested)

Guard for destructive statements and side-effect functions · READ ONLY transactions · rolled-back index trials ·
watchdog · 200k-row comparison cap · same-origin check · 64 KB body limit · per-client and per-instance rate limits ·
server-only API keys · CSP and security headers · model output validated twice.

## Trade-offs (for discussion, not bullets)

Browser Postgres vs. hosted sandbox · testing vs. formal equivalence · one structured LLM call vs. an agent ·
in-memory rate limit vs. Redis · lexical guard + database enforcement vs. a full SQL parser. See `docs/INTERVIEW-GUIDE.md` §18.

## Not yet true (do not claim)

- Deployed / live users / traffic
- GitHub stars or adoption
- Production speed-ups (all numbers are WebAssembly on synthetic data)
- Real AI provider latency or quality
- A passing GitHub Actions run (until it has run)
