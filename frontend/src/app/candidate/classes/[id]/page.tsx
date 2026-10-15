'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { ArrowLeft, ArrowRight, CheckCircle2, ExternalLink, Loader2, LogOut, Trophy, XCircle } from 'lucide-react';
import { errorMessage } from '@/lib/journeyApi';
import LiveStudent from '@/components/classroom/LiveStudent';
import {
    getMyClass,
    getMyWork,
    leaveClass,
    studentComment,
    studentDeletePost,
    studentPost,
    submitWork,
    unsubmitWork,
    type Assignment,
    type MySubmission,
    type StudentClassDetail,
    type StudentQuestion,
    type StudentWork,
} from '@/lib/mentorApi';
import {
    Avatar,
    card,
    Dialog,
    dueText,
    ErrorNote,
    focusRing,
    formatDateTime,
    input,
    isDone,
    label,
    panel,
    primaryButton,
    ProgressBar,
    secondaryButton,
    Spinner,
    StatusPill,
    Stream,
    Tabs,
    textarea,
    themeOf,
    WORK_TYPES,
} from '@/components/classroom/ui';

type Tab = 'stream' | 'classwork' | 'live' | 'people';

export default function StudentClassPage() {
    return (
        <Suspense fallback={<Spinner label="Loading class" />}>
            <ClassView />
        </Suspense>
    );
}

