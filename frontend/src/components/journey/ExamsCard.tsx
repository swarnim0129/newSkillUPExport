'use client';

import React, { useState } from 'react';
import { CalendarDays, Loader2, Plus, Trash2 } from 'lucide-react';
import { addExam, errorMessage, removeExam, type Journey } from '@/lib/journeyApi';

const card = 'bg-white dark:bg-[var(--soft-surface)] rounded-2xl shadow-sm dark:shadow-black/20 border border-slate-200 dark:border-[var(--soft-line)]';
const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-black';
const input = `w-full min-h-11 px-3 rounded-lg border border-slate-300 dark:border-[var(--soft-line)] bg-white dark:bg-[var(--soft-sunken)] text-slate-900 dark:text-white text-sm ${focusRing}`;
const label = 'block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1';

function formatDate(value: string) {
    return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// Dates are picked on the journey clock, which can be ahead of the real date in demo mode
function toInputDate(value: string) {
    return new Date(value).toISOString().slice(0, 10);
}

export default function ExamsCard({
    journey,
    setJourney,
    getToken,
}: {
    journey: Journey;
    setJourney: (journey: Journey) => void;
    getToken: () => Promise<string | null>;
}) {
    const today = toInputDate(journey.now);
    const [open, setOpen] = useState(false);
    const [title, setTitle] = useState('');
    const [start, setStart] = useState(today);
    const [end, setEnd] = useState(today);
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');
    const [note, setNote] = useState('');

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy('add');
        setError('');
        try {
            const result = await addExam(await getToken(), {
                title: title.trim(),
                startAt: new Date(`${start}T09:00:00`).toISOString(),
                endAt: new Date(`${end}T18:00:00`).toISOString(),
            });
            setJourney(result.journey);
            const moved = result.changes.filter((c) => c.action === 'move').length;
            setNote(moved ? `${moved} milestone${moved > 1 ? 's' : ''} moved out of the exam period.` : 'Nothing was due during the exam period.');
            setTitle('');
            setOpen(false);
        } catch (err) {
            setError(errorMessage(err, 'Could not add the exam.'));
        } finally {
            setBusy('');
        }
    };

    const remove = async (id: string) => {
        setBusy(id);
        setError('');
        try {
            setJourney(await removeExam(await getToken(), id));
        } catch (err) {
            setError(errorMessage(err, 'Could not remove the exam.'));
        } finally {
            setBusy('');
        }
    };

    return (
        <section className={`${card} p-5`} aria-labelledby="exams-heading">
            <h2 id="exams-heading" className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
                <CalendarDays className="h-5 w-5 text-blue-600 dark:text-blue-400" aria-hidden="true" /> Exams
            </h2>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Add your exam dates and the plan keeps that time clear, with a revision task just before.</p>

            {journey.exams.length > 0 && (
                <ul className="mt-3 space-y-2">
                    {journey.exams.map((exam) => (
                        <li key={exam.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-[var(--soft-line)] bg-slate-50 dark:bg-[var(--soft-sunken)] p-3">
                            <span>
                                <span className="block text-sm font-semibold text-slate-900 dark:text-white">{exam.title}</span>
                                <span className="block text-xs text-slate-600 dark:text-slate-400">{formatDate(exam.startAt)} to {formatDate(exam.endAt)}</span>
                            </span>
                            <button
                                className={`flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-[var(--soft-raised)] ${focusRing}`}
                                onClick={() => remove(exam.id)}
                                disabled={!!busy}
                                aria-label={`Remove ${exam.title}`}
                            >
                                {busy === exam.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            {note && <p className="mt-3 text-sm text-slate-700 dark:text-slate-300" role="status">{note}</p>}
            {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>}

            {open ? (
                <form onSubmit={save} className="mt-3 space-y-3">
                    <div>
                        <label htmlFor="exam-title" className={label}>Exam</label>
                        <input id="exam-title" className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Mid-semester exams" required maxLength={80} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label htmlFor="exam-start" className={label}>Starts</label>
                            <input id="exam-start" type="date" className={input} value={start} min={today} onChange={(e) => { setStart(e.target.value); if (e.target.value > end) setEnd(e.target.value); }} required />
                        </div>
                        <div>
                            <label htmlFor="exam-end" className={label}>Ends</label>
                            <input id="exam-end" type="date" className={input} value={end} min={start} onChange={(e) => setEnd(e.target.value)} required />
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button type="submit" className={`inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 ${focusRing}`} disabled={!!busy}>
                            {busy === 'add' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Add exam
                        </button>
                        <button type="button" className={`inline-flex min-h-11 items-center rounded-lg border border-slate-300 dark:border-[var(--soft-line)] px-4 text-sm font-semibold text-slate-700 dark:text-slate-200 ${focusRing}`} onClick={() => setOpen(false)}>
                            Cancel
                        </button>
                    </div>
                </form>
            ) : (
                <button className={`mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 dark:border-[var(--soft-line)] px-4 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[var(--soft-raised)] ${focusRing}`} onClick={() => { setOpen(true); setNote(''); }}>
                    <Plus className="h-4 w-4" aria-hidden="true" /> Add exam dates
                </button>
            )}
        </section>
    );
}
