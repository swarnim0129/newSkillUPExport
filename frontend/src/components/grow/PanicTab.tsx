'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BookOpen, Coffee, Flame, Loader2, Moon, Plus, RotateCcw, Siren, Target, Trash2, Zap, type LucideIcon } from 'lucide-react';
import { errorMessage } from '@/lib/journeyApi';
import { createSprint, deleteSprint, listSprints, toggleSprintBlock, type Sprint, type SprintBlock } from '@/lib/growApi';
import { card, ErrorNote, iconButton, input, label, panel, primaryButton, ProgressBar, secondaryButton, Spinner } from '@/components/classroom/ui';

const KIND: Record<SprintBlock['kind'], { label: string; icon: LucideIcon; className: string }> = {
    learn: { label: 'Learn', icon: BookOpen, className: 'bg-blue-600 text-white' },
    review: { label: 'Review', icon: RotateCcw, className: 'bg-violet-600 text-white' },
    practice: { label: 'Quiz burst', icon: Zap, className: 'bg-amber-500 text-slate-900' },
    break: { label: 'Break', icon: Coffee, className: 'bg-emerald-600 text-white' },
    sleep: { label: 'Sleep', icon: Moon, className: 'bg-slate-700 text-white' },
};

const CONFIDENCE = ['', 'Shaky', 'Okay', 'Solid'];

