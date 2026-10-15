'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@clerk/nextjs';
import ForecastCard from '@/components/journey/ForecastCard';
import ExamsCard from '@/components/journey/ExamsCard';
import ClassesCard from '@/components/journey/ClassesCard';
import {
    AlertTriangle,
    ArrowRight,
    BookOpenCheck,
    Code2,
    FlaskConical,
    Bot,
    CalendarClock,
    CheckCircle2,
    ChevronDown,
    Circle,
    CircleDashed,
    Clock3,
    FastForward,
    FilePen,
    GraduationCap,
    History,
    Loader2,
    MessagesSquare,
    MinusCircle,
    RefreshCw,
    Route,
    ScanSearch,
    Sparkles,
    TrendingUp,
    type LucideIcon,
    School,
} from 'lucide-react';
import {
    demoAdvance,
    demoLoadPersona,
    errorMessage,
    getJourney,
    rebuildPlan,
    setMilestoneStatus,
    setupJourney,
    type ChangeLogEntry,
    type DemoPersona,
    type GoalType,
    type Journey,
    type Milestone,
    type MilestoneTool,
    type SetupInput,
} from '@/lib/journeyApi';

/* ─── Shared styles (match the other candidate pages) ─────────────────────── */

const card = 'bg-white dark:bg-[var(--soft-surface)] rounded-2xl shadow-sm dark:shadow-black/20 border border-slate-200 dark:border-[var(--soft-line)]';
const panel = 'rounded-xl border border-slate-200 dark:border-[var(--soft-line)] bg-slate-50 dark:bg-[var(--soft-sunken)]';
const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-black';
const primaryButton = `inline-flex items-center justify-center gap-2 min-h-11 px-4 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors ${focusRing}`;
const secondaryButton = `inline-flex items-center justify-center gap-2 min-h-11 px-4 rounded-lg border border-slate-300 dark:border-[var(--soft-line)] text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[var(--soft-raised)] disabled:opacity-60 disabled:cursor-not-allowed transition-colors ${focusRing}`;
const input = `w-full min-h-11 px-3 rounded-lg border border-slate-300 dark:border-[var(--soft-line)] bg-white dark:bg-[var(--soft-sunken)] text-slate-900 dark:text-white text-sm placeholder:text-slate-400 ${focusRing}`;
const label = 'block text-sm font-medium text-slate-800 dark:text-slate-200 mb-1.5';

const TOOLS: Record<MilestoneTool, { label: string; icon: LucideIcon; href: ((topic: string) => string) | null }> = {
    roadmap: { label: 'Roadmap', icon: Route, href: (t) => `/candidate/learning-roadmap${t ? `?topic=${encodeURIComponent(t)}` : ''}` },
    tutor: { label: 'AI Tutor', icon: GraduationCap, href: () => '/candidate/tutor' },
    flashcards: { label: 'Revision Hub', icon: BookOpenCheck, href: () => '/candidate/revision' },
    resume_analyzer: { label: 'Resume Analyzer', icon: ScanSearch, href: () => '/candidate/resume-analyzer' },
    resume_builder: { label: 'Resume Builder', icon: FilePen, href: () => '/candidate/resume-builder' },
    mock_interview: { label: 'AI Interview', icon: Bot, href: () => '/candidate/ai-interview' },
    companion: { label: 'Companion', icon: MessagesSquare, href: () => '/candidate/companion' },
    dsa: { label: 'DSA practice', icon: Code2, href: (t) => `/candidate/practice${t ? `?focus=${encodeURIComponent(t)}` : ''}` },
    practice: { label: 'Subject Lab', icon: FlaskConical, href: (t) => `/candidate/practice?tab=lab${t ? `&subject=${encodeURIComponent(t)}` : ''}` },
    classwork: { label: 'Class work', icon: School, href: (t) => `/candidate/classes/${t}` },
    none: { label: 'On your own', icon: Circle, href: null },
};

const ORIGIN_LABEL: Record<Milestone['origin'], string | null> = {
    plan: null,
    remedial: 'Added after your result',
    companion: 'Added by your companion',
    replan: 'From a rebuilt plan',
    mentor: 'Set by your mentor',
};

