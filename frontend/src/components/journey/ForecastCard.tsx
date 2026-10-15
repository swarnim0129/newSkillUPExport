'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Gauge, Loader2 } from 'lucide-react';
import {
    CartesianGrid,
    Line,
    LineChart,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { errorMessage, getForecast, type Forecast } from '@/lib/journeyApi';

const card = 'bg-white dark:bg-[var(--soft-surface)] rounded-2xl shadow-sm dark:shadow-black/20 border border-slate-200 dark:border-[var(--soft-line)]';

interface Point {
    t: number;
    value?: number;
    projected?: number;
}

function monthLabel(t: number) {
    return new Date(t).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
}

function dayLabel(t: number) {
    return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Readiness over time: measured readings as a solid line, the projection at the
 * current pace as a dashed line, and the "ready" level as a reference line.
 * Single series, so no legend box; the two line styles are named under the chart.
 */
export default function ForecastCard({
    getToken,
    refreshKey,
}: {
    getToken: () => Promise<string | null>;
    refreshKey: string;
}) {
    const [forecast, setForecast] = useState<Forecast | null>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const data = await getForecast(await getToken());
                if (!cancelled) {
                    setForecast(data);
                    setError('');
                }
            } catch (err) {
                if (!cancelled) setError(errorMessage(err, 'Could not load the forecast.'));
            }
        })();
        return () => { cancelled = true; };
    }, [getToken, refreshKey]);

    const points = useMemo<Point[]>(() => {
        if (!forecast) return [];
        const history: Point[] = forecast.history.map((h) => ({ t: new Date(h.at).getTime(), value: h.value }));
        if (forecast.projected !== null && history.length) {
            const last = history[history.length - 1];
            // The dashed line starts where the measured line ends
            last.projected = last.value;
            history.push({ t: new Date(forecast.projectedAt).getTime(), projected: forecast.projected });
        }
        return history;
    }, [forecast]);

    if (error) {
        return (
            <section className={`${card} p-5`}>
                <p className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400" role="alert">
                    <AlertTriangle className="h-4 w-4" aria-hidden="true" /> {error}
                </p>
            </section>
        );
    }

    if (!forecast) {
        return (
            <section className={`${card} flex h-40 items-center justify-center p-5`} role="status">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600" aria-hidden="true" />
                <span className="sr-only">Loading forecast</span>
            </section>
        );
    }

    const behind = forecast.extraHoursPerWeek !== null && forecast.extraHoursPerWeek > 0;

    return (
        <section className={`${card} p-5`} aria-labelledby="forecast-heading">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 id="forecast-heading" className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
                        <Gauge className="h-5 w-5 text-blue-600 dark:text-blue-400" aria-hidden="true" /> Readiness forecast
                    </h2>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                        For {forecast.target.label}, {forecast.target.weeksLeft} weeks away. Ready means {forecast.readyLevel}.
                    </p>
                </div>
                <div className="text-right">
                    <p className="text-3xl font-bold tabular-nums text-slate-900 dark:text-white">{forecast.now}</p>
                    <p className="text-xs text-slate-600 dark:text-slate-400">today{forecast.pace !== null ? ` · ${forecast.pace > 0 ? '+' : ''}${forecast.pace} a week` : ''}</p>
                </div>
            </div>

            <p className={`mt-3 text-sm ${behind ? 'text-amber-800 dark:text-amber-300' : 'text-slate-700 dark:text-slate-300'}`}>
                {behind && <AlertTriangle className="mr-1.5 inline h-4 w-4 align-[-2px]" aria-hidden="true" />}
                {forecast.verdict}
            </p>

            {points.length >= 2 ? (
                <div className="mt-4 h-56 [--line:#2563eb] dark:[--line:#3b82f6] [--grid:#e2e8f0] dark:[--grid:#2a2a2a] [--axis:#64748b] dark:[--axis:#94a3b8]">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
                            <CartesianGrid vertical={false} stroke="var(--grid)" />
                            <XAxis
                                dataKey="t"
                                type="number"
                                scale="time"
                                domain={['dataMin', 'dataMax']}
                                tickFormatter={monthLabel}
                                tick={{ fill: 'var(--axis)', fontSize: 12 }}
                                stroke="var(--grid)"
                                minTickGap={24}
                            />
                            <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fill: 'var(--axis)', fontSize: 12 }} stroke="var(--grid)" />
                            <ReferenceLine
                                y={forecast.readyLevel}
                                stroke="var(--axis)"
                                strokeDasharray="2 4"
                                label={{ value: `Ready (${forecast.readyLevel})`, position: 'insideTopLeft', fill: 'var(--axis)', fontSize: 12 }}
                            />
                            <Tooltip
                                labelFormatter={(t) => dayLabel(Number(t))}
                                formatter={(value, name) => [`${value}/100`, name === 'projected' ? 'Projected' : 'Measured']}
                                contentStyle={{ borderRadius: 8, fontSize: 12 }}
                            />
                            <Line type="monotone" dataKey="value" name="value" stroke="var(--line)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls isAnimationActive={false} />
                            <Line type="linear" dataKey="projected" name="projected" stroke="var(--line)" strokeWidth={2} strokeDasharray="6 4" dot={false} activeDot={{ r: 4 }} connectNulls isAnimationActive={false} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            ) : (
                <p className="mt-4 rounded-xl bg-slate-50 dark:bg-[var(--soft-sunken)] p-4 text-sm text-slate-600 dark:text-slate-400">
                    The chart appears after a few days of readings.
                </p>
            )}
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">Solid line: measured readiness. Dashed line: where the current pace leads.</p>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {forecast.parts.map((part) => (
                    <div key={part.name} className="rounded-xl border border-slate-200 dark:border-[var(--soft-line)] bg-slate-50 dark:bg-[var(--soft-sunken)] p-3">
                        <p className="text-xs text-slate-600 dark:text-slate-400">{part.name} · {Math.round(part.weight * 100)}%</p>
                        <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-900 dark:text-white">{part.value}</p>
                    </div>
                ))}
            </div>

            <details className="mt-3">
                <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Show readings as a table</summary>
                <table className="mt-2 w-full text-left text-sm">
                    <thead>
                        <tr className="text-xs text-slate-500 dark:text-slate-400">
                            <th className="py-1 font-medium">Date</th>
                            <th className="py-1 font-medium">Readiness</th>
                        </tr>
                    </thead>
                    <tbody className="text-slate-800 dark:text-slate-200">
                        {forecast.history.slice(-12).map((h) => (
                            <tr key={h.at} className="border-t border-slate-200 dark:border-[var(--soft-line)]">
                                <td className="py-1">{dayLabel(new Date(h.at).getTime())}</td>
                                <td className="py-1 tabular-nums">{h.value}</td>
                            </tr>
                        ))}
                        {forecast.projected !== null && (
                            <tr className="border-t border-slate-200 dark:border-[var(--soft-line)] italic">
                                <td className="py-1">{dayLabel(new Date(forecast.projectedAt).getTime())} (projected)</td>
                                <td className="py-1 tabular-nums">{forecast.projected}</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </details>
        </section>
    );
}
