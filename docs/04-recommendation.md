# 04 — Recommendation

**Status: PROPOSED — awaiting approval. No application code has been written.**

## Recommended project: PlanProof (working name)

*A Postgres query optimiser that proves its own suggestions.*

Paste a schema and a slow query. An agent running on the BharatCode API inspects the query plan,
proposes indexes and rewrites, and a real Postgres running in your browser tests each proposal.
A suggestion is shown only if it is measurably cheaper **and** the rewritten query returns exactly
the same rows. The output is a "proof card": before/after plans, the measured improvement, the
equivalence check, and a ready-to-run migration with its rollback.

Category to register under: **Coding & developer tools** (changeable later).

## Why this one

1. **The model is never trusted.** A 27B model will sometimes suggest a wrong index or a rewrite
   that changes results. Here that costs nothing: the harness measures and rejects. This is the
   honest way to build on a small model, and it is the main engineering argument of the project.
2. **The API integration is structural, not decorative.** The agent uses function tools in a
   multi-step loop (explain → hypothesise → test → revise), strict structured output for the final
   recommendation, and streaming for the live trace. Remove the model and nothing works; remove the
   harness and nothing can be believed.
3. **It shows the skills an SDE interview probes.** Query plans and indexing, sandboxing untrusted
   SQL, differential testing, a stateless agent loop with history replay, retry/backoff against a
   queueing API, and an evaluation suite with a reported pass rate.
4. **The demo fits in 30 seconds and needs no install.** One click loads a sample database and a slow
   query; the viewer watches the agent work and sees a number drop with a green "results identical".
5. **It is cheap to host.** Postgres runs in the browser (PGlite); the server is one streaming proxy
   function that keeps the API key secret.
6. **It is not what other entrants are building** (see `01`, section 4).

## Honest weaknesses

| Weakness | Severity | Mitigation |
|---|---|---|
| Deadline is the day of this research; unknown whether later commits count | Critical | Register and submit the repo link immediately; ship a working vertical slice within 48 hours |
| Funded incumbents exist (Aiven/EverSQL, pganalyze, Postgres.ai) | High | Position as open-source, zero-install, proof-carrying; credit prior art; do not claim to be first |
| Sandbox data is not production data — a plan that wins on synthetic rows may not win in production | High | State it in the UI; let users load their own sample rows and `pg_stats`-style row counts; report planner cost, not only time |
| WASM Postgres timings and memory differ from a server | Medium | Lead with planner cost and rows scanned; cap dataset size; median of several runs |
| Niche audience may limit community votes | Medium | Add a "learn to read a query plan" mode that explains each plan node, aimed at students |
| Result equivalence on sample data is evidence, not a formal proof | Medium | Say "identical on N rows across K generated datasets", never "proven equivalent" |
| Student API verification time is unknown | Medium | Start verification now; build the harness first (it needs no API) |
| Name "PlanProof" not checked for conflicts | Low | Check before publishing |

## Runner-up and when to switch

**Accessibility audit agent (#24).** Choose it instead if (a) the builder has little database
background, or (b) a quick test shows the model reads UI screenshots well and a free host for a
headless browser is available. It has the stronger social-impact story and the stronger use of
image input; it loses on hosting weight and on unverifiable model behaviour.

## Decision requested

- **Approve** PlanProof → proceed to Phase 2 (repository scaffold, then the vertical slice).
- **Switch** to the runner-up or another shortlisted idea → the spec in `05` is rewritten first.
- **Revise** → say what to change.
