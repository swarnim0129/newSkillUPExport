'use client';

import React, { useEffect, useState } from 'react';
import { Users, Presentation, School, ClipboardList, Route, BarChart3 } from 'lucide-react';
import api from '@/lib/api';
import Link from 'next/link';

interface AdminStats {
    students: { total: number; withJourney: number };
    mentors: { total: number };
    classes: { total: number; active: number; memberships: number };
    classwork: { total: number };
}

export default function AdminDashboard() {
    const [stats, setStats] = useState<AdminStats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const response = await api.get('/admin/stats');
                setStats(response.data);
            } catch (error) {
                console.error('Failed to fetch stats:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchStats();
    }, []);

    return (
        <div className="animate-fade-in space-y-8">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300">
                        Admin Dashboard
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">
                        Overview of system performance and activities
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="px-4 py-2 bg-white dark:bg-black border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm text-sm">
                        <span className="w-2 h-2 rounded-full bg-[#4a6cf7] inline-block mr-2"></span>
                        System Operational
                    </div>
                </div>
            </div>

            {/* Main Stats Grid - Professional & Minimal */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                    { label: 'Students', value: stats?.students.total || 0, icon: Users },
                    { label: 'Faculty mentors', value: stats?.mentors.total || 0, icon: Presentation },
                    { label: 'Active classes', value: stats?.classes.active || 0, icon: School },
                    { label: 'Classwork set', value: stats?.classwork.total || 0, icon: ClipboardList }
                ].map((stat, i) => (
                    <div key={i} className="group relative p-6 bg-white dark:bg-black rounded-xl border border-slate-200 dark:border-slate-800 hover:border-[#4a6cf7]/30 transition-all duration-300 shadow-sm hover:shadow-md">
                        <div className="flex items-start justify-between mb-4">
                            <div className="p-2.5 rounded-lg bg-[#4a6cf7]/5 text-[#4a6cf7] group-hover:bg-[#4a6cf7] group-hover:text-white transition-colors duration-300">
                                <stat.icon size={22} className="stroke-[1.5]" />
                            </div>
                            {/* Decorative dot */}
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-200 dark:bg-slate-800 group-hover:bg-[#4a6cf7] transition-colors"></span>
                        </div>
                        <div>
                            <h3 className="text-3xl font-bold text-slate-900 dark:text-white mb-1">
                                {loading ? '...' : stat.value}
                            </h3>
                            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 group-hover:text-[#4a6cf7] transition-colors">
                                {stat.label}
                            </p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Secondary Section - Split View */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Pending Actions Column */}
                <div className="lg:col-span-2 grid grid-cols-1 gap-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white dark:bg-black p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                            <div className="flex items-center gap-3 mb-6">
                                <Route size={20} className="text-[#4a6cf7]" aria-hidden="true" />
                                <h3 className="font-semibold text-slate-900 dark:text-white">Journeys set up</h3>
                            </div>
                            <div>
                                <span className="text-4xl font-bold text-slate-900 dark:text-white block mb-1">{stats?.students.withJourney || 0}</span>
                                <span className="text-sm text-slate-500 dark:text-slate-400">of {stats?.students.total || 0} students have a four-year plan</span>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-black p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                            <div className="flex items-center gap-3 mb-6">
                                <School size={20} className="text-[#4a6cf7]" aria-hidden="true" />
                                <h3 className="font-semibold text-slate-900 dark:text-white">Class enrolments</h3>
                            </div>
                            <div>
                                <span className="text-4xl font-bold text-slate-900 dark:text-white block mb-1">{stats?.classes.memberships || 0}</span>
                                <span className="text-sm text-slate-500 dark:text-slate-400">student places across {stats?.classes.total || 0} classes</span>
                            </div>
                        </div>
                    </div>

                    {/* Quick Access Menu */}
                    <div className="w-full bg-[#4a6cf7] p-6 rounded-xl text-white shadow-lg relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8 opacity-10">
                            <School size={120} />
                        </div>
                        <div className="relative z-10">
                            <h3 className="text-xl font-bold mb-4">Quick Management</h3>
                            <div className="flex gap-3 flex-wrap">
                                <Link href="/admin/users" className="bg-white/10 hover:bg-white/20 backdrop-blur-sm px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-white/10">
                                    Manage Students
                                </Link>
                                <Link href="/admin/analytics" className="bg-white/10 hover:bg-white/20 backdrop-blur-sm px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-white/10">
                                    Analytics
                                </Link>
                                <Link href="/admin/reviews" className="bg-white/10 hover:bg-white/20 backdrop-blur-sm px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-white/10">
                                    Reviews
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column - System Overview List */}
                <div className="bg-white dark:bg-black rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
                    <h3 className="font-semibold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
                        <BarChart3 size={18} className="text-[#4a6cf7]" />
                        Platform Metrics
                    </h3>

                    <div className="space-y-6">
                        {[
                            { label: 'Students with a journey', value: stats?.students.withJourney || 0, total: stats?.students.total || 1 },
                            { label: 'Active classes', value: stats?.classes.active || 0, total: stats?.classes.total || 1 },
                            { label: 'Students in a class', value: stats?.classes.memberships || 0, total: Math.max(stats?.students.total || 1, stats?.classes.memberships || 1) }
                        ].map((s, i) => (
                            <div key={i}>
                                <div className="flex justify-between text-sm mb-2">
                                    <span className="text-slate-600 dark:text-slate-400">{s.label}</span>
                                    <span className="font-bold text-slate-900 dark:text-white">{s.value}</span>
                                </div>
                                <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-[#4a6cf7] rounded-full"
                                        style={{ width: `${Math.min((s.value / s.total) * 100, 100)}%` }}
                                    ></div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800">
                        <p className="text-xs text-center text-slate-400">
                            Last active: Just now
                        </p>
                    </div>
                </div>

            </div>
        </div>
    );
}
