/**
 * Recovery for a stale cached Web Worker script.
 *
 * The page is cross-origin isolated (COOP + COEP), and an isolated page
 * refuses to start a worker whose script response lacks a COEP header
 * (net::ERR_BLOCKED_BY_RESPONSE). Static assets are cached as immutable for a
 * year, and the bundler's worker loader keeps the same URL across releases,
 * so a browser that cached that script before the COEP header existed keeps
 * reusing a copy it will never start. This was found in production after
 * v1.0.0 and affects only returning visitors.
 *
 * The fix does not depend on the URL changing: when the worker fails before
 * sending any message, the app re-downloads its script once with
 * `cache: 'reload'`, which replaces the cached copy with the server's current
 * response (which has COEP), then starts the worker again.
 */

interface WorkerScope {
  Worker: typeof Worker;
}

export interface WorkerHandle {
  worker: Worker;
  /** The script URL the bundler generated, if the Worker constructor was reached. */
  scriptUrl?: string;
}

/**
 * Calls `create` (which must contain the bundler's `new Worker(new URL(…))`
 * expression) while recording the URL passed to the Worker constructor.
 */
export function recordWorkerUrl(create: () => Worker, scope: WorkerScope = globalThis as unknown as WorkerScope): WorkerHandle {
  const Native = scope.Worker;
  let scriptUrl: string | undefined;
  const Recording = function (url: string | URL, options?: WorkerOptions) {
    scriptUrl = String(url);
    return new Native(url, options);
  } as unknown as typeof Worker;
  scope.Worker = Recording;
  try {
    const worker = create();
    return { worker, scriptUrl };
  } finally {
    scope.Worker = Native;
  }
}

/** Re-downloads a script, bypassing and replacing the HTTP cache entry. Never throws. */
export async function refreshCachedScript(url: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await fetchImpl(url, { cache: 'reload', credentials: 'same-origin' });
    // read the body so the new response is fully stored before the worker is retried
    await res.arrayBuffer();
    return res.ok;
  } catch {
    return false;
  }
}
