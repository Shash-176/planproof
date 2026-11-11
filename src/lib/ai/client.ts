import { AnalyzeErrorSchema, AnalyzeResponseSchema, type AiStatus, type AnalyzeRequest } from './schema';

/**
 * Browser-side client for /api/analyze. The response is validated again
 * here: the server is ours, but the content came from a model, and this is
 * the boundary where it enters the verification pipeline.
 */

export class AnalyzeClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AnalyzeClientError';
  }
}

export interface AnalyzeClientResult {
  output: import('./schema').AiOutput;
  provider: string;
  model: string;
  latencyMs: number;
}

export async function analyzeViaApi(
  req: AnalyzeRequest,
  opts: { endpoint?: string; timeoutMs?: number; fetch?: typeof fetch } = {},
): Promise<AnalyzeClientResult> {
  const doFetch = opts.fetch ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60_000);
  let res: Response;
  try {
    res = await doFetch(opts.endpoint ?? '/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
      signal: controller.signal,
    });
  } catch (e) {
    const aborted = (e as Error)?.name === 'AbortError';
    throw new AnalyzeClientError(aborted ? 'timeout' : 'network', aborted ? 'AI analysis took too long and was skipped.' : 'Could not reach the AI analysis service.');
  } finally {
    clearTimeout(timer);
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new AnalyzeClientError('upstream_error', `AI analysis failed (HTTP ${res.status}).`);
  }
  const ok = AnalyzeResponseSchema.safeParse(body);
  if (res.ok && ok.success) {
    return { output: ok.data.output, provider: ok.data.provider, model: ok.data.model, latencyMs: ok.data.latencyMs };
  }
  const err = AnalyzeErrorSchema.safeParse(body);
  if (err.success) throw new AnalyzeClientError(err.data.code, err.data.message);
  throw new AnalyzeClientError('invalid_output', 'AI analysis returned an unexpected response.');
}

export async function fetchAiStatus(fetchImpl: typeof fetch = fetch): Promise<AiStatus> {
  try {
    const res = await fetchImpl('/api/analyze', { method: 'GET' });
    if (!res.ok) return { configured: false, providers: [] };
    const j = (await res.json()) as AiStatus;
    return { configured: !!j.configured, providers: Array.isArray(j.providers) ? j.providers : [] };
  } catch {
    return { configured: false, providers: [] };
  }
}
