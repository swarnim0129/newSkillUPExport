'use client';

import React, { useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { errorMessage } from '@/lib/journeyApi';
import { joinClass } from '@/lib/mentorApi';
import { card, ErrorNote, input, primaryButton } from './ui';

export default function JoinCard({ getToken, onJoined, compact = false }: { getToken: () => Promise<string | null>; onJoined: (classId: string) => void; compact?: boolean }) {
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
            const result = await joinClass(await getToken(), code);
            onJoined(result.classId);
        } catch (err) {
            setError(errorMessage(err, 'Could not join the class.'));
            setBusy(false);
        }
    };

    return (
        <form onSubmit={submit} className={compact ? '' : `${card} p-4`}>
            <label htmlFor="class-code" className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white">
                <KeyRound className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" /> Join a class
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
                <input
                    id="class-code"
                    className={`${input} font-mono tracking-widest sm:max-w-xs`}
                    placeholder="Class code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    maxLength={12}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    aria-describedby="class-code-help"
                    required
                />
                <button type="submit" className={primaryButton} disabled={busy || code.trim().length < 5}>
                    {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Join
                </button>
            </div>
            <p id="class-code-help" className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">7 letters and numbers, from your mentor.</p>
            <ErrorNote text={error} />
        </form>
    );
}
