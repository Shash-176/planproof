# Changelog

All notable changes to PlanProof. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and versions follow [Semantic Versioning](https://semver.org/).

## [1.0.2] — 2026-11-13

### Fixed
- The 1.0.1 fix did not work on Vercel: asset URLs there are not versioned by `deploymentId`, so returning visitors
  still received the stale worker script and every run failed. Found during production verification of 1.0.1.
  PlanProof now recovers on its own: if the Web Worker fails before sending any message, the app re-downloads the
  worker script once with `cache: 'reload'` (replacing the stale cached copy with the server's current response,
  which has COEP) and starts the worker again (`src/lib/workerLoader.ts`). Verified locally by reproducing the exact
  production failure with one persistent browser profile across three builds, then recovering from it.

### Changed
- `deploymentId` is kept (it versions asset URLs when self-hosting) but is documented as not protecting Vercel users.

## [1.0.1] — 2026-11-13

### Fixed
- Returning visitors could not run any verification after 1.0.0. Static assets are cached as immutable for a year,
  and the Web Worker script kept the same URL across the release, so browsers that had loaded the site before the
  COEP header existed reused a cached copy without it; a cross-origin-isolated page refuses to start such a worker
  (`net::ERR_BLOCKED_BY_RESPONSE`), and every run failed with "The sandbox crashed". First-time visitors were not
  affected. Found during production verification.
  Attempted fix: `deploymentId` from the package version, so Next.js appends `?dpl=<version>` to static asset URLs.
  This works with `next start` but not on Vercel; see 1.0.2.

## [1.0.0] — 2026-11-11

First stable release. Deployed at https://planproof-two.vercel.app/ and checked in production
(see `docs/DEPLOYMENT.md#production-verification`). The Groq integration was exercised with a real key,
locally by the owner and on the live site.

### Fixed
- Speed-ups were distorted by the browser's coarse clock (0.1 ms steps without cross-origin isolation): the same
  index could show 76× in one card and 152× in another, and a 0.00 ms median could have produced an infinite
  ratio. The page is now cross-origin isolated (COEP `require-corp` with COOP), giving a microsecond clock, and any
  optimised time at or below the measured clock step is reported as a lower bound ("at least N×").

### Added
- `Cross-Origin-Embedder-Policy: require-corp` header.
- Clock-resolution estimate in each report (`timerResolutionMs`), shown with the raw timings.
- Tests for clock estimation and lower-bound reporting (120 tests in total).

## [1.0.0-rc.1] — 2026-11-11

First release candidate as an independent open-source tool. Not yet deployed, and the real AI
provider has not yet been exercised with a live key (all AI paths are covered by mocked tests).

### Added
- Provider-neutral AI layer: one OpenAI-compatible adapter, presets for Groq (default), Gemini,
  OpenRouter and any custom endpoint, and an ordered fallback chain (`AI_CHAIN`).
- Default chain `groq:openai/gpt-oss-120b → groq:qwen/qwen3.8-27b` with strict JSON-schema output.
- `GET /api/analyze` status endpoint; the UI shows which model is used and what is sent to it.
- Redesigned interface: one-click demo, four runnable examples, verdict cards with stat tiles,
  side-by-side plan trees, plain-English steps, copyable migration and rollback SQL, progress with
  cancel, stage-specific error help, and a responsive layout.
- Security headers including a Content Security Policy compatible with PGlite.
- Same-origin check, body size limit and per-instance rate limit on `/api/analyze`.
- Watchdog extracted into a tested module; `?dbStepLimitMs=` for testing.
- Evaluation suite (`npm run eval`): 13 scenarios, repeated runs, results in `docs/benchmarks/`.
- Tests for generated-data edge cases, unexpected AI output, provider failures and the watchdog.
- ESLint (Next.js core-web-vitals + TypeScript rules); CI runs lint, typecheck, tests and build.
- Documentation: architecture with Mermaid diagrams, AI provider decision, security model, deployment
  guide, resume evidence and interview guide.

### Changed
- UNSAFE verdicts no longer repeat performance notes from the main dataset.

### Removed
- BharatCode model API client and the hackathon `BharatCode.txt` (kept under `docs/history/`).

### Fixed
- An unexpected exception inside a provider call could include internal error text in the
  `/api/analyze` response. Unknown errors now return a generic message.

## [0.1.0] — 2026-11-10

Hackathon version (BharatCode Build League, Round 1).

### Added
- Deterministic verification harness on PGlite: guard, rolled-back trials, EXPLAIN ANALYZE
  measurement, result equivalence on main, edge-case and empty datasets, verdicts.
- Synthetic data generation from the catalog, seeded with query literals.
- Browser app with four examples; BharatCode `/responses` integration.
- 73 automated tests.
