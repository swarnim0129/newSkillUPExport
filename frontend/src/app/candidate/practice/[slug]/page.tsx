'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import {
    AlertTriangle,
    ArrowLeft,
    CheckCircle2,
    Gauge,
    Lightbulb,
    Loader2,
    Play,
    RotateCcw,
    Send,
    Sparkles,
    Terminal,
    XCircle,
} from 'lucide-react';
import { errorMessage } from '@/lib/journeyApi';
import {
    getHint,
    getProblem,
    submitAttempt,
    type AttemptResponse,
    type ProblemResponse,
    type SubmissionFailure,
    type SubmissionResults,
} from '@/lib/practiceApi';
import { runPython, warmUp, type CaseResult } from '@/lib/pyRunner';

const card = 'bg-white dark:bg-[var(--soft-surface)] rounded-2xl shadow-sm dark:shadow-black/20 border border-slate-200 dark:border-[var(--soft-line)]';
const panel = 'rounded-xl border border-slate-200 dark:border-[var(--soft-line)] bg-slate-50 dark:bg-[var(--soft-sunken)]';
const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-black';
const primaryButton = `inline-flex items-center justify-center gap-2 min-h-11 px-4 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors ${focusRing}`;
const secondaryButton = `inline-flex items-center justify-center gap-2 min-h-11 px-4 rounded-lg border border-slate-300 dark:border-[var(--soft-line)] text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[var(--soft-raised)] disabled:opacity-60 disabled:cursor-not-allowed transition-colors ${focusRing}`;

const RUN_LIMIT_MS = 8000;
const SUBMIT_LIMIT_MS = 15000;
const INDENT = '    ';

const DIFFICULTY_CLASS = {
    easy: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
    medium: 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300',
    hard: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300',
};

function show(value: unknown, max = 300) {
    let text: string;
    try {
        text = JSON.stringify(value);
    } catch {
        text = String(value);
    }
    if (text === undefined) text = 'None';
    return text.length > max ? `${text.slice(0, max)}…` : text;
}

function formatDate(value: string | null) {
    return value ? new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}

type RunCase = { args: unknown[]; expected: unknown; kind: 'example' | 'hidden' | 'large' };

function draftKey(slug: string) {
    return `skillup-dsa-draft-${slug}`;
}

type RunView =
    | { mode: 'run'; results: CaseResult[]; error: string | null; stdout: string; timedOut: boolean }
    | { mode: 'submit'; outcome: SubmissionResults; stdout: string; server: AttemptResponse | null; serverError: string };

