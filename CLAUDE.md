# CLAUDE.md — project context

Read this first in every session. Keep it short and current.

## What this repo is

**PlanProof** — entry for the **BharatCode Build League** (Round 1), submitted 10 Nov 2026.
Public repo: https://github.com/Shash-176/planproof

> "Your AI suggested a SQL optimisation. Did it actually help? PlanProof proves it."

The user pastes a schema, a slow query and (optionally) what their AI suggested. The BharatCode model
extracts, proposes and explains. A real Postgres (PGlite) verifies by execution. Verdicts:
VERIFIED / INEFFECTIVE / UNSAFE / INVALID.

## Current state

See `docs/PROGRESS.md` for the live P0 checklist. Update it after every meaningful milestone.

## Hard facts (verified from bharatcode.ai on 10 Nov 2026)

- Judging: GitHub stars + website votes + judges. Weights unpublished. No vote/star manipulation.
- Submission: public repo with `BharatCode.txt` in root of default branch.
- API base URL: `https://bharatcode.ai/api/model/v1` (OpenAI-compatible).
  Endpoints: `/responses`, `/chat/completions`, `/models`. Bearer key from bharatcode.ai/account.
- Model: `qwen-3.8-27b` (students: 10M tokens/day). `deepseek-v4.1-flash` is Pro only.
- API is **stateless** (`store:true` / `previous_response_id` → 400).
- No hosted tools, no embeddings documented, no audio/video/file input. Images supported.
- Shared capacity: handle `503`, `response.failed`, `status:"incomplete"`.
- Max output 32,000 tokens including reasoning.
- The cloud build environment and the owner's VM shell **cannot reach bharatcode.ai** (proxy 403).
  Real API calls must run on the owner's machine or the deployed host.

## Engineering rules

1. **Never commit secrets.** `BHARATCODE_API_KEY` lives only in `.env.local` / host env vars.
2. **The model is not the source of truth.** It may propose, extract, classify, explain. Only
   deterministic execution may label something VERIFIED.
3. **Do not overclaim.** "Identical on N rows across K datasets", never "proven equivalent".
   Never publish a benchmark that was not measured; include the command that produced it.
4. **README marks a feature implemented only after it was tested.**
5. **Never push a broken or misleading `main`.** The repo is publicly submitted.
6. Small commits. Tests for guard, equivalence, measurement and verdicts are mandatory.

## Documents

| File | Contents |
|---|---|
| `docs/01-hackathon-rules-and-api.md` | Rules, judging, API capabilities |
| `docs/02-idea-discovery.md` | 25 ideas across 8 categories |
| `docs/03-shortlist-comparison.md` | Shortlist scoring |
| `docs/04-recommendation.md` | Original recommendation and weaknesses |
| `docs/05-product-spec-and-architecture.md` | **Current** spec, architecture, stack |
| `docs/06-roadmap.md` | P0/P1 milestones and risks |
| `docs/07-community-and-judge-strategy.md` | Reassessment against stars/votes/judges; positioning |
| `docs/PROGRESS.md` | Live progress log |

## Stack

TypeScript · Next.js (App Router) · PGlite in a Web Worker · `fetch` to BharatCode `/responses` ·
Zod · Vitest (real PGlite in Node) · Playwright smoke test.

Commands are listed in `README.md` once the scaffold exists.
