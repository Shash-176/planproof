'use client';

import { useCallback, useRef, useState } from 'react';
import type { PipelineInput, ProgressEvent } from '@/lib/harness/pipeline';
import type { Report } from '@/lib/harness/types';
import type { FromWorker } from '@/worker/protocol';

/** A database step that runs longer than this is stopped. PGlite ignores statement_timeout. */
export const DB_STEP_LIMIT_MS = 45_000;

export type RunState =
  | { status: 'idle' }
  | { status: 'running'; steps: ProgressEvent[] }
  | { status: 'done'; report: Report; steps: ProgressEvent[] }
  | { status: 'error'; message: string; stage?: string; steps: ProgressEvent[] };

export function useVerifier() {
  const [state, setState] = useState<RunState>({ status: 'idle' });
  const workerRef = useRef<Worker | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  const run = useCallback(
    (input: PipelineInput) => {
      stop();
      const steps: ProgressEvent[] = [];
      setState({ status: 'running', steps: [] });
      const worker = new Worker(new URL('../worker/pipeline.worker.ts', import.meta.url), { type: 'module' });
      workerRef.current = worker;

      const arm = (p: ProgressEvent) => {
        if (timerRef.current) clearTimeout(timerRef.current);
        if (!p.db) return;
        timerRef.current = setTimeout(() => {
          stop();
          setState({
            status: 'error',
            message: `A database step ("${p.label}") ran for more than ${DB_STEP_LIMIT_MS / 1000} seconds, so PlanProof stopped it. Try a smaller dataset or a simpler query.`,
            steps: [...steps],
          });
        }, DB_STEP_LIMIT_MS);
      };

      worker.onmessage = (e: MessageEvent<FromWorker>) => {
        const m = e.data;
        if (m.type === 'progress') {
          steps.push(m.progress);
          arm(m.progress);
          setState({ status: 'running', steps: [...steps] });
        } else if (m.type === 'result') {
          stop();
          setState({ status: 'done', report: m.report, steps: [...steps] });
        } else {
          stop();
          setState({ status: 'error', message: m.message, stage: m.stage, steps: [...steps] });
        }
      };
      worker.onerror = (e) => {
        stop();
        setState({ status: 'error', message: `The verification worker crashed: ${e.message || 'unknown error'}.`, steps: [...steps] });
      };
      arm({ step: 'setup', label: 'Starting Postgres in your browser', db: true });
      worker.postMessage({ type: 'run', input });
    },
    [stop],
  );

  return { state, run, cancel: () => { stop(); setState({ status: 'idle' }); } };
}