const TRIGGER_LABEL: Record<ChangeLogEntry['trigger'], string> = {
    setup: 'Plan created',
    evidence: 'Your results',
    overdue: 'Missed dates',
    goal_change: 'Goal changed',
    new_year: 'New year',
    companion: 'Companion chat',
    manual: 'You',
    exam: 'Exam dates',
    mistake: 'Repeated mistake',
    mentor: 'Mentor',
};

const ACTION_LABEL: Record<ChangeLogEntry['changes'][number]['action'], string> = {
    add: 'Added',
    remove: 'Removed',
    move: 'Moved',
    update: 'Updated',
    complete: 'Completed',
    skip: 'Dropped',
    mode: 'Mode',
};

const GOALS: { type: GoalType; title: string; hint: string }[] = [
    { type: 'placement', title: 'Get placed', hint: 'A job through campus or off-campus hiring' },
    { type: 'higher_studies', title: 'Higher studies', hint: 'M.Tech, MS or MBA through an entrance exam' },
    { type: 'govt_exam', title: 'Government or PSU', hint: 'Public sector and government exams' },
    { type: 'startup', title: 'Build something', hint: 'Start a product or company of your own' },
    { type: 'undecided', title: 'Not sure yet', hint: 'We will work it out together' },
];

const BRANCH_SUGGESTIONS = [
    'Computer Science and Engineering',
    'Information Technology',
    'Electronics and Communication Engineering',
    'Electrical Engineering',
    'Mechanical Engineering',
    'Civil Engineering',
    'Chemical Engineering',
    'Artificial Intelligence and Data Science',
];

function formatDate(value: string) {
    return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/* ─── Page ────────────────────────────────────────────────────────────────── */

export default function JourneyPage() {
    const { getToken, isLoaded, isSignedIn } = useAuth();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [journey, setJourney] = useState<Journey | null>(null);
    const [demoEnabled, setDemoEnabled] = useState(false);
    const [personas, setPersonas] = useState<DemoPersona[]>([]);

    const load = useCallback(async () => {
        try {
            const data = await getJourney(await getToken());
            setJourney(data.exists && data.journey ? data.journey : null);
            setDemoEnabled(data.demoEnabled);
            setPersonas(data.personas || []);
            setError('');
        } catch (err) {
            setError(errorMessage(err, 'Could not load your journey. Check that the server is running and try again.'));
        } finally {
            setLoading(false);
        }
    }, [getToken]);

    useEffect(() => {
        if (isLoaded && isSignedIn) load();
    }, [isLoaded, isSignedIn, load]);

    if (loading) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-live="polite">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" aria-hidden="true" />
                <span className="sr-only">Loading your journey</span>
            </div>
        );
    }

    if (error && !journey) {
        return (
            <div className="max-w-xl mx-auto mt-16 text-center">
                <AlertTriangle className="h-8 w-8 mx-auto text-red-500" aria-hidden="true" />
                <p className="mt-3 text-sm text-slate-700 dark:text-slate-300" role="alert">{error}</p>
                <button className={`${primaryButton} mt-4`} onClick={() => { setLoading(true); load(); }}>Try again</button>
            </div>
        );
    }

    if (!journey) {
        return <SetupWizard getToken={getToken} onReady={setJourney} demoEnabled={demoEnabled} personas={personas} />;
    }

    return (
        <JourneyView
            journey={journey}
            setJourney={setJourney}
            getToken={getToken}
            demoEnabled={demoEnabled}
            personas={personas}
        />
    );
}

type GetToken = () => Promise<string | null>;

/* ─── Setup wizard ────────────────────────────────────────────────────────── */

