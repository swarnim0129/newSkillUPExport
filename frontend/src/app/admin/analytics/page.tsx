'use client';

import React, { useEffect, useState } from 'react';
import {
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    BarChart, Bar, AreaChart, Area
} from 'recharts';
import Header from '@/components/Header';
import Card, { CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Loader2 } from 'lucide-react';

interface MonthCount { _id: string; count: number }
interface Analytics {
    overview: { totalStudents: number; withJourney: number; totalMentors: number; totalClasses: number };
    graphs: { students: MonthCount[]; mentors: MonthCount[]; classes: MonthCount[] };
}

export default function AdminAnalyticsPage() {
    const [data, setData] = useState<Analytics | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const token = localStorage.getItem('adminToken');
                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5500/api'}/admin/analytics`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (res.ok) setData(await res.json());
            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-neutral-900">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            </div>
        );
    }

    // Merge monthly sign-ups into one row per month
    const map = new Map<string, { name: string; students: number; mentors: number }>();
    const row = (month: string) => {
        if (!map.has(month)) map.set(month, { name: month, students: 0, mentors: 0 });
        return map.get(month)!;
    };
    data?.graphs.students.forEach((m) => { row(m._id).students = m.count; });
    data?.graphs.mentors.forEach((m) => { row(m._id).mentors = m.count; });
    const growthData = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    const classData = data?.graphs.classes.map((m) => ({ name: m._id, classes: m.count })) || [];

    const o = data?.overview;
    const journeyShare = o && o.totalStudents ? Math.round((100 * o.withJourney) / o.totalStudents) : 0;
    const tooltipStyle = { backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff' };

    return (
        <div className="animate-fade-in pb-12">
            <Header title="Platform Analytics" />

            <div className="p-6 space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle>New students and faculty per month</CardTitle>
                    </CardHeader>
                    <CardContent className="h-[400px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={growthData}>
                                <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-neutral-800" />
                                <XAxis dataKey="name" className="text-xs" />
                                <YAxis allowDecimals={false} />
                                <Tooltip contentStyle={tooltipStyle} />
                                <Legend />
                                <Area type="monotone" dataKey="students" stroke="#2563eb" strokeWidth={2} fill="#2563eb" fillOpacity={0.12} name="Students" />
                                <Area type="monotone" dataKey="mentors" stroke="#0d9488" strokeWidth={2} fill="#0d9488" fillOpacity={0.12} name="Faculty" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Classes created per month</CardTitle>
                        </CardHeader>
                        <CardContent className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={classData}>
                                    <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-neutral-800" />
                                    <XAxis dataKey="name" className="text-xs" />
                                    <YAxis allowDecimals={false} />
                                    <Tooltip cursor={{ fill: 'transparent' }} contentStyle={tooltipStyle} />
                                    <Bar dataKey="classes" fill="#2563eb" name="New classes" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Summary</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <dl className="grid grid-cols-2 gap-6">
                                {[
                                    { label: 'Students', value: o?.totalStudents ?? 0 },
                                    { label: 'Faculty mentors', value: o?.totalMentors ?? 0 },
                                    { label: 'Classes', value: o?.totalClasses ?? 0 },
                                    { label: 'Journeys set up', value: o?.withJourney ?? 0 },
                                ].map((item) => (
                                    <div key={item.label}>
                                        <dt className="text-sm text-slate-500 dark:text-slate-400">{item.label}</dt>
                                        <dd className="text-2xl font-bold text-slate-900 dark:text-white">{item.value}</dd>
                                    </div>
                                ))}
                            </dl>
                            <div className="mt-6">
                                <div className="flex justify-between text-sm mb-2">
                                    <span className="text-slate-600 dark:text-slate-400">Students with a four-year plan</span>
                                    <span className="font-semibold dark:text-white">{journeyShare}%</span>
                                </div>
                                <div className="h-2 bg-slate-100 dark:bg-neutral-800 rounded-full overflow-hidden" role="progressbar" aria-valuenow={journeyShare} aria-valuemin={0} aria-valuemax={100} aria-label="Students with a four-year plan">
                                    <div className="h-full bg-blue-600 rounded-full" style={{ width: `${journeyShare}%` }} />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
