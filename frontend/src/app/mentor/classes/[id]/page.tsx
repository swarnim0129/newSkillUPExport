'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
    AlertTriangle,
    Archive,
    ArchiveRestore,
    ArrowLeft,
    Check,
    Clipboard,
    Expand,
    FileUp,
    Lightbulb,
    Lock,
    LockOpen,
    Megaphone,
    Pencil,
    Plus,
    RefreshCw,
    Trash2,
    Trophy,
    UserMinus,
    Users,
} from 'lucide-react';
import { errorMessage } from '@/lib/journeyApi';
import {
    deleteAssignment,
    deleteClass,
    getCatalog,
    getClassInsights,
    getMentorClass,
    mentorComment,
    mentorDeletePost,
    mentorPinPost,
    mentorPost,
    removeStudent,
    resetClassCode,
    updateClass,
    type AssignmentDraft,
    type Catalog,
    type ClassInsights,
    type MentorClassDetail,
    type MentorWork,
    type Suggestion,
} from '@/lib/mentorApi';
import { useMentor } from '@/components/classroom/MentorContext';
import AssignmentForm from '@/components/classroom/AssignmentForm';
import ClassForm from '@/components/classroom/ClassForm';
import LiveMentor from '@/components/classroom/LiveMentor';
import ClassSquads from '@/components/classroom/ClassSquads';
import SyllabusImport from '@/components/classroom/SyllabusImport';
import { DnaView } from '@/components/grow/DnaTab';
import { getClassDna, type DnaResult } from '@/lib/growApi';
import StudentPanel, { Metric, RiskPill } from '@/components/classroom/StudentPanel';
import {
    card,
    Dialog,
    dueText,
    ErrorNote,
    focusRing,
    iconButton,
    panel,
    primaryButton,
    ProgressBar,
    secondaryButton,
    Spinner,
    Stream,
    Tabs,
    themeOf,
    WORK_TYPES,
} from '@/components/classroom/ui';

type Tab = 'stream' | 'classwork' | 'students' | 'live' | 'insights';

