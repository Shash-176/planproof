import { describe, expect, it } from 'vitest';
import { analyzeWithBharatCode, parseModelOutput, ModelError, type BharatCodeConfig } from '@/lib/model/bharatcode';
import { handleAnalyze } from '@/lib/model/handler';
import { RateLimiter } from '@/lib/model/rateLimit';
import type { AnalyzeRequest } from '@/lib/model/schema';

const req: AnalyzeRequest = { schemaSql: 'CREATE TABLE t (a int);', query: 'SELECT * FROM t WHERE a = 1', planSummary: 'Seq Scan on t', needsExtraction: false };

const good = { explanation: 'It scans the whole table.', candidates: [{ kind: 'index', sql: 'CREATE INDEX ON t (a)', rationale: 'Avoid the scan.', origin: 'model' }] };

const ok = (text: string, extra: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text }] }], ...extra }), { status: 200 });

function cfg(responses: (Response | 'hang' | Error)[], over: Partial<BharatCodeConfig> = {}) {
  const calls: { body: Record<string, unknown> }[] = [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    calls.push({ body: JSON.parse(String(init.body)) });
    const next = responses.shift() ?? new Response('{}', { status: 500 });
    if (next === 'hang')
      return new Promise<Response>((_, reject) => init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof fetch;
  const c: BharatCodeConfig = {
    apiKey: 'k', baseUrl: 'http://mock/v1', model: 'qwen-3.8-27b', timeoutMs: 50, deadlineMs: 5_000, maxRetries: 3, maxOutputTokens: 100,
    fetch: fetchImpl, sleep: async () => {}, random: () => 0, ...over,
  };
  return { c, calls };
}

describe('BharatCode client', () => {
  it('returns validated output and sends a stateless request with a JSON schema', async () => {
    const { c, calls } = cfg([ok(JSON.stringify(good))]);
    const r = await analyzeWithBharatCode(req, c);
    expect(r.output.candidates[0].sql).toBe('CREATE INDEX ON t (a)');
    expect(calls[0].body.store).toBe(false);
    expect((calls[0].body.text as { format: { type: string } }).format.type).toBe('json_schema');
  });

  it('retries on 503 and succeeds', async () => {
    const { c, calls } = cfg([new Response('', { status: 503 }), new Response('', { status: 503 }), ok(JSON.stringify(good))]);
    await expect(analyzeWithBharatCode(req, c)).resolves.toBeTruthy();
    expect(calls).toHaveLength(3);
  });

  it('gives up after the retry budget on persistent 503', async () => {
    const { c, calls } = cfg([503, 503, 503, 503, 503].map((s) => new Response('', { status: s })));
    await expect(analyzeWithBharatCode(req, c)).rejects.toMatchObject({ code: 'upstream_error' });
    expect(calls).toHaveLength(4);
  });

  it('times out a request that never answers', async () => {
    const { c } = cfg(['hang', 'hang', 'hang', 'hang']);
    await expect(analyzeWithBharatCode(req, c)).rejects.toMatchObject({ code: 'timeout' });
  });

  it('reports network failures', async () => {
    const { c } = cfg([new Error('ECONNREFUSED'), new Error('ECONNREFUSED'), new Error('ECONNREFUSED'), new Error('ECONNREFUSED')]);
    await expect(analyzeWithBharatCode(req, c)).rejects.toMatchObject({ code: 'upstream_error' });
  });

  it('does not retry an invalid key', async () => {
    const { c, calls } = cfg([new Response('', { status: 401 })]);
    await expect(analyzeWithBharatCode(req, c)).rejects.toMatchObject({ code: 'not_configured' });
    expect(calls).toHaveLength(1);
  });

  it('falls back to prompt-only JSON if structured output is rejected', async () => {
    const { c, calls } = cfg([new Response('bad format', { status: 400 }), ok(JSON.stringify(good))]);
    await analyzeWithBharatCode(req, c);
    expect(calls[1].body.text).toBeUndefined();
  });

  it('never uses truncated output', async () => {
    const { c } = cfg([new Response(JSON.stringify({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [] }), { status: 200 })]);
    await expect(analyzeWithBharatCode(req, c)).rejects.toMatchObject({ code: 'invalid_output' });
  });

  it('retries a failed run', async () => {
    const { c, calls } = cfg([new Response(JSON.stringify({ status: 'failed', error: { message: 'busy' } }), { status: 200 }), ok(JSON.stringify(good))]);
    await analyzeWithBharatCode(req, c);
    expect(calls).toHaveLength(2);
  });

  it('rejects malformed model output', async () => {
    const { c } = cfg([ok('Sure! Add an index on a.')]);
    await expect(analyzeWithBharatCode(req, c)).rejects.toBeInstanceOf(ModelError);
  });
});

describe('parseModelOutput', () => {
  it('accepts fenced JSON and JSON wrapped in prose', () => {
    expect(parseModelOutput('```json\n' + JSON.stringify(good) + '\n```').explanation).toBeTruthy();
    expect(parseModelOutput('Here you go: ' + JSON.stringify(good) + ' Hope it helps.').explanation).toBeTruthy();
  });
  it('rejects JSON with the wrong shape', () => {
    expect(() => parseModelOutput(JSON.stringify({ explanation: 'x', candidates: [{ kind: 'drop', sql: 'DROP TABLE t', rationale: '', origin: 'model' }] }))).toThrow(/expected format/);
    expect(() => parseModelOutput(JSON.stringify({ candidates: [] }))).toThrow();
  });
});

describe('/api/analyze handler', () => {
  it('reports when the key is not configured', async () => {
    const r = await handleAnalyze(req, { env: {}, clientKey: 'a' });
    expect(r.status).toBe(503);
    expect(r.body).toMatchObject({ ok: false, code: 'not_configured' });
  });

  it('validates the request body', async () => {
    const r = await handleAnalyze({ query: 'x' }, { env: { BHARATCODE_API_KEY: 'k' }, clientKey: 'a', limiter: new RateLimiter(10, 1000) });
    expect(r.status).toBe(400);
  });

  it('rate-limits per client', async () => {
    const limiter = new RateLimiter(1, 60_000);
    const { c } = cfg([ok(JSON.stringify(good))]);
    const deps = { env: { BHARATCODE_API_KEY: 'k' }, clientKey: 'same', limiter, configOverride: { fetch: c.fetch, sleep: c.sleep } };
    expect((await handleAnalyze(req, deps)).status).toBe(200);
    expect((await handleAnalyze(req, deps)).status).toBe(429);
  });

  it('maps upstream failures to a clean error', async () => {
    const { c } = cfg([new Response('', { status: 500 }), new Response('', { status: 500 }), new Response('', { status: 500 }), new Response('', { status: 500 })]);
    const r = await handleAnalyze(req, { env: { BHARATCODE_API_KEY: 'k' }, clientKey: 'b', limiter: new RateLimiter(10, 1000), configOverride: { fetch: c.fetch, sleep: c.sleep } });
    expect(r.status).toBe(502);
    expect(r.body).toMatchObject({ ok: false, code: 'upstream_error' });
  });
});
