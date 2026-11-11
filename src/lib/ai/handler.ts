import { analyze, AnalysisFailed, DEFAULT_ANALYZE_OPTIONS, type AnalyzeOptions } from './analyze';
import { providersFromEnv } from './config';
import type { ChatProvider } from './provider';
import { RateLimiter } from './rateLimit';
import { AnalyzeRequestSchema, type AiStatus, type AnalyzeError, type AnalyzeResponse } from './schema';

/**
 * Framework-independent handler for /api/analyze so it can be tested without
 * a server. The Next.js route is a thin wrapper around it.
 */

// Per server instance. Serverless instances are short-lived, so this is a
// speed bump, not a quota; the provider's free-tier limit is the hard cap.
const perClient = new RateLimiter(8, 60_000);
const perInstance = new RateLimiter(120, 60 * 60_000);

export interface HandlerDeps {
  env: Record<string, string | undefined>;
  clientKey: string;
  /** Request Origin and the host it was sent to; cross-site calls are refused. */
  origin?: string | null;
  host?: string | null;
  limiter?: RateLimiter;
  globalLimiter?: RateLimiter;
  /** Tests inject providers directly. */
  providers?: ChatProvider[];
  options?: Partial<AnalyzeOptions>;
  log?: (msg: string) => void;
}

export function aiStatus(env: Record<string, string | undefined>): AiStatus {
  const { providers } = providersFromEnv(env);
  return { configured: providers.length > 0, providers: providers.map((p) => ({ provider: p.id, model: p.model })) };
}

export async function handleAnalyze(rawBody: unknown, deps: HandlerDeps): Promise<{ status: number; body: AnalyzeResponse | AnalyzeError }> {
  const log = deps.log ?? (() => {});
  if (deps.origin && deps.host && !sameHost(deps.origin, deps.host)) {
    return { status: 403, body: { ok: false, code: 'forbidden', message: 'Cross-site requests are not allowed.' } };
  }
  const resolved = deps.providers ? { providers: deps.providers, skipped: [] } : providersFromEnv(deps.env);
  if (resolved.providers.length === 0) {
    if (resolved.skipped.length) log(`AI not configured: ${resolved.skipped.join('; ')}`);
    return {
      status: 503,
      body: { ok: false, code: 'not_configured', message: 'AI analysis is not configured on this server. Pasted SQL is still verified.' },
    };
  }
  if (!(deps.limiter ?? perClient).allow(deps.clientKey) || !(deps.globalLimiter ?? perInstance).allow('all')) {
    return { status: 429, body: { ok: false, code: 'rate_limited', message: 'Too many AI requests. Try again in a minute; pasted SQL is still verified.' } };
  }
  const parsed = AnalyzeRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { status: 400, body: { ok: false, code: 'bad_request', message: `Invalid request: ${issue?.path.join('.') || 'body'} ${issue?.message ?? 'is invalid'}.` } };
  }
  try {
    const r = await analyze(parsed.data, resolved.providers, { ...DEFAULT_ANALYZE_OPTIONS, ...deps.options });
    if (r.fellBackFrom.length) log(`AI fallback used: ${r.fellBackFrom.join(' → ')} → ${r.provider}:${r.model}`);
    return { status: 200, body: { ok: true, output: r.output, provider: r.provider, model: r.model, latencyMs: Math.round(r.latencyMs), fellBackFrom: r.fellBackFrom } };
  } catch (e) {
    if (e instanceof AnalysisFailed) {
      log(`AI analysis failed: ${e.attempts.join('; ')}`);
      const code = e.kind === 'rate_limited' ? 'rate_limited' : e.kind === 'timeout' ? 'timeout' : e.kind === 'invalid_output' || e.kind === 'truncated' ? 'invalid_output' : e.kind === 'not_configured' ? 'not_configured' : 'upstream_error';
      const status = code === 'rate_limited' ? 429 : code === 'timeout' ? 504 : code === 'not_configured' ? 503 : 502;
      return { status, body: { ok: false, code, message: e.message } };
    }
    log(`AI analysis crashed: ${(e as Error)?.stack ?? String(e)}`);
    // never echo internal errors to the client
    return { status: 500, body: { ok: false, code: 'upstream_error', message: 'Unexpected error during AI analysis.' } };
  }
}

function sameHost(origin: string, host: string): boolean {
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
