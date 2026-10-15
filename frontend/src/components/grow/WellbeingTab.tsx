'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, BatteryLow, HeartPulse, Leaf, Loader2, Moon, ShieldCheck } from 'lucide-react';
import { errorMessage } from '@/lib/journeyApi';
import { easePlan, getWellbeing, saveWellbeing, type WellbeingResult } from '@/lib/growApi';
import { card, ErrorNote, panel, primaryButton, secondaryButton, Spinner } from '@/components/classroom/ui';

const LEVEL = {
    steady: { label: 'Steady', icon: Leaf, className: 'text-emerald-700 dark:text-emerald-400', ring: 'stroke-emerald-500' },
    stretched: { label: 'Stretched', icon: BatteryLow, className: 'text-amber-700 dark:text-amber-300', ring: 'stroke-amber-500' },
    overloaded: { label: 'Overloaded', icon: AlertTriangle, className: 'text-red-700 dark:text-red-400', ring: 'stroke-red-500' },
};

export default function WellbeingTab({ getToken }: { getToken: () => Promise<string | null> }) {
    const [w, setW] = useState<WellbeingResult | null>(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState('');
    const [note, setNote] = useState('');

    const load = useCallback(async () => {
        try {
            const next = await getWellbeing(await getToken());
            setW(next);
        } catch (err) {
            setError(errorMessage(err, 'Could not load the burnout guard.'));
        }
    }, [getToken]);
    useEffect(() => { void Promise.resolve().then(load); }, [load]);

    const save = async (body: { optIn?: boolean; shareWithMentor?: boolean }) => {
        setBusy('settings');
        try { setW(await saveWellbeing(await getToken(), body)); } catch (err) { setError(errorMessage(err, 'Could not save.')); } finally { setBusy(''); }
    };

    const ease = async () => {
        setBusy('ease');
        try {
            const r = await easePlan(await getToken());
            setW(r.result);
            setNote(r.moved ? `Moved ${r.moved} milestone${r.moved > 1 ? 's' : ''} back a week. Class work stays where your mentor put it.` : 'Nothing in the next two weeks could be moved.');
        } catch (err) { setError(errorMessage(err, 'Could not ease the plan.')); } finally { setBusy(''); }
    };

    if (!w) return error ? <ErrorNote text={error} /> : <Spinner label="Checking your load" />;

    if (!w.settings.optIn) {
        return (
            <section className={`${card} mx-auto max-w-2xl p-8 text-center`}>
                <HeartPulse className="mx-auto h-10 w-10 text-rose-600 dark:text-rose-400" aria-hidden="true" />
                <h2 className="mt-3 text-xl font-bold text-slate-900 dark:text-white">Burnout guard</h2>
                <p className="mx-auto mt-2 max-w-lg text-sm text-slate-600 dark:text-slate-400">
                    It watches for late nights, weeks without a rest day, sudden spikes in work and falling scores, and eases your plan before you burn out. It is off until you turn it on, and your mentor sees nothing unless you choose to share.
                </p>
                <button className={`${primaryButton} mt-5`} onClick={() => save({ optIn: true })} disabled={busy === 'settings'}>
                    {busy === 'settings' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />} Turn on the burnout guard
                </button>
                <ErrorNote text={error} />
            </section>
        );
    }

    const level = LEVEL[w.level];
    const LevelIcon = level.icon;
    const circumference = 2 * Math.PI * 44;

    return (
        <div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
            <section className={`${card} h-fit space-y-4 p-5 text-center`} aria-labelledby="load-heading">
                <h2 id="load-heading" className="text-sm font-bold text-slate-900 dark:text-white">Your load, last 14 days</h2>
                <div className="relative mx-auto h-36 w-36">
                    <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
                        <circle cx="50" cy="50" r="44" className="fill-none stroke-slate-200 dark:stroke-white/10" strokeWidth="8" />
                        <circle cx="50" cy="50" r="44" className={`fill-none ${level.ring}`} strokeWidth="8" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - w.load / 100)} />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-3xl font-bold tabular-nums text-slate-900 dark:text-white">{w.load}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">of 100</span>
                    </div>
                </div>
                <p className={`flex items-center justify-center gap-1.5 text-lg font-bold ${level.className}`}><LevelIcon className="h-5 w-5" aria-hidden="true" /> {level.label}</p>
                <p className="text-sm text-slate-700 dark:text-slate-300">{w.advice}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{w.restDays} rest day{w.restDays === 1 ? '' : 's'} in the last two weeks</p>
                {w.level !== 'steady' && w.canEase > 0 && (
                    <button className={`${primaryButton} w-full`} onClick={ease} disabled={busy === 'ease'}>
                        {busy === 'ease' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Ease my next two weeks
                    </button>
                )}
                {note && <p className="text-sm text-emerald-700 dark:text-emerald-400" role="status">{note}</p>}
            </section>

            <div className="space-y-5">
                <section className={`${card} p-5`} aria-labelledby="signals-heading">
                    <h3 id="signals-heading" className="text-base font-bold text-slate-900 dark:text-white">What I noticed</h3>
                    {w.signals.length === 0 ? (
                        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">No warning signs. Your effort looks sustainable.</p>
                    ) : (
                        <ul className="mt-3 space-y-2">
                            {w.signals.map((s) => (
                                <li key={s.code} className={`${panel} flex items-start gap-2 px-3 py-2 text-sm text-slate-800 dark:text-slate-200`}>
                                    {s.code === 'late_nights' ? <Moon className="mt-0.5 h-4 w-4 flex-shrink-0 text-indigo-600 dark:text-indigo-400" aria-hidden="true" /> : <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />}
                                    {s.label}
                                </li>
                            ))}
                        </ul>
                    )}
                    <div className="mt-5 h-48 [--day:#2563eb] dark:[--day:#60a5fa] [--late:#6366f1] dark:[--late:#a5b4fc] [--grid:#e2e8f0] dark:[--grid:#253048] [--axis:#64748b] dark:[--axis:#94a3b8]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={w.daily.map((d) => ({ day: d.day.slice(5), daytime: d.sessions - d.late, late: d.late }))} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
                                <CartesianGrid vertical={false} stroke="var(--grid)" />
                                <XAxis dataKey="day" tick={{ fill: 'var(--axis)', fontSize: 11 }} stroke="var(--grid)" interval={1} />
                                <YAxis allowDecimals={false} tick={{ fill: 'var(--axis)', fontSize: 11 }} stroke="var(--grid)" />
                                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} formatter={(v, n) => [v, n === 'late' ? 'Midnight to 5 am' : 'Daytime']} />
                                <Legend formatter={(v) => (v === 'late' ? 'Midnight to 5 am' : 'Daytime')} wrapperStyle={{ fontSize: 12 }} />
                                <Bar dataKey="daytime" stackId="a" fill="var(--day)" radius={[0, 0, 0, 0]} />
                                <Bar dataKey="late" stackId="a" fill="var(--late)" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </section>

                <section className={`${card} space-y-3 p-5`} aria-labelledby="privacy-heading">
                    <h3 id="privacy-heading" className="text-base font-bold text-slate-900 dark:text-white">Privacy</h3>
                    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
                        <span className="text-sm text-slate-800 dark:text-slate-200">Tell my mentor when I look overloaded <span className="block text-xs text-slate-500 dark:text-slate-400">They see one line, never your activity times.</span></span>
                        <input type="checkbox" className="h-5 w-5 accent-blue-600" checked={w.settings.shareWithMentor} onChange={(e) => save({ shareWithMentor: e.target.checked })} disabled={busy === 'settings'} />
                    </label>
                    <button className={secondaryButton} onClick={() => save({ optIn: false })} disabled={busy === 'settings'}>Turn off the burnout guard</button>
                    <ErrorNote text={error} />
                </section>
            </div>
        </div>
    );
}
