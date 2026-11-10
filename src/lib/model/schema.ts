import { z } from 'zod';

/** What the browser sends to /api/analyze. Row values are never included. */
export const AnalyzeRequestSchema = z.object({
  schemaSql: z.string().min(1).max(20_000),
  query: z.string().min(1).max(10_000),
  suggestion: z.string().max(10_000).optional(),
  planSummary: z.string().max(8_000),
  needsExtraction: z.boolean(),
});
export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;

export const AiCandidateSchema = z.object({
  kind: z.enum(['index', 'rewrite']),
  sql: z.string().min(1).max(4_000),
  rationale: z.string().max(600),
  origin: z.enum(['user_suggestion', 'model']),
});

/** What the model must return. Validated strictly; anything else is rejected. */
export const AiOutputSchema = z.object({
  explanation: z.string().min(1).max(1_200),
  candidates: z.array(AiCandidateSchema).max(5),
});
export type AiOutput = z.infer<typeof AiOutputSchema>;

/** JSON Schema sent as text.format so the API can constrain decoding. */
export const AI_OUTPUT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['explanation', 'candidates'],
  properties: {
    explanation: { type: 'string', description: 'Plain English, at most 3 sentences: why the original query is slow.' },
    candidates: {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'sql', 'rationale', 'origin'],
        properties: {
          kind: { type: 'string', enum: ['index', 'rewrite'] },
          sql: { type: 'string', description: 'One CREATE INDEX statement, or one complete rewritten SELECT.' },
          rationale: { type: 'string', description: 'One sentence.' },
          origin: { type: 'string', enum: ['user_suggestion', 'model'] },
        },
      },
    },
  },
} as const;

/** What /api/analyze returns to the browser. */
export const AnalyzeResponseSchema = z.object({
  ok: z.literal(true),
  output: AiOutputSchema,
  model: z.string(),
});
export type AnalyzeResponse = z.infer<typeof AnalyzeResponseSchema>;

export const AnalyzeErrorSchema = z.object({
  ok: z.literal(false),
  code: z.enum(['not_configured', 'bad_request', 'rate_limited', 'upstream_error', 'timeout', 'invalid_output']),
  message: z.string(),
});
export type AnalyzeError = z.infer<typeof AnalyzeErrorSchema>;
