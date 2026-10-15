'use client';

import React, { useState } from 'react';
import { FileUp, Loader2, Upload } from 'lucide-react';
import { errorMessage } from '@/lib/journeyApi';
import { applySyllabus, readSyllabus, type SyllabusProposal } from '@/lib/growApi';
import { ErrorNote, input, label, panel, primaryButton, secondaryButton } from './ui';

/** Mentor: upload a syllabus; the AI proposes one Practice Lab set per week to review and post. */
export default function SyllabusImport({ classId, getToken, onDone, onCancel }: { classId: string; getToken: () => Promise<string | null>; onDone: (count: number) => void; onCancel: () => void }) {
    const [file, setFile] = useState<File | null>(null);
    const [weeks, setWeeks] = useState(12);
    const [proposal, setProposal] = useState<SyllabusProposal | null>(null);
    const [picked, setPicked] = useState<boolean[]>([]);
    const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [minScore, setMinScore] = useState(60);
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');

    const read = async () => {
        if (!file) return;
        setBusy('read');
        setError('');
        try {
            const p = await readSyllabus(await getToken(), classId, file, weeks);
            setProposal(p);
            setPicked(p.weeks.map(() => true));
        } catch (err) {
            setError(errorMessage(err, 'Could not read the syllabus.'));
        } finally {
            setBusy('');
        }
    };

    const edit = (i: number, key: 'title' | 'subject', value: string) => {
        setProposal((p) => (p ? { ...p, weeks: p.weeks.map((w, j) => (j === i ? { ...w, [key]: value } : w)) } : p));
    };

    const apply = async () => {
        if (!proposal) return;
        setBusy('apply');
        setError('');
        try {
            const r = await applySyllabus(await getToken(), classId, { startDate: new Date(startDate).toISOString(), minScore, weeks: proposal.weeks.filter((_, i) => picked[i]) });
            onDone(r.created);
        } catch (err) {
            setError(errorMessage(err, 'Could not create the weekly work.'));
            setBusy('');
        }
    };

    if (!proposal) {
        return (
            <div className="space-y-4">
                <p className="text-sm text-slate-600 dark:text-slate-400">Upload the syllabus PDF or a photo of it. The AI turns it into one Practice Lab set per week. You review everything before it is posted.</p>
                <div className={`${panel} p-4 text-center`}>
                    <FileUp className="mx-auto h-8 w-8 text-blue-600" aria-hidden="true" />
                    <input id="syl-file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                    <label htmlFor="syl-file" className={`${secondaryButton} mt-3`}><Upload className="h-4 w-4" aria-hidden="true" /> {file ? file.name : 'Choose a file'}</label>
                </div>
                <div className="w-40">
                    <label htmlFor="syl-weeks" className={label}>Weeks</label>
                    <input id="syl-weeks" type="number" min={1} max={20} className={input} value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} />
                </div>
                <ErrorNote text={error} />
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button className={secondaryButton} onClick={onCancel}>Cancel</button>
                    <button className={primaryButton} onClick={read} disabled={!file || !!busy}>{busy === 'read' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null} {busy === 'read' ? 'Reading…' : 'Read syllabus'}</button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <p className="text-sm text-slate-700 dark:text-slate-300">{proposal.course ? <><span className="font-semibold">{proposal.course}</span>. </> : null}Untick weeks you do not want, and fix any names.</p>
            <ul className="max-h-80 space-y-2 overflow-y-auto">
                {proposal.weeks.map((w, i) => (
                    <li key={i} className={`${panel} flex items-start gap-3 p-3`}>
                        <input type="checkbox" className="mt-3 h-5 w-5 accent-blue-600" checked={picked[i]} onChange={(e) => setPicked((p) => p.map((v, j) => (j === i ? e.target.checked : v)))} aria-label={`Include week ${w.week}`} />
                        <div className="grid flex-1 gap-2 sm:grid-cols-2">
                            <div>
                                <label htmlFor={`syl-t-${i}`} className="text-xs text-slate-600 dark:text-slate-400">Week {w.week} title</label>
                                <input id={`syl-t-${i}`} className={input} value={w.title} onChange={(e) => edit(i, 'title', e.target.value)} />
                            </div>
                            <div>
                                <label htmlFor={`syl-s-${i}`} className="text-xs text-slate-600 dark:text-slate-400">Lab subject</label>
                                <input id={`syl-s-${i}`} className={input} value={w.subject} onChange={(e) => edit(i, 'subject', e.target.value)} />
                            </div>
                            {w.topics.length > 0 && <p className="text-xs text-slate-500 dark:text-slate-400 sm:col-span-2">Topics: {w.topics.join(', ')}</p>}
                        </div>
                    </li>
                ))}
            </ul>
            <div className="grid gap-3 sm:grid-cols-2">
                <div>
                    <label htmlFor="syl-start" className={label}>Week 1 starts</label>
                    <input id="syl-start" type="date" className={input} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div>
                    <label htmlFor="syl-min" className={label}>Pass score</label>
                    <input id="syl-min" type="number" min={0} max={100} className={input} value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} />
                </div>
            </div>
            <ErrorNote text={error} />
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button className={secondaryButton} onClick={() => setProposal(null)}>Back</button>
                <button className={primaryButton} onClick={apply} disabled={!!busy || !picked.some(Boolean)}>{busy === 'apply' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Post {picked.filter(Boolean).length} weeks of classwork</button>
            </div>
        </div>
    );
}
