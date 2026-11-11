# Progress log

Newest first. Only things that were run and observed are marked done.

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

## Status

| Area | Status |
|---|---|
| Verification engine | Done, tested |
| AI provider layer | Done; real Groq calls verified (owner locally, and on the live site) |
| UI / one-click demo | Done; verified on the live site (desktop and mobile) |
| Tests | 120 passing |
| Evaluation | 13 scenarios × 5 runs, results committed |
| Lint / typecheck / build / audit | Clean / clean / passing / 0 vulnerabilities |
| CI | Passing on GitHub (runs #1, #2) |
| Deployment | Live at https://planproof-two.vercel.app/; timing fix awaiting push |
