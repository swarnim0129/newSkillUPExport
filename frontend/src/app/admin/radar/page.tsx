'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, CalendarDays, Crosshair, Loader2, Rocket } from 'lucide-react';
import api from '@/lib/api';

interface Row { candidateId: string; name: string; branch: string; year: number; readiness: number; projected: number; pace: number | null }
interface Radar {
    driveDate: string;
    weeksToDrive: number;
    totals: { students: number; placement: number };
    now: Record<string, number>;
    atDrive: Record<string, number>;
    byBranch: { branch: string; students: number; readyNow: number; readyAtDrive: number; average: number }[];
    byYear: { year: number; students: number; average: number }[];
    atRisk: Row[];
    readyNow: Row[];
    crossing: number;
}

const TIERS = [
    { key: 'dream', label: 'Dream (85+)' },
    { key: 'product', label: 'Product (75 to 84)' },
    { key: 'service', label: 'Service (60 to 74)' },
    { key: 'building', label: 'Still building (under 60)' },
];

/** Placement cell view: who is ready for which tier now and by the drive date. */
export default function RadarPage() {
    const [data, setData] = useState<Radar | null>(null);
    const [drive, setDrive] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const load = useCallback(async (date?: string) => {
        setLoading(true);
        try {
            const res = await api.get<Radar>('/admin/radar', { params: date ? { driveDate: date } : {} });
            setData(res.data);
            setDrive(res.data.driveDate.slice(0, 10));
            setError('');
        } catch {
            setError('Could not load the radar.');
        } finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { void Promise.resolve().then(() => load()); }, [load]);

    const tierData = data ? TIERS.map((t) => ({ tier: t.label, Now: data.now[t.key] || 0, 'By the drive': data.atDrive[t.key] || 0 })) : [];

    return (
        <div className="space-y-6 p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white"><Crosshair className="h-6 w-6 text-blue-600" aria-hidden="true" /> Placement radar</h1>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Readiness of every student aiming for placements, now and projected to the drive date from their own pace.</p>
                </div>
                <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); load(drive); }}>
                    <div>
                        <label htmlFor="drive" className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">Drive date</label>
                        <input id="drive" type="date" value={drive} onChange={(e) => setDrive(e.target.value)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-[var(--soft-line)] dark:bg-[var(--soft-sunken)] dark:text-white" />
                    </div>
                    <button type="submit" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">{loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CalendarDays className="h-4 w-4" aria-hidden="true" />} Update</button>
                </form>
            </div>
            {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

            {data && (
                <>
                    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                        <Stat label="Aiming for placements" value={data.totals.placement} />
                        <Stat label="Ready now (75+)" value={(data.now.dream || 0) + (data.now.product || 0)} />
                        <Stat label={`Ready by drive (${data.weeksToDrive} weeks)`} value={(data.atDrive.dream || 0) + (data.atDrive.product || 0)} />
                        <Stat label="Will cross 75 before the drive" value={data.crossing} icon={<Rocket className="h-4 w-4 text-emerald-600" aria-hidden="true" />} />
                    </div>

                    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-[var(--soft-line)] dark:bg-[var(--soft-surface)]">
                        <h2 className="text-base font-bold text-slate-900 dark:text-white">Company tier readiness</h2>
                        <div className="mt-3 h-72 [--a:#94a3b8] [--b:#2563eb] dark:[--b:#60a5fa] [--grid:#e2e8f0] dark:[--grid:#253048] [--axis:#64748b] dark:[--axis:#94a3b8]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={tierData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                                    <CartesianGrid vertical={false} stroke="var(--grid)" />
                                    <XAxis dataKey="tier" tick={{ fill: 'var(--axis)', fontSize: 12 }} stroke="var(--grid)" />
                                    <YAxis allowDecimals={false} tick={{ fill: 'var(--axis)', fontSize: 12 }} stroke="var(--grid)" />
                                    <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                                    <Legend wrapperStyle={{ fontSize: 12 }} />
                                    <Bar dataKey="Now" fill="var(--a)" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="By the drive" fill="var(--b)" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </section>

                    <div className="grid gap-6 lg:grid-cols-2">
                        <Table title="By branch" head={['Branch', 'Students', 'Average', 'Ready now', 'Ready by drive']} rows={data.byBranch.map((b) => [b.branch, b.students, b.average, b.readyNow, b.readyAtDrive])} />
                        <Table title="By year (all goals)" head={['Year', 'Students', 'Average readiness']} rows={data.byYear.map((y) => [`Year ${y.year}`, y.students, y.average])} />
                        <Table
                            title="At risk: third and final year, projected under 60"
                            icon={<AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />}
                            head={['Student', 'Branch', 'Now', 'At drive']}
                            rows={data.atRisk.map((r) => [r.name, r.branch, r.readiness, r.projected])}
                            empty="No one at risk."
                        />
                        <Table title="Ready now" head={['Student', 'Branch', 'Readiness']} rows={data.readyNow.map((r) => [r.name, r.branch, r.readiness])} empty="No one at 75 yet." />
                    </div>
                </>
            )}
        </div>
    );
}

function Stat({ label, value, icon }: { label: string; value: number; icon?: React.ReactNode }) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-[var(--soft-line)] dark:bg-[var(--soft-surface)]">
            <p className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">{icon}{label}</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900 dark:text-white">{value}</p>
        </div>
    );
}

function Table({ title, head, rows, icon, empty = 'No data yet.' }: { title: string; head: string[]; rows: (string | number)[][]; icon?: React.ReactNode; empty?: string }) {
    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-[var(--soft-line)] dark:bg-[var(--soft-surface)]">
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">{icon}{title}</h2>
            {rows.length === 0 ? (
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{empty}</p>
            ) : (
                <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead><tr>{head.map((h) => <th key={h} scope="col" className="border-b border-slate-200 py-2 pr-3 text-xs font-semibold text-slate-600 dark:border-white/10 dark:text-slate-400">{h}</th>)}</tr></thead>
                        <tbody>
                            {rows.map((r, i) => (
                                <tr key={i} className="border-b border-slate-100 last:border-0 dark:border-white/5">
                                    {r.map((c, j) => <td key={j} className={`py-2 pr-3 ${typeof c === 'number' ? 'tabular-nums' : ''} text-slate-800 dark:text-slate-200`}>{c}</td>)}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}
