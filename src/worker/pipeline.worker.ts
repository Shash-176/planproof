/// <reference lib="webworker" />
import { PGlite } from '@electric-sql/pglite';
import { runPipeline, SetupError, type PipelineInput } from '../lib/harness/pipeline';
import type { Db } from '../lib/harness/types';
import { analyzeViaApi } from '../lib/ai/client';
import type { FromWorker, ToWorker } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

const post = (m: FromWorker) => self.postMessage(m);

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
      analyze: (req) => analyzeViaApi(req),
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
