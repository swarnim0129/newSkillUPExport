'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@clerk/nextjs';
import { ArrowLeft, ArrowRight, Mic } from 'lucide-react';
import { errorMessage } from '@/lib/journeyApi';
import { listReplayInterviews } from '@/lib/growApi';
import { card, ErrorNote, focusRing, Spinner } from '@/components/classroom/ui';

type Item = Awaited<ReturnType<typeof listReplayInterviews>>[number];

export default function ReplayListPage() {
    const { getToken, isLoaded, isSignedIn } = useAuth();
    const [list, setList] = useState<Item[] | null>(null);
    const [error, setError] = useState('');
    const load = useCallback(async () => {
        try {
            const next = await listReplayInterviews(await getToken());
            setList(next);
        } catch (err) {
            setError(errorMessage(err, 'Could not load your interviews.'));
        }
    }, [getToken]);
    useEffect(() => { if (isLoaded && isSignedIn) void Promise.resolve().then(load); }, [isLoaded, isSignedIn, load]);

    return (
        <div className="space-y-5 pb-10">
            <Link href="/candidate/ai-interview" className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg text-sm font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white ${focusRing}`}>
                <ArrowLeft className="h-4 w-4" aria-hidden="true" /> AI Interview
            </Link>
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">Interview replay</h1>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">See every answer coloured by how it came across, then get a stronger version of the weak ones.</p>
            </div>
            <ErrorNote text={error} />
            {!list ? (
                <Spinner label="Loading interviews" />
            ) : list.length === 0 ? (
                <div className={`${card} p-8 text-center`}>
                    <Mic className="mx-auto h-8 w-8 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                    <p className="mt-3 text-sm text-slate-700 dark:text-slate-300">No interviews with a transcript yet. Take a mock interview first.</p>
                </div>
            ) : (
                <ul className="grid gap-3 md:grid-cols-2">
                    {list.map((i) => (
                        <li key={i.id}>
                            <Link href={`/candidate/ai-interview/replay/${i.id}`} className={`${card} flex items-center justify-between gap-3 p-4 hover:shadow-md ${focusRing}`}>
                                <span className="min-w-0">
                                    <span className="block truncate text-sm font-bold text-slate-900 dark:text-white">{i.seniority} {i.role}</span>
                                    <span className="block text-xs text-slate-600 dark:text-slate-400">{i.category} · {new Date(i.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}{i.score !== null ? ` · ${i.score}/100` : ''}</span>
                                </span>
                                <ArrowRight className="h-4 w-4 flex-shrink-0 text-slate-400" aria-hidden="true" />
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