function ClassView() {
    const { id } = useParams<{ id: string }>();
    const params = useSearchParams();
    const router = useRouter();
    const { getToken, isLoaded, isSignedIn } = useAuth();
    const [data, setData] = useState<StudentClassDetail | null>(null);
    const [error, setError] = useState('');
    const workId = params.get('work');
    const [tab, setTab] = useState<Tab>(workId ? 'classwork' : params.get('tab') === 'live' ? 'live' : 'stream');

    const load = useCallback(async () => {
        try {
            const next = await getMyClass(await getToken(), id);
            setData(next);
            setError('');
        } catch (err) {
            setError(errorMessage(err, 'Could not load this class.'));
        }
    }, [getToken, id]);

    useEffect(() => {
        if (isLoaded && isSignedIn) void Promise.resolve().then(load);
    }, [isLoaded, isSignedIn, load]);

    const openWork = (assignmentId: string | null) => {
        const url = assignmentId ? `/candidate/classes/${id}?work=${assignmentId}` : `/candidate/classes/${id}`;
        router.replace(url, { scroll: false });
    };

    if (!data) {
        return error ? (
            <div className="mx-auto mt-10 max-w-lg text-center">
                <ErrorNote text={error} />
                <Link href="/candidate/classes" className={`${secondaryButton} mt-4`}><ArrowLeft className="h-4 w-4" aria-hidden="true" /> All classes</Link>
            </div>
        ) : <Spinner label="Loading class" />;
    }

    const c = data.classroom;
    const theme = themeOf(c.theme);
    const todo = data.classwork.filter((w) => !isDone(w.mine.status));
    const done = data.classwork.filter((w) => isDone(w.mine.status));

    const leave = async () => {
        if (!window.confirm(`Leave ${c.name}? Its open work is taken off your plan. You can rejoin with the code.`)) return;
        try {
            await leaveClass(await getToken(), id);
            router.push('/candidate/classes');
        } catch (err) {
            setError(errorMessage(err, 'Could not leave the class.'));
        }
    };

    return (
        <div className="space-y-5 pb-10">
            <Link href="/candidate/classes" className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg text-sm font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white ${focusRing}`}>
                <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All classes
            </Link>

            <section className={`${theme.banner} rounded-2xl p-5 text-white shadow-sm sm:p-6`}>
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{c.name}</h1>
                <p className="mt-1 text-sm text-white/90">{[c.section, c.subject].filter(Boolean).join(' · ')}</p>
                {data.mentor && <p className="mt-1 text-sm text-white/90">Mentor: {data.mentor.name}{data.mentor.department ? `, ${data.mentor.department}` : ''}</p>}
                {c.description && <p className="mt-2 max-w-2xl text-sm text-white/90">{c.description}</p>}
                {c.archived && <p className="mt-2 text-sm font-semibold">This class is archived. You can read it but not post.</p>}
            </section>

            <ErrorNote text={error} />

            <Tabs<Tab>
                label="Class sections"
                value={tab}
                onChange={setTab}
                tabs={[
                    { key: 'stream', label: 'Stream' },
                    { key: 'classwork', label: 'Classwork', count: todo.length },
                    { key: 'live', label: 'Live' },
                    { key: 'people', label: 'People' },
                ]}
            />

            <div role="tabpanel">
                {tab === 'stream' && (
                    <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
                        <aside className={`${card} h-fit p-4`} aria-labelledby="upcoming-heading">
                            <h2 id="upcoming-heading" className="text-sm font-bold text-slate-900 dark:text-white">Upcoming</h2>
                            {todo.length === 0 ? (
                                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Nothing due. Nice.</p>
                            ) : (
                                <ul className="mt-2 space-y-2">
                                    {todo.slice(0, 4).map((w) => (
                                        <li key={w.id}>
                                            <button onClick={() => openWork(w.id)} className={`w-full rounded-lg text-left text-sm cursor-pointer ${focusRing}`}>
                                                <span className="block font-medium text-blue-700 hover:underline dark:text-blue-400">{w.title}</span>
                                                <span className="block text-xs text-slate-600 dark:text-slate-400">{dueText(w.dueAt)}</span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </aside>
                        {c.archived ? (
                            <Stream
                                posts={data.posts}
                                composerLabel="Ask the class a question"
                                composerPlaceholder="This class is archived"
                                onPost={async () => { throw new Error('This class is archived.'); }}
                                onComment={async () => undefined}
                                canDelete={() => false}
                                onOpenWork={openWork}
                            />
                        ) : (
                            <Stream
                                posts={data.posts}
                                composerLabel="Ask the class a question"
                                composerPlaceholder="Stuck on something? Your mentor and classmates can answer here."
                                onPost={async (text) => {
                                    try { await studentPost(await getToken(), id, text); }
                                    catch (err) { throw new Error(errorMessage(err, 'Could not post.')); }
                                    await load();
                                }}
                                onComment={async (postId, text) => { await studentComment(await getToken(), id, postId, text); await load(); }}
                                onDelete={async (postId) => { await studentDeletePost(await getToken(), id, postId); await load(); }}
                                canDelete={(post) => post.mine && post.kind === 'question'}
                                onOpenWork={openWork}
                            />
                        )}
                    </div>
                )}

                {tab === 'classwork' && (
                    <div className="space-y-6">
                        {data.classwork.length === 0 && (
                            <div className={`${card} p-8 text-center text-sm text-slate-600 dark:text-slate-400`}>No classwork yet.</div>
                        )}
                        {todo.length > 0 && <WorkList title="To do" items={todo} onOpen={openWork} />}
                        {done.length > 0 && <WorkList title="Done" items={done} onOpen={openWork} />}
                    </div>
                )}

                {tab === 'live' && <LiveStudent classId={id} getToken={getToken} />}

                {tab === 'people' && (
                    <div className="grid gap-6 lg:grid-cols-2">
                        <section className={`${card} p-5`} aria-labelledby="people-heading">
                            <h2 id="people-heading" className="text-base font-bold text-slate-900 dark:text-white">Mentor</h2>
                            {data.mentor && (
                                <p className="mt-2 flex items-center gap-2 text-sm text-slate-800 dark:text-slate-200"><Avatar name={data.mentor.name} mentor /> {data.mentor.name}</p>
                            )}
                            <h2 className="mt-5 text-base font-bold text-slate-900 dark:text-white">Classmates ({data.people.length})</h2>
                            <ul className="mt-2 space-y-2">
                                {data.people.map((p, i) => (
                                    <li key={i} className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-200">
                                        <Avatar name={p.name} /> {p.name}{p.me && <span className="text-xs text-slate-500 dark:text-slate-400">(you)</span>}
                                    </li>
                                ))}
                            </ul>
                            {!c.archived && (
                                <button className={`${secondaryButton} mt-5`} onClick={leave}><LogOut className="h-4 w-4" aria-hidden="true" /> Leave class</button>
                            )}
                        </section>
                        <section className={`${card} p-5`} aria-labelledby="board-heading">
                            <h2 id="board-heading" className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
                                <Trophy className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden="true" /> Class standings
                            </h2>
                            <p className="text-xs text-slate-600 dark:text-slate-400">Points from graded classwork, then work finished on time.</p>
                            <ol className="mt-3 space-y-1.5">
                                {data.leaderboard.map((r) => (
                                    <li key={r.candidateId} className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm ${r.me ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                                        <span className="min-w-0 truncate text-slate-800 dark:text-slate-200">
                                            <span className="inline-block w-6 font-bold tabular-nums text-slate-500">{r.rank}.</span>{r.name}{r.me ? ' (you)' : ''}
                                        </span>
                                        <span className="tabular-nums text-xs text-slate-600 dark:text-slate-400"><span className="font-bold text-slate-900 dark:text-white">{r.points}</span> pts · {r.onTime} on time</span>
                                    </li>
                                ))}
                            </ol>
                        </section>
                    </div>
                )}
            </div>

            <Dialog open={!!workId} onClose={() => openWork(null)} title="Classwork" wide>
                {workId && <WorkDetail key={workId} classId={id} workId={workId} archived={c.archived} getToken={getToken} onChanged={load} />}
            </Dialog>
        </div>
    );
}

function WorkList({ title, items, onOpen }: { title: string; items: StudentWork[]; onOpen: (id: string) => void }) {
    return (
        <section aria-label={title}>
            <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">{title}</h2>
            <ul className="space-y-2">
                {items.map((w) => {
                    const meta = WORK_TYPES[w.type];
                    const Icon = meta.icon;
                    return (
                        <li key={w.id}>
                            <button onClick={() => onOpen(w.id)} className={`${card} flex w-full items-center gap-3 p-4 text-left hover:shadow-md transition-shadow cursor-pointer ${focusRing}`}>
                                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                                    <Icon className="h-5 w-5" aria-hidden="true" />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">{w.title}</span>
                                    <span className="block text-xs text-slate-600 dark:text-slate-400">
                                        {w.summary} · {dueText(w.dueAt)}{w.mine.progressLabel && w.auto ? ` · ${w.mine.progressLabel}` : ''}
                                    </span>
                                    {w.auto && !isDone(w.mine.status) && w.mine.progress > 0 && (
                                        <span className="mt-1.5 block max-w-xs"><ProgressBar value={w.mine.progress} label={`${w.title} progress`} /></span>
                                    )}
                                </span>
                                <span className="flex flex-col items-end gap-1">
                                    <StatusPill status={w.mine.status} />
                                    {typeof w.mine.grade === 'number' && <span className="text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-300">{w.mine.grade}/{w.points}</span>}
                                </span>
                            </button>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}

function WorkDetail({
    classId,
    workId,
    archived,
    getToken,
    onChanged,
}: {
    classId: string;
    workId: string;
    archived: boolean;
    getToken: () => Promise<string | null>;
    onChanged: () => Promise<void>;
}) {
    const [assignment, setAssignment] = useState<Assignment | null>(null);
    const [mine, setMine] = useState<MySubmission | null>(null);
    const [questions, setQuestions] = useState<StudentQuestion[]>([]);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const data = await getMyWork(await getToken(), classId, workId);
                if (cancelled) return;
                setAssignment(data.assignment);
                setMine(data.mine);
                setQuestions(data.questions);
            } catch (err) {
                if (!cancelled) setError(errorMessage(err, 'Could not load this classwork.'));
            }
        })();
        return () => { cancelled = true; };
    }, [classId, workId, getToken]);

    if (!assignment || !mine) return error ? <ErrorNote text={error} /> : <Spinner label="Loading classwork" />;

    const meta = WORK_TYPES[assignment.type];
    const Icon = meta.icon;
    const update = async (next: { mine: MySubmission; questions?: StudentQuestion[] }) => {
        setMine(next.mine);
        if (next.questions) setQuestions(next.questions);
        await onChanged();
    };

    return (
        <div className="space-y-5">
            <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">{assignment.title}</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">{meta.label} · {dueText(assignment.dueAt)} · {assignment.points} points</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                    <StatusPill status={mine.status} />
                    {typeof mine.grade === 'number' && <span className="text-sm font-bold tabular-nums text-slate-900 dark:text-white">{mine.grade}/{assignment.points}</span>}
                </div>
            </div>

            {assignment.instructions && <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800 dark:text-slate-200">{assignment.instructions}</p>}

            {mine.feedback && (
                <div className={`${panel} p-3`}>
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">Feedback from your mentor</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-900 dark:text-white">{mine.feedback}</p>
                </div>
            )}

            {assignment.auto && <AutoWork assignment={assignment} mine={mine} />}
            {assignment.type === 'quiz' && (
                <QuizWork classId={classId} workId={workId} questions={questions} mine={mine} disabled={archived} getToken={getToken} onDone={update} />
            )}
            {assignment.type === 'task' && (
                <TaskWork classId={classId} workId={workId} mine={mine} disabled={archived} getToken={getToken} onDone={update} />
            )}
        </div>
    );
}

function AutoWork({ assignment, mine }: { assignment: Assignment; mine: MySubmission }) {
    const done = isDone(mine.status);
    return (
        <div className="space-y-4">
            <div className={`${panel} space-y-2 p-4`}>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{assignment.summary}</p>
                <ProgressBar value={mine.progress} label="Progress" />
                <p className="text-sm text-slate-700 dark:text-slate-300">{mine.progressLabel || 'Not started'}</p>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                    {done
                        ? `Done ${formatDateTime(mine.completedAt)}. It is ticked off in your journey plan too.`
                        : 'This marks itself done when you finish the work. Nothing to hand in.'}
                </p>
            </div>
            {assignment.type === 'dsa_problems' && (
                <ul className="space-y-1.5">
                    {assignment.target.problems.map((p) => (
                        <li key={p.slug}>
                            <Link href={`/candidate/practice/${p.slug}`} className={`flex min-h-11 items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 text-sm hover:bg-slate-50 dark:border-[var(--soft-line)] dark:hover:bg-[var(--soft-raised)] ${focusRing}`}>
                                <span className="font-medium text-slate-900 dark:text-white">{p.title}</span>
                                <span className="text-xs text-slate-600 dark:text-slate-400">{p.pattern} · {p.difficulty}</span>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
            {!done && assignment.link && assignment.type !== 'dsa_problems' && (
                <Link href={assignment.link} className={primaryButton}>
                    Start now <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
            )}
        </div>
    );
}

function QuizWork({
    classId,
    workId,
    questions,
    mine,
    disabled,
    getToken,
    onDone,
}: {
    classId: string;
    workId: string;
    questions: StudentQuestion[];
    mine: MySubmission;
    disabled: boolean;
    getToken: () => Promise<string | null>;
    onDone: (next: { mine: MySubmission; questions?: StudentQuestion[] }) => Promise<void>;
}) {
    const [answers, setAnswers] = useState<(number | null)[]>(() => questions.map(() => null));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const taken = typeof mine.score === 'number';

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (answers.some((a) => a === null)) { setError('Answer every question first.'); return; }
        if (!window.confirm('Hand in the quiz? You get one attempt.')) return;
        setBusy(true);
        setError('');
        try {
            await onDone(await submitWork(await getToken(), classId, workId, { answers: answers as number[] }));
        } catch (err) {
            setError(errorMessage(err, 'Could not hand in.'));
        } finally {
            setBusy(false);
        }
    };

    if (taken) {
        return (
            <div className="space-y-3">
                <p className={`${panel} p-3 text-sm font-semibold text-slate-900 dark:text-white`}>You scored {mine.score}/100.</p>
                <ol className="space-y-3">
                    {questions.map((q) => {
                        const right = q.chosen === q.answerIndex;
                        return (
                            <li key={q.index} className="rounded-xl border border-slate-200 p-3 dark:border-[var(--soft-line)]">
                                <p className="text-sm font-medium text-slate-900 dark:text-white">{q.index + 1}. {q.prompt}</p>
                                <p className={`mt-1 flex items-center gap-1 text-sm ${right ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
                                    {right ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <XCircle className="h-4 w-4" aria-hidden="true" />}
                                    {right ? 'Correct' : `Your answer: ${q.chosen !== null && q.chosen !== undefined ? q.options[q.chosen] : 'none'}`}
                                </p>
                                {!right && q.answerIndex !== undefined && <p className="text-sm text-slate-800 dark:text-slate-200">Correct answer: {q.options[q.answerIndex]}</p>}
                                {q.explanation && <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{q.explanation}</p>}
                            </li>
                        );
                    })}
                </ol>
            </div>
        );
    }

    return (
        <form onSubmit={submit} className="space-y-3">
            <ol className="space-y-3">
                {questions.map((q) => (
                    <li key={q.index}>
                        <fieldset className="rounded-xl border border-slate-200 p-3 dark:border-[var(--soft-line)]">
                            <legend className="px-1 text-sm font-medium text-slate-900 dark:text-white">{q.index + 1}. {q.prompt}</legend>
                            <div className="mt-1 space-y-1">
                                {q.options.map((opt, k) => (
                                    <label key={k} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 text-sm ${answers[q.index] === k ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-slate-50 dark:hover:bg-[var(--soft-raised)]'}`}>
                                        <input
                                            type="radio"
                                            name={`q-${q.index}`}
                                            className="h-5 w-5 accent-blue-600"
                                            checked={answers[q.index] === k}
                                            onChange={() => setAnswers((prev) => prev.map((a, i) => (i === q.index ? k : a)))}
                                            disabled={disabled}
                                        />
                                        <span className="text-slate-800 dark:text-slate-200">{opt}</span>
                                    </label>
                                ))}
                            </div>
                        </fieldset>
                    </li>
                ))}
            </ol>
            <ErrorNote text={error} />
            <button type="submit" className={primaryButton} disabled={busy || disabled}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Hand in quiz
            </button>
        </form>
    );
}

