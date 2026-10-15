'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Ghost, Info, Swords, TrendingDown, TrendingUp } from 'lucide-react';
import { errorMessage } from '@/lib/journeyApi';
import { getRival, type RivalResult } from '@/lib/growApi';
import { card, ErrorNote, Spinner } from '@/components/classroom/ui';

export default function RivalTab({ getToken }: { getToken: () => Promise<string | null> }) {
    const [result, setResult] = useState<RivalResult | null>(null);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        try {
            const next = await getRival(await getToken());
            setResult(next);
        } catch (err) {
            setError(errorMessage(err, 'Could not load your rival.'));
        }
    }, [getToken]);
    useEffect(() => { void Promise.resolve().then(load); }, [load]);

    if (!result) return error ? <ErrorNote text={error} /> : <Spinner label="Summoning your rival" />;

    const leading = result.series.find((s) => s.semester === result.semester);
    const youAhead = leading && leading.you !== null && leading.you >= leading.ghost;

    return (
        <div className="space-y-5">
            <section className={`${card} overflow-hidden`}>
                <div className="flex flex-col gap-4 bg-gradient-to-br from-violet-600 to-blue-700 p-5 text-white sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                        <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-white/15"><Ghost className="h-7 w-7" aria-hidden="true" /></span>
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wider text-white/80">Your rival</p>
                            <h2 className="text-xl font-bold">{result.ghostName}</h2>
                            <p className="mt-1 max-w-xl text-sm text-white/90">{result.explanation}</p>
                        </div>
                    </div>
                    <p className={`flex items-center gap-2 rounded-xl bg-white/15 px-4 py-3 text-sm font-semibold`}>
                        {youAhead ? <TrendingUp className="h-5 w-5" aria-hidden="true" /> : <TrendingDown className="h-5 w-5" aria-hidden="true" />}
                        {result.message}
                    </p>
                </div>

                <div className="p-5">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">Race by semester</h3>
                    <div className="mt-3 h-64 [--you:#2563eb] dark:[--you:#60a5fa] [--ghost:#7c3aed] dark:[--ghost:#a78bfa] [--grid:#e2e8f0] dark:[--grid:#253048] [--axis:#64748b] dark:[--axis:#94a3b8]">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={result.series.map((s) => ({ ...s, label: `S${s.semester}` }))} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
                                <CartesianGrid vertical={false} stroke="var(--grid)" />
                                <XAxis dataKey="label" tick={{ fill: 'var(--axis)', fontSize: 12 }} stroke="var(--grid)" />
                                <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fill: 'var(--axis)', fontSize: 12 }} stroke="var(--grid)" />
                                <ReferenceLine x={`S${result.semester}`} stroke="var(--axis)" strokeDasharray="3 3" label={{ value: 'You are here', position: 'insideTopLeft', fill: 'var(--axis)', fontSize: 11 }} />
                                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid rgb(148 163 184 / 0.3)', background: 'rgb(255 255 255 / 0.92)', color: '#0f172a', fontSize: 12 }} formatter={(v, n) => [`${v}/100`, n === 'you' ? 'You' : 'Ghost']} />
                                <Legend formatter={(v) => (v === 'you' ? 'You' : 'Ghost')} wrapperStyle={{ fontSize: 12 }} />
                                <Line type="monotone" dataKey="ghost" stroke="var(--ghost)" strokeWidth={2} strokeDasharray="6 4" dot={{ r: 3 }} isAnimationActive={false} />
                                <Line type="monotone" dataKey="you" stroke="var(--you)" strokeWidth={2.5} dot={{ r: 4 }} connectNulls isAnimationActive={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </section>

            <section className={`${card} p-5`} aria-labelledby="h2h-heading">
                <h3 id="h2h-heading" className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
                    <Swords className="h-5 w-5 text-violet-600 dark:text-violet-400" aria-hidden="true" /> Head to head, semester {result.semester}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400">You lead in {result.ahead} of {result.compare.length}.</p>
                <ul className="mt-4 space-y-4">
                    {result.compare.map((c) => {
                        const max = Math.max(c.you, c.ghost, 1);
                        const ahead = c.you >= c.ghost;
                        return (
                            <li key={c.label}>
                                <div className="flex items-baseline justify-between text-sm">
                                    <span className="font-medium text-slate-800 dark:text-slate-200">{c.label}</span>
                                    <span className={`text-xs font-semibold ${ahead ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-300'}`}>
                                        {ahead ? 'You lead' : `Ghost leads by ${c.ghost - c.you}`}
                                    </span>
                                </div>
                                <div className="mt-1.5 space-y-1">
                                    <Bar label="You" value={c.you} unit={c.unit} pct={c.you / max} tone="bg-blue-600 dark:bg-blue-500" />
                                    <Bar label="Ghost" value={c.ghost} unit={c.unit} pct={c.ghost / max} tone="bg-violet-500/70" />
                                </div>
                            </li>
                        );
                    })}
                </ul>
                <p className="mt-4 flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
                    <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" /> The ghost is anonymous. No one else can see your numbers here.
                </p>
            </section>
        </div>
    );
}

function Bar({ label, value, unit, pct, tone }: { label: string; value: number; unit: string; pct: number; tone: string }) {
    return (
        <div className="flex items-center gap-2">
            <span className="w-12 text-xs text-slate-600 dark:text-slate-400">{label}</span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-200/80 dark:bg-white/10" aria-hidden="true">
                <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(2, Math.round(pct * 100))}%` }} />
            </div>
            <span className="w-14 text-right text-xs font-semibold tabular-nums text-slate-800 dark:text-slate-200">{value}{unit}</span>
        </div>
    );
}
