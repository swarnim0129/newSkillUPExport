'use client';

import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { errorMessage } from '@/lib/journeyApi';
import { ErrorNote, input, label, primaryButton, secondaryButton, textarea, THEMES } from './ui';

export interface ClassFormData {
    name: string;
    section: string;
    subject: string;
    description: string;
    theme: number;
}

export default function ClassForm({
    initial,
    submitLabel,
    onSubmit,
    onCancel,
}: {
    initial?: Partial<ClassFormData>;
    submitLabel: string;
    onSubmit: (data: ClassFormData) => Promise<void>;
    onCancel: () => void;
}) {
    const [data, setData] = useState<ClassFormData>({
        name: initial?.name || '',
        section: initial?.section || '',
        subject: initial?.subject || '',
        description: initial?.description || '',
        theme: initial?.theme ?? 0,
    });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const set = (key: keyof ClassFormData, value: string | number) => setData((d) => ({ ...d, [key]: value }));

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
            await onSubmit({ ...data, name: data.name.trim() });
        } catch (err) {
            setError(errorMessage(err, 'Could not save the class.'));
            setBusy(false);
        }
    };

    return (
        <form onSubmit={submit} className="space-y-4">
            <div>
                <label htmlFor="class-name" className={label}>Class name</label>
                <input id="class-name" className={input} value={data.name} onChange={(e) => set('name', e.target.value)} required maxLength={100} placeholder="DSA Batch A" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
                <div>
                    <label htmlFor="class-section" className={label}>Section <span className="font-normal text-slate-500">(optional)</span></label>
                    <input id="class-section" className={input} value={data.section} onChange={(e) => set('section', e.target.value)} maxLength={100} placeholder="TE Computer, Div B" />
                </div>
                <div>
                    <label htmlFor="class-subject" className={label}>Subject <span className="font-normal text-slate-500">(optional)</span></label>
                    <input id="class-subject" className={input} value={data.subject} onChange={(e) => set('subject', e.target.value)} maxLength={100} placeholder="Placement preparation" />
                </div>
            </div>
            <div>
                <label htmlFor="class-description" className={label}>Description <span className="font-normal text-slate-500">(optional)</span></label>
                <textarea id="class-description" rows={2} className={textarea} value={data.description} onChange={(e) => set('description', e.target.value)} maxLength={1000} />
            </div>
            <fieldset>
                <legend className={label}>Banner colour</legend>
                <div className="flex flex-wrap gap-2">
                    {THEMES.map((t, i) => (
                        <label key={t.name} className="cursor-pointer">
                            <input type="radio" name="class-theme" className="peer sr-only" checked={data.theme === i} onChange={() => set('theme', i)} />
                            <span className={`flex h-11 items-center gap-2 rounded-lg border-2 px-3 text-sm font-medium text-slate-800 dark:text-slate-200 peer-checked:border-blue-600 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 ${data.theme === i ? 'border-blue-600' : 'border-slate-200 dark:border-[var(--soft-line)]'}`}>
                                <span className={`h-5 w-5 rounded ${t.swatch}`} aria-hidden="true" /> {t.name}
                            </span>
                        </label>
                    ))}
                </div>
            </fieldset>
            <ErrorNote text={error} />
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" className={secondaryButton} onClick={onCancel}>Cancel</button>
                <button type="submit" className={primaryButton} disabled={busy || !data.name.trim()}>
                    {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} {submitLabel}
                </button>
            </div>
        </form>
    );
}
