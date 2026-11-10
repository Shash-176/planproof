import { analyzeWithBharatCode, configFromEnv, ModelError, type BharatCodeConfig } from './bharatcode';
import { RateLimiter } from './rateLimit';
import { AnalyzeRequestSchema, type AnalyzeError, type AnalyzeResponse } from './schema';

/**
 * Framework-independent handler for POST /api/analyze, so it can be tested
 * without a running server. The Next.js route is a thin wrapper.
 */

const limiter = new RateLimiter(10, 60_000);

export interface HandlerDeps {
  env: Record<string, string | undefined>;
  clientKey: string;
  limiter?: RateLimiter;
  configOverride?: Partial<BharatCodeConfig>;
}

export async function handleAnalyze(rawBody: unknown, deps: HandlerDeps): Promise<{ status: number; body: AnalyzeResponse | AnalyzeError }> {
  const cfg = configFromEnv(deps.env);
  if (!cfg) {
    return { status: 503, body: { ok: false, code: 'not_configured', message: 'AI analysis is not configured on this server (BHARATCODE_API_KEY is not set). Pasted SQL is still verified.' } };
  }
  if (!(deps.limiter ?? limiter).allow(deps.clientKey)) {
    return { status: 429, body: { ok: false, code: 'rate_limited', message: 'Too many AI requests from this address. Try again in a minute.' } };
  }
  const parsed = AnalyzeRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return { status: 400, body: { ok: false, code: 'bad_request', message: `Invalid request: ${parsed.error.issues[0]?.message ?? 'bad input'}.` } };
  }
  try {
    const res = await analyzeWithBharatCode(parsed.data, { ...cfg, ...deps.configOverride });
    return { status: 200, body: { ok: true, output: res.output, model: res.model } };
  } catch (e) {
    if (e instanceof ModelError) {
      const code = e.code === 'bad_request' ? 'upstream_error' : e.code;
      const status = code === 'timeout' ? 504 : code === 'not_configured' ? 503 : 502;
      const suffix = e.requestId ? ` (request ${e.requestId})` : '';
      return { status, body: { ok: false, code, message: e.message + suffix } };
    }
    return { status: 500, body: { ok: false, code: 'upstream_error', message: 'Unexpected error while calling the model.' } };
  }
}
