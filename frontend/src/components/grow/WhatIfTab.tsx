'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CheckCircle2, Clock3, Info, Loader2, Sparkles } from 'lucide-react';
import { errorMessage, type GoalType } from '@/lib/journeyApi';
import { applyWhatIf, runWhatIf, type WhatIfResult } from '@/lib/growApi';
import { card, ErrorNote, panel, primaryButton, Spinner } from '@/components/classroom/ui';

const GOALS: { type: GoalType; label: string }[] = [
    { type: 'placement', label: 'Get placed' },
    { type: 'higher_studies', label: 'Higher studies' },
    { type: 'govt_exam', label: 'Government exam' },
    { type: 'startup', label: 'Build a startup' },
    { type: 'undecided', label: 'Not sure yet' },
];

function shortDate(value: string | null) {
    if (!value) return 'Not in this window';
    return new Date(value).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

/**
 * The time machine: move the sliders and the future redraws. Every number comes
 * from the student's own pace and the assumptions listed under the chart.
 */
export default function WhatIfTab({ getToken }: { getToken: () => Promise<string | null> }) {
    const [result, setResult] = useState<WhatIfResult | null>(null);
    const [hours, setHours] = useState<number | null>(null);
    const [dsa, setDsa] = useState(0);
    const [goal, setGoal] = useState<GoalType | null>(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [saved, setSaved] = useState('');
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const run = useCallback(async (body: { hoursPerWeek?: number; goal?: GoalType; dsaPerWeek: number }) => {
        try {
            const next = await runWhatIf(await getToken(), body as { hoursPerWeek: number; goal: GoalType; dsaPerWeek: number });
            setResult(next);
            setHours((h) => h ?? next.current.hoursPerWeek);
            setGoal((g) => g ?? next.current.goal);
            setError('');
        } catch (err) {
            setError(errorMessage(err, 'Could not run the time machine.'));
        }
    }, [getToken]);

    useEffect(() => { void Promise.resolve().then(() => run({ dsaPerWeek: 0 })); }, [run]);

    // Redraw shortly after the sliders stop moving
    const change = (next: { hours?: number; dsa?: number; goal?: GoalType }) => {
        const h = next.hours ?? hours ?? 8;
        const d = next.dsa ?? dsa;
        const g = next.goal ?? goal ?? 'undecided';
        if (next.hours !== undefined) setHours(next.hours);
        if (next.dsa !== undefined) setDsa(next.dsa);
        if (next.goal !== undefined) setGoal(next.goal);
        setSaved('');
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => run({ hoursPerWeek: h, dsaPerWeek: d, goal: g }), 250);
    };

    const commit = async () => {
        if (!result || hours === null) return;
        setBusy(true);
        try {
            await applyWhatIf(await getToken(), hours);
            setSaved(`Saved. Your plan now assumes ${hours} hours a week, and your companion knows.`);
            run({ hoursPerWeek: hours, dsaPerWeek: dsa, goal: goal || 'undecided' });
        } catch (err) {
            setError(errorMessage(err, 'Could not save.'));
        } finally {
            setBusy(false);
        }
    };

    if (!result) return error ? <ErrorNote text={error} /> : <Spinner label="Starting the time machine" />;

    const sooner = result.readyWeek.scenario !== null && (result.readyWeek.baseline === null || result.readyWeek.scenario < result.readyWeek.baseline);
    const data = result.points.map((p) => ({ ...p, label: new Date(p.date).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }) }));

    return (
        <div className="grid gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
            <section className={`${card} h-fit space-y-6 p-5`} aria-labelledby="levers-heading">
                <div>
                    <h2 id="levers-heading" className="text-base font-bold text-slate-900 dark:text-white">Change one thing</h2>
                    <p className="text-xs text-slate-600 dark:text-slate-400">The chart redraws as you move these. Nothing is saved until you choose to.</p>
                </div>

                <div>
                    <div className="flex items-baseline justify-between">
                        <label htmlFor="wi-hours" className="text-sm font-medium text-slate-800 dark:text-slate-200">Hours a week</label>
                        <span className="text-lg font-bold tabular-nums text-blue-700 dark:text-blue-400">{hours}</span>
                    </div>
                    <input id="wi-hours" type="range" min={1} max={40} value={hours ?? 8} onChange={(e) => change({ hours: Number(e.target.value) })} className="mt-2 w-full accent-blue-600" aria-valuetext={`${hours} hours a week`} />
                    <p className="text-xs text-slate-500 dark:text-slate-400">Now: {result.current.hoursPerWeek} hours</p>
                </div>

                <div>
                    <div className="flex items-baseline justify-between">
                        <label htmlFor="wi-dsa" className="text-sm font-medium text-slate-800 dark:text-slate-200">Extra DSA problems a week</label>
                        <span className="text-lg font-bold tabular-nums text-blue-700 dark:text-blue-400">{dsa}</span>
                    </div>
                    <input id="wi-dsa" type="range" min={0} max={15} value={dsa} onChange={(e) => change({ dsa: Number(e.target.value) })} className="mt-2 w-full accent-blue-600" aria-valuetext={`${dsa} problems a week`} />
                </div>

                <fieldset>
                    <legend className="mb-2 text-sm font-medium text-slate-800 dark:text-slate-200">Goal</legend>
                    <div className="grid grid-cols-2 gap-2">
                        {GOALS.map((g) => (
                            <button
                                key={g.type}
                                type="button"
                                onClick={() => change({ goal: g.type })}
                                aria-pressed={goal === g.type}
                                className={`min-h-11 rounded-xl border px-3 text-left text-sm font-medium cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${goal === g.type ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white/70 text-slate-700 hover:border-blue-300 dark:border-white/10 dark:bg-white/5 dark:text-slate-200'}`}
                            >
                                {g.label}
                            </button>
                        ))}
                    </div>
                </fieldset>

                {hours !== result.current.hoursPerWeek && (
                    <button className={`${primaryButton} w-full`} onClick={commit} disabled={busy}>
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />} Commit to {hours} hours a week
                    </button>
                )}
                {saved && <p className="text-sm text-emerald-700 dark:text-emerald-400" role="status">{saved}</p>}
                <ErrorNote text={error} />
            </section>

            <div className="space-y-5">
                <section className={`${card} p-5`} aria-labelledby="future-heading">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <h2 id="future-heading" className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
                                <Sparkles className="h-5 w-5 text-blue-600 dark:text-blue-400" aria-hidden="true" /> Two futures
                            </h2>
                            <p className={`mt-1 text-sm font-medium ${sooner ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'}`} aria-live="polite">{result.verdict}</p>
                        </div>
                    </div>

                    <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <Stat label="Ready (now)" value={shortDate(result.readyDate.baseline)} />
                        <Stat label="Ready (with change)" value={shortDate(result.readyDate.scenario)} highlight />
                        <Stat label={`At ${result.target.label.split('(')[0].trim()}`} value={`${result.atTarget.baseline} → ${result.atTarget.scenario}`} />
                        <Stat label="Points a week" value={`${result.current.pointsPerWeek} → ${result.scenario.pointsPerWeek}`} />
                    </dl>

                    <div className="mt-5 h-72 [--now:#64748b] dark:[--now:#94a3b8] [--new:#2563eb] dark:[--new:#60a5fa] [--grid:#e2e8f0] dark:[--grid:#253048] [--axis:#64748b] dark:[--axis:#94a3b8]">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
                                <CartesianGrid vertical={false} stroke="var(--grid)" />
                                <XAxis dataKey="label" tick={{ fill: 'var(--axis)', fontSize: 12 }} stroke="var(--grid)" interval="preserveStartEnd" minTickGap={28} />
                                <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fill: 'var(--axis)', fontSize: 12 }} stroke="var(--grid)" />
                                <ReferenceLine y={result.readyLevel} stroke="var(--axis)" strokeDasharray="4 4" label={{ value: `Ready ${result.readyLevel}`, position: 'insideTopRight', fill: 'var(--axis)', fontSize: 12 }} />
                                <Tooltip
                                    contentStyle={{ borderRadius: 12, border: '1px solid rgb(148 163 184 / 0.3)', background: 'rgb(255 255 255 / 0.92)', color: '#0f172a', fontSize: 12 }}
                                    formatter={(value, name) => [`${value}/100`, name === 'baseline' ? 'Current habits' : 'With your change']}
                                />
                                <Legend formatter={(value) => (value === 'baseline' ? 'Current habits' : 'With your change')} wrapperStyle={{ fontSize: 12 }} />
                                <Line type="monotone" dataKey="baseline" stroke="var(--now)" strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
                                <Line type="monotone" dataKey="scenario" stroke="var(--new)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                    <p className="sr-only">
                        Current habits reach {result.atTarget.baseline} by {result.target.label}; with the change, {result.atTarget.scenario}.
                    </p>
                </section>

                <section className={`${card} p-5`} aria-labelledby="assume-heading">
                    <h3 id="assume-heading" className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                        <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" /> How this is worked out
                    </h3>
                    <ul className="mt-2 space-y-1.5 text-sm text-slate-700 dark:text-slate-300">
                        {result.assumptions.map((a) => (
                            <li key={a} className="flex items-start gap-2"><Clock3 className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" aria-hidden="true" /> {a}</li>
                        ))}
                    </ul>
                </section>
            </div>
        </div>
    );
}

function Stat({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
    return (
        <div className={`${panel} p-3 shadow-[var(--neu-inset)]`}>
            <dt className="text-[11px] font-medium text-slate-600 dark:text-slate-400">{label}</dt>
            <dd className={`mt-0.5 text-base font-bold tabular-nums ${highlight ? 'text-blue-700 dark:text-blue-400' : 'text-slate-900 dark:text-white'}`}>{value}</dd>
        </div>
    );
}
