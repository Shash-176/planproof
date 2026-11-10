# Progress log

Newest first. Only things that were actually run and tested are marked done.

## 10–11 Nov 2026 — First end-to-end vertical slice

Working and tested:
- Verification harness on PGlite (Postgres 18.6 in WebAssembly): guard, rolled-back trials,
  EXPLAIN ANALYZE measurement, type-aware result equivalence, verdicts with evidence.
- Equivalence re-checked on an edge-case dataset (NULLs, duplicates, query literals mixed in) and on
  empty tables. The NOT IN → NOT EXISTS example is only caught by the edge-case dataset.
- Synthetic data from the catalog (FKs, identity, enum, varchar, uuid, composite keys).
- Deterministic plain-English plan narration.
- `/api/analyze`: BharatCode `/responses` client with JSON-schema output, Zod validation, retries,
  timeouts, rate limit. **Tested against mocks only.**
- Browser app (Next.js 16, pipeline in a Web Worker, watchdog). Production build tested in Chromium
  against a local mock API: all four examples give their intended verdicts in about 7–10 s; malformed
  model output and persistent 503s degrade to a clear message while pasted SQL is still verified.
- 73 automated tests, passing twice in a row.

Findings during the build:
- PGlite ignores `statement_timeout` (a 3 s `pg_sleep` ran to completion) → worker watchdog.
- WASM timings vary ~15% run to run → VERIFIED needs ≥ 1.5× and lower cost or fewer rows read;
  "index not used" and "same plan" are decided from the plan, not from timings.
- Generated text values never matched literals like `'pending'`, which hid the NULL trap → literals
  from the query and suggestions are mixed into generated text columns.
- Neither the build environment nor the owner's VM shell can reach bharatcode.ai (proxy 403).

Not done / blocked:
- **P0-G real API call** — needs the owner's API key and a machine that can reach bharatcode.ai.
- **P0-J deployment** — needs the owner's choice of host and account.

## 10 Nov 2026 — Approval and documentation update

- Round 1 entry submitted; repo public at https://github.com/Shash-176/planproof
- Project approved with repositioning (`docs/07-community-and-judge-strategy.md`).

## P0 status

| ID | Milestone | Status |
|---|---|---|
| P0-A | App boots locally | Done — `next build` and `next start` tested |
| P0-B | Controlled PGlite execution | Done — tested |
| P0-C | Original query execution | Done — tested |
| P0-D | Candidate execution | Done — tested |
| P0-E | Result equivalence | Done — tested |
| P0-F | Before/after measurement | Done — tested |
| P0-G | Real BharatCode integration | Built and mock-tested; **real call not yet made** |
| P0-H | End-to-end workflow | Done — tested in Chromium with mock API |
| P0-I | Tests on critical logic | Done — 73 tests |
| P0-J | Deployed publicly | Not started — needs owner's hosting account |
