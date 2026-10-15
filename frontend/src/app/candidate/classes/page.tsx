'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { AlertTriangle, Archive, CalendarClock, School } from 'lucide-react';
import { errorMessage } from '@/lib/journeyApi';
import { listMyClasses, type StudentClassCard } from '@/lib/mentorApi';
import { card, dueText, ErrorNote, focusRing, Spinner, themeOf } from '@/components/classroom/ui';
import JoinCard from '@/components/classroom/JoinCard';

export default function ClassesPage() {
    const { getToken, isLoaded, isSignedIn } = useAuth();
    const router = useRouter();
    const [classes, setClasses] = useState<StudentClassCard[] | null>(null);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        try {
            const next = await listMyClasses(await getToken());
            setClasses(next);
            setError('');
        } catch (err) {
            setError(errorMessage(err, 'Could not load your classes.'));
        }
    }, [getToken]);

    useEffect(() => {
        if (isLoaded && isSignedIn) void Promise.resolve().then(load);
    }, [isLoaded, isSignedIn, load]);

    const active = (classes || []).filter((c) => !c.archived);
    const archived = (classes || []).filter((c) => c.archived);

    return (
        <div className="space-y-6 pb-10">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">Classes</h1>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    Join your faculty&apos;s classes with the code they share. Class work lands in your journey plan and marks itself done when you finish it in Practice, Lab, interviews or the resume analyzer.
                </p>
            </div>

            <JoinCard getToken={getToken} onJoined={(id) => router.push(`/candidate/classes/${id}`)} />

            <ErrorNote text={error} />
            {!classes && !error ? (
                <Spinner label="Loading classes" />
            ) : active.length === 0 ? (
                <div className={`${card} p-8 text-center`}>
                    <School className="mx-auto h-8 w-8 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                    <p className="mt-3 text-sm text-slate-700 dark:text-slate-300">You are not in any class yet. Ask your mentor for the class code.</p>
                </div>
            ) : (
                <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Your classes">
                    {active.map((c) => <li key={c.id}><ClassCard c={c} /></li>)}
                </ul>
            )}

            {archived.length > 0 && (
                <section aria-labelledby="archived-heading">
                    <h2 id="archived-heading" className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                        <Archive className="h-4 w-4" aria-hidden="true" /> Archived
                    </h2>
                    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {archived.map((c) => <li key={c.id}><ClassCard c={c} /></li>)}
                    </ul>
                </section>
            )}
        </div>
    );
}

function ClassCard({ c }: { c: StudentClassCard }) {
    const theme = themeOf(c.theme);
    return (
        <Link href={`/candidate/classes/${c.id}`} className={`${card} group block h-full overflow-hidden transition-shadow hover:shadow-md ${focusRing}`}>
            <div className={`${theme.banner} px-4 py-4 text-white`}>
                <h2 className="truncate text-lg font-bold group-hover:underline">{c.name}</h2>
                <p className="truncate text-sm text-white/90">{[c.section, c.subject].filter(Boolean).join(' · ') || c.mentorName}</p>
                <p className="mt-1 truncate text-xs text-white/90">{c.mentorName}</p>
            </div>
            <div className="space-y-1.5 px-4 py-3 text-sm">
                {c.pending === 0 ? (
                    <p className="text-slate-600 dark:text-slate-400">All caught up.</p>
                ) : (
                    <>
                        <p className="font-semibold text-slate-900 dark:text-white">{c.pending} piece{c.pending > 1 ? 's' : ''} of work to do</p>
                        {c.missing > 0 && (
                            <p className="flex items-center gap-1 text-red-700 dark:text-red-400">
                                <AlertTriangle className="h-4 w-4" aria-hidden="true" /> {c.missing} missing
                            </p>
                        )}
                        {c.next && (
                            <p className="flex items-start gap-1 text-slate-700 dark:text-slate-300">
                                <CalendarClock className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                                <span className="min-w-0">{c.next.title} · {dueText(c.next.dueAt)}</span>
                            </p>
                        )}
                    </>
                )}
            </div>
        </Link>
    );
}
