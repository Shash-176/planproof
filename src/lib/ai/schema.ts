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

/** What the model must return. Shape is validated strictly; see parse.ts. */
export const AiOutputSchema = z.object({
  explanation: z.string().min(1).max(1_200),
  candidates: z.array(AiCandidateSchema).max(5),
});
export type AiOutput = z.infer<typeof AiOutputSchema>;

/**
 * JSON Schema sent as response_format so providers that support constrained
 * decoding (strict mode) can enforce it. Written to the common subset that
 * strict modes accept: every property required, no additional properties,
 * no length/count keywords (those are enforced by Zod instead).
 */
export const AI_OUTPUT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['explanation', 'candidates'],
  properties: {
    explanation: { type: 'string', description: 'Plain English, at most 3 sentences: why the original query is slow.' },
    candidates: {
      type: 'array',
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

/** What /api/analyze returns on success. */
export const AnalyzeResponseSchema = z.object({
  ok: z.literal(true),
  output: AiOutputSchema,
  provider: z.string(),
  model: z.string(),
  latencyMs: z.number(),
  /** Earlier providers that failed before this one answered. */
  fellBackFrom: z.array(z.string()),
});
export type AnalyzeResponse = z.infer<typeof AnalyzeResponseSchema>;

export const ANALYZE_ERROR_CODES = ['not_configured', 'bad_request', 'forbidden', 'rate_limited', 'upstream_error', 'timeout', 'invalid_output'] as const;

export const AnalyzeErrorSchema = z.object({
  ok: z.literal(false),
  code: z.enum(ANALYZE_ERROR_CODES),
  message: z.string(),
});
export type AnalyzeError = z.infer<typeof AnalyzeErrorSchema>;

/** GET /api/analyze: lets the UI show whether AI analysis is available. */
export interface AiStatus {
  configured: boolean;
  providers: { provider: string; model: string }[];
}
