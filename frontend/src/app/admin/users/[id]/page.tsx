'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
    ArrowLeft, MapPin, Briefcase, Loader2,
    Calendar, ExternalLink, Coins, FileText, Route, School
} from 'lucide-react';
import Header from '@/components/Header';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import api from '@/lib/api';

interface Candidate {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    status: 'active' | 'suspended';
    location: string;
    credits: number;
    experience?: string;
    education?: string;
    skills?: string[];
    bio?: string;
    resumeUrl?: string;
    jobPreferences?: {
        desiredRole: string;
        expectedSalary: string;
        willRelocate: boolean;
    };
    createdAt: string;
}

interface Journey {
    branch?: string;
    semesterAtSetup?: number;
    goal?: { type?: string; targetRole?: string };
    setupAt?: string;
}

interface ClassInfo {
    id: string;
    name: string;
    section?: string;
    mentor?: string;
}

export default function AdminCandidateDetailPage() {
    const params = useParams();
    const router = useRouter();
    const candidateId = params.id as string;

    const [candidate, setCandidate] = useState<Candidate | null>(null);
    const [journey, setJourney] = useState<Journey | null>(null);
    const [classes, setClasses] = useState<ClassInfo[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await api.get(`/admin/candidates/${candidateId}`);
                setCandidate(res.data.candidate);
                setJourney(res.data.journey || null);
                setClasses(res.data.classes || []);
            } catch (err) {
                console.error('Failed to fetch candidate data:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [candidateId]);

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            </div>
        );
    }

    if (!candidate) {
        return (
            <div className="flex h-screen items-center justify-center flex-col gap-4">
                <p className="text-neutral-500">User not found.</p>
                <Button variant="outline" onClick={() => router.push('/admin/users')}>
                    <ArrowLeft size={16} className="mr-2" /> Back to Users
                </Button>
            </div>
        );
    }

    const initials = `${candidate.firstName?.[0] || ''}${candidate.lastName?.[0] || ''}`.toUpperCase() || 'UN';

    return (
        <div className="animate-fade-in pb-12">
            <Header title="User Details" />

            <div className="max-w-6xl mx-auto px-6 space-y-8">
                {/* Back button */}
                <button
                    onClick={() => router.push('/admin/users')}
                    className="flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors mt-6"
                >
                    <ArrowLeft size={16} /> Back to Users
                </button>

                {/* Candidate Header Card */}
                <Card className="overflow-hidden bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 shadow-sm rounded-2xl">
                    <div className="p-6 md:p-8">
                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                            <div className="flex items-start gap-5">
                                <div className="h-16 w-16 rounded-2xl bg-blue-100 dark:bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-500 shrink-0 font-bold text-2xl">
                                    {initials}
                                </div>
                                <div>
                                    <div className="flex items-center gap-3 mb-2">
                                        <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">
                                            {candidate.firstName} {candidate.lastName}
                                        </h1>
                                        <Badge variant={
                                            candidate.status === 'active' ? 'success' : 'danger'
                                        }>
                                            {candidate.status || 'active'}
                                        </Badge>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-neutral-500 dark:text-neutral-400">
                                        {candidate.email && (
                                            <span className="flex items-center gap-1">{candidate.email}</span>
                                        )}
                                        {candidate.phone && (
                                            <span className="flex items-center gap-1">{candidate.phone}</span>
                                        )}
                                        {candidate.location && (
                                            <span className="flex items-center gap-1"><MapPin size={14} />{candidate.location}</span>
                                        )}
                                        <span className="flex items-center gap-1"><Calendar size={14} />Joined {new Date(candidate.createdAt).toLocaleDateString()}</span>
                                        <span className="flex items-center gap-1 text-amber-600 dark:text-amber-500 font-medium bg-amber-50 dark:bg-amber-500/10 px-2 py-0.5 rounded"><Coins size={14} />{candidate.credits} credits</span>
                                    </div>
                                    
                                    {candidate.jobPreferences?.desiredRole && (
                                        <div className="mt-3 text-sm text-neutral-500 dark:text-neutral-400 flex items-center gap-1">
                                            <Briefcase size={14}/> Desired Role: 
                                            <span className="text-neutral-900 dark:text-white font-medium ml-1">
                                                {candidate.jobPreferences.desiredRole}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </Card>

                {/* Additional Info / Bio */}
                {(candidate.bio || (candidate.skills && candidate.skills.length > 0) || candidate.resumeUrl) && (
                    <Card className="overflow-hidden bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 shadow-sm rounded-2xl">
                        <div className="p-6">
                            <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-4 flex items-center gap-2">
                                <FileText size={20} className="text-blue-500" />
                                Professional Profile
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-2">Resume</p>
                                    {candidate.resumeUrl ? (
                                        <a
                                            href={candidate.resumeUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                                        >
                                            <ExternalLink size={14} /> View Resume
                                        </a>
                                    ) : (
                                        <p className="text-sm text-neutral-500">Not uploaded</p>
                                    )}
                                </div>
                                {candidate.skills && candidate.skills.length > 0 && (
                                    <div>
                                        <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-2">Skills</p>
                                        <div className="flex flex-wrap gap-2">
                                            {candidate.skills.map(skill => (
                                                <Badge key={skill} variant="secondary" className="font-normal">{skill}</Badge>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {candidate.bio && (
                                    <div className="col-span-1 md:col-span-2 mt-2">
                                        <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-2">Bio</p>
                                        <p className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed max-w-3xl whitespace-pre-wrap">{candidate.bio}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </Card>
                )}

                {/* Journey and classes */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card className="bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 shadow-sm rounded-2xl">
                        <div className="p-6">
                            <h2 className="text-lg font-bold text-neutral-900 dark:text-white mb-4 flex items-center gap-2">
                                <Route size={20} className="text-blue-500" aria-hidden="true" /> Journey
                            </h2>
                            {journey ? (
                                <dl className="grid grid-cols-2 gap-4 text-sm">
                                    <div><dt className="text-neutral-500 dark:text-neutral-400">Branch</dt><dd className="font-medium text-neutral-900 dark:text-white">{journey.branch || '—'}</dd></div>
                                    <div><dt className="text-neutral-500 dark:text-neutral-400">Started in semester</dt><dd className="font-medium text-neutral-900 dark:text-white">{journey.semesterAtSetup ?? '—'}</dd></div>
                                    <div><dt className="text-neutral-500 dark:text-neutral-400">Goal</dt><dd className="font-medium text-neutral-900 dark:text-white capitalize">{journey.goal?.type?.replace('_', ' ') || '—'}{journey.goal?.targetRole ? `, ${journey.goal.targetRole}` : ''}</dd></div>
                                    <div><dt className="text-neutral-500 dark:text-neutral-400">Set up</dt><dd className="font-medium text-neutral-900 dark:text-white">{journey.setupAt ? new Date(journey.setupAt).toLocaleDateString() : '—'}</dd></div>
                                </dl>
                            ) : (
                                <p className="text-sm text-neutral-500 dark:text-neutral-400">This student has not set up their journey yet.</p>
                            )}
                        </div>
                    </Card>
                    <Card className="bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 shadow-sm rounded-2xl">
                        <div className="p-6">
                            <h2 className="text-lg font-bold text-neutral-900 dark:text-white mb-4 flex items-center gap-2">
                                <School size={20} className="text-blue-500" aria-hidden="true" /> Classes
                            </h2>
                            {classes.length ? (
                                <ul className="space-y-3">
                                    {classes.map((c) => (
                                        <li key={c.id} className="text-sm">
                                            <p className="font-medium text-neutral-900 dark:text-white">{c.name}</p>
                                            <p className="text-neutral-500 dark:text-neutral-400">{[c.section, c.mentor && `Mentor: ${c.mentor}`].filter(Boolean).join(' · ')}</p>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-sm text-neutral-500 dark:text-neutral-400">Not in any class.</p>
                            )}
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
}
