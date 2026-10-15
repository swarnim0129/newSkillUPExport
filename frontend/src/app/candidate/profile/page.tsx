'use client';

import React, { useState, useEffect } from 'react';
import { useAuth, useUser } from '@clerk/nextjs';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
    UserCircle,
    Mail,
    Phone,
    MapPin,
    Briefcase,
    Link as LinkIcon,
    Linkedin,
    Github,
    Copy,
    Check,
    Gift,
    Users,
    Loader2,
    Star,
    Target,
    ExternalLink,
    FileText,
    Pencil,
    Save,
    X,
    Plus,
} from 'lucide-react';

export default function ProfilePage() {
    const { getToken, isLoaded, isSignedIn } = useAuth();
    const { user: clerkUser } = useUser();
    const [profile, setProfile] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);
    const [origin, setOrigin] = useState('');

    // Edit mode
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState<any>({});
    const [skillInput, setSkillInput] = useState('');

    // Get origin on client side
    useEffect(() => {
        if (typeof window !== 'undefined') {
            setOrigin(window.location.origin);
        }
    }, []);

    // Fetch profile
    useEffect(() => {
        const fetchProfile = async () => {
            if (!isLoaded || !isSignedIn) return;
            try {
                const token = await getToken();
                const res = await api.get('/candidate/profile', {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (res.data.success) setProfile(res.data.profile);
            } catch (err) {
                console.error('Failed to fetch profile', err);
            } finally {
                setLoading(false);
            }
        };
        fetchProfile();
    }, [isLoaded, isSignedIn, getToken]);

    // Build referral link only when both origin and referralCode are available
    const referralLink = origin && profile?.referralCode
        ? `${origin}/signup?ref=${profile.referralCode}`
        : '';

    const handleCopy = async () => {
        if (!referralLink) return;
        try {
            await navigator.clipboard.writeText(referralLink);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch { /* ignore */ }
    };

    const startEditing = () => {
        setForm({
            firstName: profile.firstName || '',
            lastName: profile.lastName || '',
            phone: profile.phone || '',
            location: profile.location || '',
            experience: profile.experience || '',
            skills: [...(profile.skills || [])],
            resumeUrl: profile.resumeUrl || '',
            linkedIn: profile.linkedIn || '',
            portfolio: profile.portfolio || '',
            desiredRole: profile.jobPreferences?.desiredRole || '',
            expectedSalary: profile.jobPreferences?.expectedSalary || '',
            jobType: profile.jobPreferences?.jobType || '',
        });
        setEditing(true);
    };

    const cancelEditing = () => { setEditing(false); setForm({}); setSkillInput(''); };

    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setForm((prev: any) => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const addSkill = () => {
        const s = skillInput.trim();
        if (s && !form.skills.includes(s)) {
            setForm((prev: any) => ({ ...prev, skills: [...prev.skills, s] }));
            setSkillInput('');
        }
    };

    const removeSkill = (skill: string) => {
        setForm((prev: any) => ({ ...prev, skills: prev.skills.filter((sk: string) => sk !== skill) }));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const token = await getToken();
            const res = await api.put('/candidate/profile', {
                firstName: form.firstName,
                lastName: form.lastName,
                phone: form.phone,
                location: form.location,
                experience: form.experience,
                skills: form.skills,
                resumeUrl: form.resumeUrl,
                linkedIn: form.linkedIn,
                portfolio: form.portfolio,
                jobPreferences: {
                    desiredRole: form.desiredRole,
                    expectedSalary: form.expectedSalary,
                    jobType: form.jobType,
                },
            }, { headers: { Authorization: `Bearer ${token}` } });
            if (res.data.success) { setProfile(res.data.profile); setEditing(false); }
        } catch (err) {
            console.error('Save failed', err);
            alert('Failed to save profile.');
        } finally {
            setSaving(false);
        }
    };

    // Loading state
    if (loading) {
        return (
            <div className="flex h-[80vh] items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
                    <p className="text-slate-500 dark:text-slate-400 text-sm animate-pulse">Loading your profile...</p>
                </div>
            </div>
        );
    }

    if (!profile) {
        return (
            <div className="flex h-[60vh] items-center justify-center">
                <p className="text-slate-500 dark:text-slate-400">Could not load your profile.</p>
            </div>
        );
    }

    // Calculate Completeness
    const calculateCompleteness = (p: any) => {
        if (!p) return 0;
        let score = 0;
        const totalPoints = 100;

        // Basic Info (40%)
        if (p.firstName && p.lastName) score += 10;
        if (p.email) score += 10;
        if (p.phone) score += 10;
        if (p.location) score += 10;

        // Professional (30%)
        if (p.skills && p.skills.length > 0) score += 15;
        if (p.experience) score += 5;
        if (p.resumeUrl) score += 10;

        // Preferences (20%)
        if (p.jobPreferences?.desiredRole) score += 10;
        if (p.jobPreferences?.expectedSalary) score += 5;
        if (p.jobPreferences?.jobType) score += 5;

        // Socials (10%)
        if (p.linkedIn || p.portfolio) score += 10;

        return Math.min(score, 100);
    };

    const completionPercentage = calculateCompleteness(profile);
    const isProfileComplete = completionPercentage === 100;

    const avatarUrl = clerkUser?.imageUrl;
    const fullName = `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || 'Candidate';
    const initials = `${(profile.firstName || 'C')[0]}${(profile.lastName || '')[0] || ''}`.toUpperCase();

    const inputCls = 'w-full px-3 py-2 bg-white dark:bg-[#111] border border-slate-200 dark:border-[var(--soft-line)] rounded-lg text-sm text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all';

    return (
        <div className="min-h-screen bg-slate-50/50 dark:bg-[var(--soft-sunken)] p-6 lg:p-8 space-y-6 font-sans text-slate-900 dark:text-white w-full">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                <span>HOME</span><span>/</span>
                <span className="font-semibold text-slate-800 dark:text-white">PROFILE</span>
            </div>

            {/* Completeness Bar */}
            <div className="bg-white dark:bg-[#111] rounded-2xl p-6 shadow-sm dark:shadow-black/30 border border-slate-100 dark:border-[#222]">
                <div className="flex justify-between items-end mb-2">
                    <div>
                        <h2 className="text-lg font-bold">Profile Completeness</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Complete your profile to get better job recommendations.</p>
                    </div>
                    <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">{completionPercentage}%</span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-[#222] rounded-full h-2.5 overflow-hidden">
                    <div
                        className="bg-blue-600 h-2.5 rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${completionPercentage}%` }}
                    ></div>
                </div>
            </div>

            {/* ═══════════ Hero Card ═══════════ */}
            <Card className="border-none shadow-sm dark:shadow-black/30 bg-white dark:bg-[#111] rounded-2xl overflow-hidden">
                {/* Banner */}
                <div className="h-28 bg-gradient-to-r from-blue-600 via-blue-500 to-sky-400 relative">
                    <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(255,255,255,0.15), transparent 50%), radial-gradient(circle at 80% 50%, rgba(255,255,255,0.1), transparent 40%)' }} />
                </div>
                <CardContent className="relative px-8 pb-6">
                    <div className="flex flex-col sm:flex-row items-start sm:items-end gap-5 -mt-12">
                        <div className="w-24 h-24 rounded-2xl border-4 border-white dark:border-[#111] shadow-lg overflow-hidden bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shrink-0">
                            {avatarUrl
                                ? <img src={avatarUrl} alt={fullName} className="w-full h-full object-cover" />
                                : <span className="text-2xl font-bold text-white">{initials}</span>
                            }
                        </div>
                        <div className="flex-1 pt-1 sm:pb-0.5">
                            <h1 className="text-2xl font-bold">{fullName}</h1>
                            <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">
                                {profile.jobPreferences?.desiredRole || 'Job Seeker'} • {profile.location || 'Location not set'}
                            </p>
                        </div>
                        <div className="flex items-center gap-2 sm:pb-0.5">
                            {!editing ? (
                                <Button onClick={startEditing} className="bg-blue-600 hover:bg-blue-700 text-white h-9 px-4 gap-2 rounded-lg text-sm font-semibold shadow-sm">
                                    <Pencil className="w-3.5 h-3.5" /> Edit Profile
                                </Button>
                            ) : (
                                <div className="flex gap-2">
                                    <Button onClick={cancelEditing} className="bg-slate-100 dark:bg-[var(--soft-raised)] hover:bg-slate-200 dark:hover:bg-[#222] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[var(--soft-line)] h-9 px-4 gap-2 rounded-lg text-sm font-semibold">
                                        <X className="w-3.5 h-3.5" /> Cancel
                                    </Button>
                                    <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white h-9 px-4 gap-2 rounded-lg text-sm font-semibold shadow-sm">
                                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                        {saving ? 'Saving...' : 'Save Changes'}
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* ═══════════ Referral Section ═══════════ */}
            <Card className="border-none shadow-sm dark:shadow-black/30 bg-white dark:bg-[#111] rounded-2xl overflow-hidden">
                <CardContent className="p-6">
                    <div className="flex flex-col lg:flex-row lg:items-center gap-6">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5">
                                <Gift className="w-5 h-5 text-blue-500" />
                                <h3 className="text-lg font-bold">Invite Friends, Earn Credits</h3>
                            </div>
                            <p className="text-slate-500 dark:text-slate-400 text-sm mb-3">
                                Share your link. Get <span className="font-bold text-blue-500">+10 credits</span> for every candidate who signs up.
                            </p>
                            <div className="flex items-center gap-2">
                                <div className="flex-1 flex items-center gap-2 bg-slate-50 dark:bg-[var(--soft-sunken)] border border-slate-200 dark:border-[var(--soft-line)] rounded-lg px-4 py-2.5 min-w-0">
                                    <LinkIcon className="w-4 h-4 text-slate-400 shrink-0" />
                                    <span className="text-sm text-slate-600 dark:text-slate-300 truncate font-mono">
                                        {referralLink || 'Loading referral link...'}
                                    </span>
                                </div>
                                <Button
                                    onClick={handleCopy}
                                    disabled={!referralLink}
                                    className={cn(
                                        'shrink-0 h-10 px-5 gap-2 rounded-lg font-semibold text-sm transition-all',
                                        copied
                                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                            : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
                                    )}
                                >
                                    {copied ? <><Check className="w-4 h-4" /> Copied!</> : <><Copy className="w-4 h-4" /> Copy</>}
                                </Button>
                            </div>
                        </div>

                        {/* Stats */}
                        <div className="flex gap-4">
                            <div className="bg-slate-50 dark:bg-[var(--soft-sunken)] border border-slate-200 dark:border-[var(--soft-line)] rounded-xl px-6 py-4 text-center min-w-[100px]">
                                <Gift className="w-5 h-5 text-blue-500 mx-auto mb-1" />
                                <p className="text-2xl font-extrabold">{profile.credits ?? 0}</p>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Credits</p>
                            </div>
                            <div className="bg-slate-50 dark:bg-[var(--soft-sunken)] border border-slate-200 dark:border-[var(--soft-line)] rounded-xl px-6 py-4 text-center min-w-[100px]">
                                <Users className="w-5 h-5 text-blue-500 mx-auto mb-1" />
                                <p className="text-2xl font-extrabold">{profile.referralCount ?? 0}</p>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Referrals</p>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* ═══════════ Main Grid ═══════════ */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column */}
                <div className="lg:col-span-2 space-y-6">

                    {/* Personal Information */}
                    <SectionCard icon={<UserCircle className="w-4 h-4 text-blue-500" />} title="Personal Information" iconBg="bg-blue-500/10">
                        {editing ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <EditField label="First Name" name="firstName" value={form.firstName} onChange={handleFormChange} cls={inputCls} />
                                <EditField label="Last Name" name="lastName" value={form.lastName} onChange={handleFormChange} cls={inputCls} />
                                <EditField label="Phone" name="phone" value={form.phone} onChange={handleFormChange} cls={inputCls} />
                                <EditField label="Location" name="location" value={form.location} onChange={handleFormChange} cls={inputCls} />
                                <div className="sm:col-span-2">
                                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Experience</label>
                                    <select name="experience" value={form.experience} onChange={handleFormChange} className={inputCls}>
                                        <option value="">Select</option>
                                        <option value="fresher">Fresher</option>
                                        <option value="0-1">0–1 years</option>
                                        <option value="1-3">1–3 years</option>
                                        <option value="3-5">3–5 years</option>
                                        <option value="5-10">5–10 years</option>
                                        <option value="10+">10+ years</option>
                                    </select>
                                </div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                <InfoRow icon={<Mail className="w-4 h-4" />} label="Email" value={profile.email} />
                                <InfoRow icon={<Phone className="w-4 h-4" />} label="Phone" value={profile.phone} />
                                <InfoRow icon={<MapPin className="w-4 h-4" />} label="Location" value={profile.location} />
                                <InfoRow icon={<Briefcase className="w-4 h-4" />} label="Experience" value={fmtExp(profile.experience)} />
                            </div>
                        )}
                    </SectionCard>

                    {/* Links & Socials */}
                    <SectionCard icon={<ExternalLink className="w-4 h-4 text-blue-500" />} title="Links & Socials" iconBg="bg-blue-500/10">
                        {editing ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <EditField label="LinkedIn" name="linkedIn" value={form.linkedIn} onChange={handleFormChange} cls={inputCls} placeholder="https://linkedin.com/in/..." />
                                <EditField label="Portfolio / GitHub" name="portfolio" value={form.portfolio} onChange={handleFormChange} cls={inputCls} placeholder="https://github.com/..." />
                                <div className="sm:col-span-2">
                                    <EditField label="Resume URL" name="resumeUrl" value={form.resumeUrl} onChange={handleFormChange} cls={inputCls} placeholder="https://drive.google.com/..." />
                                </div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                <LinkRow icon={<Linkedin className="w-4 h-4" />} label="LinkedIn" value={profile.linkedIn} />
                                <LinkRow icon={<Github className="w-4 h-4" />} label="Portfolio / GitHub" value={profile.portfolio} />
                                <LinkRow icon={<FileText className="w-4 h-4" />} label="Resume URL" value={profile.resumeUrl} />
                            </div>
                        )}
                    </SectionCard>

                    {/* Job Preferences */}
                    <SectionCard icon={<Target className="w-4 h-4 text-blue-500" />} title="Job Preferences" iconBg="bg-blue-500/10">
                        {editing ? (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <EditField label="Desired Role" name="desiredRole" value={form.desiredRole} onChange={handleFormChange} cls={inputCls} />
                                <EditField label="Expected Salary" name="expectedSalary" value={form.expectedSalary} onChange={handleFormChange} cls={inputCls} />
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Job Type</label>
                                    <select name="jobType" value={form.jobType} onChange={handleFormChange} className={inputCls}>
                                        <option value="">Select</option>
                                        <option value="full-time">Full-time</option>
                                        <option value="part-time">Part-time</option>
                                        <option value="contract">Contract</option>
                                        <option value="internship">Internship</option>
                                        <option value="remote">Remote</option>
                                    </select>
                                </div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <PrefCard label="Desired Role" value={profile.jobPreferences?.desiredRole} />
                                <PrefCard label="Expected Salary" value={profile.jobPreferences?.expectedSalary} />
                                <PrefCard label="Job Type" value={profile.jobPreferences?.jobType} capitalize />
                            </div>
                        )}
                    </SectionCard>
                </div>

                {/* Right Column */}
                <div className="space-y-6">
                    {/* Skills */}
                    <SectionCard icon={<Star className="w-4 h-4 text-blue-500" />} title="Skills" iconBg="bg-blue-500/10">
                        {editing ? (
                            <div className="space-y-3">
                                <div className="flex gap-2">
                                    <input
                                        type="text" value={skillInput}
                                        onChange={(e) => setSkillInput(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSkill())}
                                        className={inputCls} placeholder="Type a skill & press Enter"
                                    />
                                    <Button type="button" onClick={addSkill} className="bg-blue-600 hover:bg-blue-700 text-white h-9 px-3 rounded-lg shrink-0">
                                        <Plus className="w-4 h-4" />
                                    </Button>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {form.skills.map((skill: string, i: number) => (
                                        <span key={i} className="px-3 py-1.5 bg-slate-50 dark:bg-[var(--soft-sunken)] border border-slate-200 dark:border-[var(--soft-line)] rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                            {skill}
                                            <button type="button" onClick={() => removeSkill(skill)} className="text-slate-400 hover:text-red-500 transition-colors"><X className="w-3 h-3" /></button>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ) : profile.skills?.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                                {profile.skills.map((s: string, i: number) => (
                                    <span key={i} className="px-3 py-1.5 bg-slate-50 dark:bg-[var(--soft-sunken)] border border-slate-200 dark:border-[var(--soft-line)] rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:border-blue-400 dark:hover:border-blue-500 transition-colors">{s}</span>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-slate-400">No skills added yet.</p>
                        )}
                    </SectionCard>

                    {/* Referral Code */}
                    <SectionCard icon={<Gift className="w-4 h-4 text-blue-500" />} title="Your Referral Code" iconBg="bg-blue-500/10">
                        <div className="text-center space-y-3">
                            <div className="inline-block bg-slate-50 dark:bg-[var(--soft-sunken)] border-2 border-dashed border-blue-300 dark:border-blue-500/30 rounded-xl px-8 py-4">
                                <p className="text-3xl font-extrabold tracking-widest text-blue-600 dark:text-blue-400 font-mono">
                                    {profile.referralCode || '—'}
                                </p>
                            </div>
                            <p className="text-xs text-slate-400">Share this code or the referral link above.</p>
                        </div>
                    </SectionCard>

                    {/* Account Info */}
                    <Card className="border-none shadow-sm dark:shadow-black/30 bg-white dark:bg-[#111] rounded-2xl">
                        <CardHeader>
                            <CardTitle className="text-lg font-bold">Account Info</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-400">Member Since</span>
                                <span className="font-medium text-slate-700 dark:text-slate-300">
                                    {profile.createdAt ? new Date(profile.createdAt).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}
                                </span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-400">Profile Status</span>
                                <span className={cn('font-bold', isProfileComplete ? 'text-emerald-500' : 'text-amber-500')}>
                                    {isProfileComplete ? 'Complete' : `Incomplete (${completionPercentage}%)`}
                                </span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-400">Total Credits Earned</span>
                                <span className="font-bold text-blue-600 dark:text-blue-400">
                                    {profile.totalCreditsEarned ?? 0}
                                </span>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

// ─── Sub-components ────────────────────────────────────────────

function SectionCard({ icon, title, iconBg, children }: { icon: React.ReactNode; title: string; iconBg: string; children: React.ReactNode }) {
    return (
        <Card className="border-none shadow-sm dark:shadow-black/30 bg-white dark:bg-[#111] rounded-2xl">
            <CardHeader>
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                    <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', iconBg)}>{icon}</div>
                    {title}
                </CardTitle>
            </CardHeader>
            <CardContent>{children}</CardContent>
        </Card>
    );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string }) {
    return (
        <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-[var(--soft-sunken)] flex items-center justify-center text-slate-400 shrink-0 mt-0.5">{icon}</div>
            <div className="min-w-0">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{value || '—'}</p>
            </div>
        </div>
    );
}

function LinkRow({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string }) {
    return (
        <div className="flex items-center gap-3">
            {value ? (
                <a
                    href={value}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors shrink-0"
                    title={value}
                >
                    {icon}
                </a>
            ) : (
                <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-[var(--soft-sunken)] flex items-center justify-center text-slate-400 shrink-0 cursor-not-allowed opacity-50">
                    {icon}
                </div>
            )}
            <div className="min-w-0">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
                {!value && <p className="text-xs text-slate-400 italic">Not connected</p>}
            </div>
        </div>
    );
}

function EditField({ label, name, value, onChange, cls, placeholder }: {
    label: string; name: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; cls: string; placeholder?: string;
}) {
    return (
        <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{label}</label>
            <input type="text" name={name} value={value} onChange={onChange} className={cls} placeholder={placeholder || label} />
        </div>
    );
}

function PrefCard({ label, value, capitalize }: { label: string; value?: string; capitalize?: boolean }) {
    return (
        <div className="bg-slate-50 dark:bg-[var(--soft-sunken)] border border-slate-200 dark:border-[var(--soft-line)] rounded-xl p-4">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
            <p className={cn('text-sm font-semibold text-slate-800 dark:text-slate-200', capitalize && 'capitalize')}>{value || 'Not specified'}</p>
        </div>
    );
}

function fmtExp(exp?: string): string {
    if (!exp) return '—';
    const m: Record<string, string> = { 'fresher': 'Fresher', '0-1': '0–1 years', '1-3': '1–3 years', '3-5': '3–5 years', '5-10': '5–10 years', '10+': '10+ years' };
    return m[exp] || exp;
}
