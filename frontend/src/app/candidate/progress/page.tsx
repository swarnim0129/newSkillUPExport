"use client";

import React, { useState } from "react";
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    RadarChart,
    PolarGrid,
    PolarAngleAxis,
    Radar,
} from "recharts";
import {
    Calendar,
    Download,
    FileText,
    TrendingUp,
    TrendingDown,
    Check,
    Copy,
    Gift,
    Users,
    Link as LinkIcon,
    CheckCircle2,
    MessageSquare,
    Briefcase,
    Activity,
    Code2,
} from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import { useAuth } from "@clerk/nextjs";
import api from "@/lib/api";
import { formatDistanceToNow } from "date-fns";

// --- Components ---

export default function DashboardPage() {
    const { getToken, isLoaded, isSignedIn } = useAuth();
    const [stats, setStats] = useState<any>(null);
    const [profile, setProfile] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [origin, setOrigin] = useState('');

    // Capture origin on client side to avoid SSR issues
    React.useEffect(() => {
        if (typeof window !== 'undefined') setOrigin(window.location.origin);
    }, []);

    React.useEffect(() => {
        const fetchData = async () => {
            if (!isLoaded || !isSignedIn) return;
            try {
                const token = await getToken();
                const [statsRes, profileRes] = await Promise.all([
                    api.get('/candidate/stats', { headers: { Authorization: `Bearer ${token}` } }),
                    api.get('/candidate/profile', { headers: { Authorization: `Bearer ${token}` } }),
                ]);
                if (statsRes.data.success) setStats(statsRes.data.stats);
                if (profileRes.data.success) setProfile(profileRes.data.profile);
            } catch (err: any) {
                console.error("Failed to fetch dashboard data", err);
                setError("Failed to load your latest metrics.");
            } finally {
                setLoading(false);
            }
        };

        fetchData();

        // Auto-refresh credits when user returns to this tab
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') fetchData();
        };
        document.addEventListener('visibilitychange', handleVisibility);

        // Also poll every 30 seconds while visible
        const interval = setInterval(() => {
            if (document.visibilityState === 'visible') fetchData();
        }, 30000);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibility);
            clearInterval(interval);
        };
    }, [isLoaded, isSignedIn, getToken]);

    const referralLink = origin && profile?.referralCode
        ? `${origin}/signup?ref=${profile.referralCode}`
        : '';

    const handleCopyLink = async () => {
        if (!referralLink) return;
        try {
            await navigator.clipboard.writeText(referralLink);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch { /* fallback */ }
    };

    if (loading) {
        return (
            <div className="flex h-[80vh] items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-slate-600 border-t-transparent rounded-full animate-spin" />
                    <p className="text-slate-500 font-medium animate-pulse">Syncing your growth metrics...</p>
                </div>
            </div>
        );
    }

    // Use fetched data or fallbacks
    const displayStats = stats || {};
    const milestones = displayStats.milestones || [];
    const skillProficiency = displayStats.skillProficiency; // null if no resume analyzed
    const growthDataPoints = displayStats.growthData || [];
    const activityHeatmap: Record<string, number> = displayStats.activityHeatmap || {};

    // Build heatmap data for last 365 days
    const heatmapDays: { date: string; count: number }[] = [];
    const today = new Date();
    for (let i = 364; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split('T')[0];
        heatmapDays.push({ date: key, count: activityHeatmap[key] || 0 });
    }
    const maxActivity = Math.max(...heatmapDays.map(d => d.count), 1);

    const handleExportReport = () => {
        const ds = displayStats;
        const now = new Date().toLocaleString();

        const lines = [
            `═══════════════════════════════════════════════`,
            `         SKILLUP — DASHBOARD REPORT`,
            `═══════════════════════════════════════════════`,
            `Generated: ${now}`,
            `Candidate: ${profile?.name || 'N/A'}`,
            ``,
            `───────────────────────────────────────────────`,
            `  OVERVIEW METRICS`,
            `───────────────────────────────────────────────`,
            `  Resume Score:      ${ds.resumeScore || 0} / 100`,
            `  DSA solved:        ${ds.practiceCount || 0} problems`,
            `  Interviews:        ${ds.interviewCount || 0} taken`,
            ``,
            `───────────────────────────────────────────────`,
            `  REFERRAL & CREDITS`,
            `───────────────────────────────────────────────`,
            `  Credits:           ${profile?.credits ?? 0}`,
            `  Referrals:         ${profile?.referralCount ?? 0}`,
            `  Referral Code:     ${profile?.referralCode || 'N/A'}`,
            ``,
        ];

        // Skill Proficiency
        if (skillProficiency && skillProficiency.length > 0) {
            lines.push(`───────────────────────────────────────────────`);
            lines.push(`  SKILL PROFICIENCY`);
            lines.push(`───────────────────────────────────────────────`);
            skillProficiency.forEach((s: any) => {
                const bar = '█'.repeat(Math.round(s.A / 5)) + '░'.repeat(20 - Math.round(s.A / 5));
                lines.push(`  ${s.subject.padEnd(18)} ${bar} ${s.A}%`);
            });
            lines.push(``);
        }

        // Career Growth Data
        if (growthDataPoints.length > 0) {
            lines.push(`───────────────────────────────────────────────`);
            lines.push(`  CAREER GROWTH INDEX`);
            lines.push(`───────────────────────────────────────────────`);
            lines.push(`  ${'Month'.padEnd(10)} ${'Resume'.padEnd(10)} ${'Interview'.padEnd(12)} Practice`);
            growthDataPoints.forEach((d: any) => {
                lines.push(`  ${(d.month || '').padEnd(10)} ${String(d.resume || 0).padEnd(10)} ${String(d.interview || 0).padEnd(12)} ${d.practice || 0}`);
            });
            lines.push(``);
        }

        // Activity Summary
        const totalActions = heatmapDays.reduce((sum: number, d: any) => sum + d.count, 0);
        const activeDays = heatmapDays.filter((d: any) => d.count > 0).length;
        lines.push(`───────────────────────────────────────────────`);
        lines.push(`  ACTIVITY SUMMARY (LAST 365 DAYS)`);
        lines.push(`───────────────────────────────────────────────`);
        lines.push(`  Total Actions:     ${totalActions}`);
        lines.push(`  Active Days:       ${activeDays} / 365`);
        lines.push(``);

        // Milestones
        if (milestones.length > 0) {
            lines.push(`───────────────────────────────────────────────`);
            lines.push(`  RECENT MILESTONES`);
            lines.push(`───────────────────────────────────────────────`);
            milestones.forEach((ms: any) => {
                const date = new Date(ms.date).toLocaleDateString();
                lines.push(`  [${date}] ${ms.title}`);
                if (ms.subtitle) lines.push(`           ${ms.subtitle}`);
            });
            lines.push(``);
        }

        lines.push(`═══════════════════════════════════════════════`);
        lines.push(`          End of Report`);
        lines.push(`═══════════════════════════════════════════════`);

        const reportText = lines.join('\n');
        const blob = new Blob([reportText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `skillup_dashboard_report_${new Date().toISOString().split('T')[0]}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="min-h-screen bg-slate-50/50 dark:bg-[var(--soft-sunken)] p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8 font-sans text-slate-900 dark:text-white w-full">
            {/* Header Section */}
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-1">
                        <span>HOME</span>
                        <span>/</span>
                        <span className="font-semibold text-slate-800 dark:text-white">DASHBOARD</span>
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Advanced Growth Metrics</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Precision tracking for your career lifecycle and platform activity.</p>
                </div>

                <div className="flex items-center gap-3">
                    <Button variant="outline" className="bg-white dark:bg-[var(--soft-surface)] border-slate-200 dark:border-[var(--soft-line)] text-slate-700 dark:text-slate-300 shadow-sm h-10 gap-2">
                        <Calendar className="w-4 h-4" />
                        Last 30 Days
                    </Button>
                    <Button onClick={handleExportReport} className="bg-slate-700 hover:bg-slate-800 text-white shadow-md shadow-slate-700/20 h-10 gap-2">
                        <Download className="w-4 h-4" />
                        Export Report
                    </Button>
                </div>
            </header>

            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 rounded-xl text-red-600 dark:text-red-400 text-sm font-medium">
                    {error}
                </div>
            )}

            {/* Top Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard
                    title="RESUME SCORE"
                    value={displayStats.resumeScore || 0}
                    max={100}
                    trend={displayStats.resumeScore > 0 ? "+Active" : "N/A"}
                    trendUp={displayStats.resumeScore > 0}
                    icon={<FileText className="w-5 h-5 text-slate-600" />}
                    color="text-slate-600"
                    ringColor="stroke-slate-600"
                />
                <StatCard
                    title="DSA SOLVED"
                    value={displayStats.practiceCount || 0}
                    suffix=""
                    max={Math.max(displayStats.practiceCount || 0, 45)}
                    trend={displayStats.practiceCount > 0 ? `${displayStats.practiceCount} solved` : "0 solved"}
                    trendUp={displayStats.practiceCount > 0}
                    icon={<Code2 className="w-5 h-5 text-orange-500" />}
                    color="text-orange-500"
                    ringColor="stroke-orange-500"
                />
                <StatCard
                    title="INTERVIEWS"
                    value={displayStats.interviewCount || 0}
                    suffix=""
                    max={Math.max(displayStats.interviewCount || 0, 20)}
                    trend={displayStats.interviewCount > 0 ? `${displayStats.interviewCount} taken` : "0 taken"}
                    trendUp={displayStats.interviewCount > 0}
                    icon={<MessageSquare className="w-5 h-5 text-emerald-500" />}
                    color="text-emerald-500"
                    ringColor="stroke-emerald-500"
                />
            </div>

            {displayStats?.gamification && (
                <Card className="border-none shadow-sm dark:shadow-black/20 bg-white dark:bg-[var(--soft-surface)] rounded-2xl">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xl font-bold text-slate-900 dark:text-white">Gamification Progress</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="rounded-xl border border-slate-200 dark:border-[var(--soft-line)] bg-slate-50 dark:bg-[var(--soft-sunken)] p-4">
                                <p className="text-[10px] uppercase tracking-wider text-slate-500">Level</p>
                                <p className="text-2xl font-extrabold text-slate-900 dark:text-white">{displayStats.gamification.level || 1}</p>
                            </div>
                            <div className="rounded-xl border border-slate-200 dark:border-[var(--soft-line)] bg-slate-50 dark:bg-[var(--soft-sunken)] p-4">
                                <p className="text-[10px] uppercase tracking-wider text-slate-500">Total XP</p>
                                <p className="text-2xl font-extrabold text-slate-900 dark:text-white">{displayStats.gamification.xpTotal || 0}</p>
                            </div>
                            <div className="rounded-xl border border-slate-200 dark:border-[var(--soft-line)] bg-slate-50 dark:bg-[var(--soft-sunken)] p-4">
                                <p className="text-[10px] uppercase tracking-wider text-slate-500">Weekly XP</p>
                                <p className="text-2xl font-extrabold text-slate-900 dark:text-white">{displayStats.gamification.weeklyXp || 0}</p>
                            </div>
                            <div className="rounded-xl border border-slate-200 dark:border-[var(--soft-line)] bg-slate-50 dark:bg-[var(--soft-sunken)] p-4">
                                <p className="text-[10px] uppercase tracking-wider text-slate-500">Streak</p>
                                <p className="text-2xl font-extrabold text-slate-900 dark:text-white">{displayStats.gamification.currentStreak || 0}d</p>
                            </div>
                        </div>

                        {(displayStats.gamification.recentBadges || []).length > 0 && (
                            <div className="mt-4">
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Recent Badges</p>
                                <div className="flex flex-wrap gap-2">
                                    {(displayStats.gamification.recentBadges || []).map((badge: any) => (
                                        <span key={`${badge.code}-${badge.unlockedAt}`} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                                            {badge.name}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Referral & Credits Section */}
            <Card className="border-none shadow-sm dark:shadow-black/20 bg-white dark:bg-[var(--soft-surface)] rounded-2xl">
                <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-slate-500/10 flex items-center justify-center">
                            <Gift className="w-4 h-4 text-slate-500" />
                        </div>
                        <CardTitle className="text-xl font-bold text-slate-900 dark:text-white">Referral & Credits</CardTitle>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Referral Link */}
                        <div className="md:col-span-2">
                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">YOUR REFERRAL LINK</p>
                            <div className="flex items-center gap-2">
                                <div className="flex-1 flex items-center gap-2 bg-slate-50 dark:bg-[var(--soft-raised)] border border-slate-200 dark:border-[var(--soft-line)] rounded-lg px-4 py-2.5 min-w-0">
                                    <LinkIcon className="w-4 h-4 text-slate-400 shrink-0" />
                                    <span className="text-sm text-slate-600 dark:text-slate-300 truncate font-mono">
                                        {referralLink || "Loading referral link..."}
                                    </span>
                                </div>
                                <Button
                                    onClick={handleCopyLink}
                                    disabled={!referralLink}
                                    className={cn(
                                        "shrink-0 h-10 px-4 gap-2 rounded-lg font-semibold text-sm transition-all",
                                        copied
                                            ? "bg-emerald-500 hover:bg-emerald-600 text-white"
                                            : "bg-slate-700 hover:bg-slate-800 text-white shadow-sm"
                                    )}
                                >
                                    {copied ? <><Check className="w-4 h-4" /> Copied!</> : <><Copy className="w-4 h-4" /> Copy</>}
                                </Button>
                            </div>
                            <p className="text-xs text-slate-400 mt-2">Share this link with friends. When they sign up as a candidate, you earn <span className="font-bold text-slate-500">+10 credits</span>!</p>
                        </div>

                        {/* Credits & Count */}
                        <div className="flex gap-4">
                            <div className="flex-1 bg-slate-50 dark:bg-[var(--soft-sunken)] border border-slate-200 dark:border-[var(--soft-line)] rounded-xl p-4 text-center">
                                <Gift className="w-5 h-5 text-slate-500 mx-auto mb-1" />
                                <p className="text-2xl font-extrabold text-slate-900 dark:text-white">{profile?.credits ?? 0}</p>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Credits</p>
                            </div>
                            <div className="flex-1 bg-slate-50 dark:bg-[var(--soft-sunken)] border border-slate-200 dark:border-[var(--soft-line)] rounded-xl p-4 text-center">
                                <Users className="w-5 h-5 text-slate-500 mx-auto mb-1" />
                                <p className="text-2xl font-extrabold text-slate-900 dark:text-white">{profile?.referralCount ?? 0}</p>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Referrals</p>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Main Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Career Growth Index (Area Chart) */}
                <Card className="lg:col-span-2 border-none shadow-sm dark:shadow-black/20 bg-white dark:bg-[var(--soft-surface)] rounded-2xl overflow-hidden">
                    <CardHeader className="pb-2">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <div>
                                <CardTitle className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">Career Growth Index</CardTitle>
                                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">Real activity across resumes, interviews, and practice.</p>
                            </div>
                            <div className="flex gap-3 sm:gap-4 text-[10px] sm:text-xs font-semibold uppercase tracking-wider">
                                <div className="flex items-center gap-1.5"><span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-slate-600"></span> Resume</div>
                                <div className="flex items-center gap-1.5"><span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-emerald-500"></span> Interview</div>
                                <div className="flex items-center gap-1.5"><span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-orange-500"></span> Practice</div>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="pl-0 pb-0">
                        <div className="h-[250px] sm:h-[350px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={growthDataPoints} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorResume" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#475569" stopOpacity={0.1} />
                                            <stop offset="95%" stopColor="#475569" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="colorInterview" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#10B981" stopOpacity={0.1} />
                                            <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="colorApplications" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#F97316" stopOpacity={0.1} />
                                            <stop offset="95%" stopColor="#F97316" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12 }} dy={10} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12 }} />
                                    <Tooltip
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                                        itemStyle={{ fontSize: '12px', fontWeight: 600 }}
                                    />
                                    <Area type="monotone" dataKey="resume" stroke="#475569" strokeWidth={3} fillOpacity={1} fill="url(#colorResume)" />
                                    <Area type="monotone" dataKey="interview" stroke="#10B981" strokeWidth={3} fillOpacity={1} fill="url(#colorInterview)" />
                                    <Area type="monotone" dataKey="practice" stroke="#F97316" strokeWidth={3} fillOpacity={1} fill="url(#colorApplications)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                {/* Skill Proficiency (Radar Chart) — only shown if resume analyzed */}
                <Card className="border-none shadow-sm dark:shadow-black/20 bg-white dark:bg-[var(--soft-surface)] rounded-2xl">
                    <CardHeader>
                        <CardTitle className="text-xl font-bold text-slate-900 dark:text-white">Skill Proficiency</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {skillProficiency && skillProficiency.length > 0 ? (
                            <>
                                <div className="h-[280px] w-full relative">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <RadarChart cx="50%" cy="50%" outerRadius="55%" data={skillProficiency}>
                                            <PolarGrid stroke="#E2E8F0" />
                                            <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748B', fontSize: 9, fontWeight: 600 }} />
                                            <Radar
                                                name="Skills"
                                                dataKey="A"
                                                stroke="#475569"
                                                strokeWidth={2}
                                                fill="#64748B"
                                                fillOpacity={0.2}
                                            />
                                        </RadarChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="space-y-4 mt-4">
                                    {[...skillProficiency]
                                        .sort((a: any, b: any) => b.A - a.A)
                                        .map((s: any, i: number) => (
                                            <SkillBar key={i} label={s.subject} value={s.A} />
                                        ))}
                                </div>
                            </>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-16 text-center">
                                <div className="w-14 h-14 bg-slate-100 dark:bg-neutral-800 rounded-full flex items-center justify-center mb-4">
                                    <FileText className="w-6 h-6 text-slate-400" />
                                </div>
                                <p className="text-slate-500 text-sm font-medium">No skills data yet</p>
                                <p className="text-slate-400 text-xs mt-1">Analyze your resume to see top skills here.</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Bottom Section: Activity & Milestones */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* User Activity (Heatmap Style) */}
                <Card className="lg:col-span-2 border-none shadow-sm dark:shadow-black/20 bg-white dark:bg-[var(--soft-surface)] rounded-2xl">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <div className="flex items-center gap-2">
                            <Activity className="w-5 h-5 text-slate-500" />
                            <CardTitle className="text-xl font-bold text-slate-900 dark:text-white">User Activity</CardTitle>
                        </div>
                        <div className="flex gap-1 text-[10px] text-slate-400 font-medium items-center">
                            <span>LESS</span>
                            <div className="flex gap-1">
                                <div className="w-3 h-3 bg-slate-100 dark:bg-[var(--soft-raised)] rounded-sm"></div>
                                <div className="w-3 h-3 bg-slate-200 dark:bg-[var(--soft-line)] rounded-sm"></div>
                                <div className="w-3 h-3 bg-slate-400 rounded-sm"></div>
                                <div className="w-3 h-3 bg-slate-500 rounded-sm"></div>
                                <div className="w-3 h-3 bg-slate-600 rounded-sm"></div>
                                <div className="w-3 h-3 bg-slate-800 rounded-sm"></div>
                            </div>
                            <span>MORE</span>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-wrap gap-1">
                            {heatmapDays.map((day, i) => {
                                const d = new Date(day.date + 'T00:00:00');
                                const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                                return (
                                    <div key={i} className="relative group/dot">
                                        <div
                                            className={`w-3 h-3 rounded-sm ${getHeatmapColor(day.count, maxActivity)} transition-colors hover:ring-2 ring-offset-1 ring-slate-400 cursor-pointer`}
                                        />
                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[11px] font-semibold rounded-lg shadow-lg whitespace-nowrap opacity-0 group-hover/dot:opacity-100 pointer-events-none transition-opacity z-50">
                                            {label} — {day.count} action{day.count !== 1 ? 's' : ''}
                                            <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-900 dark:border-t-white" />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>

                {/* Recent Milestones */}
                <Card className="border-none shadow-sm dark:shadow-black/20 bg-white dark:bg-[var(--soft-surface)] rounded-2xl">
                    <CardHeader>
                        <CardTitle className="text-xl font-bold text-slate-900 dark:text-white">Recent Milestones</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6 max-h-[260px] overflow-y-auto pr-1">
                        {milestones.length > 0 ? (
                            milestones.map((ms: any, i: number) => (
                                <MilestoneItem
                                    key={i}
                                    icon={
                                        <div className={cn(
                                            "rounded-full w-full h-full flex items-center justify-center text-white",
                                            ms.iconType === 'resume' ? "bg-slate-600"
                                                : ms.iconType === 'practice' ? "bg-orange-500"
                                                    : ms.iconType === 'interview' ? "bg-emerald-500"
                                                        : "bg-slate-500"
                                        )}>
                                            {ms.iconType === 'resume' ? <FileText className="w-3 h-3" />
                                                : ms.iconType === 'interview' ? <MessageSquare className="w-3 h-3" />
                                                    : ms.iconType === 'practice' ? <Code2 className="w-3 h-3" />
                                                        : <TrendingUp className="w-3 h-3" />}
                                        </div>
                                    }
                                    title={ms.title}
                                    subtitle={ms.subtitle}
                                    date={formatDistanceToNow(new Date(ms.date), { addSuffix: true })}
                                />
                            ))
                        ) : (
                            <div className="text-center py-8">
                                <div className="w-12 h-12 bg-slate-100 dark:bg-neutral-800 rounded-full flex items-center justify-center mx-auto mb-3">
                                    <TrendingUp className="w-6 h-6 text-slate-400" />
                                </div>
                                <p className="text-slate-500 text-sm">No recent milestones found. Start applying or analyze your resume to see progress!</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

// --- Sub-components ---

function StatCard({ title, value, max, suffix = "", trend, trendUp, icon, color, ringColor }: any) {
    const percentage = (value / max) * 100;
    const circumference = 2 * Math.PI * 28;
    const strokeDashoffset = circumference - (percentage / 100) * circumference;

    return (
        <Card className="border-none shadow-sm dark:shadow-black/20 bg-white dark:bg-[var(--soft-surface)] rounded-2xl p-6 relative overflow-hidden group">
            <div className="flex justify-between items-center relative z-10">
                <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{title}</p>
                    <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">{value}</span>
                        <span className="text-lg text-slate-500 dark:text-slate-400 font-medium">/{max}{suffix}</span>
                    </div>
                    <div className={`flex items-center gap-1.5 mt-4 text-xs font-bold ${trendUp ? 'text-emerald-500' : 'text-slate-400'}`}>
                        {trendUp ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                        <span>{trend}</span>
                    </div>
                </div>

                {/* Circular Progress */}
                <div className="relative w-20 h-20 flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90">
                        <circle cx="50%" cy="50%" r="28" className="stroke-slate-100 dark:stroke-[#2a2a2a] fill-none" strokeWidth="6" />
                        <motion.circle
                            initial={{ strokeDashoffset: circumference }}
                            animate={{ strokeDashoffset }}
                            transition={{ duration: 1.5, ease: "easeOut" }}
                            cx="50%" cy="50%" r="28"
                            className={`${ringColor} fill-none`}
                            strokeWidth="6"
                            strokeLinecap="round"
                            strokeDasharray={circumference}
                        />
                    </svg>
                    <div className={`absolute inset-0 flex items-center justify-center ${color}`}>
                        {icon}
                    </div>
                </div>
            </div>
        </Card>
    );
}

function SkillBar({ label, value }: { label: string, value: number }) {
    return (
        <div>
            <div className="flex justify-between text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                <span>{label}</span>
                <span className="text-slate-900 dark:text-white">{value}%</span>
            </div>
            <div className="h-1.5 bg-slate-100 dark:bg-[var(--soft-line)] rounded-full overflow-hidden">
                <div className="h-full bg-slate-600 rounded-full" style={{ width: `${value}%` }}></div>
            </div>
        </div>
    )
}

function MilestoneItem({ icon, title, subtitle, date }: any) {
    return (
        <div className="flex gap-4 items-start group">
            <div className="w-6 h-6 shrink-0 mt-0.5 shadow-sm shadow-slate-200 dark:shadow-black/30 rounded-full">
                {icon}
            </div>
            <div className="flex-1">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-slate-600 dark:group-hover:text-slate-400 transition-colors">{title}</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">{subtitle}</p>
                <p className="text-[10px] text-slate-400 mt-1">{date}</p>
            </div>
        </div>
    )
}

function getHeatmapColor(count: number, maxCount: number) {
    if (count === 0) return "bg-slate-100 dark:bg-[var(--soft-raised)]";
    const intensity = count / maxCount;
    if (intensity > 0.8) return "bg-slate-800";
    if (intensity > 0.6) return "bg-slate-600";
    if (intensity > 0.4) return "bg-slate-500";
    if (intensity > 0.2) return "bg-slate-400";
    return "bg-slate-200 dark:bg-[var(--soft-line)]";
}
