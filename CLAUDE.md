# CLAUDE.md — project context

Read this first in every session. Keep it short and current.

## Handoff (project frozen 13 Nov 2026)

PlanProof is **closed at v1.0.2**. The owner moved on to another project. Do not start new work unless the
owner asks; if they do, read this section, then `docs/ARCHITECTURE.md`.

| | |
|---|---|
| Stable version | **1.0.2**, tag `v1.0.2` → `dd304c1` (last application change) |
| Production | https://planproof-two.vercel.app/ (Vercel Hobby, free; auto-deploys from `main`) |
| Repository | https://github.com/Shash-176/planproof (MIT) |
| AI | Groq, `openai/gpt-oss-120b` → fallback `qwen/qwen3.8-27b` (same key, separate per-model free-tier limits). Env var `GROQ_API_KEY` is set in Vercel. Optional: AI analysis is skipped cleanly if it fails |
| Tests | 124 passing in 8 Vitest files (real PGlite for pipeline/datagen) |
| Evaluation | `npm run eval`: 65 / 65 runs matched expected verdicts (13 scenarios × 5); results in `docs/benchmarks/` (run on 1.0.0; the engine is unchanged since) |
| CI | GitHub Actions: lint, typecheck, test, build, audit, then a Chromium smoke test against a mock AI. All 5 runs passed (latest #5 on `dd304c1`) |
| Deployment status | Live, verified 13 Nov 2026 for first-time and returning visitors (`docs/DEPLOYMENT.md`, final section) |

### Final architecture (one paragraph)

The browser runs everything that decides: a Web Worker hosts PGlite (PostgreSQL 18.6 in WebAssembly), loads the schema
and seed or generated data, measures the original query and each candidate with `EXPLAIN (ANALYZE, FORMAT JSON)` inside
rolled-back / `READ ONLY` transactions, compares result sets on main, edge-case and empty datasets, and applies a
deterministic verdict rule (VERIFIED / INEFFECTIVE / UNSAFE / INVALID). One Next.js serverless route (`/api/analyze`)
calls the AI provider through an OpenAI-compatible adapter to explain the plan, extract SQL from pasted prose and propose
fixes. AI output is untrusted input and goes through the same checks. Diagrams: `docs/ARCHITECTURE.md`.

### Important engineering decisions

- **The model never decides.** Only execution evidence can produce VERIFIED.
- **Postgres in the browser**, not a hosted sandbox: free, private (rows never leave the tab), no server state.
- **Watchdog terminates the worker**, because PGlite ignores `statement_timeout` (45 s per database step).
- **Structural checks before timings** (index used? plan changed?), then ≥ 1.5× and lower cost or rows read, because
  WASM timings vary ~15%.
- **Cross-origin isolation (COOP + COEP)** for a microsecond clock; sub-resolution times are shown as "at least N×".
- **One structured LLM call**, not an agent; Groq chosen for a no-card free tier, strict JSON schema and terms that fit a
  public site (`docs/AI-PROVIDER.md`).

### Production bugs already solved (do not reintroduce)

1. Coarse browser clock (0.1 ms) distorted speed-ups → COOP/COEP + lower bounds (1.0.0).
2. Returning visitors' cached worker script lacked COEP and was refused (`ERR_BLOCKED_BY_RESPONSE`). `deploymentId`
   (1.0.1) does **not** version asset URLs on Vercel; the real fix is `src/lib/workerLoader.ts` (1.0.2): refresh the
   worker script with `cache: 'reload'` once and retry. **If headers ever change again, test from a browser that has
   visited the previous version.**

### Known limitations

WebAssembly timings on synthetic (uniform) data, not production; equivalence is tested on three datasets, not proven;
one read-only query at a time; index write cost reported as size only; ties in ORDER BY can be reported as an order
difference; rounded speed-ups can show "1.5×" on an INEFFECTIVE result; per-instance in-memory rate limits; CSP allows
inline scripts (Next.js); AI capacity is Groq's free tier shared by all visitors.

### Optional work never done

Importing real `pg_stats`, testing index + rewrite combinations, a CLI/GitHub Action, shareable result links, a shared
rate-limit store, nonce-based CSP. None is required; the project is complete without them.

## Rules (if work resumes)

1. **The model is not the source of truth.** Only deterministic execution may label anything VERIFIED.
2. **Never commit secrets.** Keys live in `.env.local` (git-ignored) or Vercel environment variables.
3. **Never fabricate numbers.** Benchmarks come from `npm run eval`; README claims must be backed by a test or that file.
4. **Never push a broken `main`.** Run `npm run lint && npm run typecheck && npm test && npm run build`.
5. Keep the architecture small: no auth, database server, queue or vector store without a real requirement.
6. Do not rewrite published history or change commit authors.

## Commands to resume

```bash
npm install
cp .env.example .env.local   # add GROQ_API_KEY for AI analysis (optional)
npm run dev                  # http://localhost:3000
npm run lint && npm run typecheck && npm test && npm run build
npm run eval                 # ~5 min → docs/benchmarks/RESULTS.md
npm run mock:ai              # canned OpenAI-compatible endpoint on :4010
npm run e2e -- <url> [--demo|"<example title>"|--runaway] [shot.png] [--mobile]
```

Browser tests against the mock: `npm run build`, then
`AI_CHAIN=custom:mock AI_CUSTOM_BASE_URL=http://127.0.0.1:4010/v1 AI_CUSTOM_API_KEY=test npm start`.

## Code map

- `src/lib/sql/` — lexer (comment/literal masking), guard (what may run)
- `src/lib/harness/` — datagen, measure, plan, timer, equivalence, verify (verdicts), narrate, pipeline
- `src/lib/ai/` — provider adapter, config/presets, analysis service, handler, client, schema, prompt
- `src/lib/watchdog.ts` — runaway-query protection
- `src/lib/workerLoader.ts` — stale cached worker recovery
- `src/worker/` — Web Worker hosting PGlite and the pipeline
- `src/app/` — page, components, `useVerifier`, `/api/analyze` route
- `eval/` — evaluation scenarios and runner · `tests/` — Vitest suites · `scripts/` — mock AI, browser smoke test

## Environment facts

- The cloud build environment cannot reach AI providers or vercel.app (proxy 403). Test production through a real
  browser (the owner's desktop app browser pane works).
- Keep COOP/COEP; never add a cross-origin subresource without CORP/CORS, or isolation and precise timings break.
- `next start` is not a faithful stand-in for Vercel's static asset serving (asset URL versioning differs).
- Cloud-workspace commits reach the owner's folder `F:\BharatCode-Build-League` as a git bundle; the owner pushes from
  Windows. The device shell needs delete permission for git to work there.

## Documents

`README.md` · `CHANGELOG.md` · `SECURITY.md` · `docs/ARCHITECTURE.md` · `docs/AI-PROVIDER.md` · `docs/DEPLOYMENT.md` ·
`docs/RESUME-EVIDENCE.md` · `docs/INTERVIEW-GUIDE.md` · `docs/PROGRESS.md` · `docs/benchmarks/RESULTS.md` · `docs/history/`