function SetupWizard({
    getToken,
    onReady,
    demoEnabled,
    personas,
}: {
    getToken: GetToken;
    onReady: (journey: Journey) => void;
    demoEnabled: boolean;
    personas: DemoPersona[];
}) {
    const [step, setStep] = useState(1);
    const [branch, setBranch] = useState('');
    const [college, setCollege] = useState('');
    const [semester, setSemester] = useState(1);
    const [goalType, setGoalType] = useState<GoalType>('undecided');
    const [targetRole, setTargetRole] = useState('');
    const [hours, setHours] = useState(8);
    const [interests, setInterests] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [loadingPersona, setLoadingPersona] = useState('');

    const steps = ['Where you are', 'Where you want to go', 'Your time'];

    const next = () => {
        if (step === 1 && !branch.trim()) {
            setError('Enter your branch to continue.');
            return;
        }
        setError('');
        setStep((s) => Math.min(3, s + 1));
    };

    const submit = async () => {
        setSubmitting(true);
        setError('');
        const body: SetupInput = {
            branch: branch.trim(),
            college: college.trim(),
            semester,
            goal: { type: goalType, targetRole: targetRole.trim() },
            hoursPerWeek: hours,
            interests: interests.split(',').map((i) => i.trim()).filter(Boolean),
        };
        try {
            onReady(await setupJourney(await getToken(), body));
        } catch (err) {
            setError(errorMessage(err, 'Could not build your plan. Please try again.'));
            setSubmitting(false);
        }
    };

    const loadPersona = async (key: string) => {
        setLoadingPersona(key);
        setError('');
        try {
            onReady(await demoLoadPersona(await getToken(), key));
        } catch (err) {
            setError(errorMessage(err, 'Could not load the demo student.'));
            setLoadingPersona('');
        }
    };

    return (
        <div className="max-w-2xl mx-auto py-4">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Set up your journey</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                Three short questions. Your companion uses the answers to plan every semester until you graduate, and keeps adjusting the plan as you go.
            </p>

            <ol className="mt-6 flex items-center gap-2" aria-label="Setup progress">
                {steps.map((name, i) => {
                    const n = i + 1;
                    const state = n < step ? 'done' : n === step ? 'current' : 'todo';
                    return (
                        <li key={name} className="flex-1" aria-current={state === 'current' ? 'step' : undefined}>
                            <div className={`h-1.5 rounded-full ${state === 'todo' ? 'bg-slate-200 dark:bg-[var(--soft-line)]' : 'bg-blue-600'}`} />
                            <p className={`mt-2 text-xs font-medium ${state === 'current' ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>
                                Step {n} of 3 · {name}
                            </p>
                        </li>
                    );
                })}
            </ol>

            <div className={`${card} mt-6 p-6`}>
                {step === 1 && (
                    <div className="space-y-5">
                        <div>
                            <label htmlFor="branch" className={label}>Branch</label>
                            <input
                                id="branch"
                                list="branch-options"
                                className={input}
                                value={branch}
                                onChange={(e) => setBranch(e.target.value)}
                                placeholder="For example, Mechanical Engineering"
                                autoComplete="off"
                                required
                            />
                            <datalist id="branch-options">
                                {BRANCH_SUGGESTIONS.map((b) => <option key={b} value={b} />)}
                            </datalist>
                        </div>
                        <div>
                            <label htmlFor="college" className={label}>College <span className="font-normal text-slate-500">(optional)</span></label>
                            <input id="college" className={input} value={college} onChange={(e) => setCollege(e.target.value)} autoComplete="organization" />
                        </div>
                        <div>
                            <label htmlFor="semester" className={label}>Current semester</label>
                            <select id="semester" className={input} value={semester} onChange={(e) => setSemester(Number(e.target.value))}>
                                {Array.from({ length: 8 }, (_, i) => i + 1).map((s) => (
                                    <option key={s} value={s}>Semester {s} (year {Math.ceil(s / 2)})</option>
                                ))}
                            </select>
                            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">Joining late is fine. The plan starts from where you are.</p>
                        </div>
                    </div>
                )}

                {step === 2 && (
                    <div className="space-y-5">
                        <fieldset>
                            <legend className={label}>What are you aiming for after your degree?</legend>
                            <div className="grid gap-2 sm:grid-cols-2">
                                {GOALS.map((g) => {
                                    const selected = goalType === g.type;
                                    return (
                                        <label
                                            key={g.type}
                                            className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 min-h-11 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500 ${selected ? 'border-blue-600 bg-blue-50 dark:bg-blue-500/10' : 'border-slate-200 dark:border-[var(--soft-line)] hover:bg-slate-50 dark:hover:bg-[var(--soft-raised)]'}`}
                                        >
                                            <input
                                                type="radio"
                                                name="goal"
                                                className="mt-1 accent-blue-600"
                                                checked={selected}
                                                onChange={() => setGoalType(g.type)}
                                            />
                                            <span>
                                                <span className="block text-sm font-semibold text-slate-900 dark:text-white">{g.title}</span>
                                                <span className="block text-xs text-slate-600 dark:text-slate-400">{g.hint}</span>
                                            </span>
                                        </label>
                                    );
                                })}
                            </div>
                        </fieldset>
                        {goalType !== 'undecided' && (
                            <div>
                                <label htmlFor="role" className={label}>Target role or exam <span className="font-normal text-slate-500">(optional)</span></label>
                                <input id="role" className={input} value={targetRole} onChange={(e) => setTargetRole(e.target.value)} placeholder="For example, Design Engineer or GATE" />
                            </div>
                        )}
                    </div>
                )}

                {step === 3 && (
                    <div className="space-y-5">
                        <div>
                            <label htmlFor="hours" className={label}>Hours you can give each week, outside classes: <span className="font-bold">{hours}</span></label>
                            <input id="hours" type="range" min={2} max={40} step={1} value={hours} onChange={(e) => setHours(Number(e.target.value))} className="w-full accent-blue-600 h-11" />
                            <p className="text-xs text-slate-500 dark:text-slate-400">Be honest. A plan you can keep beats an ambitious one you drop.</p>
                        </div>
                        <div>
                            <label htmlFor="interests" className={label}>Interests <span className="font-normal text-slate-500">(optional, separate with commas)</span></label>
                            <input id="interests" className={input} value={interests} onChange={(e) => setInterests(e.target.value)} placeholder="Robotics, web development, finance" />
                        </div>
                    </div>
                )}

                {error && (
                    <p className="mt-4 flex items-center gap-2 text-sm text-red-600 dark:text-red-400" role="alert">
                        <AlertTriangle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                        {error}
                    </p>
                )}

                <div className="mt-6 flex items-center justify-between gap-3">
                    <button className={secondaryButton} onClick={() => { setError(''); setStep((s) => Math.max(1, s - 1)); }} disabled={step === 1 || submitting}>
                        Back
                    </button>
                    {step < 3 ? (
                        <button className={primaryButton} onClick={next}>
                            Continue <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </button>
                    ) : (
                        <button className={primaryButton} onClick={submit} disabled={submitting}>
                            {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
                            {submitting ? 'Building your plan' : 'Build my plan'}
                        </button>
                    )}
                </div>
                {submitting && (
                    <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 text-right" aria-live="polite">This can take up to half a minute.</p>
                )}
            </div>

            {demoEnabled && personas.length > 0 && (
                <div className="mt-6 rounded-xl border border-dashed border-slate-300 dark:border-[var(--soft-line-strong)] p-4">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">For a demonstration</p>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Load a ready-made student with a history, to show how the plan behaves in different years.</p>
                    <div className="mt-3 flex flex-col gap-2">
                        {personas.map((p) => (
                            <button key={p.key} className={`${secondaryButton} justify-start`} onClick={() => loadPersona(p.key)} disabled={!!loadingPersona || submitting}>
                                {loadingPersona === p.key && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                                {p.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

/* ─── Journey view ────────────────────────────────────────────────────────── */

function JourneyView({
    journey,
    setJourney,
    getToken,
    demoEnabled,
    personas,
}: {
    journey: Journey;
    setJourney: (journey: Journey) => void;
    getToken: GetToken;
    demoEnabled: boolean;
    personas: DemoPersona[];
}) {
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');
    const [openYears, setOpenYears] = useState<Record<number, boolean>>({ [journey.year]: true });

    const now = useMemo(() => new Date(journey.now), [journey.now]);

    // One request at a time; `key` says which control shows the spinner
    const run = async (key: string, action: (token: string | null) => Promise<Journey>) => {
        setBusy(key);
        setError('');
        try {
            setJourney(await action(await getToken()));
        } catch (err) {
            setError(errorMessage(err, 'That did not work. Please try again.'));
        } finally {
            setBusy('');
        }
    };

    const years = useMemo(() => {
        return journey.stages.map((stage) => {
            const semesters = [stage.year * 2 - 1, stage.year * 2].map((semester) => ({
                semester,
                milestones: journey.milestones.filter((m) => m.semester === semester),
            }));
            const all = semesters.flatMap((s) => s.milestones).filter((m) => m.status !== 'skipped');
            return { stage, semesters, total: all.length, done: all.filter((m) => m.status === 'done').length };
        });
    }, [journey]);

    const goalText = GOALS.find((g) => g.type === journey.profile.goal.type)?.title ?? 'Not sure yet';

    return (
        <div className="space-y-6 pb-10">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">My Journey</h1>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                        {journey.profile.branch} · Semester {journey.semester} of {journey.totalSemesters} · Goal: {goalText}
                        {journey.profile.goal.targetRole ? ` (${journey.profile.goal.targetRole})` : ''}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Link href="/candidate/companion" className={primaryButton}>
                        <MessagesSquare className="h-4 w-4" aria-hidden="true" /> Talk to companion
                    </Link>
                    <button className={secondaryButton} onClick={() => run('rebuild', rebuildPlan)} disabled={!!busy}>
                        {busy === 'rebuild' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
                        Rebuild plan
                    </button>
                </div>
            </div>

            {error && (
                <p className="flex items-center gap-2 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-300" role="alert">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0" aria-hidden="true" /> {error}
                </p>
            )}

            {/* Four stages */}
            <div className={`${card} p-5`}>
                <ol className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Stages of your degree">
                    {journey.stages.map((stage) => {
                        const state = stage.year < journey.year ? 'past' : stage.year === journey.year ? 'current' : 'future';
                        return (
                            <li
                                key={stage.year}
                                aria-current={state === 'current' ? 'step' : undefined}
                                className={`rounded-xl border p-3 ${state === 'current' ? 'border-blue-600 bg-blue-50 dark:bg-blue-500/10' : 'border-slate-200 dark:border-[var(--soft-line)]'}`}
                            >
                                <div className="flex items-center gap-2">
                                    {state === 'past' && <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />}
                                    {state === 'current' && <TrendingUp className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />}
                                    {state === 'future' && <CircleDashed className="h-4 w-4 text-slate-400" aria-hidden="true" />}
                                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                        Year {stage.year}{state === 'current' ? ' · you are here' : state === 'past' ? ' · done' : ''}
                                    </span>
                                </div>
                                <p className={`mt-1 text-base font-bold ${state === 'future' ? 'text-slate-500 dark:text-slate-400' : 'text-slate-900 dark:text-white'}`}>{stage.name}</p>
                            </li>
                        );
                    })}
                </ol>
                <p className="mt-4 text-sm text-slate-700 dark:text-slate-300">
                    <span className="font-semibold">{journey.stage.name} mode:</span> {journey.stage.focus}
                </p>
                <div className="mt-4">
                    <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                        <span>{journey.stats.done} of {journey.stats.total} milestones done</span>
                        <span>{journey.stats.percent}%</span>
                    </div>
                    <div
                        className="mt-1.5 h-2 rounded-full bg-slate-200 dark:bg-[var(--soft-line)] overflow-hidden"
                        role="progressbar"
                        aria-valuenow={journey.stats.percent}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label="Plan completed"
                    >
                        <div className="h-full rounded-full bg-blue-600 motion-safe:transition-[width] motion-safe:duration-300" style={{ width: `${journey.stats.percent}%` }} />
                    </div>
                    {journey.stats.overdue > 0 && (
                        <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                            <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                            {journey.stats.overdue} past due
                        </p>
                    )}
                </div>
            </div>

            <ForecastCard getToken={getToken} refreshKey={`${journey.now}-${journey.stats.done}-${journey.skills.length}`} />

            <div className="grid gap-6 lg:grid-cols-3">
                {/* Timeline */}
                <section className="lg:col-span-2 space-y-4" aria-label="Your plan by year">
                    {years.map(({ stage, semesters, total, done }) => {
                        const open = !!openYears[stage.year];
                        const panelId = `year-${stage.year}`;
                        return (
                            <div key={stage.year} className={card}>
                                <h2>
                                    <button
                                        className={`flex w-full items-center justify-between gap-3 rounded-2xl p-5 text-left min-h-11 ${focusRing}`}
                                        onClick={() => setOpenYears((prev) => ({ ...prev, [stage.year]: !open }))}
                                        aria-expanded={open}
                                        aria-controls={panelId}
                                    >
                                        <span>
                                            <span className="block text-lg font-bold text-slate-900 dark:text-white">Year {stage.year} · {stage.name}</span>
                                            <span className="block text-xs text-slate-600 dark:text-slate-400">
                                                {total === 0 ? 'Nothing planned here' : `${done} of ${total} done`}
                                                {stage.year === journey.year ? ' · current year' : ''}
                                            </span>
                                        </span>
                                        <ChevronDown className={`h-5 w-5 flex-shrink-0 text-slate-500 motion-safe:transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                                    </button>
                                </h2>
                                {open && (
                                    <div id={panelId} className="space-y-5 px-5 pb-5">
                                        {semesters.map(({ semester, milestones }) => (
                                            <div key={semester}>
                                                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                                                    Semester {semester}
                                                    {semester === journey.semester && <span className="ml-2 rounded-full bg-blue-100 dark:bg-blue-500/20 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:text-blue-300">Now</span>}
                                                </h3>
                                                {milestones.length === 0 ? (
                                                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">No milestones in this semester.</p>
                                                ) : (
                                                    <ul className="mt-2 space-y-2">
                                                        {milestones.map((m) => (
                                                            <MilestoneRow
                                                                key={m._id}
                                                                milestone={m}
                                                                now={now}
                                                                busy={busy === m._id}
                                                                disabled={!!busy}
                                                                onToggle={() => run(m._id, (token) => setMilestoneStatus(token, m._id, m.status === 'done' ? 'pending' : 'done'))}
                                                            />
                                                        ))}
                                                    </ul>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </section>

                {/* Side column */}
                <div className="space-y-6">
                    <ExamsCard journey={journey} setJourney={setJourney} getToken={getToken} />
                    <ClassesCard getToken={getToken} />
                    <section className={`${card} p-5`} aria-labelledby="changes-heading">
                        <h2 id="changes-heading" className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
                            <History className="h-5 w-5 text-blue-600 dark:text-blue-400" aria-hidden="true" /> What changed and why
                        </h2>
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Every change to your plan is recorded here with its reason.</p>
                        <ul className="mt-4 space-y-3">
                            {journey.changeLog.slice(0, 8).map((entry, i) => (
                                <ChangeRow key={`${entry.at}-${i}`} entry={entry} />
                            ))}
                        </ul>
                    </section>

                    <section className={`${card} p-5`} aria-labelledby="skills-heading">
                        <h2 id="skills-heading" className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
                            <TrendingUp className="h-5 w-5 text-blue-600 dark:text-blue-400" aria-hidden="true" /> Measured skill levels
                        </h2>
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                            Built only from your quiz, interview and resume results. Studying alone takes a skill to 60; tested results take it further.
                        </p>
                        {journey.skills.length === 0 ? (
                            <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Nothing measured yet. Take a tutor quiz or a mock interview and it will show here.</p>
                        ) : (
                            <ul className="mt-4 space-y-3">
                                {journey.skills.slice(0, 8).map((skill) => (
                                    <li key={skill.key}>
                                        <div className="flex items-baseline justify-between gap-2 text-sm">
                                            <span className="font-medium text-slate-900 dark:text-white">{skill.name}</span>
                                            <span className="tabular-nums text-slate-700 dark:text-slate-300">{skill.level}/100</span>
                                        </div>
                                        <div className="mt-1 h-2 rounded-full bg-slate-200 dark:bg-[var(--soft-line)] overflow-hidden" role="progressbar" aria-valuenow={skill.level} aria-valuemin={0} aria-valuemax={100} aria-label={`${skill.name} level`}>
                                            <div className="h-full rounded-full bg-blue-600" style={{ width: `${skill.level}%` }} />
                                        </div>
                                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                            {skill.evidenceCount > 0 ? `${skill.evidenceCount} tested result${skill.evidenceCount > 1 ? 's' : ''}` : 'Studied, not yet tested'}
                                        </p>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    {demoEnabled && (
                        <DemoControls journey={journey} personas={personas} busy={busy} run={run} />
                    )}
                </div>
            </div>
        </div>
    );
}

/* ─── Milestone row ───────────────────────────────────────────────────────── */

function MilestoneRow({
    milestone,
    now,
    busy,
    disabled,
    onToggle,
}: {
    milestone: Milestone;
    now: Date;
    busy: boolean;
    disabled: boolean;
    onToggle: () => void;
}) {
    const tool = TOOLS[milestone.tool] ?? TOOLS.none;
    const ToolIcon = tool.icon;
    const done = milestone.status === 'done';
    const skipped = milestone.status === 'skipped';
    const overdue = !done && !skipped && new Date(milestone.dueAt) < now;
    const originLabel = ORIGIN_LABEL[milestone.origin];
    const href = tool.href ? tool.href(milestone.toolTopic) : null;

    // Status is always shown as icon plus words, never colour alone
    let status: { text: string; icon: LucideIcon; className: string };
    if (done) status = { text: 'Done', icon: CheckCircle2, className: 'text-emerald-700 dark:text-emerald-400' };
    else if (skipped) status = { text: 'Dropped', icon: MinusCircle, className: 'text-slate-500 dark:text-slate-400' };
    else if (overdue) status = { text: `Past due · ${formatDate(milestone.dueAt)}`, icon: Clock3, className: 'text-amber-700 dark:text-amber-400' };
    else if (milestone.status === 'in_progress') status = { text: `In progress · due ${formatDate(milestone.dueAt)}`, icon: CircleDashed, className: 'text-blue-700 dark:text-blue-400' };
    else status = { text: `Due ${formatDate(milestone.dueAt)}`, icon: CalendarClock, className: 'text-slate-600 dark:text-slate-400' };
    const StatusIcon = status.icon;

    return (
        <li className={`${panel} flex gap-3 p-3 ${skipped ? 'opacity-70' : ''}`}>
            {milestone.origin === 'mentor' ? (
                // Class work is ticked off by the class when the work is done, not by hand
                <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center" title="Done automatically when you finish it in the class">
                    {done ? <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" /> : <School className="h-5 w-5 text-slate-400" aria-hidden="true" />}
                </span>
            ) : (
            <button
                className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg hover:bg-slate-200 dark:hover:bg-[var(--soft-raised)] disabled:cursor-not-allowed ${focusRing}`}
                onClick={onToggle}
                disabled={disabled || skipped}
                aria-label={done ? `Mark "${milestone.title}" as not done` : `Mark "${milestone.title}" as done`}
                aria-pressed={done}
            >
                {busy ? (
                    <Loader2 className="h-5 w-5 animate-spin text-blue-600" aria-hidden="true" />
                ) : done ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                ) : (
                    <Circle className="h-5 w-5 text-slate-400" aria-hidden="true" />
                )}
            </button>
            )}

            <div className="min-w-0 flex-1">
                <p className={`text-sm font-semibold ${done || skipped ? 'text-slate-500 dark:text-slate-400 line-through' : 'text-slate-900 dark:text-white'}`}>
                    {milestone.title}
                    {milestone.priority === 'stretch' && <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400 no-underline">(optional)</span>}
                </p>
                {milestone.description && !done && !skipped && (
                    <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">{milestone.description}</p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                    <span className={`inline-flex items-center gap-1.5 font-medium ${status.className}`}>
                        <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" /> {status.text}
                    </span>
                    {originLabel && (
                        <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> {originLabel}
                        </span>
                    )}
                </div>
                {milestone.reason && milestone.origin !== 'plan' && milestone.origin !== 'replan' && (
                    <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">Why: {milestone.reason}</p>
                )}
            </div>

            {href && !done && !skipped && (
                <Link
                    href={href}
                    className={`inline-flex min-h-11 flex-shrink-0 items-center gap-1.5 self-center rounded-lg px-3 text-sm font-semibold text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 ${focusRing}`}
                >
                    <ToolIcon className="h-4 w-4" aria-hidden="true" />
                    <span className="hidden sm:inline">{tool.label}</span>
                    <span className="sr-only sm:hidden">Open {tool.label}</span>
                </Link>
            )}
        </li>
    );
}

/* ─── Change log row ──────────────────────────────────────────────────────── */

function ChangeRow({ entry }: { entry: ChangeLogEntry }) {
    const [open, setOpen] = useState(false);
    return (
        <li className={`${panel} p-3`}>
            <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-blue-700 dark:text-blue-400">{TRIGGER_LABEL[entry.trigger] ?? entry.trigger}</span>
                <time className="text-slate-500 dark:text-slate-400" dateTime={entry.at}>{formatDate(entry.at)}</time>
            </div>
            <p className="mt-1 text-sm text-slate-800 dark:text-slate-200">{entry.summary}</p>
            {entry.changes.length > 0 && (
                <>
                    <button
                        className={`mt-2 inline-flex min-h-11 items-center gap-1 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 hover:underline ${focusRing}`}
                        onClick={() => setOpen((v) => !v)}
                        aria-expanded={open}
                    >
                        {open ? 'Hide' : 'Show'} {entry.changes.length} change{entry.changes.length > 1 ? 's' : ''}
                        <ChevronDown className={`h-3.5 w-3.5 motion-safe:transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                    </button>
                    {open && (
                        <ul className="space-y-1.5 border-l-2 border-slate-200 dark:border-[var(--soft-line)] pl-3">
                            {entry.changes.map((change, i) => (
                                <li key={i} className="text-xs text-slate-700 dark:text-slate-300">
                                    <span className="font-semibold">{ACTION_LABEL[change.action] ?? change.action}:</span> {change.title}
                                    {change.detail && <span className="block text-slate-500 dark:text-slate-400">{change.detail}</span>}
                                </li>
                            ))}
                        </ul>
                    )}
                </>
            )}
        </li>
    );
}

/* ─── Demo controls ───────────────────────────────────────────────────────── */

function DemoControls({
    journey,
    personas,
    busy,
    run,
}: {
    journey: Journey;
    personas: DemoPersona[];
    busy: string;
    run: (key: string, action: (token: string | null) => Promise<Journey>) => Promise<void>;
}) {
    const [persona, setPersona] = useState(personas[0]?.key ?? '');
    const [confirming, setConfirming] = useState(false);
    const jumps = [
        { days: 30, label: '1 month' },
        { days: 183, label: '6 months' },
        { days: 365, label: '1 year' },
    ];

    return (
        <section className="rounded-2xl border border-dashed border-slate-300 dark:border-[var(--soft-line-strong)] p-5" aria-labelledby="demo-heading">
            <h2 id="demo-heading" className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <FastForward className="h-4 w-4" aria-hidden="true" /> Demo controls
            </h2>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                Move time forward to show how the plan reacts. Today for this student is {formatDate(journey.now)}
                {journey.profile.clockOffsetDays > 0 ? ` (${journey.profile.clockOffsetDays} days ahead of the real date)` : ''}.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
                {jumps.map((jump) => (
                    <button key={jump.days} className={secondaryButton} disabled={!!busy} onClick={() => run(`jump-${jump.days}`, (token) => demoAdvance(token, jump.days))}>
                        {busy === `jump-${jump.days}` && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                        Skip {jump.label}
                    </button>
                ))}
            </div>

            {personas.length > 0 && (
                <div className="mt-4">
                    <label htmlFor="persona" className={label}>Load a demo student</label>
                    <select id="persona" className={input} value={persona} onChange={(e) => { setPersona(e.target.value); setConfirming(false); }}>
                        {personas.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                    </select>
                    {confirming ? (
                        <div className="mt-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3">
                            <p className="flex items-start gap-2 text-xs text-amber-900 dark:text-amber-200">
                                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                                This replaces your current journey, results and companion chat with the demo student. It cannot be undone.
                            </p>
                            <div className="mt-2 flex gap-2">
                                <button className={primaryButton} disabled={!!busy} onClick={() => { setConfirming(false); run('persona', (token) => demoLoadPersona(token, persona)); }}>
                                    Replace my journey
                                </button>
                                <button className={secondaryButton} onClick={() => setConfirming(false)}>Cancel</button>
                            </div>
                        </div>
                    ) : (
                        <button className={`${secondaryButton} mt-2`} disabled={!!busy || !persona} onClick={() => setConfirming(true)}>
                            {busy === 'persona' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                            Load student
                        </button>
                    )}
                </div>
            )}
        </section>
    );
}
