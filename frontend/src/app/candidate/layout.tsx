'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth, UserButton, useUser } from '@clerk/nextjs';
import {
    Loader2,
    LayoutDashboard,
    Bot,
    GraduationCap,
    ScanSearch,
    FilePen,
    Coins,
    LogOut,
    Route,
    Compass,
    Milestone,
    Code2,
    MessagesSquare,
    Trophy,
    BookOpenCheck,
    BarChart3,
    School,
    Menu,
    X,
    PanelLeftClose,
    PanelLeftOpen,
    Telescope,
    Flame,
    BadgeCheck,
} from 'lucide-react';
import { AnimatedThemeToggler } from '@/components/ui/animated-theme-toggler';
import { cn } from '@/lib/utils';
import api from '@/lib/api';

export default function CandidateLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { isLoaded, isSignedIn, getToken, signOut } = useAuth();

    // The collapsed state is a per-browser preference
    useEffect(() => {
        try {
            if (localStorage.getItem('skillup_sidebar') === 'collapsed') void Promise.resolve().then(() => setCollapsed(true));
        } catch { /* storage blocked */ }
    }, []);
    const toggleCollapsed = () => {
        setCollapsed((value) => {
            try { localStorage.setItem('skillup_sidebar', value ? 'open' : 'collapsed'); } catch { /* storage blocked */ }
            return !value;
        });
    };
    const { user } = useUser();
    const router = useRouter();
    const pathname = usePathname();
    const [isAuthorized, setIsAuthorized] = useState(false);
    const [checkingRole, setCheckingRole] = useState(true);
    const [collapsed, setCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [credits, setCredits] = useState<number | null>(null);
    const [xp, setXp] = useState<number | null>(null);
    const [level, setLevel] = useState<number | null>(null);
    const [streak, setStreak] = useState<number | null>(null);

    useEffect(() => {
        const checkRole = async () => {
            if (!isLoaded) return;

            if (!isSignedIn) {
                router.push('/');
                return;
            }

            try {
                const token = await getToken();
                const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5500/api'}/onboarding/check`, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });
                const data = await response.json();

                if (data.exists && (data.role === 'candidate' || data.role === 'admin')) {
                    setIsAuthorized(true);
                } else if (data.exists && data.role === 'mentor') {
                    router.push('/mentor');
                } else {
                    router.push('/onboarding');
                }
            } catch (error) {
                console.error("Auth check failed", error);
            } finally {
                setCheckingRole(false);
            }
        };

        checkRole();
    }, [isLoaded, isSignedIn, getToken, router]);

    // Fetch credit balance for sidebar badge
    useEffect(() => {
        const fetchCredits = async () => {
            if (!isLoaded || !isSignedIn) return;
            try {
                const token = await getToken();
                const res = await api.get('/candidate/credits', {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (res.data.success) {
                    setCredits(res.data.credits);
                    setXp(res.data.xpTotal ?? null);
                    setLevel(res.data.level ?? null);
                    setStreak(res.data.currentStreak ?? null);
                }
            } catch { /* ignore */ }
        };
        fetchCredits();
    }, [isLoaded, isSignedIn, getToken]);

    // Grouped so 13 destinations stay scannable and fit a laptop screen
    const linkGroups = [
        {
            title: 'Plan',
            links: [
                { label: 'My Journey', href: '/candidate/journey', icon: Milestone },
                { label: 'Classes', href: '/candidate/classes', icon: School },
                { label: 'Companion', href: '/candidate/companion', icon: MessagesSquare },
                { label: 'Practice', href: '/candidate/practice', icon: Code2 },
                { label: 'Insights', href: '/candidate/insights', icon: Telescope },
                { label: 'Squads', href: '/candidate/squads', icon: Flame },
            ],
        },
        {
            title: 'Learn',
            links: [
                { label: 'Discover', href: '/candidate/videoTutor', icon: Compass },
                { label: 'Roadmap', href: '/candidate/learning-roadmap', icon: Route },
                { label: 'AI Tutor', href: '/candidate/tutor', icon: GraduationCap },
                { label: 'Revision Hub', href: '/candidate/revision', icon: BookOpenCheck },
            ],
        },
        {
            title: 'Career',
            links: [
                { label: 'Resume Analyzer', href: '/candidate/resume-analyzer', icon: ScanSearch },
                { label: 'Resume Builder', href: '/candidate/resume-builder', icon: FilePen },
                { label: 'AI Interview', href: '/candidate/ai-interview', icon: Bot },
                { label: 'Skill Passport', href: '/candidate/passport', icon: BadgeCheck },
            ],
        },
        {
            title: 'Progress',
            links: [
                { label: 'Dashboard', href: '/candidate/dashboard', icon: LayoutDashboard },
                { label: 'Progress', href: '/candidate/progress', icon: BarChart3 },
                { label: 'Leaderboard', href: '/candidate/leaderboard', icon: Trophy },
            ],
        },
    ];

    if (!isLoaded || checkingRole) {
        return (
            <div className="flex h-screen items-center justify-center bg-[var(--soft-canvas)]">
                <Loader2 className="h-10 w-10 animate-spin text-blue-600" aria-hidden="true" />
                <span className="sr-only">Loading</span>
            </div>
        );
    }

    if (!isAuthorized) {
        return null;
    }

    const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

    const nav = (compact: boolean) => (
        <nav aria-label="Student sections" className="flex flex-col gap-3">
            {linkGroups.map((group) => (
                <div key={group.title}>
                    {compact ? (
                        <div className="mx-auto mb-1 h-px w-8 bg-slate-300/70 dark:bg-white/10" aria-hidden="true" />
                    ) : (
                        <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{group.title}</p>
                    )}
                    <ul className="flex flex-col gap-1">
                        {group.links.map((link) => {
                            const Icon = link.icon;
                            const active = isActive(link.href);
                            return (
                                <li key={link.href}>
                                    <Link
                                        href={link.href}
                                        onClick={() => setMobileOpen(false)}
                                        aria-current={active ? 'page' : undefined}
                                        aria-label={compact ? link.label : undefined}
                                        title={compact ? link.label : undefined}
                                        className={cn(
                                            'flex h-11 items-center rounded-xl text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                                            compact ? 'mx-auto w-11 justify-center' : 'gap-3 px-3',
                                            active
                                                ? 'bg-blue-600 text-white shadow-[0_8px_18px_-8px_rgb(37_99_235/0.7)]'
                                                : 'text-slate-700 hover:bg-white/70 hover:shadow-[var(--neu-raise-sm)] dark:text-slate-300 dark:hover:bg-white/5'
                                        )}
                                    >
                                        <Icon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
                                        {!compact && <span className="truncate">{link.label}</span>}
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            ))}
        </nav>
    );

    const footer = (compact: boolean) => (
        <div className="space-y-2 border-t border-slate-300/50 pt-3 dark:border-white/10">
            {credits !== null && (
                <Link
                    href="/candidate/profile"
                    title={compact ? `${credits} credits · Level ${level ?? 1} · ${xp ?? 0} XP · ${streak ?? 0} day streak` : undefined}
                    className={cn(
                        'flex items-center rounded-xl bg-white/60 text-xs shadow-[var(--neu-inset)] dark:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                        compact ? 'mx-auto h-11 w-11 justify-center' : 'gap-2 px-3 py-2'
                    )}
                >
                    <Coins className="h-4 w-4 flex-shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                    {compact ? (
                        <span className="sr-only">{credits} credits</span>
                    ) : (
                        <span className="min-w-0 text-slate-700 dark:text-slate-300">
                            <span className="font-bold text-slate-900 dark:text-white">{credits}</span> credits
                            <span className="block text-[11px] text-slate-500 dark:text-slate-400">Lvl {level ?? 1} · {xp ?? 0} XP · {streak ?? 0}-day streak</span>
                        </span>
                    )}
                </Link>
            )}
            <div className={cn('flex items-center', compact ? 'flex-col gap-2' : 'gap-2 px-1')}>
                <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center">
                    <UserButton afterSignOutUrl="/" appearance={{ elements: { userButtonAvatarBox: { width: '34px', height: '34px' } } }} />
                </span>
                {!compact && (
                    <Link href="/candidate/profile" className="min-w-0 flex-1 truncate rounded-lg text-sm font-semibold text-slate-900 hover:underline dark:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                        {user?.fullName || 'Profile'}
                    </Link>
                )}
                <AnimatedThemeToggler className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-slate-600 hover:bg-white/70 dark:text-slate-300 dark:hover:bg-white/5" />
            </div>
            <button
                onClick={() => signOut({ redirectUrl: '/' })}
                aria-label="Log out"
                title={compact ? 'Log out' : undefined}
                className={cn(
                    'flex h-11 items-center rounded-xl text-sm font-medium text-red-600 hover:bg-red-500/10 dark:text-red-400 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                    compact ? 'mx-auto w-11 justify-center' : 'w-full gap-3 px-3'
                )}
            >
                <LogOut className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
                {!compact && 'Log out'}
            </button>
        </div>
    );

    const glass = 'bg-white/55 dark:bg-[rgb(18_24_38/0.6)] backdrop-blur-xl border-white/70 dark:border-white/5';

    return (
        <div className="flex h-screen overflow-hidden bg-[var(--soft-canvas)] text-slate-900 dark:text-white">
            {/* Desktop sidebar */}
            <aside
                className={cn(
                    'hidden md:flex flex-shrink-0 flex-col gap-4 border-r p-3 transition-[width] duration-200 shadow-[6px_0_24px_-12px_rgb(146_162_190/0.45)] dark:shadow-[6px_0_24px_-12px_rgb(0_0_0/0.6)]',
                    glass,
                    collapsed ? 'w-[76px]' : 'w-64'
                )}
            >
                <div className={cn('flex items-center', collapsed ? 'flex-col gap-2' : 'justify-between gap-2 px-1')}>
                    <Link href="/candidate/journey" className="flex items-center gap-2.5 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" aria-label="SkillUp home">
                        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white shadow-[0_8px_18px_-8px_rgb(37_99_235/0.8)]">
                            <GraduationCap className="h-6 w-6" aria-hidden="true" />
                        </span>
                        {!collapsed && <span className="text-lg font-bold tracking-tight">SkillUp</span>}
                    </Link>
                    <button
                        onClick={toggleCollapsed}
                        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                        aria-expanded={!collapsed}
                        className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-600 hover:bg-white/70 dark:text-slate-300 dark:hover:bg-white/5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                        {collapsed ? <PanelLeftOpen className="h-5 w-5" aria-hidden="true" /> : <PanelLeftClose className="h-5 w-5" aria-hidden="true" />}
                    </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-1">{nav(collapsed)}</div>
                {footer(collapsed)}
            </aside>

            <div className="flex min-w-0 flex-1 flex-col">
                {/* Mobile top bar */}
                <header className={cn('flex h-14 flex-shrink-0 items-center justify-between border-b px-3 md:hidden', glass)}>
                    <button
                        onClick={() => setMobileOpen(true)}
                        aria-label="Open menu"
                        className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-700 dark:text-slate-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                        <Menu className="h-5 w-5" aria-hidden="true" />
                    </button>
                    <Link href="/candidate/journey" className="flex items-center gap-2 font-bold">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white"><GraduationCap className="h-5 w-5" aria-hidden="true" /></span>
                        SkillUp
                    </Link>
                    <UserButton afterSignOutUrl="/" />
                </header>

                <main className="min-h-0 flex-1 overflow-y-auto">
                    <div className="mx-auto h-full max-w-7xl p-4 sm:p-6 lg:p-8">
                        {children}
                    </div>
                </main>
            </div>

            {/* Mobile drawer */}
            {mobileOpen && (
                <div className="fixed inset-0 z-[90] md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setMobileOpen(false)} aria-hidden="true" />
                    <div className={cn('absolute inset-y-0 left-0 flex w-[82vw] max-w-xs flex-col gap-4 border-r p-3', glass, 'bg-white/85 dark:bg-[rgb(18_24_38/0.92)]')}>
                        <div className="flex items-center justify-between px-1">
                            <span className="text-lg font-bold">SkillUp</span>
                            <button onClick={() => setMobileOpen(false)} aria-label="Close menu" className="flex h-11 w-11 items-center justify-center rounded-xl cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                                <X className="h-5 w-5" aria-hidden="true" />
                            </button>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto">{nav(false)}</div>
                        {footer(false)}
                    </div>
                </div>
            )}
        </div>
    );
}
