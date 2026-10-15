'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, BellRing, ExternalLink, Loader2 } from 'lucide-react';
import { errorMessage } from '@/lib/journeyApi';
import { getGrading, gradeSubmission, nudgeClass, type GradingView, type SubmissionRow, type WorkStatus } from '@/lib/mentorApi';
import { useMentor } from '@/components/classroom/MentorContext';
import {
    card,
    dueText,
    ErrorNote,
    focusRing,
    formatDateTime,
    input,
    isDone,
    panel,
    primaryButton,
    ProgressBar,
    secondaryButton,
    Spinner,
    StatusPill,
    textarea,
    WORK_TYPES,
} from '@/components/classroom/ui';

type Filter = 'all' | 'todo' | 'done' | 'missing' | 'review';

export default function GradingPage() {
    const { id, workId } = useParams<{ id: string; workId: string }>();
    const { getToken } = useMentor();
    const [data, setData] = useState<GradingView | null>(null);
    const [error, setError] = useState('');
    const [filter, setFilter] = useState<Filter>('all');
    const [nudging, setNudging] = useState(false);
    const [notice, setNotice] = useState('');

    const load = useCallback(async () => {
        try {
            setData(await getGrading(await getToken(), id, workId));
            setError('');
        } catch (err) {
            setError(errorMessage(err, 'Could not load this classwork.'));
        }
    }, [getToken, id, workId]);

    useEffect(() => { load(); }, [load]);

    if (!data) return error ? <ErrorNote text={error} /> : <Spinner label="Loading classwork" />;

    const a = data.assignment;
    const meta = WORK_TYPES[a.type];
    const Icon = meta.icon;
    const rows = data.submissions;
    const needsReview = (r: SubmissionRow) => a.type === 'task' && !!r.turnedInAt && !r.returnedAt;
    const filtered = rows.filter((r) => {
        if (filter === 'done') return isDone(r.status);
        if (filter === 'todo') return !isDone(r.status);
        if (filter === 'missing') return r.status === 'missing';
        if (filter === 'review') return needsReview(r);
        return true;
    });
    const pending = rows.filter((r) => !isDone(r.status)).length;
    const nudgedRecently = a.lastNudgedAt && Date.now() - new Date(a.lastNudgedAt).getTime() < 12 * 3600 * 1000;

    const nudge = async () => {
        setNudging(true);
        setError('');
        try {
            const n = await nudgeClass(await getToken(), id, workId);
            setNotice(`Reminder sent to ${n} student${n === 1 ? '' : 's'} through their companion.`);
            await load();
        } catch (err) {
            setError(errorMessage(err, 'Could not send reminders.'));
        } finally {
            setNudging(false);
        }
    };

    const counts: Record<Filter, number> = {
        all: rows.length,
        todo: pending,
        done: rows.filter((r) => isDone(r.status)).length,
        missing: rows.filter((r) => r.status === 'missing').length,
        review: rows.filter(needsReview).length,
    };

    return (
        <div className="space-y-5">
            <Link href={`/mentor/classes/${id}`} className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg text-sm font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white ${focusRing}`}>
                <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {data.classroom.name}
            </Link>

            <section className={`${card} p-5`}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-3">
                        <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                            <Icon className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <div>
                            <h1 className="text-xl font-bold text-slate-900 dark:text-white">{a.title}</h1>
                            <p className="text-sm text-slate-600 dark:text-slate-400">{meta.label} · {a.summary} · {dueText(a.dueAt)} · {a.points} points</p>
                            {a.instructions && <p className="mt-2 max-w-2xl whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-200">{a.instructions}</p>}
                            {a.type === 'dsa_problems' && (
                                <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">Problems: {a.target.problems.map((p) => p.title).join(', ')}</p>
                            )}
                            {a.auto && <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">Checked automatically from each student&apos;s practice. Done work is graded full marks.</p>}
                        </div>
                    </div>
                    {pending > 0 && (
                        <button className={secondaryButton} onClick={nudge} disabled={nudging || !!nudgedRecently} title={nudgedRecently ? 'You can remind again 12 hours after the last reminder' : undefined}>
                            {nudging ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <BellRing className="h-4 w-4" aria-hidden="true" />}
                            {nudgedRecently ? 'Reminded recently' : `Remind ${pending} student${pending === 1 ? '' : 's'}`}
                        </button>
                    )}
                </div>
            </section>

            {notice && <p className={`${panel} px-4 py-2 text-sm text-slate-800 dark:text-slate-200`} role="status">{notice}</p>}
            <ErrorNote text={error} />

            {a.type === 'quiz' && data.questionStats.length > 0 && data.questionStats[0].answered > 0 && (
                <section className={`${card} p-5`} aria-labelledby="qstats-heading">
                    <h2 id="qstats-heading" className="text-base font-bold text-slate-900 dark:text-white">How the class answered</h2>
                    <ol className="mt-3 space-y-3">
                        {data.questionStats.map((q) => (
                            <li key={q.index}>
                                <div className="flex justify-between gap-3 text-sm">
                                    <span className="min-w-0 text-slate-800 dark:text-slate-200">{q.index + 1}. {q.prompt}</span>
                                    <span className="flex-shrink-0 tabular-nums text-slate-600 dark:text-slate-400">{q.correct}/{q.answered} right</span>
                                </div>
                                <div className="mt-1"><ProgressBar value={q.answered ? q.correct / q.answered : 0} label={`Question ${q.index + 1} correct share`} /></div>
                            </li>
                        ))}
                    </ol>
                </section>
            )}

            <div className="flex flex-wrap gap-2" role="group" aria-label="Filter students">
                {(['all', 'todo', 'done', 'missing', ...(a.type === 'task' ? ['review'] : [])] as Filter[]).map((f) => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        aria-pressed={filter === f}
                        className={`min-h-11 rounded-full border px-4 text-sm font-semibold cursor-pointer ${focusRing} ${filter === f ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-[var(--soft-line)] dark:bg-transparent dark:text-slate-200 dark:hover:bg-[var(--soft-raised)]'}`}
                    >
                        {{ all: 'All', todo: 'Not done', done: 'Done', missing: 'Missing', review: 'To grade' }[f]} ({counts[f]})
                    </button>
                ))}
            </div>

            {filtered.length === 0 ? (
                <div className={`${card} p-8 text-center text-sm text-slate-600 dark:text-slate-400`}>Nobody here.</div>
            ) : (
                <ul className="space-y-3">
                    {filtered.map((r) => (
                        <li key={r.candidateId}>
                            <SubmissionCard row={r} grading={data} onSaved={load} classId={id} workId={workId} getToken={getToken} />
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function SubmissionCard({
    row,
    grading,
    onSaved,
    classId,
    workId,
    getToken,
}: {
    row: SubmissionRow;
    grading: GradingView;
    onSaved: () => Promise<void>;
    classId: string;
    workId: string;
    getToken: () => Promise<string | null>;
}) {
    const a = grading.assignment;
    const [grade, setGrade] = useState(row.grade === null ? '' : String(row.grade));
    const [feedback, setFeedback] = useState(row.feedback || '');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [saved, setSaved] = useState(false);
    const canGrade = a.type === 'task' ? !!row.turnedInAt : isDone(row.status as WorkStatus);

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
            await gradeSubmission(await getToken(), classId, workId, row.candidateId, { grade: grade === '' ? null : Number(grade), feedback: feedback.trim() });
            setSaved(true);
            await onSaved();
        } catch (err) {
            setError(errorMessage(err, 'Could not save.'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className={`${card} p-4`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-bold text-slate-900 dark:text-white">{row.name}</p>
                <div className="flex items-center gap-2">
                    {typeof row.grade === 'number' && <span className="text-sm font-bold tabular-nums text-slate-900 dark:text-white">{row.grade}/{a.points}</span>}
                    <StatusPill status={row.status} />
                </div>
            </div>

            {a.auto && (
                <div className="mt-2">
                    <p className="text-xs text-slate-600 dark:text-slate-400">{row.progressLabel || 'Not started'}</p>
                    <div className="mt-1 max-w-sm"><ProgressBar value={row.progress} label={`${row.name} progress`} /></div>
                </div>
            )}

            {a.type === 'quiz' && typeof row.score === 'number' && (
                <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">Scored {row.score}/100 · handed in {formatDateTime(row.turnedInAt)}</p>
            )}

            {a.type === 'task' && row.turnedInAt && (
                <div className={`${panel} mt-3 space-y-1 p-3`}>
                    <p className="text-xs text-slate-600 dark:text-slate-400">Handed in {formatDateTime(row.turnedInAt)}</p>
                    {row.text && <p className="whitespace-pre-wrap break-words text-sm text-slate-800 dark:text-slate-200">{row.text}</p>}
                    {row.link && (
                        <a href={row.link} target="_blank" rel="noopener noreferrer nofollow" className={`inline-flex items-center gap-1 break-all text-sm font-semibold text-blue-700 hover:underline dark:text-blue-400 ${focusRing}`}>
                            <ExternalLink className="h-4 w-4 flex-shrink-0" aria-hidden="true" /> {row.link}
                        </a>
                    )}
                </div>
            )}

            {canGrade && (
                <form onSubmit={save} className="mt-3 grid gap-2 sm:grid-cols-[8rem_1fr_auto] sm:items-end">
                    <div>
                        <label htmlFor={`grade-${row.candidateId}`} className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">Grade / {a.points}</label>
                        <input id={`grade-${row.candidateId}`} type="number" min={0} max={a.points} step="0.5" className={input} value={grade} onChange={(e) => { setGrade(e.target.value); setSaved(false); }} />
                    </div>
                    <div>
                        <label htmlFor={`fb-${row.candidateId}`} className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">Feedback (the student sees it)</label>
                        <textarea id={`fb-${row.candidateId}`} rows={1} className={textarea} value={feedback} onChange={(e) => { setFeedback(e.target.value); setSaved(false); }} maxLength={2000} />
                    </div>
                    <button type="submit" className={primaryButton} disabled={busy}>
                        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} {row.returnedAt ? 'Update' : 'Return'}
                    </button>
                    <div className="sm:col-span-3">
                        <ErrorNote text={error} />
                        {saved && <p className="text-sm text-emerald-700 dark:text-emerald-400" role="status">Returned. The student was told through their companion.</p>}
                    </div>
                </form>
            )}
        </div>
    );
}
