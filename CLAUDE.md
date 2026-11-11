# CLAUDE.md — project context

Read this first in every session. Keep it short and current.

## What this is

**PlanProof**: an open-source developer tool. "AI proposes. PostgreSQL proves."
A user pastes a schema, a slow query and an AI-suggested optimisation. PlanProof runs everything in
PostgreSQL compiled to WebAssembly (PGlite) in a browser Web Worker, measures with EXPLAIN ANALYZE,
compares result sets on main, edge-case and empty datasets, and returns VERIFIED / INEFFECTIVE /
UNSAFE / INVALID with evidence. An optional AI model (default Groq `openai/gpt-oss-120b`, fallback
`qwen/qwen3.8-27b`) explains, extracts and proposes; it never decides.

Repo: https://github.com/Shash-176/planproof · Started as a BharatCode Build League entry (history in `docs/history/`).

## Current state

See `docs/PROGRESS.md` (live status) and `CHANGELOG.md`. Version `1.0.0-rc.1`.

## Rules

1. **The model is not the source of truth.** Only deterministic execution may label anything VERIFIED.
   Model output is untrusted input: validate it and send it through the same guard and execution.
2. **Never commit secrets.** Keys live in `.env.local` (git-ignored) or host environment variables.
3. **Never fabricate numbers.** Benchmarks come from `npm run eval` (writes `docs/benchmarks/`).
   README claims must be backed by a test or that file.
4. **Never push a broken `main`.** Run `npm run lint && npm run typecheck && npm test && npm run build`.
5. Keep the architecture small: no auth, no database server, no queue, no vector store unless a real
   requirement appears.
6. Update `docs/PROGRESS.md` after meaningful milestones; `docs/RESUME-EVIDENCE.md` when a measurable
   outcome changes.

## Commands

```bash
npm run dev            # http://localhost:3000 (AI needs GROQ_API_KEY in .env.local)
npm run lint
npm run typecheck
npm test               # vitest, ~90 s: real PGlite for pipeline/datagen tests
npm run build
npm run eval           # evaluation suite → docs/benchmarks/RESULTS.md (~5 min)
npm run mock:ai        # canned OpenAI-compatible endpoint on :4010
npm run e2e -- <url> [--demo|"<example title>"|--runaway] [shot.png] [--mobile]
```

Browser tests against the mock: `npm run build`, then
`AI_CHAIN=custom:mock AI_CUSTOM_BASE_URL=http://127.0.0.1:4010/v1 AI_CUSTOM_API_KEY=test npm start`.

## Code map

- `src/lib/sql/` — lexer (comment/literal masking), guard (what may run)
- `src/lib/harness/` — datagen, measure, plan, equivalence, verify (verdicts), narrate, pipeline
- `src/lib/ai/` — provider adapter, config/presets, analysis service, handler, client, schema, prompt
- `src/lib/watchdog.ts` — runaway-query protection (PGlite ignores statement_timeout)
- `src/worker/` — Web Worker hosting PGlite and the pipeline
- `src/app/` — page, components, `useVerifier`, `/api/analyze` route
- `eval/` — evaluation scenarios and runner
- `tests/` — Vitest suites

## Environment facts

- The cloud build environment cannot reach AI providers (proxy 403). Real AI calls must be tested on the
  owner's machine or the deployed site.
- Commits made in the cloud workspace reach the owner's folder `F:\BharatCode-Build-League` as a git
  bundle; the owner pushes from Windows. Never commit `.env.local` or `.planproof-sync*`.

## Documents

`docs/ARCHITECTURE.md` · `docs/AI-PROVIDER.md` · `docs/DEPLOYMENT.md` · `SECURITY.md` ·
`docs/RESUME-EVIDENCE.md` · `docs/INTERVIEW-GUIDE.md` · `docs/benchmarks/RESULTS.md` · `docs/history/`
