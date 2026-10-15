'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import {
    AlertTriangle,
    ArrowRight,
    BookMarked,
    Calculator,
    CheckCircle2,
    Circle,
    CircleDashed,
    Code2,
    FlaskConical,
    Loader2,
    Lock,
    NotebookPen,
    RotateCcw,
    Sparkles,
    Trophy,
    XCircle,
    type LucideIcon,
    Dna,
    Siren,
    Camera,
} from 'lucide-react';
import { errorMessage } from '@/lib/journeyApi';
import DnaTab from '@/components/grow/DnaTab';
import PanicTab from '@/components/grow/PanicTab';
import SnapTab from '@/components/grow/SnapTab';
import {
    createLabSet,
    getDsaOverview,
    getLab,
    submitLabSet,
    type DsaOverview,
    type Journal,
    type LabResult,
    type LabSet,
    type LabSubject,
    type Pattern,
    type PatternStatus,
    type ProblemStatus,
} from '@/lib/practiceApi';
import { scrollIntoPanel } from '@/lib/scroll';

/* ─── Shared styles (match the other candidate pages) ─────────────────────── */

const card = 'bg-white dark:bg-[var(--soft-surface)] rounded-2xl shadow-sm dark:shadow-black/20 border border-slate-200 dark:border-[var(--soft-line)]';
const panel = 'rounded-xl border border-slate-200 dark:border-[var(--soft-line)] bg-slate-50 dark:bg-[var(--soft-sunken)]';
const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-black';
const primaryButton = `inline-flex items-center justify-center gap-2 min-h-11 px-4 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors ${focusRing}`;
const secondaryButton = `inline-flex items-center justify-center gap-2 min-h-11 px-4 rounded-lg border border-slate-300 dark:border-[var(--soft-line)] text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[var(--soft-raised)] disabled:opacity-60 disabled:cursor-not-allowed transition-colors ${focusRing}`;
const input = `w-full min-h-11 px-3 rounded-lg border border-slate-300 dark:border-[var(--soft-line)] bg-white dark:bg-[var(--soft-sunken)] text-slate-900 dark:text-white text-sm placeholder:text-slate-400 ${focusRing}`;

type Tab = 'dsa' | 'lab' | 'journal' | 'dna' | 'panic' | 'snap';

const PATTERN_STATUS: Record<PatternStatus, { label: string; icon: LucideIcon; className: string }> = {
    mastered: { label: 'Mastered', icon: Trophy, className: 'text-emerald-700 dark:text-emerald-400' },
    learning: { label: 'Learning', icon: CircleDashed, className: 'text-blue-700 dark:text-blue-400' },
    ready: { label: 'Ready to start', icon: Circle, className: 'text-slate-700 dark:text-slate-300' },
    locked: { label: 'Needs prerequisites', icon: Lock, className: 'text-slate-500 dark:text-slate-400' },
};

const PROBLEM_STATUS: Record<ProblemStatus, { label: string; icon: LucideIcon; className: string }> = {
    solved: { label: 'Solved', icon: CheckCircle2, className: 'text-emerald-700 dark:text-emerald-400' },
    due: { label: 'Due for review', icon: RotateCcw, className: 'text-amber-700 dark:text-amber-400' },
    tried: { label: 'Tried', icon: CircleDashed, className: 'text-blue-700 dark:text-blue-400' },
    new: { label: 'Not tried', icon: Circle, className: 'text-slate-500 dark:text-slate-400' },
};

const DIFFICULTY_CLASS = {
    easy: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
    medium: 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300',
    hard: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300',
};

