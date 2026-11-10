import { AI_OUTPUT_JSON_SCHEMA, AiOutputSchema, type AiOutput, type AnalyzeRequest } from './schema';
import { SYSTEM_PROMPT, userPrompt } from './prompt';

/**
 * Client for the BharatCode model API (OpenAI-compatible /responses).
 * Documented behaviour this handles (bharatcode.ai/build, read 10 Nov 2026):
 * stateless (store must be false), shared capacity (503 = busy, retry),
 * truncation reported with HTTP 200 (status "incomplete"), and streams that
 * can end with response.failed. This client does not stream.
 */

export interface BharatCodeConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  /** Per-attempt timeout. */
  timeoutMs: number;
  /** Overall budget across retries. */
  deadlineMs: number;
  maxRetries: number;
  maxOutputTokens: number;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

export const DEFAULT_BASE_URL = 'https://bharatcode.ai/api/model/v1';
export const DEFAULT_MODEL = 'qwen-3.8-27b';

export class ModelError extends Error {
  constructor(
    public readonly code: 'not_configured' | 'upstream_error' | 'timeout' | 'invalid_output' | 'bad_request',
    message: string,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ModelError';
  }
}

export function configFromEnv(env: Record<string, string | undefined>): BharatCodeConfig | null {
  const apiKey = env.BHARATCODE_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: (env.BHARATCODE_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, ''),
    model: env.BHARATCODE_MODEL?.trim() || DEFAULT_MODEL,
    timeoutMs: Number(env.BHARATCODE_TIMEOUT_MS) || 45_000,
    deadlineMs: 55_000,
    maxRetries: 3,
    maxOutputTokens: 4_000,
  };
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

interface ResponsesBody {
  status?: string;
  output_text?: string;
  output?: { type?: string; content?: { type?: string; text?: string }[] }[];
  incomplete_details?: { reason?: string };
  error?: { message?: string } | null;
}

/** Text of a /responses result. Raw HTTP has no output_text helper, so both shapes are read. */
export function outputText(body: ResponsesBody): string {
  if (typeof body.output_text === 'string' && body.output_text.length) return body.output_text;
  const parts: string[] = [];
  for (const item of body.output ?? []) {
    if (item.type && item.type !== 'message') continue;
    for (const c of item.content ?? []) if ((c.type === 'output_text' || c.type === 'text') && c.text) parts.push(c.text);
  }
  return parts.join('');
}

/** Parse model text into validated output. Tolerates fences and surrounding prose. */
export function parseModelOutput(text: string): AiOutput {
  const attempts: string[] = [text.trim()];
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fence) attempts.push(fence[1].trim());
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last > first) attempts.push(text.slice(first, last + 1));
  let lastError = 'no JSON object found';
  for (const a of attempts) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(a);
    } catch {
      continue;
    }
    const r = AiOutputSchema.safeParse(parsed);
    if (r.success) return r.data;
    lastError = r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
  }
  throw new ModelError('invalid_output', `The model's answer did not match the expected format (${lastError}).`);
}

export async function analyzeWithBharatCode(req: AnalyzeRequest, cfg: BharatCodeConfig): Promise<{ output: AiOutput; model: string }> {
  const doFetch = cfg.fetch ?? fetch;
  const sleep = cfg.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const random = cfg.random ?? Math.random;
  const started = Date.now();

  let useFormat = true;
  let lastError: ModelError | null = null;

  for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
    const remaining = cfg.deadlineMs - (Date.now() - started);
    if (remaining <= 0) break;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(cfg.timeoutMs, remaining));
    const body: Record<string, unknown> = {
      model: cfg.model,
      store: false,
      max_output_tokens: cfg.maxOutputTokens,
      input: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt(req) },
      ],
    };
    if (useFormat) body.text = { format: { type: 'json_schema', name: 'planproof_analysis', schema: AI_OUTPUT_JSON_SCHEMA, strict: true } };

    let res: Response;
    try {
      res = await doFetch(`${cfg.baseUrl}/responses`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      const aborted = (e as Error)?.name === 'AbortError';
      lastError = new ModelError(aborted ? 'timeout' : 'upstream_error', aborted ? 'The BharatCode API did not answer in time.' : `Could not reach the BharatCode API: ${(e as Error).message}`);
      if (attempt < cfg.maxRetries) await sleep(backoff(attempt, random));
      continue;
    }
    clearTimeout(timer);
    const requestId = res.headers.get('x-request-id') ?? undefined;

    if (res.status === 401 || res.status === 403) {
      throw new ModelError('not_configured', `The BharatCode API rejected the key (HTTP ${res.status}).`, requestId);
    }
    if (res.status === 400 && useFormat) {
      // structured output may not be accepted for this model; retry once with prompt-only JSON
      useFormat = false;
      lastError = new ModelError('bad_request', 'The API rejected structured output; retried without it.', requestId);
      attempt--; // this retry does not count against the budget
      continue;
    }
    if (RETRYABLE.has(res.status)) {
      lastError = new ModelError('upstream_error', `The BharatCode API is busy (HTTP ${res.status}).`, requestId);
      if (attempt < cfg.maxRetries) await sleep(backoff(attempt, random, res.headers.get('retry-after')));
      continue;
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new ModelError('upstream_error', `The BharatCode API returned HTTP ${res.status}. ${text.slice(0, 200)}`.trim(), requestId);
    }

    let json: ResponsesBody;
    try {
      json = (await res.json()) as ResponsesBody;
    } catch {
      throw new ModelError('invalid_output', 'The BharatCode API returned a body that is not JSON.', requestId);
    }
    if (json.status === 'failed') {
      lastError = new ModelError('upstream_error', `The model run failed: ${json.error?.message ?? 'unknown reason'}.`, requestId);
      if (attempt < cfg.maxRetries) await sleep(backoff(attempt, random));
      continue;
    }
    if (json.status === 'incomplete') {
      // never use partial output
      throw new ModelError('invalid_output', `The model's answer was cut off (${json.incomplete_details?.reason ?? 'incomplete'}).`, requestId);
    }
    return { output: parseModelOutput(outputText(json)), model: cfg.model };
  }
  throw lastError ?? new ModelError('timeout', 'The BharatCode API did not answer in time.');
}

export function backoff(attempt: number, random: () => number, retryAfter?: string | null): number {
  const ra = retryAfter ? Number(retryAfter) : NaN;
  if (Number.isFinite(ra) && ra > 0) return Math.min(ra * 1000, 10_000);
  const base = 1000 * 2 ** attempt;
  return Math.min(base + Math.floor(random() * 500), 10_000);
}
