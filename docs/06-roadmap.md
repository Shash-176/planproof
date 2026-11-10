# 06 — Development roadmap

Written 10 November 2026. Voting and judging dates are not published, so the plan front-loads
anything a judge or voter could see. Days are counted from approval.

## Stage 0 — before 11:59 PM IST, 10 November 2026 (owner: you)

1. Register at https://bharatcode.ai/hackathon ("Apply for Round 1"); pick *Coding & developer tools*.
2. Start student verification for API access if you have not already.
3. Create a public GitHub repo and push this folder (`BharatCode.txt`, `README.md`, `docs/`).
4. Submit the main repo URL on the hackathon page with the project name and summary.
5. Create an API key at bharatcode.ai/account. Do not commit it.

## Stage 1 — vertical slice (days 1–2)

Goal: one sample database, one slow query, one verified index suggestion, live on a public URL.

- Scaffold Next.js + TypeScript, lint, tests, CI
- PGlite in a Web Worker; load the sample schema and seed data
- Server route: streaming proxy to `/responses` with 503 backoff
- Agent loop with three tools: `get_schema`, `explain`, `try_index`
- Minimal UI: query box, live trace, before/after cost
- Deploy

Exit test: a stranger opens the URL, clicks "Run example", and sees a verified improvement.

## Stage 2 — the proof (days 3–4)

- `try_rewrite` tool and the result-equivalence checker (order-insensitive multiset hash)
- SQL guard: statement allow-list, transaction + rollback, statement timeout, step budget
- Measurement: planner cost, rows scanned, median of N timed runs
- Structured final recommendation → proof card with migration and rollback SQL
- Unit tests for guard, checker and measurement

Exit test: an intentionally wrong rewrite is rejected with a readable reason.

## Stage 3 — real inputs (day 5)

- Bring-your-own schema (paste DDL) and optional sample rows (CSV paste)
- Synthetic data generator honouring foreign keys, with model-suggested value distributions
- Dataset size caps and clear messaging about sandbox-vs-production limits

## Stage 4 — evidence and reliability (day 6)

- Benchmark suite: 12–15 slow-query scenarios with known-good fixes
- `npm run eval` produces a pass-rate table for the README
- Handle `response.incomplete`, `response.failed`, truncated tool calls, token budget
- "Explain this plan" learning mode

## Stage 5 — presentation (day 7)

- README: one-line pitch, 30-second GIF, architecture diagram, eval table, limitations, prior art
- Shareable proof-card link
- Final pass on mobile layout, empty states and error states

## Stretch (only after Stage 5)

- CLI and GitHub Action that comments on PRs touching SQL
- Composite and partial index search; index write-cost estimate
- MySQL via a second engine

## Cut order if time runs short

Drop in this order: stretch → learning mode → synthetic data generator → bring-your-own rows.
Never cut: equivalence check, eval table, public demo.

## Risks tracked

| Risk | Trigger | Response |
|---|---|---|
| Late commits do not count | Organisers clarify, or voting opens early | Whatever is deployed at that moment must already run; keep `main` always demoable |
| API access delayed | No key within 24h | Build harness and UI against recorded fixtures; integrate when key arrives |
| Model tool-calling unreliable | <60% of benchmark scenarios pass | Tighten tool schemas, add few-shot traces, reduce tool count, constrain with `tool_choice` |
| PGlite limitation blocks a feature | e.g. an `EXPLAIN` option unsupported | Fall back to plain `EXPLAIN (FORMAT JSON)` cost; document it |
| Serverless streaming time limit | Long agent runs cut off | One model turn per request (the loop already lives in the client) |