export default function ProblemPage() {
    const params = useParams<{ slug: string }>();
    const slug = params.slug;
    const { getToken, isLoaded, isSignedIn } = useAuth();

    const [data, setData] = useState<ProblemResponse | null>(null);
    const [loadError, setLoadError] = useState('');
    const [code, setCode] = useState('');
    const [pythonState, setPythonState] = useState<'loading' | 'ready' | 'failed'>('loading');
    const [busy, setBusy] = useState<'' | 'run' | 'submit' | 'hint'>('');
    const [view, setView] = useState<RunView | null>(null);
    const [hints, setHints] = useState<string[]>([]);
    const [hintCredit, setHintCredit] = useState<number | null>(null);
    const [hintError, setHintError] = useState('');
    const startedAt = useRef(Date.now());
    const resultRef = useRef<HTMLDivElement>(null);

    const load = useCallback(async () => {
        try {
            const response = await getProblem(await getToken(), slug);
            setData(response);
            setHints(response.progress.hints || []);
            let draft: string | null = null;
            try {
                draft = localStorage.getItem(draftKey(slug));
            } catch {
                draft = null;
            }
            setCode(draft || response.lastCode || response.problem.starterCode);
            setLoadError('');
        } catch (err) {
            setLoadError(errorMessage(err, 'Could not load this problem.'));
        }
    }, [getToken, slug]);

    useEffect(() => {
        if (isLoaded && isSignedIn) load();
    }, [isLoaded, isSignedIn, load]);

    // Python is a large download the first time, so start it while the student reads
    useEffect(() => {
        warmUp().then(() => setPythonState('ready')).catch(() => setPythonState('failed'));
    }, []);

    const saveDraft = (value: string) => {
        setCode(value);
        try {
            localStorage.setItem(draftKey(slug), value);
        } catch {
            /* storage may be unavailable; the draft simply is not kept */
        }
    };

    const scrollToResults = () => {
        requestAnimationFrame(() => resultRef.current?.focus());
    };

    const runExamples = async () => {
        if (!data) return;
        setBusy('run');
        const outcome = await runPython({
            harness: data.harness,
            code,
            spec: data.problem.spec,
            cases: data.problem.examples,
            timeoutMs: RUN_LIMIT_MS,
        });
        if (outcome.timedOut) setPythonState('loading');
        setView({ mode: 'run', results: outcome.results, error: outcome.error, stdout: outcome.stdout, timedOut: outcome.timedOut });
        setBusy('');
        scrollToResults();
        if (outcome.timedOut) warmUp().then(() => setPythonState('ready')).catch(() => setPythonState('failed'));
    };

    const submit = async () => {
        if (!data) return;
        setBusy('submit');
        const examples: RunCase[] = data.problem.examples.map((c) => ({ args: c.args, expected: c.expected, kind: 'example' }));
        const hidden: RunCase[] = data.problem.hiddenCases.map((c) => ({ args: c.args, expected: c.expected, kind: c.kind || 'hidden' }));
        const cases = [...examples, ...hidden];

        const outcome = await runPython({ harness: data.harness, code, spec: data.problem.spec, cases, timeoutMs: SUBMIT_LIMIT_MS });

        const failures: SubmissionFailure[] = [];
        outcome.results.forEach((r, i) => {
            if (!r.passed && failures.length < 3) {
                failures.push({ args: cases[i].args, expected: cases[i].expected, actual: r.actual, error: r.error || null, kind: cases[i].kind });
            }
        });
        const results: SubmissionResults = {
            total: cases.length,
            passedCount: outcome.timedOut ? Math.max(0, outcome.timedOutIndex ?? 0) : outcome.results.filter((r) => r.passed).length,
            failures,
            error: outcome.error,
            timedOut: outcome.timedOut,
            timedOutKind: outcome.timedOut && outcome.timedOutIndex !== null ? cases[outcome.timedOutIndex]?.kind ?? null : outcome.timedOut ? 'example' : null,
        };

        let server: AttemptResponse | null = null;
        let serverError = '';
        try {
            server = await submitAttempt(await getToken(), slug, {
                code,
                results,
                timeSpentSec: Math.round((Date.now() - startedAt.current) / 1000),
            });
            if (server.passed) {
                setHints([]);
                setHintCredit(null);
                startedAt.current = Date.now();
            }
        } catch (err) {
            serverError = errorMessage(err, 'Your code ran, but the result could not be saved. Please submit again.');
        }

        setView({ mode: 'submit', outcome: results, stdout: outcome.stdout, server, serverError });
        setBusy('');
        scrollToResults();
        if (outcome.timedOut) {
            setPythonState('loading');
            warmUp().then(() => setPythonState('ready')).catch(() => setPythonState('failed'));
        }
    };

    const nextHint = async () => {
        setBusy('hint');
        setHintError('');
        try {
            const result = await getHint(await getToken(), slug, code);
            setHints(result.hints);
            if (typeof result.creditIfSolvedNow === 'number') setHintCredit(result.creditIfSolvedNow);
        } catch (err) {
            setHintError(errorMessage(err, 'Could not get a hint right now.'));
        } finally {
            setBusy('');
        }
    };

    const resetCode = () => {
        if (data) saveDraft(data.problem.starterCode);
    };

    if (loadError) {
        return (
            <div className="max-w-xl mx-auto mt-16 text-center">
                <AlertTriangle className="h-8 w-8 mx-auto text-red-500" aria-hidden="true" />
                <p className="mt-3 text-sm text-slate-700 dark:text-slate-300" role="alert">{loadError}</p>
                <Link href="/candidate/practice" className={`${secondaryButton} mt-4`}>Back to Practice</Link>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-live="polite">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" aria-hidden="true" />
                <span className="sr-only">Loading problem</span>
            </div>
        );
    }

    const { problem, progress } = data;

    return (
        <div className="space-y-4 pb-10">
            <Link href={`/candidate/practice?focus=${problem.pattern}`} className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white ${focusRing}`}>
                <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {problem.patternName}
            </Link>

            <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">{problem.title}</h1>
                <span className={`rounded px-2 py-0.5 text-xs font-semibold capitalize ${DIFFICULTY_CLASS[problem.difficulty]}`}>{problem.difficulty}</span>
                {progress.solved && !progress.due && (
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Solved · next review {formatDate(progress.nextReviewAt)}
                    </span>
                )}
                {progress.due && (
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-amber-700 dark:text-amber-400">
                        <RotateCcw className="h-4 w-4" aria-hidden="true" /> Due for review
                    </span>
                )}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                {/* Left: problem, hints, results */}
                <div className="space-y-4 min-w-0">
                    <section className={`${card} p-5`} aria-labelledby="statement-heading">
                        <h2 id="statement-heading" className="sr-only">Problem</h2>
                        <p className="text-sm leading-relaxed text-slate-800 dark:text-slate-200 whitespace-pre-line">
                            {problem.statement.split('`').map((part, i) => (i % 2 ? <code key={i} className="rounded bg-slate-100 dark:bg-[var(--soft-raised)] px-1 py-0.5 font-mono text-[13px]">{part}</code> : part))}
                        </p>
                        {problem.constraints.length > 0 && (
                            <ul className="mt-3 list-disc pl-5 text-xs text-slate-600 dark:text-slate-400">
                                {problem.constraints.map((c) => <li key={c}><code className="font-mono">{c}</code></li>)}
                            </ul>
                        )}
                        <h3 className="mt-4 text-sm font-semibold text-slate-900 dark:text-white">Examples</h3>
                        <ul className="mt-2 space-y-2">
                            {problem.examples.map((example, i) => (
                                <li key={i} className={`${panel} p-3 font-mono text-xs text-slate-800 dark:text-slate-200 overflow-x-auto`}>
                                    <div><span className="text-slate-500">Input: </span>{problem.params.map((p, j) => `${p.name} = ${show(example.args[j], 200)}`).join(', ')}</div>
                                    <div><span className="text-slate-500">Output: </span>{show(example.expected, 200)}</div>
                                </li>
                            ))}
                        </ul>
                        {problem.complexity && (
                            <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                                <Gauge className="h-3.5 w-3.5" aria-hidden="true" /> Target: {problem.complexity}
                            </p>
                        )}
                    </section>

                    <section className={`${card} p-5`} aria-labelledby="hints-heading">
                        <h2 id="hints-heading" className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                            <Lightbulb className="h-4 w-4 text-amber-500" aria-hidden="true" /> Coach hints ({hints.length} of 3)
                        </h2>
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                            A nudge, then the approach, then pseudocode. Each hint lowers the credit this problem gives your pattern level.
                        </p>
                        {hints.length > 0 && (
                            <ol className="mt-3 space-y-2">
                                {hints.map((hint, i) => (
                                    <li key={i} className={`${panel} p-3 text-sm text-slate-800 dark:text-slate-200`}>
                                        <span className="font-semibold">Hint {i + 1}: </span>{hint}
                                    </li>
                                ))}
                            </ol>
                        )}
                        {hintCredit !== null && (
                            <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">Solving now earns {Math.round(hintCredit * 100)}% credit.</p>
                        )}
                        {hintError && <p className="mt-2 text-sm text-red-600 dark:text-red-400" role="alert">{hintError}</p>}
                        {hints.length < 3 && (
                            <button className={`${secondaryButton} mt-3`} onClick={nextHint} disabled={!!busy}>
                                {busy === 'hint' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Lightbulb className="h-4 w-4" aria-hidden="true" />}
                                Show hint {hints.length + 1}
                            </button>
                        )}
                    </section>

                    <div ref={resultRef} tabIndex={-1} className="outline-none" aria-live="polite">
                        {view && <ResultsPanel view={view} problem={problem} />}
                    </div>
                </div>

                {/* Right: editor */}
                <div className="lg:sticky lg:top-0 lg:self-start space-y-3 min-w-0">
                    <CodeEditor value={code} onChange={saveDraft} label={`Python solution for ${problem.title}`} />
                    <div className="flex flex-wrap items-center gap-2">
                        <button className={secondaryButton} onClick={runExamples} disabled={!!busy || pythonState !== 'ready'}>
                            {busy === 'run' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
                            Run examples
                        </button>
                        <button className={primaryButton} onClick={submit} disabled={!!busy || pythonState !== 'ready'}>
                            {busy === 'submit' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
                            Submit
                        </button>
                        <button className={`${secondaryButton} ml-auto`} onClick={resetCode} disabled={!!busy}>
                            Reset code
                        </button>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400" role="status">
                        {pythonState === 'loading' && (
                            <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Loading Python in your browser. The first time takes around ten seconds.</span>
                        )}
                        {pythonState === 'ready' && 'Python is ready. Submit runs the examples plus hidden and large tests.'}
                        {pythonState === 'failed' && 'Python could not load. Check your connection and reload the page.'}
                    </p>
                </div>
            </div>
        </div>
    );
}

/* ─── Editor ──────────────────────────────────────────────────────────────── */

function CodeEditor({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const gutterRef = useRef<HTMLDivElement>(null);
    // After Escape, Tab moves focus out of the editor instead of indenting
    const escaped = useRef(false);
    const lines = value.split('\n').length;

    const replaceSelection = (text: string, cursorOffset = text.length) => {
        const el = textareaRef.current;
        if (!el) return;
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const next = value.slice(0, start) + text + value.slice(end);
        onChange(next);
        requestAnimationFrame(() => {
            el.selectionStart = el.selectionEnd = start + cursorOffset;
        });
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Escape') {
            escaped.current = true;
            return;
        }
        if (e.key === 'Tab' && !escaped.current) {
            e.preventDefault();
            replaceSelection(INDENT);
            return;
        }
        escaped.current = false;
        if (e.key === 'Enter') {
            // Keep the current indentation, and indent one level after a colon
            const el = e.currentTarget;
            const before = value.slice(0, el.selectionStart);
            const line = before.slice(before.lastIndexOf('\n') + 1);
            const indent = (line.match(/^\s*/) || [''])[0] + (line.trimEnd().endsWith(':') ? INDENT : '');
            e.preventDefault();
            replaceSelection(`\n${indent}`);
        }
    };

    return (
        <div className={`${card} overflow-hidden`}>
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-[var(--soft-line)] px-4 py-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <Terminal className="h-3.5 w-3.5" aria-hidden="true" /> Python 3
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">Tab indents · Esc then Tab leaves the editor</span>
            </div>
            <div className="flex h-[26rem] lg:h-[32rem]">
                <div
                    ref={gutterRef}
                    aria-hidden="true"
                    className="select-none overflow-hidden bg-slate-50 dark:bg-[var(--soft-sunken)] py-3 pl-3 pr-2 text-right font-mono text-[13px] leading-6 text-slate-400"
                >
                    {Array.from({ length: lines }, (_, i) => <div key={i}>{i + 1}</div>)}
                </div>
                <textarea
                    ref={textareaRef}
                    aria-label={label}
                    spellCheck={false}
                    autoCapitalize="off"
                    autoComplete="off"
                    autoCorrect="off"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={onKeyDown}
                    onScroll={(e) => {
                        if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop;
                    }}
                    className="flex-1 resize-none bg-white dark:bg-[var(--soft-surface)] p-3 font-mono text-[13px] leading-6 text-slate-900 dark:text-slate-100 outline-none whitespace-pre overflow-auto focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
                />
            </div>
        </div>
    );
}

/* ─── Results ─────────────────────────────────────────────────────────────── */

function ResultsPanel({ view, problem }: { view: RunView; problem: ProblemResponse['problem'] }) {
    if (view.mode === 'run') {
        return (
            <section className={`${card} p-5`} aria-label="Example results">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">Example results</h2>
                {view.timedOut && <Notice tone="warn" text={`Still running after ${RUN_LIMIT_MS / 1000} seconds, so it was stopped. Look for a loop that never ends.`} />}
                {view.error && <Notice tone="error" text={view.error} />}
                <ul className="mt-3 space-y-2">
                    {view.results.map((r, i) => (
                        <CaseRow key={i} index={i} passed={r.passed} args={problem.examples[i].args} expected={problem.examples[i].expected} actual={r.actual} error={r.error} params={problem.params} />
                    ))}
                </ul>
                {view.stdout && <Output text={view.stdout} />}
            </section>
        );
    }

    const { outcome, server, serverError } = view;
    const passed = server ? server.passed : outcome.passedCount === outcome.total && !outcome.error && !outcome.timedOut;

    return (
        <section className={`${card} p-5 space-y-3`} aria-label="Submission result">
            <h2 className={`inline-flex items-center gap-2 text-lg font-bold ${passed ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
                {passed ? <CheckCircle2 className="h-5 w-5" aria-hidden="true" /> : <XCircle className="h-5 w-5" aria-hidden="true" />}
                {passed ? 'Accepted' : 'Not accepted yet'}
                <span className="text-sm font-medium text-slate-600 dark:text-slate-400">({outcome.passedCount} of {outcome.total} tests)</span>
            </h2>

            {outcome.timedOut && (
                <Notice tone="warn" text={outcome.timedOutKind === 'large' ? 'Correct so far, but too slow on a large input.' : 'Stopped: the code did not finish in time.'} />
            )}
            {outcome.error && <Notice tone="error" text={outcome.error} />}
            {serverError && <Notice tone="error" text={serverError} />}

            {server && server.passed && (
                <div className={`${panel} p-3 text-sm text-slate-800 dark:text-slate-200 space-y-1`}>
                    <p>Credit for this solve: <strong>{Math.round(server.credit * 100)}%</strong>{server.credit < 1 ? ' (hints and earlier failed tries lower it; a clean re-solve later raises it)' : ''}.</p>
                    <p>{server.pattern.name} is now at <strong>{server.pattern.level}/100</strong>.</p>
                    {server.nextReviewAt && <p>Solve it again around <strong>{formatDate(server.nextReviewAt)}</strong> to lock it in{server.reviewChange === 'advanced' ? ' (review interval extended)' : ''}.</p>}
                    {server.complexity && <p className="inline-flex items-center gap-1.5"><Gauge className="h-4 w-4" aria-hidden="true" /> Expected complexity: {server.complexity}</p>}
                </div>
            )}

            {server && server.mistake && (
                <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm">
                    <p className="inline-flex items-center gap-1.5 font-semibold text-amber-900 dark:text-amber-200">
                        <AlertTriangle className="h-4 w-4" aria-hidden="true" /> {server.mistake.label}
                    </p>
                    {server.mistake.explanation && <p className="mt-1 text-amber-900 dark:text-amber-100">{server.mistake.explanation}</p>}
                    {server.mistake.fixHint && <p className="mt-1 text-amber-900 dark:text-amber-100"><span className="font-semibold">Try:</span> {server.mistake.fixHint}</p>}
                    {server.reviewChange === 'reset' && <p className="mt-1 text-amber-900 dark:text-amber-100">This was a review, so it comes back tomorrow.</p>}
                </div>
            )}

            {server && server.drill && (
                <p className="inline-flex items-start gap-1.5 text-sm text-blue-800 dark:text-blue-300">
                    <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                    <span>Added to your plan: <strong>{server.drill.title}</strong>. {server.drill.reason}</span>
                </p>
            )}

            {outcome.failures.length > 0 && (
                <ul className="space-y-2">
                    {outcome.failures.slice(0, 1).map((f, i) => (
                        <CaseRow key={i} index={i} label={f.kind === 'large' ? 'Large test' : f.kind === 'example' ? 'Example' : 'Hidden test'} passed={false} args={f.args} expected={f.expected} actual={f.actual} error={f.error || undefined} params={problem.params} />
                    ))}
                </ul>
            )}
            {view.stdout && <Output text={view.stdout} />}
        </section>
    );
}

function CaseRow({
    index,
    label,
    passed,
    args,
    expected,
    actual,
    error,
    params,
}: {
    index: number;
    label?: string;
    passed: boolean;
    args: unknown[];
    expected: unknown;
    actual?: unknown;
    error?: string;
    params: { name: string }[];
}) {
    return (
        <li className={`${panel} p-3 text-xs font-mono overflow-x-auto`}>
            <p className={`mb-1 inline-flex items-center gap-1.5 font-sans text-sm font-semibold ${passed ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
                {passed ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <XCircle className="h-4 w-4" aria-hidden="true" />}
                {label || `Example ${index + 1}`}: {passed ? 'passed' : 'failed'}
            </p>
            <div className="text-slate-800 dark:text-slate-200"><span className="text-slate-500">Input: </span>{params.map((p, j) => `${p.name} = ${show(args[j])}`).join(', ')}</div>
            <div className="text-slate-800 dark:text-slate-200"><span className="text-slate-500">Expected: </span>{show(expected)}</div>
            {error ? (
                <div className="text-red-700 dark:text-red-400"><span className="text-slate-500">Error: </span>{error}</div>
            ) : (
                <div className="text-slate-800 dark:text-slate-200"><span className="text-slate-500">Got: </span>{show(actual)}</div>
            )}
        </li>
    );
}

function Notice({ tone, text }: { tone: 'warn' | 'error'; text: string }) {
    const cls = tone === 'warn'
        ? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-100'
        : 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300';
    return (
        <p className={`mt-2 flex items-start gap-2 rounded-lg border p-3 text-sm ${cls}`} role="alert">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
            <span className="font-mono text-xs break-words">{text}</span>
        </p>
    );
}

function Output({ text }: { text: string }) {
    return (
        <details className="mt-3">
            <summary className={`min-h-11 cursor-pointer text-sm font-semibold text-slate-700 dark:text-slate-300 ${focusRing} rounded`}>Printed output</summary>
            <pre className={`${panel} mt-2 max-h-48 overflow-auto p-3 text-xs text-slate-800 dark:text-slate-200`}>{text}</pre>
        </details>
    );
}
