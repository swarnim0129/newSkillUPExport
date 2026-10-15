'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth, UserButton, useUser } from '@clerk/nextjs';
import { AlertTriangle, GraduationCap, Loader2, School } from 'lucide-react';
import { AnimatedThemeToggler } from '@/components/ui/animated-theme-toggler';
import { errorMessage } from '@/lib/journeyApi';
import { getMentorMe, registerMentor, type Mentor } from '@/lib/mentorApi';
import { ErrorNote, focusRing, input, primaryButton, secondaryButton, Spinner } from '@/components/classroom/ui';
import { MentorContext } from '@/components/classroom/MentorContext';

/**
 * Faculty area shell. Only faculty accounts get in: a fresh account is sent
 * to faculty registration, a student account is told to use another account.
 */
export default function MentorLayout({ children }: { children: React.ReactNode }) {
    const { getToken, isLoaded, isSignedIn } = useAuth();
    const router = useRouter();
    const [mentor, setMentor] = useState<Mentor | null>(null);
    const [demoEnabled, setDemoEnabled] = useState(false);
    const [state, setState] = useState<'loading' | 'ready' | 'student' | 'error'>('loading');
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        try {
            const me = await getMentorMe(await getToken());
            if (me.mentor) {
                setMentor(me.mentor);
                setDemoEnabled(me.demoEnabled);
                setState('ready');
            } else if (me.accountRole === 'candidate') {
                setState('student');
            } else {
                router.replace('/onboarding?role=mentor');
            }
        } catch (err) {
            setError(errorMessage(err, 'Could not reach the server. Check that the backend is running.'));
            setState('error');
        }
    }, [getToken, router]);

    useEffect(() => {
        if (isLoaded && isSignedIn) void Promise.resolve().then(load);
    }, [isLoaded, isSignedIn, load]);

    return (
        <div className="min-h-screen bg-[var(--soft-canvas)]">
            <header className="sticky top-0 z-40 border-b border-white/70 dark:border-white/5 bg-white/55 dark:bg-[rgb(18_24_38/0.55)] backdrop-blur-xl shadow-[0_6px_24px_-14px_rgb(146_162_190/0.5)] dark:shadow-[0_6px_24px_-14px_rgb(0_0_0/0.6)]">
                <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6" aria-label="Faculty">
                    <div className="flex items-center gap-2">
                        <Link href="/mentor" className={`flex items-center gap-2 rounded-lg pr-2 ${focusRing}`}>
                            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white">
                                <GraduationCap className="h-5 w-5" aria-hidden="true" />
                            </span>
                            <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">SkillUp</span>
                            <span className="hidden rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 sm:inline">Faculty</span>
                        </Link>
                        <Link href="/mentor" className={`ml-2 hidden min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-[var(--soft-raised)] sm:inline-flex ${focusRing}`}>
                            <School className="h-4 w-4" aria-hidden="true" /> Classes
                        </Link>
                    </div>
                    <div className="flex items-center gap-2">
                        {mentor && <span className="hidden text-sm text-slate-600 dark:text-slate-400 md:inline">{mentor.name}</span>}
                        <AnimatedThemeToggler className="h-11 w-11 rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-[var(--soft-raised)] dark:hover:text-white" />
                        <UserButton afterSignOutUrl="/" appearance={{ elements: { avatarBox: 'w-9 h-9' } }} />
                    </div>
                </nav>
            </header>

            <main className="mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-6">
                {state === 'loading' && <Spinner label="Loading faculty area" />}
                {state === 'error' && (
                    <div className="mx-auto mt-10 max-w-xl text-center">
                        <AlertTriangle className="mx-auto h-8 w-8 text-red-500" aria-hidden="true" />
                        <p className="mt-3 text-sm text-slate-700 dark:text-slate-300" role="alert">{error}</p>
                        <button className={`${primaryButton} mt-4`} onClick={() => { setState('loading'); load(); }}>Try again</button>
                    </div>
                )}
                {state === 'student' && (
                    <div className="mx-auto mt-10 max-w-lg text-center">
                        <School className="mx-auto h-8 w-8 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                        <h1 className="mt-3 text-xl font-bold text-slate-900 dark:text-white">This is a student account</h1>
                        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                            This account was set up as a student. If you are faculty, switch it to a faculty account. Your student plan stays saved but this account will open the faculty area from now on.
                        </p>
                        <ConvertForm getToken={getToken} onDone={() => { localStorage.removeItem('skillup_role_intent'); setState('loading'); load(); }} />
                        <Link href="/candidate/journey" className={`${secondaryButton} mt-3`}>No, I am a student</Link>
                    </div>
                )}
                {state === 'ready' && mentor && (
                    <MentorContext.Provider value={{ mentor, setMentor, demoEnabled, getToken }}>
                        {children}
                    </MentorContext.Provider>
                )}
            </main>
        </div>
    );
}

function ConvertForm({ getToken, onDone }: { getToken: () => Promise<string | null>; onDone: () => void }) {
    const { user } = useUser();
    const [name, setName] = useState(user?.fullName || '');
    const [department, setDepartment] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!window.confirm('Switch this account to faculty? It will open the faculty area instead of the student pages.')) return;
        setBusy(true);
        setError('');
        try {
            await registerMentor(await getToken(), { name: name.trim(), department: department.trim(), convert: true });
            onDone();
        } catch (err) {
            setError(errorMessage(err, 'Could not switch the account.'));
            setBusy(false);
        }
    };

    return (
        <form onSubmit={submit} className="mt-5 space-y-3 text-left">
            <div>
                <label htmlFor="convert-name" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">Name students see</label>
                <input id="convert-name" className={input} value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} autoComplete="name" />
            </div>
            <div>
                <label htmlFor="convert-dept" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">Department <span className="font-normal text-slate-500">(optional)</span></label>
                <input id="convert-dept" className={input} value={department} onChange={(e) => setDepartment(e.target.value)} maxLength={100} />
            </div>
            <ErrorNote text={error} />
            <button type="submit" className={`${primaryButton} w-full`} disabled={busy || !name.trim()}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Switch to a faculty account
            </button>
        </form>
    );
}
