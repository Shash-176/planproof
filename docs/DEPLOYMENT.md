# Deployment

## Choice: Vercel Hobby

| Option | Fit for PlanProof | Notes |
|---|---|---|
| **Vercel (Hobby)** | Native Next.js: static page plus one serverless route, secrets as environment variables, HTTPS and a stable `*.vercel.app` URL | Free; for non-commercial personal use, which a portfolio project is. If a usage limit is exceeded the feature pauses; Hobby has no billing, so nothing is charged. Functions: up to 300 s, 2 GB. |
| Cloudflare Workers / Pages | Works via the OpenNext adapter | Extra build adapter and configuration for no benefit here |
| Netlify, Render | Workable | No advantage over Vercel for a Next.js app; Render's free web services sleep when idle |
| GitHub Pages | Not suitable | Static only: the AI key needs a server-side route |

Facts from https://vercel.com/docs/plans/hobby and https://vercel.com/docs/functions/limitations, read 11 Nov 2026.

## What is already configured

- `next.config.ts`: security headers and CSP.
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
