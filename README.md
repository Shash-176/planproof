# PlanProof

**Your AI said "add this index". Did it actually help? PlanProof runs it and shows you.**

Paste a schema and a slow SQL query. An agent on the [BharatCode](https://bharatcode.ai) model API
proposes indexes and rewrites. A real Postgres running *in your browser* tests every proposal, and
a suggestion is shown only if it is measurably cheaper **and** returns exactly the same rows.

Entry for the **BharatCode Build League, Round 1** · Category: Coding & developer tools

## Project status

This repository was opened on 10 November 2026 at the design stage. To be clear about what exists:

| Area | Status |
|---|---|
| Problem research, competitor review, idea comparison | Done — see [`docs/`](docs/) |
| Product specification and architecture | Done (preliminary) — [`docs/05`](docs/05-product-spec-and-architecture.md) |
| Development roadmap | Done — [`docs/06`](docs/06-roadmap.md) |
| Application code | **Not started** |
| Live demo | **Not available yet** |
| Benchmark results | **None yet** |

Nothing below the next heading is implemented. It describes what is being built.

## Planned: how it will work

```
You paste:  schema + slow query
                │
                ▼
   Agent (BharatCode API, qwen-3.8-27b)
   reads the query plan, proposes an index or a rewrite
                │
                ▼
   Verification harness (no AI involved)
   • runs the proposal in a sandboxed Postgres (PGlite, in the browser)
   • measures planner cost and rows scanned, before and after
   • checks the rewritten query returns identical rows
                │
        ┌───────┴────────┐
        ▼                ▼
   Proof card         Rejected
   before/after       with the reason
   + migration SQL    (no gain / results differ)
```

The design principle: **the model proposes, the database decides.** A small model will sometimes be
wrong. Here a wrong suggestion costs nothing, because it is measured and thrown away.

## Planned features

- One-click example database and slow query, no install and no sign-up
- Live trace of the agent's steps
- Proof cards: before/after plan, measured improvement, equivalence check, migration and rollback SQL
- "Explain this plan" mode for people learning how databases execute queries
- Public benchmark suite with a reported pass rate

## Planned stack

TypeScript · Next.js · PGlite (Postgres compiled to WebAssembly) in a Web Worker ·
BharatCode `/responses` API with function tools and structured output · Zod · Vitest

## Documents

1. [Hackathon rules and API notes](docs/01-hackathon-rules-and-api.md)
2. [Idea discovery — 25 ideas across 8 categories](docs/02-idea-discovery.md)
3. [Shortlist comparison](docs/03-shortlist-comparison.md)
4. [Recommendation and known weaknesses](docs/04-recommendation.md)
5. [Product spec and architecture](docs/05-product-spec-and-architecture.md)
6. [Roadmap](docs/06-roadmap.md)

## Prior art

Postgres.ai, Aiven AI Database Optimizer (EverSQL), pganalyze, Dexter and pgMustard all work on
query performance and deserve credit. PlanProof's aim is narrower: a zero-install sandbox whose
suggestions carry their own evidence.

## Known limitations of the approach

- Sandbox data is not production data; a plan that wins here may not win on your real tables.
- Matching results on test data is strong evidence, not a mathematical proof of equivalence.
- Postgres dialect only.

## Licence

MIT — see [LICENSE](LICENSE).