export default function MentorClassPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const { getToken } = useMentor();
    const [data, setData] = useState<MentorClassDetail | null>(null);
    const [error, setError] = useState('');
    const [tab, setTab] = useState<Tab>('stream');
    const [catalog, setCatalog] = useState<Catalog | null>(null);
    const [form, setForm] = useState<{ existing?: MentorWork; draft?: AssignmentDraft } | null>(null);
    const [editingClass, setEditingClass] = useState(false);
    const [showCode, setShowCode] = useState(false);
    const [selected, setSelected] = useState<string | null>(null);
    const [insights, setInsights] = useState<ClassInsights | null>(null);
    const [insightsError, setInsightsError] = useState('');
    const [copied, setCopied] = useState(false);
    const [notice, setNotice] = useState('');
    const [importing, setImporting] = useState(false);

    const load = useCallback(async () => {
        try {
            const next = await getMentorClass(await getToken(), id);
            setData(next);
            setError('');
        } catch (err) {
            setError(errorMessage(err, 'Could not load this class.'));
        }
    }, [getToken, id]);

    const loadInsights = useCallback(async () => {
        try {
            const next = await getClassInsights(await getToken(), id);
            setInsightsError('');
            setInsights(next);
        } catch (err) {
            setInsightsError(errorMessage(err, 'Could not load insights.'));
        }
    }, [getToken, id]);

    useEffect(() => { void Promise.resolve().then(load); }, [load]);
    useEffect(() => { if (tab === 'insights' && !insights) void Promise.resolve().then(loadInsights); }, [tab, insights, loadInsights]);

    const openForm = async (value: { existing?: MentorWork; draft?: AssignmentDraft }) => {
        setForm(value);
        if (!catalog) {
            try { setCatalog(await getCatalog(await getToken())); } catch { /* the form still works without the list */ }
        }
    };

    const act = async (fn: () => Promise<unknown>, fallback: string, done?: string) => {
        setError('');
        try {
            await fn();
            if (done) setNotice(done);
            await load();
        } catch (err) {
            setError(errorMessage(err, fallback));
        }
    };

    if (!data) {
        return error ? (
            <div className="mx-auto mt-10 max-w-lg text-center">
                <ErrorNote text={error} />
                <Link href="/mentor" className={`${secondaryButton} mt-4`}><ArrowLeft className="h-4 w-4" aria-hidden="true" /> All classes</Link>
            </div>
        ) : <Spinner label="Loading class" />;
    }

    const c = data.classroom;
    const theme = themeOf(c.theme);
    const toReview = data.classwork.reduce((sum, w) => sum + w.counts.toReview, 0);

    const copyCode = async () => {
        try {
            await navigator.clipboard.writeText(c.code || '');
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch { setCopied(false); }
    };

    const applySuggestion = async (s: Suggestion) => {
        if (s.kind === 'announcement') {
            await act(() => getToken().then((t) => mentorPost(t, id, { text: s.draft.text || '' })), 'Could not post.', 'Posted to the stream.');
            setTab('stream');
            return;
        }
        const { type, title, instructions, target, dueInDays } = s.draft;
        openForm({ draft: { type, title, instructions, target, dueInDays } });
    };

    return (
        <div className="space-y-5">
            <Link href="/mentor" className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg text-sm font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white ${focusRing}`}>
                <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All classes
            </Link>

            <section className={`${theme.banner} overflow-hidden rounded-2xl text-white shadow-sm`}>
                <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6">
                    <div className="min-w-0">
                        {c.archived && <p className="mb-2 inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold"><Archive className="h-3.5 w-3.5" aria-hidden="true" /> Archived</p>}
                        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{c.name}</h1>
                        <p className="mt-1 text-sm text-white/90">{[c.section, c.subject].filter(Boolean).join(' · ')}</p>
                        {c.description && <p className="mt-2 max-w-2xl text-sm text-white/90">{c.description}</p>}
                    </div>
                    {!c.archived && (
                        <div className="rounded-xl bg-white/15 p-3 backdrop-blur-sm">
                            <p className="text-xs font-medium text-white/90">Class code {c.joinOpen ? '' : '(closed)'}</p>
                            <div className="flex items-center gap-1">
                                <p className="font-mono text-2xl font-bold tracking-widest">{c.code}</p>
                                <button className={`${iconButton} text-white hover:bg-white/20 hover:text-white dark:text-white`} onClick={copyCode} aria-label="Copy class code">
                                    {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Clipboard className="h-4 w-4" aria-hidden="true" />}
                                </button>
                                <button className={`${iconButton} text-white hover:bg-white/20 hover:text-white dark:text-white`} onClick={() => setShowCode(true)} aria-label="Show code full screen">
                                    <Expand className="h-4 w-4" aria-hidden="true" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
                <div className="flex flex-wrap gap-1 border-t border-white/20 bg-black/10 px-3 py-2">
                    <BannerButton onClick={() => setEditingClass(true)} icon={Pencil} label="Edit class" />
                    {!c.archived && (
                        <>
                            <BannerButton
                                onClick={() => act(() => getToken().then((t) => updateClass(t, id, { joinOpen: !c.joinOpen })), 'Could not change joining.', c.joinOpen ? 'Code turned off. Students in the class stay.' : 'Code turned on.')}
                                icon={c.joinOpen ? Lock : LockOpen}
                                label={c.joinOpen ? 'Stop new joins' : 'Allow joins'}
                            />
                            <BannerButton
                                onClick={() => { if (window.confirm('Make a new code? The current code stops working.')) act(() => getToken().then((t) => resetClassCode(t, id)), 'Could not reset the code.', 'New code ready.'); }}
                                icon={RefreshCw}
                                label="New code"
                            />
                        </>
                    )}
                    <BannerButton
                        onClick={() => {
                            if (c.archived || window.confirm('Archive this class? Students can still see it but cannot post, and nothing new can be set.')) {
                                act(() => getToken().then((t) => updateClass(t, id, { archived: !c.archived })), 'Could not change the class.', c.archived ? 'Class restored.' : 'Class archived.');
                            }
                        }}
                        icon={c.archived ? ArchiveRestore : Archive}
                        label={c.archived ? 'Restore' : 'Archive'}
                    />
                    {c.archived && (
                        <BannerButton
                            onClick={async () => {
                                if (!window.confirm(`Delete "${c.name}" for good? Its stream, classwork and grades are removed, and open work leaves students' plans. This cannot be undone.`)) return;
                                try {
                                    await deleteClass(await getToken(), id);
                                    router.push('/mentor');
                                } catch (err) {
                                    setError(errorMessage(err, 'Could not delete the class.'));
                                }
                            }}
                            icon={Trash2}
                            label="Delete"
                        />
                    )}
                </div>
            </section>

            {notice && (
                <p className={`${panel} flex items-center justify-between gap-2 px-4 py-2 text-sm text-slate-800 dark:text-slate-200`} role="status">
                    {notice}
                    <button className={`text-xs font-semibold text-blue-700 dark:text-blue-400 ${focusRing}`} onClick={() => setNotice('')}>Dismiss</button>
                </p>
            )}
            <ErrorNote text={error} />

            <Tabs<Tab>
                label="Class sections"
                value={tab}
                onChange={setTab}
                tabs={[
                    { key: 'stream', label: 'Stream' },
                    { key: 'classwork', label: 'Classwork', count: toReview },
                    { key: 'students', label: `Students (${data.students.length})` },
                    { key: 'live', label: 'Live battle' },
                    { key: 'insights', label: 'Insights' },
                ]}
            />

            <div role="tabpanel">
                {tab === 'stream' && (
                    <div className="mx-auto max-w-3xl">
                        <Stream
                            posts={data.posts}
                            composerLabel="Announce something to your class"
                            composerPlaceholder="Test on Friday covers sliding window and stacks…"
                            onPost={async (text) => {
                                try { await mentorPost(await getToken(), id, { text }); }
                                catch (err) { throw new Error(errorMessage(err, 'Could not post.')); }
                                await load();
                            }}
                            onComment={async (postId, text) => { await mentorComment(await getToken(), id, postId, text); await load(); }}
                            onDelete={async (postId) => { await mentorDeletePost(await getToken(), id, postId); await load(); }}
                            canDelete={() => true}
                            onPin={async (postId, pinned) => { await mentorPinPost(await getToken(), id, postId, pinned); await load(); }}
                            onOpenWork={(workId) => router.push(`/mentor/classes/${id}/work/${workId}`)}
                        />
                    </div>
                )}

                {tab === 'classwork' && (
                    <div className="space-y-4">
                        {!c.archived && (
                            <div className="flex flex-wrap gap-2">
                                <button className={primaryButton} onClick={() => openForm({})}>
                                    <Plus className="h-4 w-4" aria-hidden="true" /> Create classwork
                                </button>
                                <button className={secondaryButton} onClick={() => setImporting(true)}>
                                    <FileUp className="h-4 w-4" aria-hidden="true" /> Import syllabus
                                </button>
                            </div>
                        )}
                        {data.classwork.length === 0 ? (
                            <div className={`${card} p-8 text-center text-sm text-slate-600 dark:text-slate-400`}>
                                No classwork yet. Set DSA problems, a pattern level, a Practice Lab subject, a quiz, a task, a mock interview or a resume score.
                            </div>
                        ) : (
                            <ul className="space-y-3">
                                {data.classwork.map((w) => (
                                    <li key={w.id}>
                                        <WorkRow
                                            work={w}
                                            onOpen={() => router.push(`/mentor/classes/${id}/work/${w.id}`)}
                                            onEdit={() => openForm({ existing: w })}
                                            onDelete={() => {
                                                if (window.confirm(`Delete "${w.title}"? Grades for it are removed and it leaves students' plans.`)) {
                                                    act(() => getToken().then((t) => deleteAssignment(t, id, w.id)), 'Could not delete.', 'Classwork deleted.');
                                                }
                                            }}
                                        />
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}

                {tab === 'students' && (
                    <StudentsTab
                        data={data}
                        selected={selected}
                        onSelect={setSelected}
                        onRemove={(candidateId, name) => {
                            if (window.confirm(`Remove ${name} from this class? Their open class work leaves their plan.`)) {
                                setSelected(null);
                                act(() => getToken().then((t) => removeStudent(t, id, candidateId)), 'Could not remove the student.', `${name} removed.`);
                            }
                        }}
                        onShowCode={() => setShowCode(true)}
                        getToken={getToken}
                    />
                )}

                {tab === 'live' && (
                    <LiveMentor classId={id} quizzes={data.classwork.filter((w) => w.type === 'quiz')} getToken={getToken} />
                )}

                {tab === 'insights' && (
                    insights ? (
                        <div className="space-y-6">
                            <InsightsTab insights={insights} onApply={applySuggestion} onRefresh={() => { setInsights(null); }} />
                            <ClassDna classId={id} getToken={getToken} />
                        </div>
                    ) : insightsError ? (
                        <div className="space-y-3"><ErrorNote text={insightsError} /><button className={secondaryButton} onClick={loadInsights}>Try again</button></div>
                    ) : <Spinner label="Working out class insights" />
                )}
            </div>

            <Dialog open={!!form} onClose={() => setForm(null)} title={form?.existing ? 'Edit classwork' : 'Create classwork'} wide>
                {form && (
                    <AssignmentForm
                        classId={id}
                        catalog={catalog}
                        existing={form.existing}
                        draft={form.draft}
                        getToken={getToken}
                        onCancel={() => setForm(null)}
                        onSaved={() => {
                            setForm(null);
                            setNotice(form.existing ? 'Classwork updated; students’ plans follow the new title and date.' : 'Assigned. It is in every student’s plan now.');
                            setInsights(null);
                            setTab('classwork');
                            load();
                        }}
                    />
                )}
            </Dialog>

            <Dialog open={importing} onClose={() => setImporting(false)} title="Import a syllabus" wide>
                {importing && (
                    <SyllabusImport
                        classId={id}
                        getToken={getToken}
                        onCancel={() => setImporting(false)}
                        onDone={(count) => { setImporting(false); setNotice(`${count} weekly Practice Lab sets posted. They are in every student\u2019s plan.`); setTab('classwork'); load(); }}
                    />
                )}
            </Dialog>

            <Dialog open={editingClass} onClose={() => setEditingClass(false)} title="Edit class">
                <ClassForm
                    initial={c}
                    submitLabel="Save"
                    onSubmit={async (value) => {
                        await updateClass(await getToken(), id, value);
                        setEditingClass(false);
                        await load();
                    }}
                    onCancel={() => setEditingClass(false)}
                />
            </Dialog>

            <Dialog open={showCode} onClose={() => setShowCode(false)} title="Join this class" wide>
                <div className="py-6 text-center">
                    <p className="text-sm text-slate-600 dark:text-slate-400">Students open <span className="font-semibold">Classes</span> in SkillUp, choose Join class, and enter:</p>
                    <p className="mt-4 select-all break-all font-mono text-6xl font-bold tracking-[0.2em] text-slate-900 dark:text-white sm:text-7xl">{c.code}</p>
                    <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">{c.name}{c.section ? ` · ${c.section}` : ''}</p>
                    {!c.joinOpen && <p className="mt-2 text-sm font-semibold text-amber-700 dark:text-amber-300">Joining is turned off. Turn it on from the class banner.</p>}
                </div>
            </Dialog>
        </div>
    );
}

function BannerButton({ onClick, icon: Icon, label }: { onClick: () => void; icon: React.ComponentType<{ className?: string }>; label: string }) {
    return (
        <button onClick={onClick} className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-white hover:bg-white/20 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white`}>
            <Icon className="h-4 w-4" aria-hidden="true" /> {label}
        </button>
    );
}

function WorkRow({ work, onOpen, onEdit, onDelete }: { work: MentorWork; onOpen: () => void; onEdit: () => void; onDelete: () => void }) {
    const meta = WORK_TYPES[work.type];
    const Icon = meta.icon;
    const { counts } = work;
    const overdue = work.dueAt && new Date(work.dueAt) < new Date();
    return (
        <div className={`${card} flex flex-col gap-3 p-4 sm:flex-row sm:items-center`}>
            <button onClick={onOpen} className={`flex min-w-0 flex-1 items-start gap-3 rounded-lg text-left cursor-pointer ${focusRing}`}>
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-slate-900 hover:underline dark:text-white">{work.title}</span>
                    <span className="block text-xs text-slate-600 dark:text-slate-400">
                        {meta.label} · {work.summary} · <span className={overdue ? 'font-semibold text-slate-800 dark:text-slate-200' : ''}>{dueText(work.dueAt)}</span>
                    </span>
                </span>
            </button>
            <div className="flex items-center gap-4 sm:gap-5">
                <Count value={`${counts.done}/${counts.total}`} label="done" />
                <Count value={String(counts.missing)} label="missing" warn={counts.missing > 0} />
                {work.type === 'task' && <Count value={String(counts.toReview)} label="to grade" highlight={counts.toReview > 0} />}
                <div className="flex">
                    <button className={iconButton} onClick={onEdit} aria-label={`Edit ${work.title}`}><Pencil className="h-4 w-4" aria-hidden="true" /></button>
                    <button className={iconButton} onClick={onDelete} aria-label={`Delete ${work.title}`}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                </div>
            </div>
        </div>
    );
}

function Count({ value, label, warn = false, highlight = false }: { value: string; label: string; warn?: boolean; highlight?: boolean }) {
    return (
        <div className="text-center">
            <p className={`text-lg font-bold tabular-nums ${warn ? 'text-red-700 dark:text-red-400' : highlight ? 'text-blue-700 dark:text-blue-400' : 'text-slate-900 dark:text-white'}`}>{value}</p>
            <p className="text-[11px] text-slate-600 dark:text-slate-400">{label}</p>
        </div>
    );
}

function StudentsTab({
    data,
    selected,
    onSelect,
    onRemove,
    onShowCode,
    getToken,
}: {
    data: MentorClassDetail;
    selected: string | null;
    onSelect: (id: string | null) => void;
    onRemove: (candidateId: string, name: string) => void;
    onShowCode: () => void;
    getToken: () => Promise<string | null>;
}) {
    if (data.students.length === 0) {
        return (
            <div className={`${card} mx-auto max-w-xl p-8 text-center`}>
                <Users className="mx-auto h-8 w-8 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                <p className="mt-3 text-sm text-slate-700 dark:text-slate-300">No students yet. Share the class code; students join from Classes in their SkillUp account.</p>
                <button className={`${primaryButton} mt-4`} onClick={onShowCode}><Expand className="h-4 w-4" aria-hidden="true" /> Show code</button>
            </div>
        );
    }
    const order = { high: 0, medium: 1, low: 2 };
    const students = [...data.students].sort((a, b) =>
        (a.summary ? order[a.summary.risk] : 3) - (b.summary ? order[b.summary.risk] : 3) || b.classwork.missing - a.classwork.missing || a.name.localeCompare(b.name)
    );

    return (
        <div className="grid gap-6 lg:grid-cols-5">
            <div className="space-y-4 lg:col-span-2">
                <ul className="space-y-2" aria-label="Students, most in need of attention first">
                    {students.map((s) => (
                        <li key={s.candidateId}>
                            <div className={`${card} flex items-center gap-2 p-3 ${selected === s.candidateId ? 'ring-2 ring-blue-500' : ''}`}>
                                <button
                                    onClick={() => onSelect(s.candidateId)}
                                    aria-pressed={selected === s.candidateId}
                                    className={`min-w-0 flex-1 rounded-lg text-left cursor-pointer ${focusRing}`}
                                >
                                    <span className="flex flex-wrap items-center gap-2">
                                        <span className="text-sm font-bold text-slate-900 dark:text-white">{s.name}</span>
                                        {s.summary ? <RiskPill risk={s.summary.risk} /> : <span className="text-xs text-slate-500 dark:text-slate-400">No journey yet</span>}
                                    </span>
                                    <span className="mt-1 block text-xs text-slate-600 dark:text-slate-400">
                                        Classwork {s.classwork.done}/{s.classwork.total}
                                        {s.classwork.missing > 0 && <span className="font-semibold text-red-700 dark:text-red-400"> · {s.classwork.missing} missing</span>}
                                        {s.summary && <> · readiness {s.summary.readiness} · {s.summary.branch}, sem {s.summary.semester}</>}
                                    </span>
                                    {s.summary && s.summary.flags[0] && (
                                        <span className="mt-1 flex items-start gap-1 text-xs text-slate-700 dark:text-slate-300">
                                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" /> {s.summary.flags[0].label}
                                        </span>
                                    )}
                                </button>
                                <button className={iconButton} onClick={() => onRemove(s.candidateId, s.name)} aria-label={`Remove ${s.name} from class`} title="Remove from class">
                                    <UserMinus className="h-4 w-4" aria-hidden="true" />
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>

                <ClassSquads classId={data.classroom.id} getToken={getToken} students={data.students.length} />

                <section className={`${card} p-4`} aria-labelledby="leaderboard-heading">
                    <h2 id="leaderboard-heading" className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                        <Trophy className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden="true" /> Class standings
                    </h2>
                    <p className="text-xs text-slate-600 dark:text-slate-400">Points from graded classwork, then work finished on time.</p>
                    <ol className="mt-3 space-y-1.5">
                        {data.leaderboard.slice(0, 10).map((r) => (
                            <li key={r.candidateId} className="flex items-center justify-between gap-2 text-sm">
                                <span className="min-w-0 truncate text-slate-800 dark:text-slate-200"><span className="inline-block w-6 font-bold tabular-nums text-slate-500">{r.rank}.</span>{r.name}</span>
                                <span className="tabular-nums text-xs text-slate-600 dark:text-slate-400"><span className="font-bold text-slate-900 dark:text-white">{r.points}</span> pts · {r.onTime} on time</span>
                            </li>
                        ))}
                    </ol>
                </section>
            </div>
            <div className="lg:col-span-3">
                {selected ? (
                    <StudentPanel key={selected} candidateId={selected} getToken={getToken} />
                ) : (
                    <div className={`${card} p-8 text-center text-sm text-slate-600 dark:text-slate-400`}>Choose a student to see their plan, results and mistakes, and to send a private note.</div>
                )}
            </div>
        </div>
    );
}

function InsightsTab({ insights, onApply, onRefresh }: { insights: ClassInsights; onApply: (s: Suggestion) => void; onRefresh: () => void }) {
    const o = insights.overview;
    const weakest = [...insights.patterns].sort((a, b) => a.average - b.average).slice(0, 6);
    return (
        <div className="space-y-6">
            <div className="flex justify-end">
                <button className={secondaryButton} onClick={onRefresh}><RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh</button>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Metric label="Students" value={`${o.students}`} />
                <Metric label="Classwork done" value={o.completion === null ? 'n/a' : `${o.completion}%`} />
                <Metric label="Average readiness" value={o.withJourney ? `${o.readiness}` : 'n/a'} />
                <Metric label="Need attention" value={`${o.atRisk}`} />
            </div>

            {insights.suggestions.length > 0 && (
                <section className={`${card} p-5`} aria-labelledby="suggest-heading">
                    <h2 id="suggest-heading" className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
                        <Lightbulb className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden="true" /> What to set next
                    </h2>
                    <p className="text-xs text-slate-600 dark:text-slate-400">Worked out from your students&apos; results. You can edit before posting.</p>
                    <ul className="mt-3 grid gap-3 md:grid-cols-2">
                        {insights.suggestions.map((s) => (
                            <li key={s.id} className={`${panel} flex flex-col justify-between gap-3 p-4`}>
                                <div>
                                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{s.title}</p>
                                    <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{s.reason}</p>
                                </div>
                                <button className={`${primaryButton} self-start`} onClick={() => onApply(s)}>
                                    {s.kind === 'announcement' ? <><Megaphone className="h-4 w-4" aria-hidden="true" /> Post to class</> : <><Plus className="h-4 w-4" aria-hidden="true" /> Review and assign</>}
                                </button>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            <div className="grid gap-6 lg:grid-cols-2">
                <section className={`${card} p-5`} aria-labelledby="patterns-heading">
                    <h2 id="patterns-heading" className="text-base font-bold text-slate-900 dark:text-white">Weakest DSA patterns</h2>
                    <p className="text-xs text-slate-600 dark:text-slate-400">Class average level, 0 to 100. 75 counts as mastered.</p>
                    <ul className="mt-3 space-y-3">
                        {weakest.map((p) => (
                            <li key={p.key}>
                                <div className="flex justify-between text-sm"><span className="text-slate-800 dark:text-slate-200">{p.name}</span><span className="tabular-nums text-slate-600 dark:text-slate-400">{p.average} · {p.mastered} mastered</span></div>
                                <div className="mt-1"><ProgressBar value={p.average / 100} label={`${p.name} class average`} /></div>
                            </li>
                        ))}
                    </ul>
                </section>

                <section className={`${card} p-5`} aria-labelledby="mistakes-heading">
                    <h2 id="mistakes-heading" className="text-base font-bold text-slate-900 dark:text-white">Common mistakes (last 60 days)</h2>
                    {insights.mistakes.length === 0 ? (
                        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">No repeated mistakes recorded.</p>
                    ) : (
                        <ul className="mt-3 space-y-2">
                            {insights.mistakes.slice(0, 6).map((m) => (
                                <li key={m.type} className="flex items-center justify-between gap-2 text-sm">
                                    <span className="text-slate-800 dark:text-slate-200">{m.label}</span>
                                    <span className="tabular-nums text-slate-600 dark:text-slate-400">{m.count} times · {m.students} student{m.students === 1 ? '' : 's'}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                    {insights.subjects.length > 0 && (
                        <>
                            <h3 className="mt-5 text-sm font-bold text-slate-900 dark:text-white">Lowest tested subjects</h3>
                            <ul className="mt-2 space-y-2">
                                {insights.subjects.map((s) => (
                                    <li key={s.name} className="flex items-center justify-between gap-2 text-sm">
                                        <span className="text-slate-800 dark:text-slate-200">{s.name}</span>
                                        <span className="tabular-nums text-slate-600 dark:text-slate-400">avg {s.average} · {s.students} tested</span>
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}
                </section>

                <section className={`${card} p-5`} aria-labelledby="completion-heading">
                    <h2 id="completion-heading" className="text-base font-bold text-slate-900 dark:text-white">Classwork completion</h2>
                    {insights.classwork.length === 0 ? (
                        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">No classwork yet.</p>
                    ) : (
                        <ul className="mt-3 space-y-3">
                            {insights.classwork.map((w) => (
                                <li key={w.id}>
                                    <div className="flex justify-between gap-2 text-sm">
                                        <span className="min-w-0 truncate text-slate-800 dark:text-slate-200">{w.title}</span>
                                        <span className="flex-shrink-0 tabular-nums text-slate-600 dark:text-slate-400">{w.done}/{w.total}{w.missing ? ` · ${w.missing} missing` : ''}{w.late ? ` · ${w.late} late` : ''}</span>
                                    </div>
                                    <div className="mt-1"><ProgressBar value={w.total ? w.done / w.total : 0} label={`${w.title} completion`} /></div>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                <section className={`${card} p-5`} aria-labelledby="risk-heading">
                    <h2 id="risk-heading" className="text-base font-bold text-slate-900 dark:text-white">Students to check on</h2>
                    {insights.atRisk.length === 0 ? (
                        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Everyone is on track.</p>
                    ) : (
                        <ul className="mt-3 space-y-3">
                            {insights.atRisk.map((s) => (
                                <li key={s.candidateId}>
                                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">{s.name} <RiskPill risk={s.risk} /></p>
                                    <p className="text-xs text-slate-600 dark:text-slate-400">{s.flags.join(' · ')}</p>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            </div>
        </div>
    );
}


function ClassDna({ classId, getToken }: { classId: string; getToken: () => Promise<string | null> }) {
    const [dna, setDna] = useState<DnaResult | null>(null);
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const next = await getClassDna(await getToken(), classId);
                if (!cancelled) setDna(next);
            } catch { /* the rest of the insights still show */ }
        })();
        return () => { cancelled = true; };
    }, [classId, getToken]);
    if (!dna) return null;
    return <DnaView dna={dna} title="Class mistake DNA" subject="class" />;
}
