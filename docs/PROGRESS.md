# Progress log

Newest first. Only things that were run and observed are marked done.

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
| AI provider layer | Done, mock-tested; **real call pending** (owner's key) |
| UI / one-click demo | Done, tested in Chromium (desktop and mobile) |
| Tests | 115 passing |
| Evaluation | 13 scenarios × 5 runs, results committed |
| Lint / typecheck / build / audit | Passing / clean / passing / 0 vulnerabilities |
| CI | Configured; first GitHub run on next push |
| Deployment | Prepared for Vercel; **not deployed** (owner's account) |
