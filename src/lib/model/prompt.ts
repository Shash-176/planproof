import type { AnalyzeRequest } from './schema';

export const SYSTEM_PROMPT = `You are PlanProof's SQL analyst for PostgreSQL.

Your output is NOT trusted. Every statement you produce will be executed in a sandbox and checked:
results must stay identical and performance must measurably improve. So be precise rather than persuasive.

Return JSON only, matching the provided schema.

Rules:
- "explanation": at most 3 short sentences in plain English for a developer who cannot read query plans. Say why the original query is slow, using the plan you are given. No markdown.
- "candidates": each is exactly ONE statement:
  - kind "index": a single CREATE INDEX statement (no CONCURRENTLY, no IF NOT EXISTS).
  - kind "rewrite": one complete SELECT that must return exactly the same rows (and the same order if the original has ORDER BY) as the original.
- If a USER SUGGESTION is given and NEEDS_EXTRACTION is true, first convert the user's suggestion into candidates with origin "user_suggestion", faithfully, without improving or fixing it. If the suggestion contains no concrete SQL change, return no user_suggestion candidates.
- Then optionally add up to 2 of your own candidates with origin "model". Prefer one good index over several guesses.
- Never produce statements that modify data or drop anything.
- Use only tables and columns that exist in the schema.`;

export function userPrompt(req: AnalyzeRequest): string {
  return [
    'SCHEMA:',
    req.schemaSql,
    '',
    'ORIGINAL QUERY:',
    req.query,
    '',
    'MEASURED PLAN OF THE ORIGINAL QUERY:',
    req.planSummary,
    '',
    req.suggestion ? `USER SUGGESTION (from another AI assistant, may be prose or SQL):\n${req.suggestion}` : 'USER SUGGESTION: none',
    '',
    `NEEDS_EXTRACTION: ${req.needsExtraction}`,
  ].join('\n');
}
