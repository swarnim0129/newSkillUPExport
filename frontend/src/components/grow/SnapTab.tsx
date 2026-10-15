'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Camera, CheckCircle2, FlaskConical, Layers, ListChecks, Loader2, Milestone, RotateCw, ScrollText, Trash2, Upload, XCircle } from 'lucide-react';
import { errorMessage } from '@/lib/journeyApi';
import { createSnap, deleteSnap, listSnaps, snapToPlan, type SnapNote } from '@/lib/growApi';
import { card, ErrorNote, focusRing, iconButton, panel, primaryButton, secondaryButton, Spinner, Tabs } from '@/components/classroom/ui';

type View = 'summary' | 'quiz' | 'cards';

export default function SnapTab({ getToken }: { getToken: () => Promise<string | null> }) {
    const [snaps, setSnaps] = useState<SnapNote[] | null>(null);
    const [selected, setSelected] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [uploading, setUploading] = useState(false);
    const [dragging, setDragging] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    const load = useCallback(async () => {
        try {
            const next = await listSnaps(await getToken());
            setSnaps(next);
            setSelected((s) => s ?? next[0]?.id ?? null);
        } catch (err) {
            setError(errorMessage(err, 'Could not load your notes.'));
        }
    }, [getToken]);
    useEffect(() => { void Promise.resolve().then(load); }, [load]);

    const upload = async (file: File | undefined) => {
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) { setError('That file is over 10 MB. Try a smaller photo.'); return; }
        setUploading(true);
        setError('');
        try {
            const snap = await createSnap(await getToken(), file);
            setSnaps((prev) => [snap, ...(prev || [])]);
            setSelected(snap.id);
        } catch (err) {
            setError(errorMessage(err, 'Could not read that file.'));
        } finally {
            setUploading(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    if (!snaps) return error ? <ErrorNote text={error} /> : <Spinner label="Loading your notes" />;
    const snap = snaps.find((s) => s.id === selected) || null;

    return (
        <div className="grid gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
            <div className="space-y-4">
                <div
                    onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files[0]); }}
                    className={`${card} border-2 border-dashed p-5 text-center transition-colors ${dragging ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-500/10' : ''}`}
                >
                    {uploading ? (
                        <div role="status" className="py-4">
                            <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-600" aria-hidden="true" />
                            <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">Reading your notes…</p>
                            <p className="text-xs text-slate-600 dark:text-slate-400">Writing a summary, 5 questions and flashcards. About 20 seconds.</p>
                        </div>
                    ) : (
                        <>
                            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-[0_8px_18px_-8px_rgb(37_99_235/0.8)]"><Camera className="h-6 w-6" aria-hidden="true" /></span>
                            <p className="mt-3 text-sm font-bold text-slate-900 dark:text-white">Snap your notes or the whiteboard</p>
                            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Photo or PDF, up to 10 MB. You get a summary, a quiz and flashcards.</p>
                            <input ref={fileRef} id="snap-file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
                            <label htmlFor="snap-file" className={`${primaryButton} mt-4`}><Upload className="h-4 w-4" aria-hidden="true" /> Choose a photo or PDF</label>
                        </>
                    )}
                </div>
                <ErrorNote text={error} />
                {snaps.length > 0 && (
                    <ul className="space-y-2" aria-label="Your snapped notes">
                        {snaps.map((s) => (
                            <li key={s.id}>
                                <button onClick={() => setSelected(s.id)} aria-pressed={selected === s.id} className={`${card} w-full p-3 text-left cursor-pointer ${focusRing} ${selected === s.id ? 'ring-2 ring-blue-500' : ''}`}>
                                    <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">{s.title}</span>
                                    <span className="block text-xs text-slate-500 dark:text-slate-400">{s.subject || 'Notes'} · {new Date(s.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {snap ? (
                <SnapDetail
                    key={snap.id}
                    snap={snap}
                    getToken={getToken}
                    onUpdate={(next) => setSnaps((prev) => (prev || []).map((p) => (p.id === next.id ? next : p)))}
                    onDelete={async () => {
                        if (!window.confirm('Delete these notes?')) return;
                        await deleteSnap(await getToken(), snap.id);
                        setSnaps((prev) => (prev || []).filter((p) => p.id !== snap.id));
                        setSelected(null);
                    }}
                />
            ) : (
                <div className={`${card} flex items-center justify-center p-10 text-center text-sm text-slate-600 dark:text-slate-400`}>
                    Your snapped notes show up here, ready to revise.
                </div>
            )}
        </div>
    );
}

function SnapDetail({ snap, getToken, onUpdate, onDelete }: { snap: SnapNote; getToken: () => Promise<string | null>; onUpdate: (s: SnapNote) => void; onDelete: () => void }) {
    const [view, setView] = useState<View>('summary');
    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState('');

    const addToPlan = async () => {
        setBusy(true);
        try {
            const r = await snapToPlan(await getToken(), snap.id);
            onUpdate({ ...snap, addedToPlan: true });
            setNote(r.added ? 'Added a revision milestone due in 3 days.' : 'It is already in your plan.');
        } catch (err) {
            setNote(errorMessage(err, 'Could not add it to your plan.'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <section className={`${card} p-5`} aria-labelledby="snap-title">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h2 id="snap-title" className="text-xl font-bold text-slate-900 dark:text-white">{snap.title}</h2>
                    <p className="text-sm text-slate-600 dark:text-slate-400">{[snap.subject, snap.topics.join(', ')].filter(Boolean).join(' · ')}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {!snap.addedToPlan && (
                        <button className={secondaryButton} onClick={addToPlan} disabled={busy}>
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Milestone className="h-4 w-4" aria-hidden="true" />} Add revision to my plan
                        </button>
                    )}
                    {snap.subject && (
                        <Link href={`/candidate/practice?tab=lab&subject=${encodeURIComponent(snap.subject)}`} className={secondaryButton}>
                            <FlaskConical className="h-4 w-4" aria-hidden="true" /> Lab set
                        </Link>
                    )}
                    <button className={iconButton} onClick={onDelete} aria-label="Delete these notes"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                </div>
            </div>
            {note && <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-400" role="status">{note}</p>}

            <div className="mt-4">
                <Tabs<View>
                    label="Study views"
                    value={view}
                    onChange={setView}
                    tabs={[
                        { key: 'summary', label: 'Summary' },
                        { key: 'quiz', label: `Quiz (${snap.questions.length})` },
                        { key: 'cards', label: `Flashcards (${snap.flashcards.length})` },
                    ]}
                />
            </div>
            <div role="tabpanel" className="mt-4">
                {view === 'summary' && (
                    <div className="space-y-4">
                        <ul className="space-y-2">
                            {snap.summary.map((p, i) => (
                                <li key={i} className="flex items-start gap-2.5 text-sm leading-relaxed text-slate-800 dark:text-slate-200">
                                    <ScrollText className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" /> {p}
                                </li>
                            ))}
                        </ul>
                        {snap.formulas.length > 0 && (
                            <div className={`${panel} p-3`}>
                                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Formulas and definitions</p>
                                <ul className="space-y-1.5">
                                    {snap.formulas.map((f, i) => <li key={i} className="font-mono text-sm text-slate-900 dark:text-white">{f}</li>)}
                                </ul>
                            </div>
                        )}
                    </div>
                )}
                {view === 'quiz' && <Quiz questions={snap.questions} />}
                {view === 'cards' && <Cards cards={snap.flashcards} />}
            </div>
        </section>
    );
}

function Quiz({ questions }: { questions: SnapNote['questions'] }) {
    const [answers, setAnswers] = useState<(number | null)[]>(() => questions.map(() => null));
    const [checked, setChecked] = useState(false);
    const score = answers.filter((a, i) => a === questions[i].answerIndex).length;
    return (
        <div className="space-y-3">
            {checked && <p className={`${panel} p-3 text-sm font-semibold text-slate-900 dark:text-white`} role="status">You got {score} of {questions.length}.</p>}
            <ol className="space-y-3">
                {questions.map((q, i) => (
                    <li key={i}>
                        <fieldset className="rounded-xl border border-slate-200 p-3 dark:border-white/10">
                            <legend className="px-1 text-sm font-medium text-slate-900 dark:text-white">{i + 1}. {q.prompt}</legend>
                            <div className="mt-1 space-y-1">
                                {q.options.map((o, k) => {
                                    const right = checked && k === q.answerIndex;
                                    const wrong = checked && answers[i] === k && k !== q.answerIndex;
                                    return (
                                        <label key={k} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 text-sm ${right ? 'bg-emerald-50 dark:bg-emerald-500/10' : wrong ? 'bg-red-50 dark:bg-red-500/10' : answers[i] === k ? 'bg-blue-50 dark:bg-blue-500/10' : 'hover:bg-slate-50 dark:hover:bg-white/5'}`}>
                                            <input type="radio" name={`sq-${i}`} className="h-5 w-5 accent-blue-600" checked={answers[i] === k} disabled={checked} onChange={() => setAnswers((prev) => prev.map((a, j) => (j === i ? k : a)))} />
                                            <span className="flex-1 text-slate-800 dark:text-slate-200">{o}</span>
                                            {right && <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label="Correct answer" />}
                                            {wrong && <XCircle className="h-4 w-4 text-red-600" aria-label="Your answer, wrong" />}
                                        </label>
                                    );
                                })}
                            </div>
                            {checked && q.explanation && <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{q.explanation}</p>}
                        </fieldset>
                    </li>
                ))}
            </ol>
            {checked ? (
                <button className={secondaryButton} onClick={() => { setAnswers(questions.map(() => null)); setChecked(false); }}><RotateCw className="h-4 w-4" aria-hidden="true" /> Try again</button>
            ) : (
                <button className={primaryButton} onClick={() => setChecked(true)} disabled={answers.some((a) => a === null)}><ListChecks className="h-4 w-4" aria-hidden="true" /> Check answers</button>
            )}
        </div>
    );
}

function Cards({ cards }: { cards: SnapNote['flashcards'] }) {
    const [index, setIndex] = useState(0);
    const [flipped, setFlipped] = useState(false);
    if (!cards.length) return <p className="text-sm text-slate-600 dark:text-slate-400">No flashcards for these notes.</p>;
    const card2 = cards[index];
    const go = (d: number) => { setIndex((i) => (i + d + cards.length) % cards.length); setFlipped(false); };
    return (
        <div className="mx-auto max-w-lg">
            <button
                onClick={() => setFlipped((f) => !f)}
                aria-label={flipped ? 'Show the question' : 'Show the answer'}
                className={`flex min-h-56 w-full flex-col items-center justify-center rounded-2xl p-6 text-center shadow-[var(--neu-raise)] transition-colors cursor-pointer ${focusRing} ${flipped ? 'bg-blue-600 text-white' : 'border border-white/70 bg-white/70 text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-white'}`}
            >
                <span className={`mb-3 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide ${flipped ? 'text-white/80' : 'text-slate-500 dark:text-slate-400'}`}>
                    <Layers className="h-3.5 w-3.5" aria-hidden="true" /> {flipped ? 'Answer' : 'Question'} · {index + 1}/{cards.length}
                </span>
                <span className="text-lg font-semibold leading-snug" aria-live="polite">{flipped ? card2.back : card2.front}</span>
                <span className={`mt-4 text-xs ${flipped ? 'text-white/80' : 'text-slate-500 dark:text-slate-400'}`}>Tap to flip</span>
            </button>
            <div className="mt-3 flex justify-between">
                <button className={secondaryButton} onClick={() => go(-1)}>Previous</button>
                <button className={secondaryButton} onClick={() => go(1)}>Next</button>
            </div>
        </div>
    );
}
