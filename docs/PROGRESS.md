# Progress log

Newest first. Only things that were run and observed are marked done.

## 13 Nov 2026 — v1.0.2: final release, project closed

- **1.0.1 did not fix production.** In the browser that had visited before COEP, every run still failed: Vercel served
  the worker from the same unversioned URL, so `deploymentId` had no effect there.
- **1.0.2 fix:** re-download the worker script once with `cache: 'reload'` when the worker fails before its first message,
  then retry (`src/lib/workerLoader.ts`, 4 new tests). Reproduced the exact failure locally first (one persistent
  Chromium profile across three builds), then confirmed the recovery.
- **Final production verification (same browser that reproduced the failure):** stale worker blocked once, refreshed
  (200), retried successfully; demo VERIFIED ×2 in 8.7 s; all four examples gave their documented verdicts; Groq
  `openai/gpt-oss-120b` answered each run (0.8–0.9 s), and one model rewrite was caught as UNSAFE; cancel, runaway stop and
  recovery OK; 5 µs clock steps; headers intact; API 400/413/405; no unexpected console errors. Later loads started the
  worker first time (the path a fresh visitor takes); a fresh profile was verified locally, not against production.
- **CI:** all 5 runs passed (#5 on `dd304c1`).
- **Final local checks:** 124 tests (8 files), lint, typecheck, build, `npm audit` 0, no secrets in history, `.env.local`
  ignored, no temporary files tracked.
- **Closed.** Handoff in `CLAUDE.md`.


## 13 Nov 2026 — v1.0.1: release closure

- GitHub `main` and tag `v1.0.0` at `a557b03`; CI run #3 started for it.
- Production carries the COEP fix: isolated page, 5 µs clock steps, Groq configured.
- **Regression found in production:** returning visitors' cached Web Worker script (no COEP) is refused by the isolated
  page; every run fails. Fixed in 1.0.1 with a versioned `deploymentId`. Verified locally (all asset URLs versioned;
  demo, examples, mobile, runaway OK; 120 tests; lint; audit 0). **Production re-check pending the 1.0.1 deploy.**


## 11 Nov 2026 — v1.0.0: production release validation

### Owner-reported
- Real Groq integration tested locally by the owner: demo produced the expected VERIFIED workflow.
- Deployed to Vercel at https://planproof-two.vercel.app/.

### Verified this session
- **GitHub Actions:** CI runs #1 (`0f3b87b`) and #2 (`13372af`, 3m 25s) completed successfully (read from the public
  Actions page; job-level detail not visible without signing in).
- **Production (live site, real browser):** all checks in `docs/DEPLOYMENT.md#production-verification` — real Groq
  analysis (`openai/gpt-oss-120b`, 1.1 s), demo and all four examples with their documented verdicts, cancel,
  error states, runaway-query stop and recovery, mobile layout, security headers, API error codes, rate limit,
  no secrets in page or scripts.
- **Defect found in production and fixed:** coarse browser clock (0.1 ms) distorted speed-ups (76× vs 152× for the same
  index; a 0.00 ms median was possible). Fix: COEP for cross-origin isolation + lower-bound reporting. Verified locally
  in Chromium (isolated, 0.01 ms timings, PGlite and all examples working, no console/CSP errors). **Not yet verified
  in production: needs the push to deploy.**
- **Tests:** 120 passing (7 files). Lint, typecheck, production build: clean. `npm audit`: 0 vulnerabilities.
- **Evaluation (v1.0.0):** 65 / 65 runs matched; 5 / 5 semantic regressions caught every run; no verdict varied.
- **Secrets:** a production build made with a fake `GROQ_API_KEY` contains the value in none of the 27 client files
  under `.next/static` (worker chunk included) nor anywhere else in `.next`; the variable name and the Groq hostname
  appear in no client file. Full git history: no key patterns; key variables only ever assigned placeholder values.
- **Version:** 1.0.0.


## 11 Nov 2026 — v1.0.0-rc.1: independent open-source release candidate

### Baseline audit (start of session)
- Local `main` and GitHub `main` both at `0f3b87b`; working tree clean.
- `npm test`: **73 tests passed** (4 files). `tsc --noEmit`: clean. `next build`: passed. `npm audit`: 0 vulnerabilities.
- Browser smoke test against the mock API: demo VERIFIED, NULL-trap example UNSAFE, no console errors.
- Every AI provider host (Groq, Gemini, OpenRouter, Cerebras, Cloudflare, Hugging Face, GitHub Models,
  Mistral) is blocked from the build environment by the network proxy (HTTP 403). Real provider calls
  cannot be tested from here.

### Done this session
- **AI provider layer** replaces BharatCode: OpenAI-compatible adapter, presets (Groq default, Gemini,
  OpenRouter, custom), fallback chain, retries/deadline, defensive parsing, Zod validation on server and
  client, `GET /api/analyze` status. Decision record: `docs/AI-PROVIDER.md`.
- **Bug fixed:** unexpected exceptions could leak internal error text through `/api/analyze`.
- **UI rebuilt:** one-click demo, runnable examples, stat tiles, side-by-side plan trees, plain-English
  steps, copyable migration/rollback, progress with cancel, stage-specific errors, mobile layout.
- **Watchdog** extracted and unit-tested; verified in Chromium that a 200k × 200k cross join is stopped.
- **Security headers / CSP** (works with PGlite: `'wasm-unsafe-eval'`); same-origin check; body limit;
  per-instance rate limit. Review in `SECURITY.md`.
- **Tests:** 73 → 115 (generated-data edge cases, unexpected AI output, provider failures, watchdog).
- **Evaluation suite** `npm run eval`: 13 scenarios × 5 runs; results in `docs/benchmarks/RESULTS.md`.
- **ESLint** added (2 real findings fixed); minimatch override clears a dev-only advisory; audit 0.
- **CI:** lint, typecheck, tests, build, audit, plus a browser job (demo, NULL trap, mobile, runaway).
- **Docs:** README, ARCHITECTURE (Mermaid, validated with mmdc), AI-PROVIDER, DEPLOYMENT, SECURITY,
  CHANGELOG, RESUME-EVIDENCE, INTERVIEW-GUIDE; hackathon documents moved to `docs/history/`.

### Not done / needs the owner
- **Real AI provider call**: needs a Groq API key and a machine that can reach Groq (owner's PC or Vercel).
- **Deployment**: needs the owner's Vercel account (steps in `docs/DEPLOYMENT.md`).
- **CI result on GitHub**: workflow validated locally step by step; first real run happens on push.

## 10–11 Nov 2026 — v0.1.0: hackathon vertical slice

- Verification harness on PGlite, edge/empty dataset checks, synthetic data, plain-English narration.
- BharatCode `/responses` integration (mock-tested only).
- Browser app with four examples; 73 tests.
- Findings: PGlite ignores `statement_timeout`; WASM timings vary ~15%; generated text never matched
  query literals, hiding the NULL trap (fixed by seeding literals).

## Status (final)

| Area | Status |
|---|---|
| Version | 1.0.2 (frozen) |
| Verification engine | Done, tested; unchanged since the 1.0.0 evaluation |
| AI provider layer | Done; real Groq calls verified on the live site |
| UI / one-click demo | Done; verified on the live site for first-time and returning visitors |
| Tests | 124 passing |
| Evaluation | 13 scenarios × 5 runs, 65 / 65 |
| Lint / typecheck / build / audit | Clean / clean / passing / 0 vulnerabilities |
| CI | All 5 runs passed |
| Deployment | Live at https://planproof-two.vercel.app/ |
