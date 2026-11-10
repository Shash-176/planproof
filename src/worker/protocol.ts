import type { PipelineInput, ProgressEvent } from '../lib/harness/pipeline';
import type { Report } from '../lib/harness/types';

export type ToWorker = { type: 'run'; input: PipelineInput };

export type FromWorker =
  | { type: 'progress'; progress: ProgressEvent }
  | { type: 'result'; report: Report }
  | { type: 'error'; message: string; stage?: string };
