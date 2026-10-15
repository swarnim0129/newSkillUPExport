'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { GraduationCap, Loader2, Lock } from 'lucide-react';
import { getPublicPassport, type PassportView } from '@/lib/growApi';
import PassportCard from '@/components/grow/PassportCard';

/** Public, no sign-in: what a recruiter sees after scanning the QR code. */
export default function PublicPassportPage() {
    const { handle } = useParams<{ handle: string }>();
    const [passport, setPassport] = useState<PassportView | null>(null);
    const [missing, setMissing] = useState(false);

    useEffect(() => {
        let cancelled = false;
        getPublicPassport(handle)
            .then((p) => { if (!cancelled) setPassport(p); })
            .catch(() => { if (!cancelled) setMissing(true); });
        return () => { cancelled = true; };
    }, [handle]);

    return (
        <div className="min-h-screen bg-[var(--soft-canvas)]">
            <header className="border-b border-white/70 bg-white/55 backdrop-blur-xl dark:border-white/5 dark:bg-[rgb(18_24_38/0.6)]">
                <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
                    <Link href="/" className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white"><GraduationCap className="h-5 w-5" aria-hidden="true" /></span>
                        SkillUp
                    </Link>
                    <span className="text-xs text-slate-600 dark:text-slate-400">Skill passport</span>
                </div>
            </header>
            <main className="mx-auto max-w-5xl px-4 py-8">
                {passport ? (
                    <PassportCard passport={passport} />
                ) : missing ? (
                    <div className="mx-auto mt-16 max-w-md text-center">
                        <Lock className="mx-auto h-9 w-9 text-slate-500" aria-hidden="true" />
                        <h1 className="mt-3 text-xl font-bold text-slate-900 dark:text-white">This passport is private</h1>
                        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">The student has not published it, or the link is wrong.</p>
                    </div>
                ) : (
                    <div className="flex min-h-[50vh] items-center justify-center" role="status">
                        <Loader2 className="h-8 w-8 animate-spin text-blue-600" aria-hidden="true" />
                        <span className="sr-only">Loading passport</span>
                    </div>
                )}
            </main>
        </div>
    );
}
