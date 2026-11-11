import { SYSTEM_PROMPT, userPrompt } from './prompt';
import { ProviderError, type ChatProvider } from './provider';
import { AI_OUTPUT_JSON_SCHEMA, AiOutputSchema, type AiOutput, type AnalyzeRequest } from './schema';

/**
 * Analysis service: builds the prompt, walks the provider chain, and turns
 * raw text into validated AiOutput. This is the only place that knows the
 * output format. The result is still untrusted: the verification pipeline
 * runs every candidate through the guard and the database.
 */

export interface AnalyzeOptions {
  /** Budget for one provider attempt. */
  attemptTimeoutMs: number;
  /** Budget for the whole chain, including retries. */
  deadlineMs: number;
  /** Extra attempts on the same provider for transient failures (5xx, network). */
  retriesPerProvider: number;
  /** Honour Retry-After only if it is at most this long; otherwise move on. */
  maxRetryAfterMs: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export const DEFAULT_ANALYZE_OPTIONS: AnalyzeOptions = {
  attemptTimeoutMs: 20_000,
  deadlineMs: 45_000,
  retriesPerProvider: 1,
  maxRetryAfterMs: 3_000,
};

export interface AnalyzeResult {
  output: AiOutput;
  provider: string;
  model: string;
  latencyMs: number;
  fellBackFrom: string[];
}

export class AnalysisFailed extends Error {
  constructor(
    public readonly kind: ProviderError['kind'] | 'not_configured',
    message: string,
    public readonly attempts: string[],
  ) {
    super(message);
    this.name = 'AnalysisFailed';
  }
}

/** Parse model text into validated output. Tolerates code fences and surrounding prose. */
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
    // more than five candidates is not a reason to discard a good answer
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { candidates?: unknown }).candidates))
      (parsed as { candidates: unknown[] }).candidates = (parsed as { candidates: unknown[] }).candidates.slice(0, 5);
    const r = AiOutputSchema.safeParse(parsed);
    if (r.success) return r.data;
    lastError = r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
  }
  throw new ProviderError('invalid_output', `The model's answer did not match the expected format (${lastError}).`);
}

const TRANSIENT = new Set<ProviderError['kind']>(['unavailable', 'timeout']);

export async function analyze(req: AnalyzeRequest, chain: ChatProvider[], opts: AnalyzeOptions = DEFAULT_ANALYZE_OPTIONS): Promise<AnalyzeResult> {
  if (chain.length === 0) throw new AnalysisFailed('not_configured', 'No AI provider is configured.', []);
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const now = opts.now ?? Date.now;
  const started = now();
  const attempts: string[] = [];
  const failedProviders: string[] = [];
  let last: ProviderError | null = null;
  const system = SYSTEM_PROMPT;
  const user = userPrompt(req);

  for (const p of chain) {
    const label = `${p.id}:${p.model}`;
    for (let attempt = 0; attempt <= opts.retriesPerProvider; attempt++) {
      const remaining = opts.deadlineMs - (now() - started);
      if (remaining <= 0) throw new AnalysisFailed('timeout', 'AI analysis ran out of time.', attempts);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.min(opts.attemptTimeoutMs, remaining));
      const t0 = now();
      try {
        const res = await p.complete({ system, user, schemaName: 'planproof_analysis', jsonSchema: AI_OUTPUT_JSON_SCHEMA as unknown as Record<string, unknown>, signal: controller.signal });
        const output = parseModelOutput(res.text);
        return { output, provider: p.id, model: p.model, latencyMs: now() - t0, fellBackFrom: failedProviders };
      } catch (e) {
        // unknown exceptions are bugs, not provider answers: never pass their text on
        const err = e instanceof ProviderError ? e : new ProviderError('unavailable', 'Unexpected error while calling the provider.');
        last = err;
        attempts.push(`${label}: ${err.kind}`);
        const retryAfter = err.details.retryAfterMs;
        const canRetrySame =
          attempt < opts.retriesPerProvider &&
          (TRANSIENT.has(err.kind) || (err.kind === 'rate_limited' && retryAfter !== undefined && retryAfter <= opts.maxRetryAfterMs));
        if (!canRetrySame) break; // auth, bad request, invalid output, long rate limit: next provider
        await sleep(err.kind === 'rate_limited' ? retryAfter! : 500 * 2 ** attempt);
      } finally {
        clearTimeout(timer);
      }
    }
    failedProviders.push(label);
  }
  throw new AnalysisFailed(last?.kind ?? 'unavailable', summarise(last, chain.length), attempts);
}

function summarise(last: ProviderError | null, n: number): string {
  const which = n > 1 ? `All ${n} configured AI providers failed.` : 'The AI provider failed.';
  if (!last) return which;
  switch (last.kind) {
    case 'rate_limited':
      return `${which} The free-tier rate limit was reached; try again in a minute.`;
    case 'timeout':
      return `${which} The provider did not answer in time.`;
    case 'auth':
      return `${which} The server's API key was rejected.`;
    case 'invalid_output':
    case 'truncated':
      return `${which} The model's answer could not be used.`;
    default:
      return `${which} ${last.message}`;
  }
}
