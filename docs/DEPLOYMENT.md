# Deployment

**Live:** https://planproof-two.vercel.app/ (Vercel Hobby, deployed from `main` by the owner on 11 Nov 2026).

## Choice: Vercel Hobby

| Option | Fit for PlanProof | Notes |
|---|---|---|
| **Vercel (Hobby)** | Native Next.js: static page plus one serverless route, secrets as environment variables, HTTPS and a stable `*.vercel.app` URL | Free; for non-commercial personal use, which a portfolio project is. If a usage limit is exceeded the feature pauses; Hobby has no billing, so nothing is charged. Functions: up to 300 s, 2 GB. |
| Cloudflare Workers / Pages | Works via the OpenNext adapter | Extra build adapter and configuration for no benefit here |
| Netlify, Render | Workable | No advantage over Vercel for a Next.js app; Render's free web services sleep when idle |
| GitHub Pages | Not suitable | Static only: the AI key needs a server-side route |

Facts from https://vercel.com/docs/plans/hobby and https://vercel.com/docs/functions/limitations, read 11 Nov 2026.

## What is already configured

- `next.config.ts`: security headers, CSP, and COOP + COEP for cross-origin isolation (precise timers for EXPLAIN ANALYZE).
- `src/app/api/analyze/route.ts`: Node.js runtime, `maxDuration = 60`, no caching.
- `.env.example`: every variable, with comments.
- No `vercel.json` is needed; Vercel detects Next.js.

## Steps (about 5 minutes)

1. **Get a Groq API key** (free): sign in at https://console.groq.com, open **API Keys**, create a key.
   Do not add a payment method. Optional but recommended: **Settings → Data Controls → enable Zero Data Retention**.
2. **Import the repository into Vercel**: sign in at https://vercel.com with GitHub (Hobby plan),
   **Add New → Project**, choose `Shash-176/planproof`. Framework preset: Next.js (auto-detected).
   Leave build settings at their defaults.
3. **Add the environment variable** before deploying: `GROQ_API_KEY` = your key, for Production
   (and Preview if you want AI on preview deployments).
4. **Deploy.** Vercel builds and gives a URL such as `https://planproof-<something>.vercel.app`.
5. **Check it**:
   - open the URL and click **Run the demo**: a VERIFIED card should appear within about 10 seconds
   - the form should say *Also ask openai/gpt-oss-120b (groq)…*; if it says AI analysis is not
     configured, the variable is missing or was added after the build: redeploy
   - `https://<your-url>/api/analyze` should return `{"configured":true,…}` and no key

Every later push to `main` redeploys automatically.

## Cost

- Vercel Hobby: free. Limits pause usage, they do not bill.
- Groq Free tier: free. Limits return HTTP 429; PlanProof then skips AI analysis and still verifies pasted SQL.
- Expected monthly cost with no payment methods on file: **$0**.

## Operating notes

- Function logs (1 hour retention on Hobby) show `[analyze]` lines for fallbacks and failures. They contain
  provider names and error kinds, never keys or user input.
- If the Groq key leaks, revoke it in the Groq console and replace the Vercel variable; redeploy.

## Production verification

Performed on 11 Nov 2026 against https://planproof-two.vercel.app/ in a real browser (the Claude desktop app's
built-in Chromium-based browser), before the COEP fix below was deployed unless noted.

| Check | Result |
|---|---|
| `GET /api/analyze` | `{"configured":true,"providers":[groq openai/gpt-oss-120b, groq qwen/qwen3.8-27b]}`, `cache-control: no-store`, no key |
| One-click demo | 2 suggestions, both VERIFIED (the pasted index and the model's own proposal); AI explanation written by `openai/gpt-oss-120b` via Groq in 1.1 s; run took 8.7 s |
| Example: index Postgres ignores | Pasted suggestion INEFFECTIVE (index not used); model proposal also INEFFECTIVE |
| Example: JOIN rewrite | Pasted suggestion UNSAFE (results change); model proposal VERIFIED |
| Example: NOT EXISTS rewrite | Pasted suggestion UNSAFE on the edge-case dataset; model proposal INEFFECTIVE |
| Cancel during a run | Progress cleared, no results or error shown, buttons re-enabled |
| Destructive query (`DELETE FROM orders`) | Refused before execution with a stage-specific message |
| Broken schema | Postgres syntax error shown with a hint |
| Runaway query (`?dbStepLimitMs=3000`, 200k × 200k cross join) | Stopped by the watchdog; the next run on the same page succeeded |
| Mobile (375 × 812) | No horizontal overflow on the landing page or results |
| Security headers | CSP, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, COOP, and HSTS (added by Vercel) |
| API errors | Bad JSON → 400, invalid body → 400, 70 KB body → 413, PUT → 405; messages contain no internals |
| Rate limit | Requests beyond 8 per minute from one client → 429 (checked with invalid bodies, so no AI quota was used) |
| Secrets in the browser | Page HTML and all 8 page scripts contain no `gsk_` key, no `GROQ_API_KEY` name and no provider hostname. The Web Worker's chunks were not fetchable from the page; the equivalent local check (below) covers them |

Local equivalent of the bundle check: a production build made with a fake key in `GROQ_API_KEY` contains that
value in no file under `.next/static` (see `docs/PROGRESS.md`).

**Defect found and fixed:** browsers step `performance.now()` in 0.1 ms without cross-origin isolation, so very fast
optimised queries read as 0.10 or 0.00 ms and the same index showed 76× in one card and 152× in another. Fixed by
adding COEP (verified locally in Chromium: `crossOriginIsolated` true, timings to 0.01 ms, PGlite working) and by
reporting sub-resolution results as lower bounds. Re-check production after the fix deploys: the response headers
should include `Cross-Origin-Embedder-Policy: require-corp`.
