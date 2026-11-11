# 06 — Development roadmap

Updated 10 November 2026 after approval. Round 1 entry is submitted; the repo is public, so `main`
must always be in a working, honestly described state.

Positioning: **"Your AI suggested a SQL optimisation. Did it actually help? PlanProof proves it."**

## P0 — smallest complete workflow (in order)

| ID | Milestone | Done when |
|---|---|---|
| P0-A | App boots locally | `npm run dev` serves the page; `npm run build` passes |
| P0-B | Controlled PGlite execution | Schema loads, data generated or seeded, `ANALYZE` runs |
| P0-C | Original query execution | Baseline measured; invalid/destructive originals rejected |
| P0-D | Candidate execution | Index and rewrite candidates applied in rolled-back transactions |
| P0-E | Result equivalence | Multiset/ordered comparison on main, empty and edge datasets |
| P0-F | Before/after measurement | Median time, cost, rows read; acceptance rule gives a verdict |
| P0-G | Real BharatCode integration | `/api/analyze` returns validated output from the real API |
| P0-H | End-to-end workflow | Browser: inputs → verdict cards with evidence |
| P0-I | Tests on critical logic | Adversarial suite passes (see list below) |
| P0-J | Deployed publicly | Needs the owner's hosting account and API key |

Adversarial cases required for P0-I: improvement that preserves results; no-op optimisation;
rewrite that changes results; invalid SQL; malformed model output; API timeout; API error;
destructive SQL; empty tables; duplicate rows; NULLs; ordering differences; data large enough to
change plans.

## P1 — only after P0 is stable

1. One-click impressive example
2. Visual before/after comparison
3. Plain-English explanation polish (deterministic explanation itself is P0-H)
4. Excellent error states
5. Proof card / result summary
6. Shareable result link
7. README GIF / demo
8. Additional examples and a "suggestions that looked right" gallery
9. UI polish
10. Performance and reliability work; multi-turn tool-calling agent

## Never cut
Deterministic verification, equivalence checking, adversarial tests, honest README status.

## Risks

| Risk | Response |
|---|---|
| No network path to bharatcode.ai from the build environment | Build against a mock with the same contract; owner runs the first real call locally |
| Model output unreliable | Strict schema, defensive parsing, Zod validation; verification never depends on it |
| PGlite `statement_timeout` ineffective | Worker watchdog terminates long runs |
| WASM timing noise | Median of several runs; cost and rows-read also required for VERIFIED |
| Synthetic data misleads | State row counts and data source on every result |
| Late commits may not count | Keep `main` working at every push |
