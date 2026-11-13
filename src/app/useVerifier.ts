'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PipelineInput, ProgressEvent } from '@/lib/harness/pipeline';
import type { Report } from '@/lib/harness/types';
import { DEFAULT_DB_STEP_LIMIT_MS, limitFromSearch, Watchdog } from '@/lib/watchdog';
import { recordWorkerUrl, refreshCachedScript } from '@/lib/workerLoader';
import type { FromWorker } from '@/worker/protocol';

export type RunState =
  | { status: 'idle' }
  | { status: 'running'; steps: ProgressEvent[]; startedAt: number }
  | { status: 'done'; report: Report; steps: ProgressEvent[] }
  | { status: 'error'; message: string; stage?: string; steps: ProgressEvent[] };

export function useVerifier() {
  const [state, setState] = useState<RunState>({ status: 'idle' });
  const workerRef = useRef<Worker | null>(null);
  const dogRef = useRef<Watchdog | null>(null);
  const limitRef = useRef(DEFAULT_DB_STEP_LIMIT_MS);
  const runIdRef = useRef(0);

  useEffect(() => {
    limitRef.current = limitFromSearch(window.location.search);
  }, []);

  const stop = useCallback(() => {
    runIdRef.current++;
    dogRef.current?.disarm();
    dogRef.current = null;
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  const run = useCallback(
    (input: PipelineInput) => {
      stop();
      const steps: ProgressEvent[] = [];
      const startedAt = Date.now();
      setState({ status: 'running', steps: [], startedAt });

      if (typeof WebAssembly === 'undefined' || typeof Worker === 'undefined') {
        setState({ status: 'error', stage: 'browser', message: 'This browser does not support WebAssembly or Web Workers, which PlanProof needs to run Postgres.', steps });
        return;
      }

      const runId = ++runIdRef.current;
      const dog = new Watchdog(limitRef.current, (label, limit) => {
        stop();
        setState({
          status: 'error',
          stage: 'timeout',
          message: `“${label}” ran for more than ${Math.round(limit / 1000)} seconds, so PlanProof stopped it. Postgres in the browser cannot cancel a query, so the whole sandbox was shut down.`,
          steps: [...steps],
        });
      });
      dogRef.current = dog;

      const launch = (attempt: number) => {
        const { worker, scriptUrl } = recordWorkerUrl(() => new Worker(new URL('../worker/pipeline.worker.ts', import.meta.url), { type: 'module' }));
        workerRef.current = worker;
        let heardFrom = false;

        worker.onmessage = (e: MessageEvent<FromWorker>) => {
          heardFrom = true;
          const m = e.data;
          if (m.type === 'progress') {
            steps.push(m.progress);
            dog.observe(m.progress);
            setState({ status: 'running', steps: [...steps], startedAt });
          } else if (m.type === 'result') {
            stop();
            setState({ status: 'done', report: m.report, steps: [...steps] });
          } else {
            stop();
            setState({ status: 'error', message: m.message, stage: m.stage, steps: [...steps] });
          }
        };
        worker.onerror = (e) => {
          // A worker that fails before saying anything most likely never loaded:
          // refresh its cached script once and try again (see workerLoader.ts).
          if (!heardFrom && attempt === 0 && scriptUrl) {
            e.preventDefault();
            worker.terminate();
            void refreshCachedScript(scriptUrl).then(() => {
              if (runIdRef.current === runId && workerRef.current === worker) launch(1);
            });
            return;
          }
          stop();
          setState({ status: 'error', stage: 'worker', message: e.message || 'The verification sandbox crashed.', steps: [...steps] });
        };
        dog.observe({ label: 'Starting Postgres', db: true });
        worker.postMessage({ type: 'run', input });
      };
      launch(0);
    },
    [stop],
  );

  const cancel = useCallback(() => {
    stop();
    setState({ status: 'idle' });
  }, [stop]);

  return { state, run, cancel };
}
