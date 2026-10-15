'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Legend, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from 'recharts';
import { Dna, TrendingDown, TrendingUp } from 'lucide-react';
import { errorMessage } from '@/lib/journeyApi';
import { getDna, type DnaResult } from '@/lib/growApi';
import { card, ErrorNote, panel, Spinner } from '@/components/classroom/ui';

export default function DnaTab({ getToken }: { getToken: () => Promise<string | null> }) {
    const [dna, setDna] = useState<DnaResult | null>(null);
    const [error, setError] = useState('');
    const load = useCallback(async () => {
        try {
            const next = await getDna(await getToken());
            setDna(next);
        } catch (err) {
            setError(errorMessage(err, 'Could not load your mistake DNA.'));
        }
    }, [getToken]);
    useEffect(() => { void Promise.resolve().then(load); }, [load]);
    if (!dna) return error ? <ErrorNote text={error} /> : <Spinner label="Reading your mistakes" />;
    return <DnaView dna={dna} title="Your mistake DNA" subject="you" />;
}

/** The fingerprint chart; used for one student and for a whole class. */
export function DnaView({ dna, title, subject }: { dna: DnaResult; title: string; subject: 'you' | 'class' }) {
    if (dna.total === 0) {
        return (
            <section className={`${card} p-8 text-center`}>
                <Dna className="mx-auto h-9 w-9 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                <h2 className="mt-3 text-lg font-bold text-slate-900 dark:text-white">{title}</h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-slate-600 dark:text-slate-400">
                    {subject === 'you' ? 'No mistakes recorded yet.' : 'No mistakes recorded in this class yet.'} Every failed run in Practice and every missed Lab question is classified, and the fingerprint builds up from there.
                </p>
            </section>
        );
    }
    const data = dna.axes.map((a) => ({ label: a.label, 'Last 30 days': a.recent, 'The 30 days before': a.before }));
    return (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <section className={`${card} p-5`} aria-labelledby="dna-heading">
                <h2 id="dna-heading" className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
                    <Dna className="h-5 w-5 text-blue-600 dark:text-blue-400" aria-hidden="true" /> {title}
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-400">Share of each kind of mistake. A shape that shrinks over time means the habit is fixing itself.</p>
                <div className="mt-3 h-80 [--a:#2563eb] dark:[--a:#60a5fa] [--b:#94a3b8] dark:[--b:#64748b] [--grid:#cbd5e1] dark:[--grid:#334155] [--axis:#475569] dark:[--axis:#cbd5e1]">
                    <ResponsiveContainer width="100%" height="100%">
                        <RadarChart data={data} outerRadius="72%">
                            <PolarGrid stroke="var(--grid)" />
                            <PolarAngleAxis dataKey="label" tick={{ fill: 'var(--axis)', fontSize: 11 }} />
                            <PolarRadiusAxis angle={90} domain={[0, 'auto']} tick={false} axisLine={false} />
                            <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} formatter={(v) => [`${v}%`]} />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                            <Radar dataKey="The 30 days before" stroke="var(--b)" fill="var(--b)" fillOpacity={0.15} strokeDasharray="5 4" isAnimationActive={false} />
                            <Radar dataKey="Last 30 days" stroke="var(--a)" fill="var(--a)" fillOpacity={0.3} strokeWidth={2} isAnimationActive={false} />
                        </RadarChart>
                    </ResponsiveContainer>
                </div>
            </section>

            <div className="space-y-5">
                {dna.dominant && (
                    <section className={`${card} p-5`}>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Strongest trait</p>
                        <p className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{dna.dominant.label}</p>
                        <p className="text-sm text-slate-600 dark:text-slate-400">{dna.dominant.share}% of {subject === 'you' ? 'your' : 'the class’s'} {dna.total} recorded mistakes</p>
                    </section>
                )}
                <section className={`${card} p-5`} aria-labelledby="shift-heading">
                    <h3 id="shift-heading" className="text-sm font-bold text-slate-900 dark:text-white">How it shifted this month</h3>
                    {dna.shifts.length === 0 ? (
                        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">No big shifts yet. Keep practising and this fills in.</p>
                    ) : (
                        <ul className="mt-2 space-y-2">
                            {dna.shifts.map((s) => (
                                <li key={s.text} className={`${panel} flex items-start gap-2 px-3 py-2 text-sm ${s.tone === 'good' ? 'text-emerald-800 dark:text-emerald-300' : 'text-amber-800 dark:text-amber-300'}`}>
                                    {s.tone === 'good' ? <TrendingDown className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" /> : <TrendingUp className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />}
                                    {s.text}
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
                <section className={`${card} p-5`} aria-labelledby="count-heading">
                    <h3 id="count-heading" className="text-sm font-bold text-slate-900 dark:text-white">All time, last 6 months</h3>
                    <ul className="mt-2 space-y-1.5">
                        {[...dna.axes].sort((a, b) => b.count - a.count).map((a) => (
                            <li key={a.type} className="flex items-center justify-between gap-2 text-sm">
                                <span className="text-slate-800 dark:text-slate-200">{a.label}</span>
                                <span className="tabular-nums text-slate-600 dark:text-slate-400">{a.count}</span>
                            </li>
                        ))}
                    </ul>
                </section>
            </div>
        </div>
    );
}
