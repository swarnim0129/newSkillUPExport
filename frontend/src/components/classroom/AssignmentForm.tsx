'use client';

import React, { useMemo, useState } from 'react';
import { Check, Loader2, Plus, Sparkles, Trash2 } from 'lucide-react';
import { errorMessage } from '@/lib/journeyApi';
import {
    createAssignment,
    draftQuiz,
    updateAssignment,
    type Assignment,
    type AssignmentDraft,
    type Catalog,
    type QuizQuestion,
    type WorkType,
} from '@/lib/mentorApi';
import { ErrorNote, focusRing, iconButton, input, label, panel, primaryButton, secondaryButton, textarea, WORK_TYPES } from './ui';

const TYPE_ORDER: WorkType[] = ['dsa_problems', 'dsa_pattern', 'lab_subject', 'quiz', 'task', 'mock_interview', 'resume'];

/** yyyy-mm-ddThh:mm in local time, for datetime-local inputs */
function toLocalInput(date: Date) {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultDue(days = 7) {
    const d = new Date(Date.now() + days * 86400000);
    d.setHours(23, 59, 0, 0);
    return toLocalInput(d);
}

const emptyQuestion = (): QuizQuestion => ({ prompt: '', options: ['', '', '', ''], answerIndex: 0, explanation: '' });

/**
 * Create or edit classwork. `initial` is either an existing assignment (edit,
 * type fixed) or a draft from a suggestion (create, prefilled).
 */
export default function AssignmentForm({
    classId,
    catalog,
    existing,
    draft,
    getToken,
    onSaved,
    onCancel,
}: {
    classId: string;
    catalog: Catalog | null;
    existing?: Assignment | null;
    draft?: AssignmentDraft | null;
    getToken: () => Promise<string | null>;
    onSaved: () => void;
    onCancel: () => void;
}) {
    const start = existing || draft;
    const [type, setType] = useState<WorkType | null>(start?.type || null);
    const [title, setTitle] = useState(start?.title || '');
    const [instructions, setInstructions] = useState(start?.instructions || '');
    const [points, setPoints] = useState(String(start?.points ?? 100));
    const [hasDue, setHasDue] = useState(existing ? !!existing.dueAt : true);
    const [due, setDue] = useState(
        existing?.dueAt ? toLocalInput(new Date(existing.dueAt)) : defaultDue(draft?.dueInDays || 7)
    );
    const t = start?.target || {};
    const [slugs, setSlugs] = useState<string[]>(t.slugs || []);
    const [pattern, setPattern] = useState(t.pattern || catalog?.patterns[0]?.key || '');
    const [level, setLevel] = useState(String(t.level || 60));
    const [subject, setSubject] = useState(t.subject || '');
    const [role, setRole] = useState(t.role || '');
    const [minScore, setMinScore] = useState(String(t.minScore ?? (type === 'resume' ? 70 : 60)));
    const [questions, setQuestions] = useState<QuizQuestion[]>(
        (existing?.questions as QuizQuestion[] | undefined) || draft?.questions || [emptyQuestion()]
    );
    const [problemFilter, setProblemFilter] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const [aiTopic, setAiTopic] = useState('');
    const [aiCount, setAiCount] = useState('5');
    const [aiLevel, setAiLevel] = useState('medium');
    const [aiBusy, setAiBusy] = useState(false);

    const problems = useMemo(() => {
        const all = (catalog?.patterns || []).flatMap((p) => p.problems.map((q) => ({ ...q, patternName: p.name, patternKey: p.key })));
        const f = problemFilter.trim().toLowerCase();
        return f ? all.filter((q) => q.title.toLowerCase().includes(f) || q.patternName.toLowerCase().includes(f)) : all;
    }, [catalog, problemFilter]);

    const pickType = (next: WorkType) => {
        setType(next);
        if (!title) setTitle('');
        if (next === 'resume') setMinScore('70');
        if (next === 'task' && points === '100') setPoints('20');
    };

    const toggleSlug = (slug: string) => {
        setSlugs((prev) => (prev.includes(slug) ? prev.filter((s) => s !== slug) : prev.length >= 15 ? prev : [...prev, slug]));
    };

    const setQuestion = (i: number, patch: Partial<QuizQuestion>) => {
        setQuestions((prev) => prev.map((q, j) => (j === i ? { ...q, ...patch } : q)));
    };

    const runAi = async () => {
        if (!aiTopic.trim()) return;
        setAiBusy(true);
        setError('');
        try {
            const drafted = await draftQuiz(await getToken(), classId, { topic: aiTopic.trim(), count: Number(aiCount), level: aiLevel });
            // Replace an untouched empty first question, otherwise add after the existing ones
            setQuestions((prev) => {
                const kept = prev.filter((q) => q.prompt.trim());
                return [...kept, ...drafted];
            });
            if (!title.trim()) setTitle(`Quiz: ${aiTopic.trim()}`.slice(0, 120));
        } catch (err) {
            setError(errorMessage(err, 'Could not draft questions.'));
        } finally {
            setAiBusy(false);
        }
    };

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!type) return;
        setBusy(true);
        setError('');
        const body: AssignmentDraft = {
            type,
            title: title.trim(),
            instructions: instructions.trim(),
            points: Number(points),
            dueAt: hasDue && due ? new Date(due).toISOString() : null,
            target: { slugs, pattern, level: Number(level), subject: subject.trim(), role: role.trim(), minScore: Number(minScore) },
            questions: type === 'quiz' ? questions.map((q) => ({ ...q, options: q.options.map((o) => o.trim()).filter(Boolean) })) : undefined,
        };
        try {
            const token = await getToken();
            if (existing) await updateAssignment(token, classId, existing.id, body);
            else await createAssignment(token, classId, body);
            onSaved();
        } catch (err) {
            setError(errorMessage(err, 'Could not save the classwork.'));
            setBusy(false);
        }
    };

    if (!type) {
        return (
            <div>
                <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">What kind of work? Most kinds are checked automatically from what students do on SkillUp, and every kind goes into each student&apos;s plan.</p>
                <ul className="grid gap-2 sm:grid-cols-2">
                    {TYPE_ORDER.map((key) => {
                        const w = WORK_TYPES[key];
                        const Icon = w.icon;
                        return (
                            <li key={key}>
                                <button
                                    type="button"
                                    onClick={() => pickType(key)}
                                    className={`flex h-full w-full items-start gap-3 rounded-xl border border-slate-200 dark:border-[var(--soft-line)] p-3 text-left hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors cursor-pointer ${focusRing}`}
                                >
                                    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                                        <Icon className="h-5 w-5" aria-hidden="true" />
                                    </span>
                                    <span>
                                        <span className="block text-sm font-semibold text-slate-900 dark:text-white">{w.label}</span>
                                        <span className="block text-xs text-slate-600 dark:text-slate-400">{w.hint}</span>
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </div>
        );
    }

    const TypeIcon = WORK_TYPES[type].icon;
    return (
        <form onSubmit={submit} className="space-y-4">
            <div className={`${panel} flex items-center justify-between gap-3 p-3`}>
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                    <TypeIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" /> {WORK_TYPES[type].label}
                </span>
                {!existing && (
                    <button type="button" className={`text-sm font-semibold text-blue-700 dark:text-blue-400 hover:underline ${focusRing}`} onClick={() => setType(null)}>
                        Change
                    </button>
                )}
            </div>

            <div>
                <label htmlFor="work-title" className={label}>Title</label>
                <input id="work-title" className={input} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required placeholder="Two Pointers practice set" />
            </div>
            <div>
                <label htmlFor="work-instructions" className={label}>Instructions <span className="font-normal text-slate-500">(optional)</span></label>
                <textarea id="work-instructions" rows={3} className={textarea} value={instructions} onChange={(e) => setInstructions(e.target.value)} maxLength={2000} />
            </div>

            {type === 'dsa_problems' && (
                <fieldset>
                    <legend className={label}>Problems <span className="font-normal text-slate-500">({slugs.length} picked, up to 15)</span></legend>
                    <label htmlFor="problem-filter" className="sr-only">Filter problems</label>
                    <input id="problem-filter" className={input} placeholder="Filter by title or pattern" value={problemFilter} onChange={(e) => setProblemFilter(e.target.value)} />
                    <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-xl border border-slate-200 dark:border-[var(--soft-line)] p-1">
                        {problems.map((p) => {
                            const on = slugs.includes(p.slug);
                            return (
                                <li key={p.slug}>
                                    <button
                                        type="button"
                                        onClick={() => toggleSlug(p.slug)}
                                        aria-pressed={on}
                                        className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-3 text-left text-sm cursor-pointer ${focusRing} ${on ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-slate-50 dark:hover:bg-[var(--soft-raised)]'}`}
                                    >
                                        <span className="min-w-0">
                                            <span className="block truncate font-medium text-slate-900 dark:text-white">{p.title}</span>
                                            <span className="block text-xs text-slate-500 dark:text-slate-400">{p.patternName} · {p.difficulty}</span>
                                        </span>
                                        <span className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border ${on ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 dark:border-[var(--soft-line)]'}`} aria-hidden="true">
                                            {on && <Check className="h-3.5 w-3.5" />}
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </fieldset>
            )}

            {type === 'dsa_pattern' && (
                <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                        <label htmlFor="work-pattern" className={label}>Pattern</label>
                        <select id="work-pattern" className={input} value={pattern} onChange={(e) => setPattern(e.target.value)}>
                            {(catalog?.patterns || []).map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="work-level" className={label}>Target level (10 to 100)</label>
                        <input id="work-level" type="number" min={10} max={100} className={input} value={level} onChange={(e) => setLevel(e.target.value)} required />
                    </div>
                </div>
            )}

            {type === 'lab_subject' && (
                <div>
                    <label htmlFor="work-subject" className={label}>Subject</label>
                    <input id="work-subject" list="lab-subjects" className={input} value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={100} required placeholder="Thermodynamics" />
                    <datalist id="lab-subjects">
                        {(catalog?.subjects || []).map((s) => <option key={s} value={s} />)}
                    </datalist>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Any subject works. It appears in each student&apos;s Practice Lab, with questions written for it.</p>
                </div>
            )}

            {type === 'mock_interview' && (
                <div>
                    <label htmlFor="work-role" className={label}>Role <span className="font-normal text-slate-500">(optional; any role counts if empty)</span></label>
                    <input id="work-role" className={input} value={role} onChange={(e) => setRole(e.target.value)} maxLength={100} placeholder="Software Engineer" />
                </div>
            )}

            {(type === 'lab_subject' || type === 'mock_interview' || type === 'resume') && (
                <div>
                    <label htmlFor="work-min" className={label}>Pass score (0 to 100)</label>
                    <input id="work-min" type="number" min={0} max={100} className={input} value={minScore} onChange={(e) => setMinScore(e.target.value)} required />
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Only results after you set this work count.</p>
                </div>
            )}

            {type === 'quiz' && (
                <div className="space-y-3">
                    <div className={`${panel} space-y-2 p-3`}>
                        <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white">
                            <Sparkles className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" /> Draft questions with AI
                        </p>
                        <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
                            <label htmlFor="ai-topic" className="sr-only">Topic</label>
                            <input id="ai-topic" className={input} placeholder="Topic, e.g. Deadlocks in operating systems" value={aiTopic} onChange={(e) => setAiTopic(e.target.value)} maxLength={200} />
                            <label htmlFor="ai-count" className="sr-only">Number of questions</label>
                            <select id="ai-count" className={input} value={aiCount} onChange={(e) => setAiCount(e.target.value)}>
                                {[3, 5, 8, 10].map((n) => <option key={n} value={n}>{n} questions</option>)}
                            </select>
                            <label htmlFor="ai-level" className="sr-only">Difficulty</label>
                            <select id="ai-level" className={input} value={aiLevel} onChange={(e) => setAiLevel(e.target.value)}>
                                <option value="easy">Easy</option>
                                <option value="medium">Medium</option>
                                <option value="hard">Hard</option>
                            </select>
                            <button type="button" className={secondaryButton} onClick={runAi} disabled={aiBusy || !aiTopic.trim()}>
                                {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />} Draft
                            </button>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Check every answer before posting. You can edit anything below.</p>
                    </div>

                    <ol className="space-y-3">
                        {questions.map((q, i) => (
                            <li key={i} className="rounded-xl border border-slate-200 dark:border-[var(--soft-line)] p-3">
                                <div className="flex items-start gap-2">
                                    <div className="flex-1">
                                        <label htmlFor={`q-${i}`} className={label}>Question {i + 1}</label>
                                        <textarea id={`q-${i}`} rows={2} className={textarea} value={q.prompt} onChange={(e) => setQuestion(i, { prompt: e.target.value })} maxLength={600} required />
                                    </div>
                                    {questions.length > 1 && (
                                        <button type="button" className={`${iconButton} mt-6`} onClick={() => setQuestions((prev) => prev.filter((_, j) => j !== i))} aria-label={`Remove question ${i + 1}`}>
                                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                                        </button>
                                    )}
                                </div>
                                <fieldset className="mt-2 space-y-1.5">
                                    <legend className="mb-1 text-xs text-slate-600 dark:text-slate-400">Options. Select the correct one.</legend>
                                    {q.options.map((opt, k) => (
                                        <div key={k} className="flex items-center gap-2">
                                            <input
                                                type="radio"
                                                name={`answer-${i}`}
                                                checked={q.answerIndex === k}
                                                onChange={() => setQuestion(i, { answerIndex: k })}
                                                className="h-5 w-5 accent-blue-600"
                                                aria-label={`Option ${k + 1} is correct`}
                                            />
                                            <label htmlFor={`q-${i}-o-${k}`} className="sr-only">Option {k + 1}</label>
                                            <input
                                                id={`q-${i}-o-${k}`}
                                                className={input}
                                                value={opt}
                                                placeholder={`Option ${k + 1}${k >= 2 ? ' (optional)' : ''}`}
                                                maxLength={200}
                                                onChange={(e) => setQuestion(i, { options: q.options.map((o, m) => (m === k ? e.target.value : o)) })}
                                            />
                                        </div>
                                    ))}
                                </fieldset>
                                <label htmlFor={`q-${i}-exp`} className="mt-2 block text-xs text-slate-600 dark:text-slate-400">Explanation shown after the quiz (optional)</label>
                                <input id={`q-${i}-exp`} className={input} value={q.explanation} onChange={(e) => setQuestion(i, { explanation: e.target.value })} maxLength={600} />
                            </li>
                        ))}
                    </ol>
                    {questions.length < 20 && (
                        <button type="button" className={secondaryButton} onClick={() => setQuestions((prev) => [...prev, emptyQuestion()])}>
                            <Plus className="h-4 w-4" aria-hidden="true" /> Add question
                        </button>
                    )}
                </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
                <div>
                    <div className="mb-1.5 flex items-center justify-between">
                        <label htmlFor="work-due" className="text-sm font-medium text-slate-800 dark:text-slate-200">Due</label>
                        <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                            <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={!hasDue} onChange={(e) => setHasDue(!e.target.checked)} /> No due date
                        </label>
                    </div>
                    <input id="work-due" type="datetime-local" className={input} value={due} onChange={(e) => setDue(e.target.value)} disabled={!hasDue} required={hasDue} />
                </div>
                <div>
                    <label htmlFor="work-points" className={label}>Points</label>
                    <input id="work-points" type="number" min={0} max={1000} className={input} value={points} onChange={(e) => setPoints(e.target.value)} required />
                </div>
            </div>

            <ErrorNote text={error} />
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" className={secondaryButton} onClick={onCancel}>Cancel</button>
                <button type="submit" className={primaryButton} disabled={busy}>
                    {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} {existing ? 'Save changes' : 'Assign to class'}
                </button>
            </div>
        </form>
    );
}
