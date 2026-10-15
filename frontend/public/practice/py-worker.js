/* Runs student Python code in the browser with Pyodide, inside a Web Worker so
 * a slow or endless loop never freezes the page: the page terminates this
 * worker when time runs out and starts a fresh one. */
/* global importScripts, loadPyodide */

const PYODIDE_URL = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';

let pyodidePromise = null;
let harnessSource = null;
let harnessGlobals = null;

function ensurePyodide() {
  if (!pyodidePromise) {
    importScripts(`${PYODIDE_URL}pyodide.js`);
    pyodidePromise = loadPyodide({ indexURL: PYODIDE_URL });
  }
  return pyodidePromise;
}

function lastLine(message) {
  const lines = String(message || '').trim().split('\n').filter(Boolean);
  return lines.length ? lines[lines.length - 1] : 'Error';
}

self.onmessage = async (event) => {
  const { id, type } = event.data;

  if (type === 'init') {
    try {
      await ensurePyodide();
      self.postMessage({ id, type: 'ready' });
    } catch (err) {
      self.postMessage({ id, type: 'error', error: `Could not load Python: ${err.message}` });
    }
    return;
  }

  if (type !== 'run') return;

  const { harness, code, spec, cases } = event.data;
  let pyodide;
  try {
    pyodide = await ensurePyodide();
  } catch (err) {
    self.postMessage({ id, type: 'error', error: `Could not load Python: ${err.message}` });
    return;
  }

  try {
    if (harness !== harnessSource) {
      harnessGlobals = pyodide.globals.get('dict')();
      pyodide.runPython(harness, { globals: harnessGlobals });
      harnessSource = harness;
    }

    // A fresh namespace for every run, so nothing leaks between attempts
    const userGlobals = pyodide.globals.get('dict')();
    userGlobals.set('ListNode', harnessGlobals.get('ListNode'));
    userGlobals.set('TreeNode', harnessGlobals.get('TreeNode'));
    try {
      pyodide.runPython(code, { globals: userGlobals });
    } catch (err) {
      self.postMessage({ id, type: 'result', result: { results: [], error: lastLine(err.message), stdout: '' } });
      userGlobals.destroy();
      return;
    }

    const report = (index) => self.postMessage({ id, type: 'progress', index });
    const runTests = harnessGlobals.get('run_tests');
    const raw = runTests(userGlobals, JSON.stringify(spec), JSON.stringify(cases), report);
    runTests.destroy();
    userGlobals.destroy();
    self.postMessage({ id, type: 'result', result: JSON.parse(raw) });
  } catch (err) {
    self.postMessage({ id, type: 'result', result: { results: [], error: lastLine(err.message), stdout: '' } });
  }
};
