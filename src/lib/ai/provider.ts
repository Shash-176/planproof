/**
 * Transport layer for chat-completion providers. A provider turns a system
 * prompt, a user prompt and a JSON Schema into raw text. It knows nothing
 * about SQL, PlanProof's output format or verification.
 *
 * One adapter covers every provider PlanProof supports, because Groq, Google
 * Gemini, OpenRouter and most others expose an OpenAI-compatible
 * POST /chat/completions endpoint with response_format: json_schema.
 */

export type ProviderErrorKind =
  | 'auth' // key missing, invalid or not allowed
  | 'rate_limited' // 429 or quota exhausted
  | 'timeout'
  | 'unavailable' // network error or 5xx
  | 'bad_request' // 400 the provider would repeat
  | 'invalid_output' // answered, but not usable
  | 'truncated'; // stopped by the token limit

export class ProviderError extends Error {
  constructor(
    public readonly kind: ProviderErrorKind,
    message: string,
    public readonly details: { provider?: string; status?: number; retryAfterMs?: number; requestId?: string } = {},
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export interface CompletionRequest {
  system: string;
  user: string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  signal: AbortSignal;
}

export interface CompletionResult {
  text: string;
  requestId?: string;
}

export interface ChatProvider {
  /** Stable id, e.g. "groq". */
  readonly id: string;
  readonly model: string;
  complete(req: CompletionRequest): Promise<CompletionResult>;
}

export interface OpenAICompatibleConfig {
  id: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Use json_schema with strict: true. If the provider rejects it, json_object is tried once. */
  strictSchema: boolean;
  /** Groq and OpenAI use max_completion_tokens; some compatible APIs only accept max_tokens. */
  maxTokensParam: 'max_completion_tokens' | 'max_tokens';
  maxTokens: number;
  /** Provider-specific parameters, e.g. reasoning controls. */
  extraBody?: Record<string, unknown>;
  fetch?: typeof fetch;
}

interface ChatCompletionBody {
  id?: string;
  choices?: { finish_reason?: string | null; message?: { content?: string | null; refusal?: string | null } }[];
  error?: { message?: string; code?: string | number; type?: string };
}

export function createOpenAICompatibleProvider(cfg: OpenAICompatibleConfig): ChatProvider {
  const doFetch = cfg.fetch ?? fetch;
  const url = `${cfg.baseUrl.replace(/\/+$/, '')}/chat/completions`;

  async function send(req: CompletionRequest, mode: 'json_schema' | 'json_object'): Promise<Response> {
    const body: Record<string, unknown> = {
      model: cfg.model,
      messages: [
        { role: 'system', content: mode === 'json_object' ? `${req.system}\n\nJSON Schema for your answer:\n${JSON.stringify(req.jsonSchema)}` : req.system },
        { role: 'user', content: req.user },
      ],
      [cfg.maxTokensParam]: cfg.maxTokens,
      response_format:
        mode === 'json_schema'
          ? { type: 'json_schema', json_schema: { name: req.schemaName, schema: req.jsonSchema, strict: cfg.strictSchema } }
          : { type: 'json_object' },
      stream: false,
      ...cfg.extraBody,
    };
    try {
      return await doFetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify(body),
        signal: req.signal,
      });
    } catch (e) {
      if ((e as Error)?.name === 'AbortError' || req.signal.aborted)
        throw new ProviderError('timeout', `${cfg.id} did not answer in time.`, { provider: cfg.id });
      throw new ProviderError('unavailable', `Could not reach ${cfg.id}: ${(e as Error)?.message ?? 'network error'}.`, { provider: cfg.id });
    }
  }

  return {
    id: cfg.id,
    model: cfg.model,
    async complete(req) {
      let res = await send(req, 'json_schema');
      if (res.status === 400) {
        const text = await safeText(res);
        if (/response_format|json_schema|schema/i.test(text) && !/json_validate_failed/i.test(text)) {
          // structured output not accepted for this model: ask for plain JSON instead
          res = await send(req, 'json_object');
        } else {
          throw classify(400, text, res, cfg.id);
        }
      }
      if (!res.ok) throw classify(res.status, await safeText(res), res, cfg.id);

      let json: ChatCompletionBody;
      try {
        json = (await res.json()) as ChatCompletionBody;
      } catch {
        throw new ProviderError('invalid_output', `${cfg.id} returned a body that is not JSON.`, { provider: cfg.id, requestId: requestIdOf(res) });
      }
      const choice = json.choices?.[0];
      if (!choice) throw new ProviderError('invalid_output', `${cfg.id} returned no choices.`, { provider: cfg.id, requestId: requestIdOf(res) });
      if (choice.finish_reason === 'length')
        throw new ProviderError('truncated', `${cfg.id}'s answer was cut off by the token limit.`, { provider: cfg.id, requestId: requestIdOf(res) });
      if (choice.message?.refusal) throw new ProviderError('invalid_output', `${cfg.id} refused: ${choice.message.refusal.slice(0, 200)}`, { provider: cfg.id });
      const text = choice.message?.content;
      if (!text) throw new ProviderError('invalid_output', `${cfg.id} returned an empty answer.`, { provider: cfg.id, requestId: requestIdOf(res) });
      return { text, requestId: requestIdOf(res) ?? json.id };
    },
  };
}

function requestIdOf(res: Response): string | undefined {
  return res.headers.get('x-request-id') ?? res.headers.get('x-groq-id') ?? undefined;
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 2_000);
  } catch {
    return '';
  }
}

export function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const s = Number(value);
  if (Number.isFinite(s) && s >= 0) return s * 1000;
  const d = Date.parse(value);
  return Number.isFinite(d) ? Math.max(0, d - Date.now()) : undefined;
}

function classify(status: number, body: string, res: Response, provider: string): ProviderError {
  const details = { provider, status, requestId: requestIdOf(res), retryAfterMs: parseRetryAfter(res.headers.get('retry-after')) };
  const short = extractMessage(body);
  if (status === 401 || status === 403) return new ProviderError('auth', `${provider} rejected the API key (HTTP ${status}).`, details);
  if (status === 429) return new ProviderError('rate_limited', `${provider} rate limit reached.`, details);
  if (status === 408 || status === 504) return new ProviderError('timeout', `${provider} timed out (HTTP ${status}).`, details);
  if (status >= 500) return new ProviderError('unavailable', `${provider} is unavailable (HTTP ${status}).`, details);
  if (/json_validate_failed/i.test(body)) return new ProviderError('invalid_output', `${provider}'s answer did not match the schema.`, details);
  return new ProviderError('bad_request', `${provider} rejected the request (HTTP ${status})${short ? `: ${short}` : ''}.`, details);
}

function extractMessage(body: string): string {
  try {
    const j = JSON.parse(body) as { error?: { message?: string } };
    return (j.error?.message ?? '').slice(0, 200);
  } catch {
    return body.slice(0, 200);
  }
}
