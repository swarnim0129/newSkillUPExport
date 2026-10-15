'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, CalendarDays, CheckCircle2, Clock3, Loader2, Send, Shield, ShieldAlert, ShieldCheck, type LucideIcon } from 'lucide-react';
import { errorMessage } from '@/lib/journeyApi';
import { getStudent, sendMentorNote, type MenteeDetail, type MenteeSummary } from '@/lib/mentorApi';
import { card, ErrorNote, formatDate, panel, primaryButton, StatusPill, textarea } from './ui';

// Risk always shows as icon plus words, never colour alone
export const RISK: Record<MenteeSummary['risk'], { label: string; icon: LucideIcon; className: string }> = {
    high: { label: 'Needs attention', icon: ShieldAlert, className: 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' },
    medium: { label: 'Watch', icon: Shield, className: 'text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800' },
    low: { label: 'On track', icon: ShieldCheck, className: 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' },
};

export function RiskPill({ risk }: { risk: MenteeSummary['risk'] }) {
    const r = RISK[risk];
    const Icon = r.icon;
    return (
        <span className={`inline-flex flex-shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${r.className}`}>
            <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {r.label}
        </span>
    );
}

export function goalText(goal: MenteeSummary['goal']) {
    const names: Record<string, string> = {
        placement: 'Placement',
        higher_studies: 'Higher studies',
        govt_exam: 'Government exam',
        startup: 'Startup',
        undecided: 'Undecided',
    };
    return `${names[goal.type] || goal.type}${goal.targetRole ? ` · ${goal.targetRole}` : ''}`;
}

export function Metric({ label, value }: { label: string; value: string }) {
    return (
        <div className={`${panel} p-2 text-center`}>
            <p className="text-[11px] text-slate-600 dark:text-slate-400">{label}</p>
            <p className="text-sm font-bold tabular-nums text-slate-900 dark:text-white">{value}</p>
        </div>
    );
}

/** Everything a mentor sees about one student, plus a private note box. */
export default function StudentPanel({ candidateId, getToken }: { candidateId: string; getToken: () => Promise<string | null> }) {
    const [detail, setDetail] = useState<MenteeDetail | null>(null);
    const [error, setError] = useState('');
    const [note, setNote] = useState('');
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const data = await getStudent(await getToken(), candidateId);
                if (!cancelled) setDetail(data);
            } catch (err) {
                if (!cancelled) setError(errorMessage(err, 'Could not load this student.'));
            }
        })();
        return () => { cancelled = true; };
    }, [candidateId, getToken]);

    const send = async (e: React.FormEvent) => {
        e.preventDefault();
        setSending(true);
        setError('');
        try {
            await sendMentorNote(await getToken(), candidateId, note.trim());
            setNote('');
            setSent(true);
        } catch (err) {
            setError(errorMessage(err, 'Could not send the note.'));
        } finally {
            setSending(false);
        }
    };

    if (error && !detail) return <div className={`${card} p-6`}><ErrorNote text={error} /></div>;
    if (!detail) {
        return (
            <div className={`${card} flex h-48 items-center justify-center`} role="status">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600" aria-hidden="true" />
                <span className="sr-only">Loading student</span>
            </div>
        );
    }

    const s = detail.summary;
    const noteForm = (
        <form onSubmit={send} className="border-t border-slate-200 dark:border-[var(--soft-line)] pt-4">
            <label htmlFor="mentor-note" className="block text-sm font-semibold text-slate-900 dark:text-white">Private note</label>
            <p className="text-xs text-slate-600 dark:text-slate-400">Only this student sees it, in their companion chat. The companion keeps it in mind.</p>
            <textarea
                id="mentor-note"
                rows={3}
                maxLength={1000}
                className={`mt-2 ${textarea}`}
                value={note}
                onChange={(e) => { setNote(e.target.value); setSent(false); }}
                required
            />
            <ErrorNote text={error} />
            <div className="mt-2 flex items-center gap-3">
                <button type="submit" className={primaryButton} disabled={sending || !note.trim()}>
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />} Send note
                </button>
                {sent && <span className="text-sm text-emerald-700 dark:text-emerald-400" role="status">Sent.</span>}
            </div>
        </form>
    );

    if (!s) {
        return (
            <section className={`${card} space-y-4 p-5`}>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">{detail.name}</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">{detail.message}</p>
                {noteForm}
            </section>
        );
    }

    return (
        <section className={`${card} space-y-5 p-5`} aria-labelledby="student-heading">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <h2 id="student-heading" className="text-lg font-bold text-slate-900 dark:text-white">{s.name}</h2>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                        {s.branch} · Sem {s.semester} ({s.stage}) · {goalText(s.goal)}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                        Last active {formatDate(s.lastActiveAt)} · {s.dsa.mastered} DSA patterns mastered · {s.dsa.dueReviews} reviews due
                    </p>
                </div>
                <RiskPill risk={s.risk} />
            </div>

            <div className="grid grid-cols-3 gap-2">
                <Metric label="Plan done" value={`${s.planPercent}%`} />
                <Metric label="Readiness" value={`${s.readiness}`} />
                <Metric label="Projected" value={s.projected === null ? 'n/a' : `${s.projected}`} />
            </div>

            {s.flags.length > 0 && (
                <ul className="space-y-1">
                    {s.flags.map((f) => (
                        <li key={f.code} className="flex items-start gap-1.5 text-sm text-slate-700 dark:text-slate-300">
                            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" /> {f.label}
                        </li>
                    ))}
                </ul>
            )}

            {detail.classwork && detail.classwork.length > 0 && (
                <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Classwork in your classes</h3>
                    <ul className="mt-2 space-y-1.5">
                        {detail.classwork.map((w, i) => (
                            <li key={i} className="flex items-center justify-between gap-2 text-sm">
                                <span className="min-w-0 truncate text-slate-800 dark:text-slate-200">
                                    {w.title}
                                    {w.progressLabel && <span className="text-xs text-slate-500 dark:text-slate-400"> · {w.progressLabel}</span>}
                                </span>
                                <span className="flex items-center gap-2">
                                    {typeof w.grade === 'number' && <span className="text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-300">{w.grade}/{w.points}</span>}
                                    <StatusPill status={w.status} />
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Coming up in their plan</h3>
                <ul className="mt-2 space-y-1.5">
                    {(detail.upcoming || []).map((m) => (
                        <li key={m.id} className="flex items-start gap-2 text-sm">
                            {m.overdue ? (
                                <Clock3 className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                            ) : (
                                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" aria-hidden="true" />
                            )}
                            <span className="text-slate-800 dark:text-slate-200">
                                {m.title}
                                <span className="text-xs text-slate-500 dark:text-slate-400"> · {m.overdue ? 'past due' : 'due'} {formatDate(m.dueAt)}{m.origin === 'remedial' ? ' · added after a result' : m.origin === 'mentor' ? ' · class work' : ''}</span>
                            </span>
                        </li>
                    ))}
                </ul>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
                <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Weakest tested skills</h3>
                    {!detail.skills?.length ? (
                        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Nothing tested yet.</p>
                    ) : (
                        <ul className="mt-2 space-y-2">
                            {detail.skills.slice(0, 5).map((sk) => (
                                <li key={sk.name}>
                                    <div className="flex justify-between text-xs text-slate-700 dark:text-slate-300"><span>{sk.name}</span><span className="tabular-nums">{sk.level}</span></div>
                                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-[var(--soft-line)]" aria-hidden="true">
                                        <div className="h-full rounded-full bg-blue-600 dark:bg-blue-500" style={{ width: `${sk.level}%` }} />
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Recent mistakes</h3>
                    {!detail.mistakes?.length ? (
                        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">None recorded.</p>
                    ) : (
                        <ul className="mt-2 space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                            {detail.mistakes.map((m, i) => (
                                <li key={i}><span className="font-semibold">{m.title}:</span> {m.explanation}</li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>

            {!!detail.exams?.length && (
                <p className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300">
                    <CalendarDays className="h-4 w-4" aria-hidden="true" />
                    Exams: {detail.exams.map((e) => `${e.title} (${formatDate(e.startAt)})`).join(', ')}
                </p>
            )}

            <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Recent plan changes</h3>
                <ul className="mt-2 space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                    {(detail.changeLog || []).map((c, i) => (
                        <li key={i}><span className="text-slate-500 dark:text-slate-400">{formatDate(c.at)}:</span> {c.summary}</li>
                    ))}
                </ul>
            </div>

            {noteForm}
        </section>
    );
}