function formatDate(value: string | null) {
    if (!value) return '';
    return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function LevelBar({ level, label }: { level: number; label: string }) {
    return (
        <div
            className="h-2 rounded-full bg-slate-200 dark:bg-[var(--soft-line)] overflow-hidden"
            role="progressbar"
            aria-valuenow={level}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={label}
        >
            <div className="h-full rounded-full bg-blue-600 dark:bg-blue-500" style={{ width: `${level}%` }} />
        </div>
    );
}

export default function PracticePage() {
    return (
        <Suspense
            fallback={
                <div className="flex min-h-[60vh] items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-600" aria-hidden="true" />
                </div>
            }
        >
            <PracticeHub />
        </Suspense>
    );
}

function PracticeHub() {
    const { getToken, isLoaded, isSignedIn } = useAuth();
    const router = useRouter();
    const params = useSearchParams();
    const focus = params.get('focus') || '';
    const initialTab = (params.get('tab') as Tab) || 'dsa';
    const [tab, setTab] = useState<Tab>(['dsa', 'lab', 'journal', 'dna', 'panic', 'snap'].includes(initialTab) ? initialTab : 'dsa');

    const [overview, setOverview] = useState<DsaOverview | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        try {
            const data = await getDsaOverview(await getToken());
            setOverview(data);
            setError('');
        } catch (err) {
            setError(errorMessage(err, 'Could not load practice. Check that the server is running and try again.'));
        } finally {
            setLoading(false);
        }
    }, [getToken]);

    useEffect(() => {
        if (isLoaded && isSignedIn) load();
    }, [isLoaded, isSignedIn, load]);

    // A milestone can link straight to a problem by its slug
    useEffect(() => {
        if (!overview || !focus) return;
        const isProblem = overview.patterns.some((p) => p.problems.some((pr) => pr.slug === focus));
        if (isProblem) router.replace(`/candidate/practice/${focus}`);
    }, [overview, focus, router]);

    const tabs: { key: Tab; label: string; icon: LucideIcon }[] = [
        { key: 'dsa', label: 'DSA patterns', icon: Code2 },
        { key: 'lab', label: 'Subject Lab', icon: FlaskConical },
        { key: 'journal', label: 'Mistake journal', icon: NotebookPen },
        { key: 'dna', label: 'Mistake DNA', icon: Dna },
        { key: 'panic', label: 'Panic mode', icon: Siren },
        { key: 'snap', label: 'Snap & study', icon: Camera },
    ];

    const changeTab = (next: Tab) => {
        setTab(next);
        const url = new URL(window.location.href);
        url.searchParams.set('tab', next);
        url.searchParams.delete('focus');
        window.history.replaceState(null, '', url.toString());
    };

    return (
        <div className="space-y-6 pb-10">
            <div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Practice</h1>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    Every result here feeds your skill levels and your plan. Problems come back for review before you forget them.
                </p>
            </div>

            <div role="tablist" aria-label="Practice sections" className="flex gap-2 overflow-x-auto border-b border-slate-200 dark:border-[var(--soft-line)]">
                {tabs.map(({ key, label, icon: Icon }) => (
                    <button
                        key={key}
                        role="tab"
                        id={`tab-${key}`}
                        aria-selected={tab === key}
                        aria-controls={`panel-${key}`}
                        onClick={() => changeTab(key)}
                        className={`-mb-px inline-flex min-h-11 flex-shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm font-semibold transition-colors ${focusRing} ${
                            tab === key
                                ? 'border-blue-600 text-blue-700 dark:text-blue-400'
                                : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                        }`}
                    >
                        <Icon className="h-4 w-4" aria-hidden="true" /> {label}
                    </button>
                ))}
            </div>

            <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
                {tab === 'dsa' && (
                    loading ? (
                        <Spinner label="Loading patterns" />
                    ) : error || !overview ? (
                        <ErrorBox message={error} onRetry={() => { setLoading(true); load(); }} />
                    ) : (
                        <DsaTab overview={overview} focus={focus} />
                    )
                )}
                {tab === 'lab' && <LabTab getToken={getToken} initialSubject={params.get('subject') || ''} />}
                {tab === 'dna' && <DnaTab getToken={getToken} />}
                {tab === 'panic' && <PanicTab getToken={getToken} />}
                {tab === 'snap' && <SnapTab getToken={getToken} />}
                {tab === 'journal' && (
                    loading ? <Spinner label="Loading journal" /> : overview ? <JournalView journal={overview.journal} /> : <ErrorBox message={error} onRetry={load} />
                )}
            </div>
        </div>
    );
}

function Spinner({ label }: { label: string }) {
    return (
        <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-live="polite">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" aria-hidden="true" />
            <span className="sr-only">{label}</span>
        </div>
    );
}