function toLocalInput(date: Date) {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function countdown(to: string, now: number) {
    const ms = new Date(to).getTime() - now;
    if (ms <= 0) return 'Exam time';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h ${m}m` : `${h}h ${m}m`;
}

export default function PanicTab({ getToken }: { getToken: () => Promise<string | null> }) {
    const [sprints, setSprints] = useState<Sprint[] | null>(null);
    const [error, setError] = useState('');
    const [creating, setCreating] = useState(false);
    const [now, setNow] = useState(() => Date.now());

    const load = useCallback(async () => {
        try {
            const next = await listSprints(await getToken());
            setSprints(next);
        } catch (err) {
            setError(errorMessage(err, 'Could not load your sprints.'));
        }
    }, [getToken]);
    useEffect(() => { void Promise.resolve().then(load); }, [load]);
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 30000);
        return () => clearInterval(t);
    }, []);

    if (!sprints) return error ? <ErrorNote text={error} /> : <Spinner label="Loading panic mode" />;
    const active = sprints.find((s) => s.active && new Date(s.examAt).getTime() > now);

    if (!active || creating) {
        return (
            <SprintForm
                getToken={getToken}
                onCancel={active ? () => setCreating(false) : undefined}
                onCreated={(s) => { setSprints((prev) => [s, ...(prev || []).map((p) => ({ ...p, active: false }))]); setCreating(false); }}
            />
        );
    }

    return (
        <SprintView
            sprint={active}
            now={now}
            getToken={getToken}
            onChange={(s) => setSprints((prev) => (prev || []).map((p) => (p.id === s.id ? s : p)))}
            onNew={() => setCreating(true)}
            onDelete={async () => {
                if (!window.confirm('Delete this sprint?')) return;
                await deleteSprint(await getToken(), active.id);
                setSprints((prev) => (prev || []).filter((p) => p.id !== active.id));
            }}
        />
    );
}

function SprintForm({ getToken, onCreated, onCancel }: { getToken: () => Promise<string | null>; onCreated: (s: Sprint) => void; onCancel?: () => void }) {
    const [subject, setSubject] = useState('');
    const [examAt, setExamAt] = useState(() => {
        const d = new Date(Date.now() + 2 * 86400000);
        d.setHours(10, 0, 0, 0);
        return toLocalInput(d);
    });
    const [hours, setHours] = useState(6);
    const [topics, setTopics] = useState<{ name: string; confidence: number }[]>([{ name: '', confidence: 1 }, { name: '', confidence: 2 }]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [skipped, setSkipped] = useState<string[]>([]);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
            const r = await createSprint(await getToken(), {
                subject: subject.trim(),
                examAt: new Date(examAt).toISOString(),
                hoursPerDay: hours,
                topics: topics.filter((t) => t.name.trim()).map((t) => ({ name: t.name.trim(), confidence: t.confidence })),
            });
            setSkipped(r.skipped);
            onCreated(r.sprint);
        } catch (err) {
            setError(errorMessage(err, 'Could not build your sprint.'));
            setBusy(false);
        }
    };

    return (
        <form onSubmit={submit} className={`${card} mx-auto max-w-2xl space-y-5 p-6`}>
            <div className="flex items-start gap-3">
                <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-red-600 text-white shadow-[0_8px_18px_-8px_rgb(220_38_38/0.7)]"><Siren className="h-6 w-6" aria-hidden="true" /></span>
                <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">Exam soon? Breathe.</h2>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Tell me what is coming. I will lay out every hour until the exam: shaky topics first, quick quiz bursts, breaks, and sleep.</p>
                </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
                <div>
                    <label htmlFor="pm-subject" className={label}>Subject</label>
                    <input id="pm-subject" className={input} value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={100} required placeholder="Strength of materials" />
                </div>
                <div>
                    <label htmlFor="pm-exam" className={label}>Exam starts</label>
                    <input id="pm-exam" type="datetime-local" className={input} value={examAt} onChange={(e) => setExamAt(e.target.value)} required />
                </div>
            </div>
            <div>
                <div className="flex items-baseline justify-between">
                    <label htmlFor="pm-hours" className="text-sm font-medium text-slate-800 dark:text-slate-200">Study hours a day</label>
                    <span className="text-lg font-bold tabular-nums text-blue-700 dark:text-blue-400">{hours}</span>
                </div>
                <input id="pm-hours" type="range" min={2} max={12} value={hours} onChange={(e) => setHours(Number(e.target.value))} className="w-full accent-blue-600" />
            </div>
            <fieldset>
                <legend className={label}>Topics, and how sure you feel</legend>
                <ul className="space-y-2">
                    {topics.map((t, i) => (
                        <li key={i} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <label htmlFor={`pm-topic-${i}`} className="sr-only">Topic {i + 1}</label>
                            <input id={`pm-topic-${i}`} className={input} value={t.name} maxLength={100} placeholder={`Topic ${i + 1}`} onChange={(e) => setTopics((prev) => prev.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                            <div className="flex gap-1" role="radiogroup" aria-label={`Confidence for topic ${i + 1}`}>
                                {[1, 2, 3].map((c) => (
                                    <button
                                        key={c}
                                        type="button"
                                        role="radio"
                                        aria-checked={t.confidence === c}
                                        onClick={() => setTopics((prev) => prev.map((x, j) => (j === i ? { ...x, confidence: c } : x)))}
                                        className={`min-h-11 rounded-lg border px-3 text-xs font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${t.confidence === c ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white/70 text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200'}`}
                                    >
                                        {CONFIDENCE[c]}
                                    </button>
                                ))}
                                {topics.length > 1 && (
                                    <button type="button" className={iconButton} onClick={() => setTopics((prev) => prev.filter((_, j) => j !== i))} aria-label={`Remove topic ${i + 1}`}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
                {topics.length < 12 && (
                    <button type="button" className={`${secondaryButton} mt-2`} onClick={() => setTopics((prev) => [...prev, { name: '', confidence: 2 }])}><Plus className="h-4 w-4" aria-hidden="true" /> Add topic</button>
                )}
            </fieldset>
            <ErrorNote text={error} />
            {skipped.length > 0 && <p className="text-sm text-amber-700 dark:text-amber-300">Not enough time for: {skipped.join(', ')}.</p>}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                {onCancel && <button type="button" className={secondaryButton} onClick={onCancel}>Back to my sprint</button>}
                <button type="submit" className={primaryButton} disabled={busy || !subject.trim() || !topics.some((t) => t.name.trim())}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Flame className="h-4 w-4" aria-hidden="true" />} {busy ? 'Planning every hour…' : 'Build my sprint'}
                </button>
            </div>
        </form>
    );
}

