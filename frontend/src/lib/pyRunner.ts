'use client';

/**
 * Runs practice code in the browser (Pyodide in a Web Worker).
 *
 * One worker is kept warm between runs. When a run goes over its time limit
 * the worker is terminated, which is the only way to stop an endless loop,
 * and a new one is started for the next run.
 */

export interface CaseResult {
  passed: boolean;
  actual?: unknown;
  error?: string;
  ms?: number;
}

export interface RunOutcome {
  results: CaseResult[];
  error: string | null;
  stdout: string;
  timedOut: boolean;
  // Index of the case that was running when time ran out
  timedOutIndex: number | null;
}

interface RunInput {
  harness: string;
  code: string;
  spec: unknown;
  cases: { args: unknown[]; expected: unknown }[];
  timeoutMs: number;
}

type Listener = (message: { id: number; type: string; [key: string]: unknown }) => void;

let worker: Worker | null = null;
let readyPromise: Promise<void> | null = null;
let nextId = 1;
const listeners = new Map<number, Listener>();

function startWorker() {
  worker = new Worker('/practice/py-worker.js');
  worker.onmessage = (event) => {
    const listener = listeners.get(event.data.id);
    if (listener) listener(event.data);
  };
  const id = nextId++;
  readyPromise = new Promise((resolve, reject) => {
    listeners.set(id, (message) => {
      listeners.delete(id);
      if (message.type === 'ready') resolve();
      else reject(new Error(String(message.error || 'Python failed to load')));
    });
  });
  worker.postMessage({ id, type: 'init' });
}

/** Start loading Python early (it is a large download the first time). */
export function warmUp(): Promise<void> {
  if (!worker || !readyPromise) startWorker();
  return readyPromise as Promise<void>;
}

export async function runPython(input: RunInput): Promise<RunOutcome> {
  await warmUp();
  const id = nextId++;
  let lastIndex: number | null = null;

  return new Promise<RunOutcome>((resolve) => {
    const timer = setTimeout(() => {
      listeners.delete(id);
      worker?.terminate();
      worker = null;
      readyPromise = null;
      resolve({ results: [], error: null, stdout: '', timedOut: true, timedOutIndex: lastIndex });
    }, input.timeoutMs);

    listeners.set(id, (message) => {
      if (message.type === 'progress') {
        lastIndex = Number(message.index);
        return;
      }
      clearTimeout(timer);
      listeners.delete(id);
      if (message.type === 'result') {
        const result = message.result as { results: CaseResult[]; error?: string; stdout?: string };
        resolve({
          results: result.results || [],
          error: result.error || null,
          stdout: result.stdout || '',
          timedOut: false,
          timedOutIndex: null,
        });
      } else {
        resolve({ results: [], error: String(message.error || 'Unknown error'), stdout: '', timedOut: false, timedOutIndex: null });
      }
    });

    worker?.postMessage({ id, type: 'run', harness: input.harness, code: input.code, spec: input.spec, cases: input.cases });
  });
}
