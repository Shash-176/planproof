import { describe, expect, it } from 'vitest';
import { recordWorkerUrl, refreshCachedScript } from '@/lib/workerLoader';

/** Minimal stand-in for the browser's Worker constructor. */
class FakeWorker {
  static created: { url: string; options?: WorkerOptions }[] = [];
  constructor(url: string | URL, options?: WorkerOptions) {
    FakeWorker.created.push({ url: String(url), options });
  }
}

describe('recordWorkerUrl', () => {
  it('records the URL the bundler passes to the Worker constructor and restores the constructor', () => {
    const scope = { Worker: FakeWorker as unknown as typeof Worker };
    const { worker, scriptUrl } = recordWorkerUrl(() => new scope.Worker('/_next/static/chunks/turbopack-worker-abc.js', { type: 'module' }), scope);
    expect(scriptUrl).toBe('/_next/static/chunks/turbopack-worker-abc.js');
    expect(worker).toBeInstanceOf(FakeWorker);
    expect(scope.Worker).toBe(FakeWorker);
  });

  it('restores the constructor even if creating the worker throws', () => {
    const scope = { Worker: FakeWorker as unknown as typeof Worker };
    expect(() => recordWorkerUrl(() => { throw new Error('boom'); }, scope)).toThrow('boom');
    expect(scope.Worker).toBe(FakeWorker);
  });
});

describe('refreshCachedScript', () => {
  it('re-downloads the script bypassing the HTTP cache', async () => {
    const calls: RequestInit[] = [];
    const ok = await refreshCachedScript('/w.js', (async (_u: string, init: RequestInit) => {
      calls.push(init);
      return new Response('// worker');
    }) as unknown as typeof fetch);
    expect(ok).toBe(true);
    expect(calls[0].cache).toBe('reload');
  });

  it('never throws, so a failed refresh falls through to the normal error message', async () => {
    const failing = (async () => { throw new TypeError('offline'); }) as unknown as typeof fetch;
    await expect(refreshCachedScript('/w.js', failing)).resolves.toBe(false);
  });
});
