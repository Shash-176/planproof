# CLAUDE.md — project context

Read this first in every session. Keep it short and current.

## What this repo is

Entry for the **BharatCode Build League** (Round 1). Goal: the strongest possible project for an
SDE internship application, built on the BharatCode model API.

## Current state (updated 10 Nov 2026)

- **Phase 1 (research and recommendation): complete.**
- **Recommendation: PlanProof** — a Postgres query optimiser that proves its suggestions by running
  them in an in-browser Postgres and checking result equivalence. See `docs/04-recommendation.md`.
- **Approval: PENDING.** Do not write application code until the owner approves. If they choose a
  different project, rewrite `docs/05` and `docs/06` first, then this file.
- No application code exists yet. `README.md`, `LICENSE`, `.gitignore` and `BharatCode.txt` exist for the Round 1 submission.

## Hard facts (verified from bharatcode.ai on 10 Nov 2026)

- Deadline shown: register and submit by **10 Nov 2026, 11:59 PM IST**. Whether later commits count
  is unknown. Keep `main` demoable at all times.
- Submission: public GitHub repo, `BharatCode.txt` in root of default branch, main repo URL.
- Judging: GitHub stars + website votes + judges. Weights unpublished.
- API base URL: `https://bharatcode.ai/api/model/v1` (OpenAI-compatible).
  Endpoints: `/responses`, `/chat/completions`, `/models`.
- Model: `qwen-3.8-27b` (students: 10M tokens/day). `deepseek-v4.1-flash` is Pro only.
- API is **stateless** (`store:true` / `previous_response_id` → 400): replay full history each turn.
- No hosted tools, no embeddings documented, no audio/video/file input. Images are supported.
- Shared capacity: handle `503`, `response.failed`, `status:"incomplete"`. Never run a partial tool call.
- Max output 32,000 tokens including reasoning.

Full notes and sources: `docs/01-hackathon-rules-and-api.md`.

## Documents

| File | Contents |
|---|---|
| `docs/01-hackathon-rules-and-api.md` | Rules, deadline, judging, API capabilities, other entrants |
| `docs/02-idea-discovery.md` | 25 ideas across the 8 categories with competitors |
| `docs/03-shortlist-comparison.md` | 8 shortlisted ideas scored on 6 weighted criteria |
| `docs/04-recommendation.md` | The recommendation, weaknesses, runner-up |
| `docs/05-product-spec-and-architecture.md` | Spec, architecture, stack, open questions |
| `docs/06-roadmap.md` | Staged plan, cut order, risks |

## Rules for working in this repo

1. **Never commit secrets.** `BHARATCODE_API_KEY` lives only in `.env.local` / host env vars.
   The repo is public and the hackathon forbids secrets in it.
2. **The model proposes, the harness decides.** No suggestion reaches the user unless the
   deterministic harness measured it and the equivalence check passed.
3. **Do not overclaim.** Say "identical on N rows across K datasets", not "proven equivalent".
   Credit prior art (Postgres.ai, Aiven/EverSQL, pganalyze) in the README.
4. **Mark unverified facts.** Anything not confirmed from an official source is labelled as such.
5. **Small vertical slices.** Each stage in `docs/06-roadmap.md` ends with something that runs.
6. **Tests for the harness are mandatory**: SQL guard, measurement, equivalence checker.
7. Update the "Current state" section at the end of every session.

## Planned stack (if approved)

TypeScript · Next.js (App Router) · PGlite in a Web Worker · OpenAI SDK pointed at BharatCode ·
Zod · Vitest · Playwright · GitHub Actions. Commands will be added here once the scaffold exists.

## Open questions

See `docs/05-product-spec-and-architecture.md` section 4.
