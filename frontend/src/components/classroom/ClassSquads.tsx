'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Flame, Loader2, Users } from 'lucide-react';
import { errorMessage } from '@/lib/journeyApi';
import { formClassSquads, getClassSquads, type SquadView } from '@/lib/growApi';
import { card, ErrorNote, input, panel, primaryButton } from './ui';

/** Mentor: pair strong and still-learning students into study squads. */
export default function ClassSquads({ classId, getToken, students }: { classId: string; getToken: () => Promise<string | null>; students: number }) {
    const [squads, setSquads] = useState<SquadView[] | null>(null);
    const [size, setSize] = useState(3);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        try {
            const next = await getClassSquads(await getToken(), classId);
            setSquads(next);
        } catch (err) {
            setError(errorMessage(err, 'Could not load squads.'));
        }
    }, [classId, getToken]);
    useEffect(() => { void Promise.resolve().then(load); }, [load]);

    const form = async () => {
        if (squads && squads.length && !window.confirm('Replace the current class squads with new ones?')) return;
        setBusy(true);
        setError('');
        try { setSquads(await formClassSquads(await getToken(), classId, size)); } catch (err) { setError(errorMessage(err, 'Could not form squads.')); } finally { setBusy(false); }
    };

    return (
        <section className={`${card} space-y-4 p-4`} aria-labelledby="squads-heading">
            <div>
                <h2 id="squads-heading" className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white"><Users className="h-4 w-4 text-orange-600" aria-hidden="true" /> Study squads</h2>
                <p className="text-xs text-slate-600 dark:text-slate-400">Each squad mixes stronger and still-learning students by readiness. A squad keeps its flame only on days everyone practises.</p>
            </div>
            <div className="flex items-end gap-2">
                <div className="w-32">
                    <label htmlFor="sq-size" className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">Squad size</label>
                    <select id="sq-size" className={input} value={size} onChange={(e) => setSize(Number(e.target.value))}>
                        {[2, 3, 4].map((n) => <option key={n} value={n}>{n} students</option>)}
                    </select>
                </div>
                <button className={primaryButton} onClick={form} disabled={busy || students < 2}>{busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} {squads && squads.length ? 'Re-form squads' : 'Form squads'}</button>
            </div>
            <ErrorNote text={error} />
            {squads && squads.length > 0 && (
                <ul className="space-y-2">
                    {squads.map((s) => (
                        <li key={s.id} className={`${panel} flex items-center justify-between gap-3 px-3 py-2`}>
                            <span className="min-w-0 text-sm">
                                <span className="block truncate font-semibold text-slate-900 dark:text-white">{s.members.map((m) => m.name).join(', ')}</span>
                                <span className="block text-xs text-slate-500 dark:text-slate-400">{s.members.filter((m) => m.activeToday).length}/{s.members.length} practised today</span>
                            </span>
                            <span className={`flex items-center gap-1 text-sm font-bold tabular-nums ${s.flameToday ? 'text-orange-600' : 'text-slate-500'}`}><Flame className="h-4 w-4" aria-hidden="true" /> {s.streak}</span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