function SprintView({ sprint, now, getToken, onChange, onNew, onDelete }: {
    sprint: Sprint; now: number; getToken: () => Promise<string | null>; onChange: (s: Sprint) => void; onNew: () => void; onDelete: () => void;
}) {
    const [busy, setBusy] = useState('');
    const days = useMemo(() => {
        const map = new Map<string, SprintBlock[]>();
        sprint.blocks.forEach((b) => {
            const key = new Date(b.startAt).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
            map.set(key, [...(map.get(key) || []), b]);
        });
        return [...map.entries()];
    }, [sprint.blocks]);
    const current = sprint.blocks.find((b) => {
        const start = new Date(b.startAt).getTime();
        return now >= start && now < start + b.minutes * 60000;
    });
    const nextBlock = sprint.blocks.find((b) => new Date(b.startAt).getTime() > now && !b.done);

    const toggle = async (b: SprintBlock) => {
        setBusy(b.id);
        try { onChange(await toggleSprintBlock(await getToken(), sprint.id, b.id, !b.done)); } finally { setBusy(''); }
    };

    return (
        <div className="space-y-5">
            <section className={`${card} overflow-hidden`}>
                <div className="flex flex-col gap-4 bg-gradient-to-br from-red-600 to-orange-500 p-5 text-white sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-white/85">Panic mode · {sprint.subject}</p>
                        <p className="mt-1 text-4xl font-bold tabular-nums">{countdown(sprint.examAt, now)}</p>
                        <p className="text-sm text-white/90">until {new Date(sprint.examAt).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    <div className="min-w-[14rem] rounded-xl bg-white/15 p-3">
                        <p className="text-sm font-semibold">{sprint.progress.done} of {sprint.progress.total} study blocks done</p>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/25" aria-hidden="true"><div className="h-full rounded-full bg-white" style={{ width: `${sprint.progress.total ? (100 * sprint.progress.done) / sprint.progress.total : 0}%` }} /></div>
                    </div>
                </div>
                <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="flex items-start gap-2 text-sm text-slate-800 dark:text-slate-200">
                        <Target className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-600" aria-hidden="true" />
                        {current ? <span><strong>Right now:</strong> {current.title}</span> : nextBlock ? <span><strong>Next:</strong> {nextBlock.title} at {new Date(nextBlock.startAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span> : 'All blocks are behind you. Rest well before the exam.'}
                    </p>
                    <div className="flex gap-2">
                        <button className={secondaryButton} onClick={onNew}>New sprint</button>
                        <button className={iconButton} onClick={onDelete} aria-label="Delete sprint"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                    </div>
                </div>
            </section>

            {days.map(([day, blocks]) => (
                <section key={day} aria-label={day}>
                    <h3 className="mb-2 text-sm font-bold text-slate-700 dark:text-slate-300">{day}</h3>
                    <ol className="space-y-2">
                        {blocks.map((b) => {
                            const k = KIND[b.kind];
                            const Icon = k.icon;
                            const isNow = current && current.id === b.id;
                            const past = new Date(b.startAt).getTime() + b.minutes * 60000 < now;
                            const study = b.kind !== 'break' && b.kind !== 'sleep';
                            return (
                                <li key={b.id} className={`${panel} flex items-start gap-3 p-3 ${isNow ? 'ring-2 ring-red-500' : ''} ${past && !b.done && study ? 'opacity-80' : ''}`}>
                                    <span className="w-12 flex-shrink-0 pt-1 text-xs font-semibold tabular-nums text-slate-600 dark:text-slate-400">
                                        {new Date(b.startAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                    <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${k.className}`} aria-hidden="true"><Icon className="h-4 w-4" /></span>
                                    <div className="min-w-0 flex-1">
                                        <p className={`text-sm font-semibold ${b.done ? 'text-slate-500 line-through dark:text-slate-400' : 'text-slate-900 dark:text-white'}`}>
                                            {b.title} <span className="font-normal text-slate-500 dark:text-slate-400">· {b.minutes} min{isNow ? ' · now' : ''}</span>
                                        </p>
                                        {b.tip && !b.done && <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{b.tip}</p>}
                                        {b.kind === 'practice' && !b.done && (
                                            <Link href={`/candidate/practice?tab=lab&subject=${encodeURIComponent(sprint.subject)}`} className="mt-1 inline-flex min-h-9 items-center text-xs font-semibold text-blue-700 hover:underline dark:text-blue-400">
                                                Start a {sprint.subject} quiz burst
                                            </Link>
                                        )}
                                    </div>
                                    {study && (
                                        <label className="flex h-11 w-11 flex-shrink-0 cursor-pointer items-center justify-center">
                                            <span className="sr-only">Mark {b.title} done</span>
                                            {busy === b.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <input type="checkbox" className="h-5 w-5 accent-blue-600" checked={b.done} onChange={() => toggle(b)} />}
                                        </label>
                                    )}
                                </li>
                            );
                        })}
                    </ol>
                </section>
            ))}
            <p className="text-xs text-slate-500 dark:text-slate-400">{sprint.generatedBy === 'ai' ? 'Schedule computed from your topics; topic tips written by AI.' : 'Schedule computed from your topics.'} Quiz bursts open a Practice Lab set in {sprint.subject}, which also updates your skill level.</p>
            <ProgressBar value={sprint.progress.total ? sprint.progress.done / sprint.progress.total : 0} label="Sprint progress" />
        </div>
    );
}
