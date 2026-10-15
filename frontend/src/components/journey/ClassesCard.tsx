'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowRight, School } from 'lucide-react';
import { listMyClasses, type StudentClassCard } from '@/lib/mentorApi';
import JoinCard from '@/components/classroom/JoinCard';
import { card, dueText, focusRing } from '@/components/classroom/ui';

/** Journey side card: the student's classes, what is due next, and joining by code. */
export default function ClassesCard({ getToken }: { getToken: () => Promise<string | null> }) {
    const router = useRouter();
    const [classes, setClasses] = useState<StudentClassCard[] | null>(null);
    const [failed, setFailed] = useState(false);

    const load = useCallback(async () => {
        try {
            const next = await listMyClasses(await getToken());
            setClasses(next);
        } catch {
            setFailed(true);
        }
    }, [getToken]);

    useEffect(() => { void Promise.resolve().then(load); }, [load]);

    const active = (classes || []).filter((c) => !c.archived);

    return (
        <section className={`${card} p-5`} aria-labelledby="classes-heading">
            <div className="flex items-center justify-between gap-2">
                <h2 id="classes-heading" className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
                    <School className="h-5 w-5 text-blue-600 dark:text-blue-400" aria-hidden="true" /> Classes
                </h2>
                {active.length > 0 && (
                    <Link href="/candidate/classes" className={`inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-blue-700 hover:underline dark:text-blue-400 ${focusRing}`}>
                        All <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                )}
            </div>

            {failed && <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Could not load your classes.</p>}

            {active.length > 0 && (
                <ul className="mt-3 space-y-2">
                    {active.slice(0, 4).map((c) => (
                        <li key={c.id}>
                            <Link
                                href={c.next ? `/candidate/classes/${c.id}?work=${c.next.id}` : `/candidate/classes/${c.id}`}
                                className={`block rounded-xl border border-slate-200 p-3 hover:bg-slate-50 dark:border-[var(--soft-line)] dark:hover:bg-[var(--soft-raised)] ${focusRing}`}
                            >
                                <span className="block text-sm font-semibold text-slate-900 dark:text-white">{c.name}</span>
                                {c.next ? (
                                    <span className="mt-0.5 block text-xs text-slate-600 dark:text-slate-400">
                                        Next: {c.next.title} · {dueText(c.next.dueAt)}
                                    </span>
                                ) : (
                                    <span className="mt-0.5 block text-xs text-slate-600 dark:text-slate-400">All caught up</span>
                                )}
                                {c.missing > 0 && (
                                    <span className="mt-1 flex items-center gap-1 text-xs font-semibold text-red-700 dark:text-red-400">
                                        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> {c.missing} missing
                                    </span>
                                )}
                            </Link>
                        </li>
                    ))}
                </ul>
            )}

            {classes && active.length === 0 && (
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                    In a faculty class? Join with the code. Class work joins your plan and is ticked off when you do it.
                </p>
            )}
            <div className="mt-4">
                <JoinCard compact getToken={getToken} onJoined={(id) => router.push(`/candidate/classes/${id}`)} />
            </div>
        </section>
    );
}
