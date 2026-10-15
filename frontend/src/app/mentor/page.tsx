'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Archive, ClipboardCheck, Loader2, Pencil, Plus, School, Sparkles, Users } from 'lucide-react';
import { errorMessage } from '@/lib/journeyApi';
import { createClass, createDemoClass, listMentorClasses, updateMentorMe, type MentorClassCard } from '@/lib/mentorApi';
import { useMentor } from '@/components/classroom/MentorContext';
import {
    card,
    Dialog,
    ErrorNote,
    focusRing,
    input,
    label,
    primaryButton,
    secondaryButton,
    Spinner,
    themeOf,
} from '@/components/classroom/ui';
import ClassForm from '@/components/classroom/ClassForm';

export default function MentorHome() {
    const { mentor, setMentor, demoEnabled, getToken } = useMentor();
    const router = useRouter();
    const [classes, setClasses] = useState<MentorClassCard[] | null>(null);
    const [error, setError] = useState('');
    const [creating, setCreating] = useState(false);
    const [editingProfile, setEditingProfile] = useState(false);
    const [demoBusy, setDemoBusy] = useState(false);
    const [showArchived, setShowArchived] = useState(false);

    const load = useCallback(async () => {
        try {
            const next = await listMentorClasses(await getToken());
            setClasses(next.classes);
            setError('');
        } catch (err) {
            setError(errorMessage(err, 'Could not load your classes.'));
        }
    }, [getToken]);

    useEffect(() => { void Promise.resolve().then(load); }, [load]);

    const addDemo = async () => {
        setDemoBusy(true);
        setError('');
        try {
            const classroom = await createDemoClass(await getToken());
            router.push(`/mentor/classes/${classroom.id}`);
        } catch (err) {
            setError(errorMessage(err, 'Could not create the demo class.'));
            setDemoBusy(false);
        }
    };

    if (!classes && !error) return <Spinner label="Loading classes" />;

    const active = (classes || []).filter((c) => !c.archived);
    const archived = (classes || []).filter((c) => c.archived);
    const toReview = active.reduce((sum, c) => sum + c.toReview, 0);

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">Your classes</h1>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-slate-600 dark:text-slate-400">
                        {mentor.name}{mentor.department ? ` · ${mentor.department}` : ''}
                        <button className={`inline-flex items-center gap-1 rounded font-semibold text-blue-700 hover:underline dark:text-blue-400 ${focusRing}`} onClick={() => setEditingProfile(true)}>
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit
                        </button>
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {demoEnabled && (
                        <button className={secondaryButton} onClick={addDemo} disabled={demoBusy}>
                            {demoBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
                            {demoBusy ? 'Building demo class…' : 'Add a demo class'}
                        </button>
                    )}
                    <button className={primaryButton} onClick={() => setCreating(true)}>
                        <Plus className="h-4 w-4" aria-hidden="true" /> Create class
                    </button>
                </div>
            </div>

            <ErrorNote text={error} />

            {toReview > 0 && (
                <p className={`${card} flex items-center gap-2 p-4 text-sm text-slate-800 dark:text-slate-200`} role="status">
                    <ClipboardCheck className="h-5 w-5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                    {toReview} hand-in{toReview > 1 ? 's' : ''} waiting for your grade.
                </p>
            )}

            {active.length === 0 ? (
                <div className={`${card} mx-auto max-w-xl p-8 text-center`}>
                    <School className="mx-auto h-9 w-9 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                    <h2 className="mt-3 text-lg font-bold text-slate-900 dark:text-white">Create your first class</h2>
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                        You get a join code to share with students. Work you set is checked from their own practice on SkillUp and added to each student&apos;s plan.
                    </p>
                    <div className="mt-5 flex flex-wrap justify-center gap-2">
                        <button className={primaryButton} onClick={() => setCreating(true)}><Plus className="h-4 w-4" aria-hidden="true" /> Create class</button>
                        {demoEnabled && (
                            <button className={secondaryButton} onClick={addDemo} disabled={demoBusy}>
                                {demoBusy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Try a demo class
                            </button>
                        )}
                    </div>
                </div>
            ) : (
                <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Classes">
                    {active.map((c) => <li key={c.id}><ClassCard c={c} /></li>)}
                </ul>
            )}

            {archived.length > 0 && (
                <div>
                    <button className={`${secondaryButton}`} onClick={() => setShowArchived((v) => !v)} aria-expanded={showArchived}>
                        <Archive className="h-4 w-4" aria-hidden="true" /> {showArchived ? 'Hide' : 'Show'} archived classes ({archived.length})
                    </button>
                    {showArchived && (
                        <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Archived classes">
                            {archived.map((c) => <li key={c.id}><ClassCard c={c} /></li>)}
                        </ul>
                    )}
                </div>
            )}

            <Dialog open={creating} onClose={() => setCreating(false)} title="Create class">
                <ClassForm
                    submitLabel="Create"
                    onSubmit={async (data) => {
                        const classroom = await createClass(await getToken(), data);
                        router.push(`/mentor/classes/${classroom.id}`);
                    }}
                    onCancel={() => setCreating(false)}
                />
            </Dialog>

            <Dialog open={editingProfile} onClose={() => setEditingProfile(false)} title="Your profile">
                <ProfileForm
                    name={mentor.name}
                    department={mentor.department}
                    onSave={async (data) => {
                        setMentor(await updateMentorMe(await getToken(), data));
                        setEditingProfile(false);
                    }}
                    onCancel={() => setEditingProfile(false)}
                />
            </Dialog>
        </div>
    );
}

function ClassCard({ c }: { c: MentorClassCard }) {
    const theme = themeOf(c.theme);
    return (
        <Link
            href={`/mentor/classes/${c.id}`}
            className={`${card} group block h-full overflow-hidden transition-shadow hover:shadow-md ${focusRing} ${c.archived ? 'opacity-80' : ''}`}
        >
            <div className={`${theme.banner} px-4 py-4 text-white`}>
                <h2 className="truncate text-lg font-bold group-hover:underline">{c.name}</h2>
                <p className="truncate text-sm text-white/90">{[c.section, c.subject].filter(Boolean).join(' · ') || 'No section'}</p>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
                <span className="inline-flex items-center gap-1"><Users className="h-4 w-4" aria-hidden="true" /> {c.students} student{c.students === 1 ? '' : 's'}</span>
                <span>{c.classwork} classwork</span>
                {c.toReview > 0 && <span className="font-semibold text-blue-700 dark:text-blue-400">{c.toReview} to grade</span>}
                {c.archived && <span className="inline-flex items-center gap-1 text-slate-500"><Archive className="h-3.5 w-3.5" aria-hidden="true" /> Archived</span>}
            </div>
            {!c.archived && (
                <div className="border-t border-slate-200 px-4 py-2 text-xs text-slate-600 dark:border-[var(--soft-line)] dark:text-slate-400">
                    Join code <span className="font-mono text-sm font-bold tracking-wider text-slate-900 dark:text-white">{c.code}</span>
                    {c.joinOpen === false && <span> · closed to new students</span>}
                </div>
            )}
        </Link>
    );
}

function ProfileForm({
    name,
    department,
    onSave,
    onCancel,
}: {
    name: string;
    department: string;
    onSave: (data: { name: string; department: string }) => Promise<void>;
    onCancel: () => void;
}) {
    const [value, setValue] = useState({ name, department });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        try {
            await onSave({ name: value.name.trim(), department: value.department.trim() });
        } catch (err) {
            setError(errorMessage(err, 'Could not save.'));
            setBusy(false);
        }
    };
    return (
        <form onSubmit={submit} className="space-y-4">
            <div>
                <label htmlFor="profile-name" className={label}>Name students see</label>
                <input id="profile-name" className={input} value={value.name} onChange={(e) => setValue((v) => ({ ...v, name: e.target.value }))} required maxLength={100} autoComplete="name" />
            </div>
            <div>
                <label htmlFor="profile-dept" className={label}>Department</label>
                <input id="profile-dept" className={input} value={value.department} onChange={(e) => setValue((v) => ({ ...v, department: e.target.value }))} maxLength={100} />
            </div>
            <ErrorNote text={error} />
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" className={secondaryButton} onClick={onCancel}>Cancel</button>
                <button type="submit" className={primaryButton} disabled={busy || !value.name.trim()}>
                    {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Save
                </button>
            </div>
        </form>
    );
}