function TaskWork({
    classId,
    workId,
    mine,
    disabled,
    getToken,
    onDone,
}: {
    classId: string;
    workId: string;
    mine: MySubmission;
    disabled: boolean;
    getToken: () => Promise<string | null>;
    onDone: (next: { mine: MySubmission }) => Promise<void>;
}) {
    const [text, setText] = useState(mine.text || '');
    const [link, setLink] = useState(mine.link || '');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const handIn = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
            await onDone(await submitWork(await getToken(), classId, workId, { text: text.trim(), link: link.trim() }));
        } catch (err) {
            setError(errorMessage(err, 'Could not hand in.'));
        } finally {
            setBusy(false);
        }
    };

    const takeBack = async () => {
        setBusy(true);
        setError('');
        try {
            await onDone({ mine: await unsubmitWork(await getToken(), classId, workId) });
        } catch (err) {
            setError(errorMessage(err, 'Could not take it back.'));
        } finally {
            setBusy(false);
        }
    };

    if (mine.turnedInAt) {
        return (
            <div className="space-y-3">
                <div className={`${panel} space-y-1 p-3`}>
                    <p className="text-xs text-slate-600 dark:text-slate-400">Handed in {formatDateTime(mine.turnedInAt)}</p>
                    {mine.text && <p className="whitespace-pre-wrap break-words text-sm text-slate-900 dark:text-white">{mine.text}</p>}
                    {mine.link && (
                        <a href={mine.link} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1 break-all text-sm font-semibold text-blue-700 hover:underline dark:text-blue-400 ${focusRing}`}>
                            <ExternalLink className="h-4 w-4 flex-shrink-0" aria-hidden="true" /> {mine.link}
                        </a>
                    )}
                </div>
                <ErrorNote text={error} />
                {!mine.returnedAt && !disabled && (
                    <button className={secondaryButton} onClick={takeBack} disabled={busy}>
                        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Take back to edit
                    </button>
                )}
            </div>
        );
    }

    return (
        <form onSubmit={handIn} className="space-y-3">
            <div>
                <label htmlFor="task-text" className={label}>Your note</label>
                <textarea id="task-text" rows={4} className={textarea} value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} disabled={disabled} />
            </div>
            <div>
                <label htmlFor="task-link" className={label}>Link <span className="font-normal text-slate-500">(GitHub, Drive, anything public)</span></label>
                <input id="task-link" type="url" inputMode="url" className={input} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" maxLength={500} disabled={disabled} />
            </div>
            <ErrorNote text={error} />
            <button type="submit" className={primaryButton} disabled={busy || disabled || (!text.trim() && !link.trim())}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Hand in
            </button>
        </form>
    );
}
