/// <reference lib="webworker" />
import { PGlite } from '@electric-sql/pglite';
import { runPipeline, SetupError, type PipelineInput } from '../lib/harness/pipeline';
import type { Db } from '../lib/harness/types';
import type { AnalyzeRequest } from '../lib/model/schema';
import type { FromWorker, ToWorker } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

const post = (m: FromWorker) => self.postMessage(m);

class AnalyzeFailure extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

async function analyze(req: AnalyzeRequest) {
  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(req),
  });
  let body: { ok?: boolean; code?: string; message?: string; output?: unknown; model?: string } = {};
  try {
    body = await res.json();
  } catch {
    throw new AnalyzeFailure('upstream_error', `AI analysis failed (HTTP ${res.status}).`);
  }
  if (!res.ok || !body.ok) throw new AnalyzeFailure(body.code ?? 'upstream_error', body.message ?? `AI analysis failed (HTTP ${res.status}).`);
  // the server already validated the output; the pipeline treats it as untrusted anyway
  return { output: body.output as never, model: body.model ?? 'unknown' };
}

self.onmessage = async (e: MessageEvent<ToWorker>) => {
  if (e.data.type !== 'run') return;
  const input: PipelineInput = e.data.input;
  let db: PGlite | null = null;
  try {
    const report = await runPipeline(input, {
      createDb: async () => {
        db = await PGlite.create();
        return db as unknown as Db;
      },
      analyze,
      onProgress: (p) => post({ type: 'progress', progress: p }),
    });
    post({ type: 'result', report });
  } catch (err) {
    const stage = err instanceof SetupError ? err.stage : undefined;
    post({ type: 'error', message: (err as Error)?.message ?? String(err), stage });
  } finally {
    try {
      await (db as PGlite | null)?.close();
    } catch {
      /* ignore */
    }
  }
};