function ErrorBox({ message, onRetry }: { message: string; onRetry: () => void }) {
    return (
        <div className="max-w-xl mx-auto mt-10 text-center">
            <AlertTriangle className="h-8 w-8 mx-auto text-red-500" aria-hidden="true" />
            <p className="mt-3 text-sm text-slate-700 dark:text-slate-300" role="alert">{message || 'Something went wrong.'}</p>
            <button className={`${primaryButton} mt-4`} onClick={onRetry}>Try again</button>
        </div>
    );
}

/* ─── DSA ─────────────────────────────────────────────────────────────────── */

function DsaTab({ overview, focus }: { overview: DsaOverview; focus: string }) {
    const tiers = useMemo(() => {
        const max = Math.max(...overview.patterns.map((p) => p.tier));
        return Array.from({ length: max + 1 }, (_, tier) => overview.patterns.filter((p) => p.tier === tier));
    }, [overview.patterns]);

    const focusRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (focus && focusRef.current) scrollIntoPanel(focusRef.current, 'center');
    }, [focus]);

    const tierNames = ['Start here', 'Builds on the basics', 'Intermediate', 'Advanced'];

    return (
        <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Problems solved" value={`${overview.stats.solved} of ${overview.stats.total}`} />
                <Stat label="Patterns mastered" value={`${overview.stats.mastered} of ${overview.patterns.length}`} />
                <Stat label="Average pattern level" value={`${overview.stats.average}/100`} />
                <div className={`${card} p-4`}>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Up next</p>
                    {overview.recommendation ? (
                        <>
                            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{overview.recommendation.title}</p>
                            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{overview.recommendation.reason}</p>
                            <Link href={`/candidate/practice/${overview.recommendation.slug}`} className={`${primaryButton} mt-3 w-full`}>
                                Start <ArrowRight className="h-4 w-4" aria-hidden="true" />
                            </Link>
                        </>
                    ) : (
                        <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">Everything is solved and fresh. Well done.</p>
                    )}
                </div>
            </div>

            {overview.reviews.length > 0 && (
                <section className={`${card} p-5`} aria-labelledby="reviews-heading">
                    <h2 id="reviews-heading" className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
                        <RotateCcw className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden="true" /> Due for review ({overview.reviews.length})
                    </h2>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                        Solving these again on time keeps your pattern levels from fading. Each on-time review pushes the next one further out: 3, 7, 21, then 60 days.
                    </p>
                    <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {overview.reviews.slice(0, 9).map((review) => (
                            <li key={review.slug}>
                                <Link href={`/candidate/practice/${review.slug}`} className={`${panel} flex min-h-11 items-center justify-between gap-3 p-3 hover:border-blue-400 ${focusRing}`}>
                                    <span>
                                        <span className="block text-sm font-semibold text-slate-900 dark:text-white">{review.title}</span>
                                        <span className="block text-xs text-slate-600 dark:text-slate-400">{review.patternName} · due since {formatDate(review.dueSince)}</span>
                                    </span>
                                    <ArrowRight className="h-4 w-4 flex-shrink-0 text-slate-400" aria-hidden="true" />
                                </Link>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            <section aria-labelledby="map-heading">
                <h2 id="map-heading" className="text-lg font-bold text-slate-900 dark:text-white">Pattern map</h2>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                    Patterns open once their prerequisites reach {overview.thresholds.unlock}. A pattern is mastered at {overview.thresholds.mastered}. You can still open any problem early.
                </p>
                <div className="mt-4 grid gap-4 lg:grid-cols-4">
                    {tiers.map((patterns, tier) => (
                        <div key={tier} className="space-y-3">
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{tierNames[tier] || `Tier ${tier + 1}`}</h3>
                            {patterns.map((pattern) => (
                                <div key={pattern.key} ref={focus === pattern.key ? focusRef : undefined}>
                                    <PatternCard pattern={pattern} highlighted={focus === pattern.key} />
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className={`${card} p-4`}>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{value}</p>
        </div>
    );
}

function PatternCard({ pattern, highlighted }: { pattern: Pattern; highlighted: boolean }) {
    const status = PATTERN_STATUS[pattern.status];
    const StatusIcon = status.icon;
    return (
        <article className={`${card} p-4 ${highlighted ? 'ring-2 ring-blue-500' : ''}`} aria-labelledby={`pattern-${pattern.key}`}>
            <div className="flex items-start justify-between gap-2">
                <h4 id={`pattern-${pattern.key}`} className="text-sm font-bold text-slate-900 dark:text-white">{pattern.name}</h4>
                <span className="text-sm font-semibold tabular-nums text-slate-700 dark:text-slate-300">{pattern.level}</span>
            </div>
            <p className={`mt-1 inline-flex items-center gap-1.5 text-xs font-medium ${status.className}`}>
                <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />
                {status.label}
                {pattern.status === 'locked' && pattern.needsNames.length > 0 && `: ${pattern.needsNames.join(', ')}`}
            </p>
            <div className="mt-2">
                <LevelBar level={pattern.level} label={`${pattern.name} level`} />
            </div>
            <ul className="mt-3 space-y-1">
                {pattern.problems.map((problem) => {
                    const s = PROBLEM_STATUS[problem.status];
                    const Icon = s.icon;
                    return (
                        <li key={problem.slug}>
                            <Link
                                href={`/candidate/practice/${problem.slug}`}
                                className={`flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm hover:bg-slate-100 dark:hover:bg-[var(--soft-raised)] ${focusRing}`}
                            >
                                <Icon className={`h-4 w-4 flex-shrink-0 ${s.className}`} aria-hidden="true" />
                                <span className="min-w-0 flex-1 truncate text-slate-800 dark:text-slate-200">{problem.title}</span>
                                <span className="sr-only">{s.label}.</span>
                                <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold capitalize ${DIFFICULTY_CLASS[problem.difficulty]}`}>{problem.difficulty}</span>
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </article>
    );
}

/* ─── Subject Lab ─────────────────────────────────────────────────────────── */

function LabTab({ getToken, initialSubject }: { getToken: () => Promise<string | null>; initialSubject: string }) {
    const [subjects, setSubjects] = useState<LabSubject[]>([]);
    const [branch, setBranch] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [starting, setStarting] = useState('');
    const [set, setSet] = useState<LabSet | null>(null);

    const load = useCallback(async () => {
        try {
            const data = await getLab(await getToken());
            setSubjects(data.subjects);
            setBranch(data.branch);
            setError('');
        } catch (err) {
            setError(errorMessage(err, 'Could not load the Lab.'));
        } finally {
            setLoading(false);
        }
    }, [getToken]);

    useEffect(() => { load(); }, [load]);

    const start = async (subject: string) => {
        setStarting(subject);
        setError('');
        try {
            setSet(await createLabSet(await getToken(), subject));
        } catch (err) {
            setError(errorMessage(err, 'Could not create questions. Please try again.'));
        } finally {
            setStarting('');
        }
    };

    if (loading) return <Spinner label="Loading the Lab" />;
    if (set) {
        return <LabSetView set={set} getToken={getToken} onDone={() => { setSet(null); load(); }} />;
    }

    const sorted = [...subjects].sort((a, b) => Number(b.due) - Number(a.due) || Number(b.subject === initialSubject) - Number(a.subject === initialSubject));

    return (
        <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-400">
                Five fresh questions per set for {branch || 'your branch'}, at a difficulty that follows your measured level. Missed concepts come back in the next set.
            </p>
            {error && (
                <p className="flex items-center gap-2 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-300" role="alert">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0" aria-hidden="true" /> {error}
                </p>
            )}
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {sorted.map((s) => (
                    <li key={s.subject} className={`${card} flex flex-col p-4 ${s.subject === initialSubject ? 'ring-2 ring-blue-500' : ''}`}>
                        <div className="flex items-start justify-between gap-2">
                            <h3 className="text-sm font-bold text-slate-900 dark:text-white">{s.subject}</h3>
                            {s.due && (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
                                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Review due
                                </span>
                            )}
                        </div>
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                            {s.level !== null ? `Level ${s.level}/100` : 'Not measured yet'} · {s.sets} set{s.sets === 1 ? '' : 's'}
                            {s.lastScore !== null ? ` · last score ${s.lastScore}` : ''} · next set: {s.difficulty}
                        </p>
                        {s.missedConcepts.length > 0 && (
                            <p className="mt-2 text-xs text-slate-700 dark:text-slate-300">
                                <span className="font-semibold">Will revisit:</span> {s.missedConcepts.slice(0, 3).join(', ')}
                            </p>
                        )}
                        <div className="mt-auto pt-3">
                            <button className={`${secondaryButton} w-full`} onClick={() => start(s.subject)} disabled={!!starting}>
                                {starting === s.subject ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Calculator className="h-4 w-4" aria-hidden="true" />}
                                {starting === s.subject ? 'Writing questions' : 'Start 5 questions'}
                            </button>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}

function LabSetView({ set, getToken, onDone }: { set: LabSet; getToken: () => Promise<string | null>; onDone: () => void }) {
    const [answers, setAnswers] = useState<(number | string | null)[]>(set.questions.map(() => null));
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [graded, setGraded] = useState<{ score: number; results: LabResult[]; nextReviewAt: string } | null>(null);

    const unanswered = answers.filter((a) => a === null || a === '').length;

    const submit = async () => {
        setSubmitting(true);
        setError('');
        try {
            const result = await submitLabSet(await getToken(), set.id, answers);
            setGraded(result);
        } catch (err) {
            setError(errorMessage(err, 'Could not grade the set. Please try again.'));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="max-w-3xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">{set.subject}</h2>
                    <p className="text-xs text-slate-600 dark:text-slate-400 capitalize">{set.difficulty} set{set.isReview ? ' · review' : ''}</p>
                </div>
                <button className={secondaryButton} onClick={onDone}>Back to subjects</button>
            </div>

            {graded && (
                <div className={`${card} p-5`} role="status">
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">{graded.score}/100</p>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                        {graded.score >= 70 ? 'Good. ' : 'Below 70: your plan now includes a revision of this subject. '}
                        Next review of {set.subject}: {formatDate(graded.nextReviewAt)}.
                    </p>
                </div>
            )}

            <ol className="space-y-4">
                {set.questions.map((q) => {
                    const result = graded?.results[q.index];
                    return (
                        <li key={q.index} className={`${card} p-5`}>
                            <fieldset disabled={!!graded}>
                                <legend className="text-sm font-semibold text-slate-900 dark:text-white">
                                    <span className="text-slate-500 dark:text-slate-400">Q{q.index + 1}. </span>{q.question}
                                </legend>
                                {q.type === 'mcq' ? (
                                    <div className="mt-3 space-y-2">
                                        {q.options.map((option, i) => {
                                            const chosen = answers[q.index] === i;
                                            const isAnswer = result && result.correctAnswer === i;
                                            return (
                                                <label
                                                    key={i}
                                                    className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500 ${
                                                        result && isAnswer
                                                            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10'
                                                            : result && chosen
                                                                ? 'border-red-400 bg-red-50 dark:bg-red-900/20'
                                                                : chosen
                                                                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-500/10'
                                                                    : 'border-slate-200 dark:border-[var(--soft-line)]'
                                                    }`}
                                                >
                                                    <input
                                                        type="radio"
                                                        name={`q-${q.index}`}
                                                        className="accent-blue-600"
                                                        checked={chosen}
                                                        onChange={() => setAnswers((prev) => prev.map((a, idx) => (idx === q.index ? i : a)))}
                                                    />
                                                    <span className="text-slate-800 dark:text-slate-200">{option}</span>
                                                    {result && isAnswer && <span className="ml-auto text-xs font-semibold text-emerald-700 dark:text-emerald-400">Correct answer</span>}
                                                </label>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="mt-3 flex items-center gap-2">
                                        <label htmlFor={`num-${q.index}`} className="sr-only">Your answer</label>
                                        <input
                                            id={`num-${q.index}`}
                                            type="number"
                                            step="any"
                                            inputMode="decimal"
                                            className={`${input} max-w-48`}
                                            value={answers[q.index] ?? ''}
                                            onChange={(e) => setAnswers((prev) => prev.map((a, idx) => (idx === q.index ? e.target.value : a)))}
                                            placeholder="Your answer"
                                        />
                                        {q.unit && <span className="text-sm text-slate-600 dark:text-slate-400">{q.unit}</span>}
                                    </div>
                                )}
                            </fieldset>
                            {result && (
                                <div className="mt-3 rounded-lg bg-slate-50 dark:bg-[var(--soft-sunken)] p-3 text-sm">
                                    <p className={`inline-flex items-center gap-1.5 font-semibold ${result.correct ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
                                        {result.correct ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <XCircle className="h-4 w-4" aria-hidden="true" />}
                                        {result.correct ? 'Correct' : q.type === 'numeric' ? `Not quite: answer ${result.correctAnswer}${result.unit ? ` ${result.unit}` : ''}` : 'Not quite'}
                                    </p>
                                    <p className="mt-1 text-slate-700 dark:text-slate-300">{result.explanation}</p>
                                </div>
                            )}
                        </li>
                    );
                })}
            </ol>

            {error && (
                <p className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400" role="alert">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0" aria-hidden="true" /> {error}
                </p>
            )}
            {!graded && (
                <div className="flex items-center gap-3">
                    <button className={primaryButton} onClick={submit} disabled={submitting}>
                        {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                        Submit answers
                    </button>
                    {unanswered > 0 && <span className="text-xs text-slate-600 dark:text-slate-400">{unanswered} unanswered (counted as wrong)</span>}
                </div>
            )}
        </div>
    );
}

/* ─── Mistake journal ─────────────────────────────────────────────────────── */

function JournalView({ journal }: { journal: Journal }) {
    const max = Math.max(1, ...journal.counts.map((c) => c.count));
    if (journal.entries.length === 0) {
        return (
            <div className={`${card} p-8 text-center`}>
                <BookMarked className="mx-auto h-8 w-8 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                <p className="mt-3 text-sm text-slate-700 dark:text-slate-300">No mistakes recorded yet. Every failed submission is explained and kept here.</p>
            </div>
        );
    }
    return (
        <div className="grid gap-6 lg:grid-cols-3">
            <section className={`${card} p-5`} aria-labelledby="pattern-of-mistakes">
                <h2 id="pattern-of-mistakes" className="text-lg font-bold text-slate-900 dark:text-white">Your mistake patterns</h2>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Last 60 days. When one kind repeats, a drill is added to your plan.</p>
                <ul className="mt-4 space-y-3">
                    {journal.counts.map((c) => (
                        <li key={c.type}>
                            <div className="flex items-baseline justify-between text-sm">
                                <span className="text-slate-800 dark:text-slate-200">{c.label}</span>
                                <span className="tabular-nums font-semibold text-slate-700 dark:text-slate-300">{c.count}</span>
                            </div>
                            <div className="mt-1 h-2 rounded-full bg-slate-200 dark:bg-[var(--soft-line)] overflow-hidden" aria-hidden="true">
                                <div className="h-full rounded-full bg-blue-600 dark:bg-blue-500" style={{ width: `${(c.count / max) * 100}%` }} />
                            </div>
                        </li>
                    ))}
                </ul>
            </section>
            <section className="lg:col-span-2 space-y-3" aria-label="Recent mistakes">
                {journal.entries.map((entry) => (
                    <article key={entry.id} className={`${card} p-4`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">
                                {entry.kind === 'dsa' ? (
                                    <Link href={`/candidate/practice/${entry.ref}`} className={`hover:underline ${focusRing} rounded`}>{entry.title}</Link>
                                ) : (
                                    entry.title
                                )}
                                <span className="font-normal text-slate-500 dark:text-slate-400"> · {entry.topic}</span>
                            </p>
                            <time className="text-xs text-slate-500 dark:text-slate-400" dateTime={entry.at}>{formatDate(entry.at)}</time>
                        </div>
                        <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
                            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> {entry.label}
                        </p>
                        {entry.explanation && <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{entry.explanation}</p>}
                        {entry.fixHint && <p className="mt-1 text-sm text-slate-600 dark:text-slate-400"><span className="font-semibold">Try:</span> {entry.fixHint}</p>}
                        {entry.drillAdded && (
                            <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 dark:text-blue-400">
                                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> A drill for this was added to your plan
                            </p>
                        )}
                    </article>
                ))}
            </section>
        </div>
    );
}

